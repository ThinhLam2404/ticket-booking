import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  Prisma,
  SepayIntentStatus,
  SepayTransactionStatus,
  ShowtimeSeatStatus,
  PaymentStatus,
  TicketStatus,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { SepayWebhookDto } from './dto/sepay-webhook.dto.js';
import { SHOWTIME_BUFFER_SECONDS } from '../bookings/booking-policy.js';
import { MailService } from '../mail/mail.service.js';
import { logOperationalEvent } from '../../common/logging/operational-logger.js';
import { recordPaymentReviewRequired } from '../observability/metrics.service.js';
import { RedisService } from '../redis/redis.service.js';

const PAYMENT_CODE_PREFIX = 'CB';
const PAYMENT_CODE_LENGTH = 8;

@Injectable()
export class SepayService {
  private readonly logger = new Logger(SepayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly redis: RedisService,
  ) {}

  async checkout(userId: string, bookingId: string) {
    await this.bookingsService.expireBookingById(bookingId);

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: {
        items: true,
        showtime: true,
        sepayIntent: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (
      booking.status !== BookingStatus.PENDING ||
      booking.expiresAt <= new Date()
    ) {
      throw new ConflictException(
        'Booking is no longer available for checkout',
      );
    }

    const secondsUntilShowtime = Math.floor(
      (booking.showtime.startsAt.getTime() - Date.now()) / 1000,
    );
    if (secondsUntilShowtime <= SHOWTIME_BUFFER_SECONDS) {
      throw new ConflictException(
        'Showtime is too close to start for a new booking',
      );
    }
    //NOTE - check xem ghế mình chọn có ghế nào đã bị mua mất chưa
    const heldSeats = await this.prisma.showtimeSeat.count({
      where: {
        id: { in: booking.items.map((item) => item.showtimeSeatId) },
        heldByBookingId: bookingId,
        status: ShowtimeSeatStatus.HELD,
      },
    });
    if (heldSeats !== booking.items.length) {
      throw new ConflictException('Booking no longer owns all selected seats');
    }

    if (
      booking.sepayIntent &&
      booking.sepayIntent.status === SepayIntentStatus.PENDING &&
      booking.sepayIntent.expiresAt > new Date()
    ) {
      return this.buildCheckoutResponse(booking.sepayIntent);
    }

    const paymentCode = this.generatePaymentCode();
    const expiresAt = booking.expiresAt;

    const intent = await this.prisma.sepayPaymentIntent.upsert({
      where: { bookingId },
      create: {
        paymentCode,
        expectedAmount: booking.totalAmount,
        expiresAt,
        bookingId,
        userId,
      },
      update: {
        paymentCode,
        expectedAmount: booking.totalAmount,
        expiresAt,
        status: SepayIntentStatus.PENDING,
      },
    });

    logOperationalEvent('info', 'payment_intent_created', {
      bookingId,
      paymentIntentId: intent.id,
    });
    return this.buildCheckoutResponse(intent);
  }

  async handleWebhook(rawBody: Record<string, unknown>) {
    const dto = plainToInstance(SepayWebhookDto, rawBody, {
      enableImplicitConversion: true,
    });
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    if (errors.length) {
      const details = errors.flatMap((error) =>
        Object.values(error.constraints ?? {}),
      );
      this.logger.error(
        `SePay webhook payload rejected: ${details.join('; ')}`,
      );
      logOperationalEvent('warn', 'payment_webhook_rejected', {
        validationErrorCount: details.length,
      });
      throw new BadRequestException(details);
    }
    if (dto.transferType !== 'in') {
      return { success: true };
    }

    const configuredAccount = this.config.get<string>('SEPAY_ACCOUNT_NUMBER');
    if (configuredAccount && dto.accountNumber !== configuredAccount) {
      this.logger.warn('Webhook for unknown account, ignoring');
      logOperationalEvent('warn', 'payment_webhook_unknown_account');
      return { success: true };
    }

    let existing = await this.prisma.sepayTransaction.findUnique({
      where: { sepayId: dto.id },
    });
    //NOTE - neu status = matched thi cho di tiep vi co the chua hoan tat confirm booking
    if (
      existing?.status === SepayTransactionStatus.CONFIRMED ||
      existing?.status === SepayTransactionStatus.REVIEW_REQUIRED
    ) {
      return { success: true };
    }

    const content = dto.content?.trim() ?? '';
    const paymentCode = this.extractPaymentCode(content);
    let intent = paymentCode
      ? await this.prisma.sepayPaymentIntent.findUnique({
          where: { paymentCode },
          include: { booking: { include: { items: true, user: true } } },
        })
      : null;
    const amount = new Prisma.Decimal(dto.transferAmount);
    //NOTE - neu chua co sepay transaction
    if (!existing) {
      const matched =
        intent &&
        intent.status === SepayIntentStatus.PENDING &&
        intent.expectedAmount.equals(amount) &&
        intent.expiresAt > new Date();
      const txStatus: SepayTransactionStatus = matched
        ? SepayTransactionStatus.MATCHED
        : SepayTransactionStatus.REVIEW_REQUIRED;
      try {
        await this.prisma.sepayTransaction.create({
          data: {
            sepayId: dto.id,
            gateway: dto.gateway,
            accountNumber: dto.accountNumber,
            transferAmount: amount,
            content: dto.content ?? '',
            referenceCode: dto.referenceCode ?? null,
            transferType: dto.transferType,
            transactionDate: new Date(dto.transactionDate),
            status: txStatus,
            paymentIntentId: intent?.id ?? null,
          },
        });
      } catch (error) {
        //NOTE - Nếu lỗi không phải duplicate thì vẫn throw lỗi thật.
        if (!isUniqueConstraintError(error)) throw error;
        const concurrent = await this.prisma.sepayTransaction.findUnique({
          where: { sepayId: dto.id },
        });
        //NOTE - Nếu transaction là MATCHED, request hiện tại có thể tiếp tục confirm.
        if (!concurrent || concurrent.status !== SepayTransactionStatus.MATCHED)
          return { success: true };
        existing = concurrent;
      }
      if (!matched) {
        recordPaymentReviewRequired();
        logOperationalEvent('warn', 'payment_review_required', {
          sepayTransactionId: String(dto.id),
          paymentIntentId: intent?.id,
        });
        this.logger.warn(
          `SePay transaction ${dto.id} status=${txStatus} intentId=${intent?.id ?? 'none'}`,
        );
        return { success: true };
      }
    }

    if (!intent && existing?.paymentIntentId) {
      intent = await this.prisma.sepayPaymentIntent.findUnique({
        where: { id: existing.paymentIntentId },
        include: { booking: { include: { items: true, user: true } } },
      });
    }
    //NOTE -  Nếu transaction là MATCHED nhưng không còn intent
    if (!intent) {
      await this.prisma.sepayTransaction.updateMany({
        where: { sepayId: dto.id, status: SepayTransactionStatus.MATCHED },
        data: { status: SepayTransactionStatus.REVIEW_REQUIRED },
      });
      recordPaymentReviewRequired();
      return { success: true };
    }

    await this.confirmBooking(intent.booking, intent, dto.id);
    return { success: true };
  }

  async findTransactions(query?: { status?: SepayTransactionStatus }) {
    const where = query?.status ? { status: query.status } : {};
    const transactions = await this.prisma.sepayTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        paymentIntent: {
          include: {
            booking: {
              include: {
                user: true,
                showtime: { include: { movie: true } },
                items: {
                  include: { showtimeSeat: { include: { seat: true } } },
                },
              },
            },
          },
        },
      },
    });
    return transactions.map((tx) => {
      const booking = tx.paymentIntent?.booking;
      if (!booking) return { ...tx, booking: null };
      return {
        ...tx,
        booking: {
          id: booking.id,
          status: booking.status,
          totalAmount: booking.totalAmount.toString(),
          userEmail: booking.user?.email ?? '',
          movieTitle: booking.showtime?.movie?.title ?? '',
          showtimeStartsAt: booking.showtime?.startsAt.toISOString() ?? '',
          seatLabels: booking.items.map(
            (item) =>
              `${item.showtimeSeat?.seat?.row ?? ''}${item.showtimeSeat?.seat?.number ?? ''}`,
          ),
        },
      };
    });
  }

  async manualConfirmTransaction(
    adminId: string,
    id: string,
    dto: { force?: boolean; adminNote?: string },
  ) {
    const transaction = await this.prisma.sepayTransaction.findUnique({
      where: { id },
      include: {
        paymentIntent: { include: { booking: { include: { items: true } } } },
      },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (transaction.status !== SepayTransactionStatus.REVIEW_REQUIRED) {
      throw new ConflictException(
        'Only transactions requiring review can be confirmed',
      );
    }

    const warnings: string[] = [];
    const booking = transaction.paymentIntent?.booking;
    if (!booking) warnings.push('BOOKING_NOT_FOUND');
    else {
      if (!booking.totalAmount.equals(transaction.transferAmount))
        warnings.push('AMOUNT_MISMATCH');
      if (booking.expiresAt <= new Date()) warnings.push('BOOKING_EXPIRED');
      if (booking.status !== BookingStatus.PENDING)
        warnings.push('BOOKING_NOT_PENDING');
    }
    if (warnings.length && !dto.force) {
      throw new ConflictException({
        message: 'Manual confirmation requires force',
        code: 'CONFIRMATION_WARNINGS',
        warnings: warnings.join(','),
      });
    }

    if (!booking)
      throw new ConflictException('Transaction is not linked to a booking');
    const intent = await this.prisma.sepayPaymentIntent.findUnique({
      where: { id: transaction.paymentIntentId ?? '' },
      include: { booking: { include: { user: true } } },
    });
    if (!intent) throw new ConflictException('Payment intent not found');
    const confirmed = await this.confirmBooking(
      booking,
      intent,
      transaction.sepayId,
    );
    if (!confirmed) {
      throw new ConflictException(
        'Booking could not be confirmed; transaction remains under review',
      );
    }
    const updated = await this.prisma.sepayTransaction.update({
      where: { id },
      data: {
        status: SepayTransactionStatus.CONFIRMED,
        adminNote: dto.adminNote ?? null,
      },
    });
    logOperationalEvent('info', 'payment_manually_confirmed', {
      transactionId: id,
      adminId,
      warnings: warnings.join(','),
    });
    return updated;
  }

  async updateTransactionStatus(
    id: string,
    dto: { status: SepayTransactionStatus; adminNote?: string },
  ) {
    const existing = await this.prisma.sepayTransaction.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Transaction not found');
    if (
      dto.status === SepayTransactionStatus.REFUNDED ||
      dto.status === SepayTransactionStatus.CONFIRMED
    ) {
      throw new ConflictException(
        'Use the corresponding payment workflow to confirm or refund a transaction',
      );
    }
    return this.prisma.sepayTransaction.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.adminNote !== undefined && { adminNote: dto.adminNote }),
      },
    });
  }
  async refundBooking(
    adminId: string,
    bookingId: string,
    dto: { reason: string; adminNote?: string },
  ) {
    const lockKey = `booking:refund:${bookingId}`;
    const lockValue = randomUUID();
    const lockAcquired = await this.redis.acquireLock(lockKey, lockValue, 30);
    if (!lockAcquired) {
      throw new ConflictException(
        'Another refund is in progress for this booking',
      );
    }

    try {
      const idempotencyKey = `booking:${bookingId}`;
      const existing = await this.prisma.refund.findUnique({
        where: { idempotencyKey },
      });
      if (existing) return existing;

      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          payment: true,
          user: true,
          items: true,
          tickets: true,
          sepayIntent: { include: { transactions: true } },
        },
      });
      if (!booking) throw new NotFoundException('Booking not found');
      if (
        !booking.payment ||
        booking.payment.status !== PaymentStatus.SUCCEEDED
      ) {
        throw new ConflictException(
          'Only a successful payment can be refunded',
        );
      }
      if (
        booking.tickets.some((ticket) => ticket.status === TicketStatus.USED)
      ) {
        throw new ConflictException('A used ticket cannot be refunded');
      }

      const refund = await this.prisma.$transaction(async (tx) => {
        const current = await tx.booking.findUnique({
          where: { id: bookingId },
          include: {
            payment: true,
            user: true,
            items: true,
            tickets: true,
            sepayIntent: { include: { transactions: true } },
          },
        });
        if (!current) throw new NotFoundException('Booking not found');
        const alreadyRefunded = await tx.refund.findUnique({
          where: { idempotencyKey },
        });
        if (alreadyRefunded) return alreadyRefunded;
        if (
          !current.payment ||
          current.payment.status !== PaymentStatus.SUCCEEDED
        ) {
          throw new ConflictException(
            'Only a successful payment can be refunded',
          );
        }
        if (
          current.tickets.some((ticket) => ticket.status === TicketStatus.USED)
        ) {
          throw new ConflictException('A used ticket cannot be refunded');
        }
        const created = await tx.refund.create({
          data: {
            bookingId,
            paymentId: current.payment.id,
            transactionId:
              current.sepayIntent?.transactions.find(
                (item) => item.status === SepayTransactionStatus.CONFIRMED,
              )?.id ?? null,
            amount: current.payment.amount,
            reason: dto.reason,
            adminNote: dto.adminNote,
            adminId,
            idempotencyKey,
          },
        });
        const paymentUpdated = await tx.payment.updateMany({
          where: { id: current.payment.id, status: PaymentStatus.SUCCEEDED },
          data: { status: PaymentStatus.REFUNDED },
        });
        if (paymentUpdated.count !== 1)
          throw new ConflictException('Payment is no longer refundable');
        await tx.booking.updateMany({
          where: { id: bookingId, status: BookingStatus.CONFIRMED },
          data: { status: BookingStatus.CANCELLED },
        });
        await tx.ticket.updateMany({
          where: { bookingId, status: TicketStatus.ACTIVE },
          data: { status: TicketStatus.CANCELLED },
        });
        await tx.showtimeSeat.updateMany({
          where: {
            id: { in: current.items.map((item) => item.showtimeSeatId) },
            status: ShowtimeSeatStatus.SOLD,
          },
          data: {
            status: ShowtimeSeatStatus.AVAILABLE,
            heldByBookingId: null,
            heldUntil: null,
          },
        });
        if (created.transactionId) {
          await tx.sepayTransaction.update({
            where: { id: created.transactionId },
            data: { status: SepayTransactionStatus.REFUNDED },
          });
        }
        await this.mailService.queueRefundEmail(
          bookingId,
          current.user.email,
          current.payment.amount.toString(),
          dto.reason,
          tx,
        );
        return created;
      });
      logOperationalEvent('info', 'booking_refunded', {
        bookingId,
        refundId: refund.id,
        adminId,
        amount: refund.amount.toString(),
      });
      return refund;
    } finally {
      await this.redis.releaseLock(lockKey, lockValue);
    }
  }

  private async confirmBooking(
    booking: {
      id: string;
      userId: string;
      holdToken: string;
      showtimeId: string;
      items: { id: string; showtimeSeatId: string }[];
    },
    intent: {
      id: string;
      bookingId: string;
      expectedAmount: Prisma.Decimal;
      booking: { user: { email: string } };
    },
    sepayId: number,
  ): Promise<boolean> {
    let confirmed: unknown = null;
    try {
      confirmed = await this.prisma.$transaction(async (tx) => {
        const current = await tx.booking.findFirst({
          where: {
            id: booking.id,
            status: BookingStatus.PENDING,
            expiresAt: { gt: new Date() },
          },
          include: { items: true },
        });
        if (!current) {
          return null;
        }

        const heldCount = await tx.showtimeSeat.count({
          where: {
            id: { in: current.items.map((i) => i.showtimeSeatId) },
            heldByBookingId: booking.id,
            status: ShowtimeSeatStatus.HELD,
          },
        });
        if (heldCount !== current.items.length) {
          return null;
        }

        const updated = await tx.booking.updateMany({
          where: {
            id: booking.id,
            status: BookingStatus.PENDING,
            expiresAt: { gt: new Date() },
          },
          data: { status: BookingStatus.CONFIRMED },
        });
        if (updated.count !== 1) {
          return null;
        }

        await tx.showtimeSeat.updateMany({
          where: {
            heldByBookingId: booking.id,
            status: ShowtimeSeatStatus.HELD,
          },
          data: {
            status: ShowtimeSeatStatus.SOLD,
            heldUntil: null,
            heldByBookingId: null,
          },
        });

        await tx.payment.upsert({
          where: { bookingId: booking.id },
          create: {
            bookingId: booking.id,
            amount: intent.expectedAmount,
            provider: 'SEPAY',
            reference: `SEPAY-${sepayId}`,
            status: 'SUCCEEDED',
          },
          update: {
            provider: 'SEPAY',
            reference: `SEPAY-${sepayId}`,
            status: 'SUCCEEDED',
          },
        });

        for (const item of current.items) {
          await tx.ticket.upsert({
            where: { bookingItemId: item.id },
            create: {
              code: `TKT-${randomUUID()}`,
              bookingId: booking.id,
              bookingItemId: item.id,
            },
            update: {},
          });
        }

        await tx.sepayPaymentIntent.update({
          where: { id: intent.id },
          data: { status: SepayIntentStatus.SUCCEEDED },
        });

        await tx.sepayTransaction.update({
          where: { sepayId },
          data: { status: SepayTransactionStatus.CONFIRMED },
        });
        await this.mailService.queueTicketEmail(
          booking.id,
          intent.booking.user.email,
          tx,
        );

        return current;
      });

      if (confirmed) {
        this.mailService.wakeWorker();
        await this.bookingsService.releaseSeatLocks(
          booking.showtimeId,
          booking.items.map((i) => i.showtimeSeatId),
          booking.holdToken,
        );
        logOperationalEvent('info', 'booking_confirmed', {
          bookingId: booking.id,
          paymentIntentId: intent.id,
          sepayTransactionId: String(sepayId),
        });
        this.logger.log(`Booking ${booking.id} confirmed via SePay webhook`);
      } else {
        await this.prisma.sepayTransaction.updateMany({
          where: {
            sepayId,
            status: SepayTransactionStatus.MATCHED,
          },
          data: { status: SepayTransactionStatus.REVIEW_REQUIRED },
        });
        recordPaymentReviewRequired();
        logOperationalEvent('warn', 'payment_review_required', {
          bookingId: booking.id,
          paymentIntentId: intent.id,
          sepayTransactionId: String(sepayId),
        });
        this.logger.warn(
          `Booking ${booking.id} could not be confirmed — marked for review`,
        );
      }
    } catch (err) {
      this.logger.error(`Error confirming booking ${booking.id}`, err);
      throw err;
    }
    return confirmed !== null;
  }

  private buildCheckoutResponse(intent: {
    id: string;
    paymentCode: string;
    expectedAmount: Prisma.Decimal;
    expiresAt: Date;
    status: SepayIntentStatus;
  }) {
    const bankCode = this.config.get<string>('SEPAY_BANK_CODE') ?? '';
    const accountNumber = this.config.get<string>('SEPAY_ACCOUNT_NUMBER') ?? '';
    const accountName = this.config.get<string>('SEPAY_ACCOUNT_NAME') ?? '';
    const amount = intent.expectedAmount.toFixed(0);

    const params = new URLSearchParams({
      acc: accountNumber,
      bank: bankCode,
      amount,
      des: intent.paymentCode,
      template: 'compact',
    });
    const qrUrl = `https://vietqr.app/img?${params.toString()}`;

    return {
      intentId: intent.id,
      paymentCode: intent.paymentCode,
      amount,
      bankCode,
      accountNumber,
      accountName,
      qrUrl,
      expiresAt: intent.expiresAt.toISOString(),
      status: intent.status,
    };
  }

  private generatePaymentCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = PAYMENT_CODE_PREFIX;
    const remaining = PAYMENT_CODE_LENGTH - PAYMENT_CODE_PREFIX.length;
    for (let i = 0; i < remaining; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  private extractPaymentCode(content: string): string | null {
    const pattern = new RegExp(
      `\\b${PAYMENT_CODE_PREFIX}[A-Z0-9]{${PAYMENT_CODE_LENGTH - PAYMENT_CODE_PREFIX.length}}\\b`,
    );
    const match = content.toUpperCase().match(pattern);
    return match ? match[0] : null;
  }
}

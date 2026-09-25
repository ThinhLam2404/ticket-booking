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
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { SepayWebhookDto } from './dto/sepay-webhook.dto.js';
import { SHOWTIME_BUFFER_SECONDS } from '../bookings/booking-policy.js';

const PAYMENT_CODE_PREFIX = 'CB';
const PAYMENT_CODE_LENGTH = 8;

@Injectable()
export class SepayService {
  private readonly logger = new Logger(SepayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
    private readonly config: ConfigService,
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
        `SePay webhook payload rejected: ${details.join('; ')} | body=${JSON.stringify(rawBody)}`,
      );
      throw new BadRequestException(details);
    }
    if (dto.transferType !== 'in') {
      return { success: true };
    }

    const configuredAccount = this.config.get<string>('SEPAY_ACCOUNT_NUMBER');
    if (configuredAccount && dto.accountNumber !== configuredAccount) {
      this.logger.warn(
        `Webhook for unknown account ${dto.accountNumber}, ignoring`,
      );
      return { success: true };
    }

    const existing = await this.prisma.sepayTransaction.findUnique({
      where: { sepayId: dto.id },
    });
    if (existing) {
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
      if (isUniqueConstraintError(error)) {
        return { success: true };
      }
      throw error;
    }

    if (!matched || !intent) {
      this.logger.warn(
        `SePay transaction ${dto.id} status=${txStatus} intentId=${intent?.id ?? 'none'}`,
      );
      return { success: true };
    }

    await this.confirmBooking(intent.booking, intent, dto.id);
    return { success: true };
  }

  async findTransactions(query?: { status?: SepayTransactionStatus }) {
    const where = query?.status ? { status: query.status } : {};
    return this.prisma.sepayTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async updateTransactionStatus(
    id: string,
    dto: { status: SepayTransactionStatus; adminNote?: string },
  ) {
    const existing = await this.prisma.sepayTransaction.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Transaction not found');
    }
    return this.prisma.sepayTransaction.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.adminNote !== undefined && { adminNote: dto.adminNote }),
      },
    });
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
  ) {
    try {
      const confirmed = await this.prisma.$transaction(async (tx) => {
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

        await tx.mailOutbox.upsert({
          where: { dedupeKey: `TICKETS_ISSUED:${booking.id}` },
          create: {
            type: 'TICKETS_ISSUED',
            recipient: intent.booking.user.email,
            dedupeKey: `TICKETS_ISSUED:${booking.id}`,
            payload: { bookingId: booking.id },
          },
          update: {},
        });

        return current;
      });

      if (confirmed) {
        await this.bookingsService.releaseSeatLocks(
          booking.showtimeId,
          booking.items.map((i) => i.showtimeSeatId),
          booking.holdToken,
        );
        this.logger.log(`Booking ${booking.id} confirmed via SePay webhook`);
      } else {
        await this.prisma.sepayTransaction.updateMany({
          where: {
            sepayId,
            status: SepayTransactionStatus.MATCHED,
          },
          data: { status: SepayTransactionStatus.REVIEW_REQUIRED },
        });
        this.logger.warn(
          `Booking ${booking.id} could not be confirmed — marked for review`,
        );
      }
    } catch (err) {
      this.logger.error(`Error confirming booking ${booking.id}`, err);
      throw err;
    }
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

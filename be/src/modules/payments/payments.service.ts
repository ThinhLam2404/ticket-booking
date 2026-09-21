import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  BookingStatus,
  MovieStatus,
  PaymentStatus,
  Prisma,
  ShowtimeSeatStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { RedisService } from '../redis/redis.service.js';
import { MockPaymentDto, PurchaseSeatsDto } from './dto/mock-payment.dto.js';
import {
  PURCHASE_LOCK_TTL_SECONDS,
  PURCHASE_WINDOW_SECONDS,
} from '../bookings/booking-policy.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async purchaseSeats(userId: string, dto: PurchaseSeatsDto) {
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
    if (nodeEnv !== 'development' && nodeEnv !== 'test') {
      throw new ForbiddenException('Mock payments are disabled');
    }
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new ConflictException('Payment idempotency key is required');
    }

    const existingByKey = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
      include: { booking: true },
    });
    if (existingByKey) {
      if (existingByKey.booking.userId !== userId) {
        throw new ConflictException('Payment idempotency key is already used');
      }
      return this.getPaymentResult(userId, existingByKey.bookingId);
    }

    const showtime = await this.prisma.showtime.findUnique({
      where: { id: dto.showtimeId },
      include: { movie: true, showtimeSeats: { include: { seat: true } } },
    });
    if (!showtime || showtime.movie.status !== MovieStatus.PUBLISHED) {
      throw new NotFoundException('Showtime not found');
    }
    const secondsUntilShowtime = Math.floor(
      (showtime.startsAt.getTime() - Date.now()) / 1000,
    );
    if (secondsUntilShowtime <= 0) {
      throw new ConflictException('Showtime has already started');
    }
    if (secondsUntilShowtime > PURCHASE_WINDOW_SECONDS) {
      throw new ConflictException(
        'Seat purchase is only available within the final purchase window',
      );
    }

    const seatsById = new Map(
      showtime.showtimeSeats.map((seat) => [seat.id, seat]),
    );
    const seatsByCoordinate = new Map(
      showtime.showtimeSeats.map((seat) => [
        `${seat.seat.row}:${seat.seat.number}`,
        seat,
      ]),
    );
    const canonicalSeats = new Map<
      string,
      (typeof showtime.showtimeSeats)[number]
    >();
    for (const seatId of new Set(dto.showtimeSeatIds)) {
      const seat = seatsById.get(seatId);
      if (!seat) {
        throw new NotFoundException(
          'One or more showtime seats were not found',
        );
      }
      canonicalSeats.set(seat.id, seat);
      if (seat.seat.type === 'COUPLE') {
        const partner = seatsByCoordinate.get(
          `${seat.seat.row}:${seat.seat.number % 2 === 1 ? seat.seat.number + 1 : seat.seat.number - 1}`,
        );
        if (!partner || partner.seat.type !== 'COUPLE') {
          throw new ConflictException('Couple seat must have a valid partner');
        }
        canonicalSeats.set(partner.id, partner);
      }
    }
    const canonicalSeatIds = [...canonicalSeats.values()]
      .sort(
        (left, right) =>
          left.seat.row.localeCompare(right.seat.row) ||
          left.seat.number - right.seat.number,
      )
      .map((seat) => seat.id);
    if (canonicalSeatIds.length > 10) {
      throw new ConflictException('A maximum of 10 physical seats can be held');
    }

    const holdToken = randomUUID();
    const acquiredSeatIds: string[] = [];
    try {
      for (const seatId of canonicalSeatIds) {
        const acquired = await this.redis.setIfAbsent(
          `booking:seat:${dto.showtimeId}:${seatId}`,
          holdToken,
          PURCHASE_LOCK_TTL_SECONDS,
        );
        if (acquired !== 'OK') {
          throw new ConflictException('One or more seats are being held');
        }
        acquiredSeatIds.push(seatId);
      }
      const result = await this.prisma.$transaction(async (transaction) => {
        //NOTE - kiểm tra ghế trạng thái HELD nhưng đã hết thời gian giữ
        await transaction.showtimeSeat.updateMany({
          where: {
            id: { in: canonicalSeatIds },
            showtimeId: dto.showtimeId,
            status: ShowtimeSeatStatus.HELD,
            heldUntil: { lte: new Date() },
          },
          data: {
            status: ShowtimeSeatStatus.AVAILABLE,
            heldUntil: null,
            heldByBookingId: null,
          },
        });
        const availableSeats = await transaction.showtimeSeat.findMany({
          where: {
            id: { in: canonicalSeatIds },
            showtimeId: dto.showtimeId,
            status: ShowtimeSeatStatus.AVAILABLE,
          },
        });
        if (availableSeats.length !== canonicalSeatIds.length) {
          throw new ConflictException(
            'One or more seats are no longer available',
          );
        }
        //nếu false thì tạo booking cancel, payment fail và không bán ghế
        if (dto.success === false) {
          const booking = await transaction.booking.create({
            data: {
              userId,
              showtimeId: dto.showtimeId,
              totalAmount: availableSeats.reduce(
                (total, seat) => total.plus(seat.price),
                new Prisma.Decimal(0),
              ),
              expiresAt: new Date(),
              holdToken,
              status: BookingStatus.CANCELLED,
              items: {
                create: availableSeats.map((seat) => ({
                  showtimeSeatId: seat.id,
                  price: seat.price,
                })),
              },
            },
          });
          const payment = await transaction.payment.create({
            data: {
              bookingId: booking.id,
              amount: booking.totalAmount,
              provider: 'MOCK',
              reference: dto.reference?.trim() || `MOCK-${randomUUID()}`,
              idempotencyKey,
              status: PaymentStatus.FAILED,
            },
          });
          return { bookingId: booking.id, paymentId: payment.id };
        }
        //nếu success tạo booking confirm, showtime seat sold, payment succeed, tạo ticket
        const booking = await transaction.booking.create({
          data: {
            userId,
            showtimeId: dto.showtimeId,
            totalAmount: availableSeats.reduce(
              (total, seat) => total.plus(seat.price),
              new Prisma.Decimal(0),
            ),
            expiresAt: new Date(),
            holdToken,
            status: BookingStatus.CONFIRMED,
            items: {
              create: availableSeats.map((seat) => ({
                showtimeSeatId: seat.id,
                price: seat.price,
              })),
            },
          },
          include: { items: true },
        });
        const soldSeats = await transaction.showtimeSeat.updateMany({
          where: {
            id: { in: canonicalSeatIds },
            status: ShowtimeSeatStatus.AVAILABLE,
          },
          data: { status: ShowtimeSeatStatus.SOLD },
        });
        if (soldSeats.count !== canonicalSeatIds.length) {
          throw new ConflictException('Selected seats could not be sold');
        }
        const payment = await transaction.payment.create({
          data: {
            bookingId: booking.id,
            amount: booking.totalAmount,
            provider: 'MOCK',
            reference: dto.reference?.trim() || `MOCK-${randomUUID()}`,
            idempotencyKey,
            status: PaymentStatus.SUCCEEDED,
          },
        });
        for (const item of booking.items) {
          await transaction.ticket.create({
            data: {
              code: `TKT-${randomUUID()}`,
              bookingId: booking.id,
              bookingItemId: item.id,
            },
          });
        }
        return { bookingId: booking.id, paymentId: payment.id };
      });

      return this.getPaymentResult(userId, result.bookingId);
    } catch (error) {
      const existingPayment = await this.prisma.payment.findUnique({
        where: { idempotencyKey },
      });
      if (existingPayment) {
        return this.getPaymentResult(userId, existingPayment.bookingId);
      }
      throw error;
    } finally {
      await this.bookingsService.releaseSeatLocks(
        dto.showtimeId,
        acquiredSeatIds,
        holdToken,
      );
    }
  }

  async processMockPayment(
    userId: string,
    bookingId: string,
    dto: MockPaymentDto,
  ) {
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
    if (nodeEnv !== 'development' && nodeEnv !== 'test') {
      throw new ForbiddenException('Mock payments are disabled');
    }
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new ConflictException('Payment idempotency key is required');
    }

    const existingByKey = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });
    if (existingByKey) {
      if (existingByKey.bookingId !== bookingId) {
        throw new ConflictException('Payment idempotency key is already used');
      }
      return this.getPaymentResult(userId, bookingId);
    }

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: { payment: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status === BookingStatus.CONFIRMED) {
      return this.getPaymentResult(userId, bookingId);
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new ConflictException('Booking is not payable');
    }

    const reference = dto.reference?.trim() || `MOCK-${randomUUID()}`;
    const success = dto.success !== false;

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.booking.findFirst({
          where: { id: bookingId, userId },
          include: { items: true, payment: true },
        });
        if (!current) {
          throw new NotFoundException('Booking not found');
        }
        if (current.status === BookingStatus.CONFIRMED) {
          return {
            completed: false,
            holdToken: current.holdToken,
            showtimeId: current.showtimeId,
            showtimeSeatIds: current.items.map((item) => item.showtimeSeatId),
          };
        }
        if (
          current.status !== BookingStatus.PENDING ||
          current.expiresAt <= new Date()
        ) {
          throw new ConflictException('Booking is no longer payable');
        }

        if (!success) {
          const payment = await transaction.payment.upsert({
            where: { bookingId },
            create: {
              bookingId,
              amount: current.totalAmount,
              provider: 'MOCK',
              reference,
              idempotencyKey,
              status: PaymentStatus.FAILED,
            },
            update: {
              ...(current.payment?.status !== PaymentStatus.SUCCEEDED && {
                reference,
                idempotencyKey,
                status: PaymentStatus.FAILED,
              }),
            },
          });
          await transaction.booking.updateMany({
            where: { id: bookingId, status: BookingStatus.PENDING },
            data: { status: BookingStatus.CANCELLED },
          });
          await transaction.showtimeSeat.updateMany({
            where: {
              heldByBookingId: bookingId,
              status: ShowtimeSeatStatus.HELD,
            },
            data: {
              status: ShowtimeSeatStatus.AVAILABLE,
              heldUntil: null,
              heldByBookingId: null,
            },
          });
          return {
            completed: false,
            failed: true,
            payment,
            holdToken: current.holdToken,
            showtimeId: current.showtimeId,
            showtimeSeatIds: current.items.map((item) => item.showtimeSeatId),
          };
        }

        const heldSeats = await transaction.showtimeSeat.count({
          where: {
            id: { in: current.items.map((item) => item.showtimeSeatId) },
            heldByBookingId: bookingId,
            status: ShowtimeSeatStatus.HELD,
          },
        });
        if (heldSeats !== current.items.length) {
          throw new ConflictException(
            'Booking no longer owns all selected seats',
          );
        }

        const payment = await transaction.payment.upsert({
          where: { bookingId },
          create: {
            bookingId,
            amount: current.totalAmount,
            provider: 'MOCK',
            reference,
            idempotencyKey,
            status: PaymentStatus.SUCCEEDED,
          },
          update: {
            amount: current.totalAmount,
            provider: 'MOCK',
            reference,
            idempotencyKey,
            status: PaymentStatus.SUCCEEDED,
          },
        });

        const confirmed = await transaction.booking.updateMany({
          where: {
            id: bookingId,
            userId,
            status: BookingStatus.PENDING,
            expiresAt: { gt: new Date() },
          },
          data: { status: BookingStatus.CONFIRMED },
        });
        if (confirmed.count !== 1) {
          throw new ConflictException('Booking could not be confirmed');
        }

        const soldSeats = await transaction.showtimeSeat.updateMany({
          where: {
            heldByBookingId: bookingId,
            status: ShowtimeSeatStatus.HELD,
          },
          data: {
            status: ShowtimeSeatStatus.SOLD,
            heldUntil: null,
            heldByBookingId: null,
          },
        });
        if (soldSeats.count !== current.items.length) {
          throw new ConflictException('Selected seats could not be sold');
        }

        for (const item of current.items) {
          await transaction.ticket.upsert({
            where: { bookingItemId: item.id },
            create: {
              code: `TKT-${randomUUID()}`,
              bookingId,
              bookingItemId: item.id,
            },
            update: {},
          });
        }

        return {
          completed: true,
          payment,
          holdToken: current.holdToken,
          showtimeId: current.showtimeId,
          showtimeSeatIds: current.items.map((item) => item.showtimeSeatId),
        };
      });

      await this.bookingsService.releaseSeatLocks(
        result.showtimeId,
        result.showtimeSeatIds,
        result.holdToken,
      );
      return this.getPaymentResult(userId, bookingId);
    } catch (error) {
      const existingPayment = await this.prisma.payment.findUnique({
        where: { idempotencyKey },
      });
      if (existingPayment?.bookingId === bookingId) {
        return this.getPaymentResult(userId, bookingId);
      }

      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Payment reference or idempotency key is already used',
        );
      }
      throw error;
    }
  }

  private async getPaymentResult(userId: string, bookingId: string) {
    const [booking, payment] = await Promise.all([
      this.bookingsService.findOne(userId, bookingId),
      this.prisma.payment.findUnique({ where: { bookingId } }),
    ]);
    return { payment: toPublicResponse(payment), booking };
  }
}

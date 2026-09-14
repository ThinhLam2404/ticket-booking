import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  BookingStatus,
  PaymentStatus,
  ShowtimeSeatStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { MockPaymentDto } from './dto/mock-payment.dto.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
    private readonly config: ConfigService,
  ) {}

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

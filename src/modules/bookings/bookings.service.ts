import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  MovieStatus,
  PaymentStatus,
  Prisma,
  ShowtimeSeatStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';

const HOLD_TTL_SECONDS = 10 * 60;
const IDEMPOTENCY_KEY_MAX_LENGTH = 100;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async hold(userId: string, dto: CreateBookingDto, idempotencyKey?: string) {
    const normalizedIdempotencyKey = idempotencyKey?.trim();
    if (
      normalizedIdempotencyKey &&
      normalizedIdempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH
    ) {
      throw new ConflictException('Idempotency-Key is too long');
    }

    const requestedSeatIds = [...new Set(dto.showtimeSeatIds)];
    if (!requestedSeatIds.length) {
      throw new ConflictException('At least one seat is required');
    }
    const requestHash = this.createRequestHash(
      dto.showtimeId,
      requestedSeatIds,
    );

    if (normalizedIdempotencyKey) {
      const previousBooking = await this.findIdempotentBooking(
        userId,
        normalizedIdempotencyKey,
        requestHash,
      );
      if (previousBooking) {
        return this.toPublicBooking(previousBooking);
      }
    }

    const showtime = await this.prisma.showtime.findUnique({
      where: { id: dto.showtimeId },
      include: { movie: true },
    });

    if (!showtime || showtime.movie.status !== MovieStatus.PUBLISHED) {
      throw new NotFoundException('Showtime not found');
    }
    if (showtime.startsAt <= new Date()) {
      throw new ConflictException('Showtime has already started');
    }

    const seats = await this.prisma.showtimeSeat.findMany({
      where: { id: { in: requestedSeatIds }, showtimeId: dto.showtimeId },
      include: { seat: true },
    });
    if (seats.length !== requestedSeatIds.length) {
      throw new NotFoundException('One or more showtime seats were not found');
    }

    const holdToken = randomUUID();
    const acquiredSeatIds: string[] = [];

    try {
      for (const seat of seats) {
        const acquired = await this.redis.setIfAbsent(
          this.seatLockKey(dto.showtimeId, seat.id),
          holdToken,
          HOLD_TTL_SECONDS,
        );
        if (acquired !== 'OK') {
          const existingBooking = normalizedIdempotencyKey
            ? await this.waitForIdempotentBooking(
                userId,
                normalizedIdempotencyKey,
                requestHash,
              )
            : null;
          if (existingBooking) {
            return this.toPublicBooking(existingBooking);
          }
          throw new ConflictException('One or more seats are being held');
        }
        acquiredSeatIds.push(seat.id);
      }

      const expiresAt = new Date(Date.now() + HOLD_TTL_SECONDS * 1000);
      const booking = await this.prisma.$transaction(async (transaction) => {
        const now = new Date();
        await transaction.showtimeSeat.updateMany({
          where: {
            id: { in: requestedSeatIds },
            status: ShowtimeSeatStatus.HELD,
            heldUntil: { lte: now },
          },
          data: {
            status: ShowtimeSeatStatus.AVAILABLE,
            heldUntil: null,
            heldByBookingId: null,
          },
        });

        const availableSeats = await transaction.showtimeSeat.findMany({
          where: {
            id: { in: requestedSeatIds },
            showtimeId: dto.showtimeId,
            status: ShowtimeSeatStatus.AVAILABLE,
          },
          include: { seat: true },
        });
        if (availableSeats.length !== requestedSeatIds.length) {
          throw new ConflictException(
            'One or more seats are no longer available',
          );
        }

        const totalAmount = availableSeats.reduce(
          (total, seat) => total.plus(seat.price),
          new Prisma.Decimal(0),
        );
        const createdBooking = await transaction.booking.create({
          data: {
            userId,
            showtimeId: dto.showtimeId,
            totalAmount,
            expiresAt,
            holdToken,
            requestHash,
            ...(normalizedIdempotencyKey && {
              idempotencyKey: normalizedIdempotencyKey,
            }),
            items: {
              create: availableSeats.map((seat) => ({
                showtimeSeatId: seat.id,
                price: seat.price,
              })),
            },
          },
        });

        const claimedSeats = await transaction.showtimeSeat.updateMany({
          where: {
            id: { in: requestedSeatIds },
            status: ShowtimeSeatStatus.AVAILABLE,
          },
          data: {
            status: ShowtimeSeatStatus.HELD,
            heldUntil: expiresAt,
            heldByBookingId: createdBooking.id,
          },
        });
        if (claimedSeats.count !== requestedSeatIds.length) {
          throw new ConflictException(
            'One or more seats are no longer available',
          );
        }

        return transaction.booking.findUniqueOrThrow({
          where: { id: createdBooking.id },
          include: this.bookingInclude,
        });
      });

      return this.toPublicBooking(booking);
    } catch (error) {
      await this.releaseSeatLocks(dto.showtimeId, acquiredSeatIds, holdToken);

      if (isUniqueConstraintError(error) && normalizedIdempotencyKey) {
        const previousBooking = await this.findIdempotentBooking(
          userId,
          normalizedIdempotencyKey,
          requestHash,
        );
        if (previousBooking) {
          return this.toPublicBooking(previousBooking);
        }
      }

      throw error;
    }
  }

  async findMine(userId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { userId },
      include: this.bookingInclude,
      orderBy: { createdAt: 'desc' },
    });
    return bookings.map((booking) => this.toPublicBooking(booking));
  }

  async findOne(userId: string, id: string) {
    await this.expireBooking(id);
    const booking = await this.prisma.booking.findFirst({
      where: { id, userId },
      include: this.bookingInclude,
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return this.toPublicBooking(booking);
  }

  async cancel(userId: string, id: string) {
    await this.expireBooking(id);
    const booking = await this.prisma.booking.findFirst({
      where: { id, userId },
      include: { items: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new ConflictException('Only pending bookings can be cancelled');
    }

    const cancelled = await this.prisma.$transaction(async (transaction) => {
      const updatedBooking = await transaction.booking.updateMany({
        where: { id, userId, status: BookingStatus.PENDING },
        data: { status: BookingStatus.CANCELLED },
      });
      if (updatedBooking.count !== 1) {
        throw new ConflictException('Booking is no longer pending');
      }

      await transaction.payment.updateMany({
        where: { bookingId: id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
      await transaction.showtimeSeat.updateMany({
        where: {
          heldByBookingId: id,
          status: ShowtimeSeatStatus.HELD,
        },
        data: {
          status: ShowtimeSeatStatus.AVAILABLE,
          heldUntil: null,
          heldByBookingId: null,
        },
      });

      return transaction.booking.findUniqueOrThrow({
        where: { id },
        include: this.bookingInclude,
      });
    });

    await this.releaseSeatLocks(
      booking.showtimeId,
      booking.items.map((item) => item.showtimeSeatId),
      booking.holdToken,
    );

    return this.toPublicBooking(cancelled);
  }

  async checkout(userId: string, id: string) {
    await this.expireBooking(id);
    return this.prisma.$transaction(async (transaction) => {
      const booking = await transaction.booking.findFirst({
        where: { id, userId },
        include: { items: true, payment: true },
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

      const heldSeats = await transaction.showtimeSeat.count({
        where: {
          id: { in: booking.items.map((item) => item.showtimeSeatId) },
          heldByBookingId: id,
          status: ShowtimeSeatStatus.HELD,
        },
      });
      if (heldSeats !== booking.items.length) {
        throw new ConflictException(
          'Booking no longer owns all selected seats',
        );
      }

      return transaction.payment.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          amount: booking.totalAmount,
          provider: 'MOCK',
          status: PaymentStatus.PENDING,
        },
        update: {
          amount: booking.totalAmount,
          status: PaymentStatus.PENDING,
        },
      });
    });
  }

  async expireBookings() {
    const expiredBookings = await this.prisma.booking.findMany({
      where: { status: BookingStatus.PENDING, expiresAt: { lte: new Date() } },
      include: { items: true },
    });

    for (const booking of expiredBookings) {
      await this.expireBooking(booking.id);
    }
  }

  async expireBookingById(id: string) {
    await this.expireBooking(id);
  }

  async releaseSeatLocks(
    showtimeId: string,
    showtimeSeatIds: string[],
    holdToken: string,
  ) {
    await Promise.allSettled(
      showtimeSeatIds.map((showtimeSeatId) =>
        this.redis.releaseIfOwned(
          this.seatLockKey(showtimeId, showtimeSeatId),
          holdToken,
        ),
      ),
    );
  }

  toPublicBooking<T extends { holdToken: string }>(
    booking: T,
  ): Omit<T, 'holdToken'> {
    const publicBooking = { ...booking };
    Reflect.deleteProperty(publicBooking, 'holdToken');
    return publicBooking as Omit<T, 'holdToken'>;
  }

  private async expireBooking(id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: {
        id,
        status: BookingStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      include: { items: true },
    });
    if (!booking) {
      return;
    }

    const expired = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.booking.updateMany({
        where: { id, status: BookingStatus.PENDING },
        data: { status: BookingStatus.EXPIRED },
      });
      if (updated.count !== 1) {
        return false;
      }

      await transaction.payment.updateMany({
        where: { bookingId: id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
      await transaction.showtimeSeat.updateMany({
        where: {
          heldByBookingId: id,
          status: ShowtimeSeatStatus.HELD,
        },
        data: {
          status: ShowtimeSeatStatus.AVAILABLE,
          heldUntil: null,
          heldByBookingId: null,
        },
      });
      return true;
    });

    if (expired) {
      await this.releaseSeatLocks(
        booking.showtimeId,
        booking.items.map((item) => item.showtimeSeatId),
        booking.holdToken,
      );
    }
  }

  private async findIdempotentBooking(
    userId: string,
    idempotencyKey: string,
    requestHash: string,
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { userId, idempotencyKey },
      include: this.bookingInclude,
    });
    if (booking && booking.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency-Key was already used with a different request',
      );
    }
    return booking;
  }

  private async waitForIdempotentBooking(
    userId: string,
    idempotencyKey: string,
    requestHash: string,
  ) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const booking = await this.findIdempotentBooking(
        userId,
        idempotencyKey,
        requestHash,
      );
      if (booking) {
        return booking;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return null;
  }

  private createRequestHash(showtimeId: string, showtimeSeatIds: string[]) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          showtimeId,
          showtimeSeatIds: [...showtimeSeatIds].sort(),
        }),
      )
      .digest('hex');
  }

  private readonly bookingInclude = {
    showtime: {
      include: { movie: true, room: { include: { cinema: true } } },
    },
    items: {
      include: { showtimeSeat: { include: { seat: true } }, ticket: true },
    },
    payment: true,
    tickets: true,
  } satisfies Prisma.BookingInclude;

  private seatLockKey(showtimeId: string, showtimeSeatId: string) {
    return `booking:seat:${showtimeId}:${showtimeSeatId}`;
  }
}

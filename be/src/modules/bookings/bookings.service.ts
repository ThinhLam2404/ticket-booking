import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  MovieStatus,
  PaymentStatus,
  SepayIntentStatus,
  Prisma,
  ShowtimeSeatStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { SHOWTIME_BUFFER_SECONDS, computeHoldTtl } from './booking-policy.js';
import { logOperationalEvent } from '../../common/logging/operational-logger.js';
import {
  recordBookingExpired,
  recordHoldConflict,
} from '../observability/metrics.service.js';

const IDEMPOTENCY_KEY_MAX_LENGTH = 100;
const BOOKING_EXPIRY_BATCH_SIZE = 50;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAllAdmin(query: {
    search?: string;
    status?: BookingStatus;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const search = query.search?.trim();
    const where: Prisma.BookingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: 'insensitive' } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        include: {
          user: true,
          showtime: {
            include: { movie: true, room: { include: { cinema: true } } },
          },
          items: { include: { showtimeSeat: { include: { seat: true } } } },
          payment: true,
          refunds: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);
    return {
      data: toPublicResponse(data),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneAdmin(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: true,
        showtime: {
          include: { movie: true, room: { include: { cinema: true } } },
        },
        items: { include: { showtimeSeat: { include: { seat: true } } } },
        payment: true,
        tickets: true,
        refunds: true,
        sepayIntent: { include: { transactions: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    //NOTE - chuan hoa ko tra ve cac field nhu hashPassword, token,..
    return toPublicResponse(booking);
  }

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
    const showtime = await this.prisma.showtime.findUnique({
      where: { id: dto.showtimeId },
      include: { movie: true },
    });

    if (!showtime) {
      throw new NotFoundException('Showtime not found');
    }

    const seats = await this.prisma.showtimeSeat.findMany({
      where: { showtimeId: dto.showtimeId },
      include: { seat: true },
    });
    const seatsById = new Map(seats.map((seat) => [seat.id, seat]));
    const seatsByCoordinate = new Map(
      seats.map((seat) => [`${seat.seat.row}:${seat.seat.number}`, seat]),
    );
    const canonicalSeats = new Map<string, (typeof seats)[number]>();

    for (const seatId of requestedSeatIds) {
      const seat = seatsById.get(seatId);
      if (!seat) {
        throw new NotFoundException(
          'One or more showtime seats were not found',
        );
      }
      canonicalSeats.set(seat.id, seat);
      //NOTE - nếu chọn ghế couple thì tự động chọn ghế gần kề
      if (seat.seat.type === 'COUPLE') {
        const partnerNumber =
          seat.seat.number % 2 === 1
            ? seat.seat.number + 1
            : seat.seat.number - 1;
        const partner = seatsByCoordinate.get(
          `${seat.seat.row}:${partnerNumber}`,
        );
        if (!partner || partner.seat.type !== 'COUPLE') {
          throw new ConflictException('Couple seat must have a valid partner');
        }
        canonicalSeats.set(partner.id, partner);
      }
    }
    //NOTE - sắp xếp ghế theo thứ tự tăng dần
    const canonicalSeatIds = [...canonicalSeats.values()]
      .sort(
        (left, right) =>
          left.seat.row.localeCompare(right.seat.row) ||
          left.seat.number - right.seat.number,
      )
      .map((seat) => seat.id);
    //NOTE - maximum select 10 ghế
    if (canonicalSeatIds.length > 10) {
      throw new ConflictException('A maximum of 10 physical seats can be held');
    }
    const requestHash = this.createRequestHash(
      dto.showtimeId,
      canonicalSeatIds,
    );
    if (normalizedIdempotencyKey) {
      const previousBooking = await this.findIdempotentBooking(
        userId,
        normalizedIdempotencyKey,
        requestHash,
      );
      if (previousBooking) {
        return toPublicResponse(previousBooking);
      }
    }

    if (showtime.movie.status !== MovieStatus.PUBLISHED) {
      throw new NotFoundException('Showtime not found');
    }
    const secondsUntilShowtime = Math.floor(
      (showtime.startsAt.getTime() - Date.now()) / 1000,
    );
    if (secondsUntilShowtime <= 0) {
      throw new ConflictException('Showtime has already started');
    }
    if (secondsUntilShowtime <= SHOWTIME_BUFFER_SECONDS) {
      throw new ConflictException(
        'Showtime is too close to start for a new booking',
      );
    }

    const holdTtl = computeHoldTtl(secondsUntilShowtime);
    const holdToken = randomUUID();
    const acquiredSeatIds: string[] = [];
    try {
      for (const seatId of canonicalSeatIds) {
        const acquired = await this.redis.setIfAbsent(
          this.seatLockKey(dto.showtimeId, seatId),
          holdToken,
          holdTtl,
        );
        if (acquired !== 'OK') {
          //NOTE - nếu ghế đã có ng đặt thì kiểm tra xem có phải ghế của người khác đặt hay là của mình (retry 5 lần)
          const existingBooking = normalizedIdempotencyKey
            ? await this.waitForIdempotentBooking(
                userId,
                normalizedIdempotencyKey,
                requestHash,
              )
            : null;
          if (existingBooking) {
            return toPublicResponse(existingBooking);
          }
          recordHoldConflict();
          throw new ConflictException('One or more seats are being held');
        }
        acquiredSeatIds.push(seatId);
      }

      const expiresAt = new Date(Date.now() + holdTtl * 1000);
      const bookingId = await this.prisma.$transaction(
        async (transaction) => {
        const now = new Date();
        //NOTE - update trạng thái ghế held -> available nếu đã hết hạn
        await transaction.showtimeSeat.updateMany({
          where: {
            id: { in: canonicalSeatIds },
            status: ShowtimeSeatStatus.HELD,
            heldUntil: { lte: now },
          },
          data: {
            status: ShowtimeSeatStatus.AVAILABLE,
            heldUntil: null,
            heldByBookingId: null,
          },
        });
        //NOTE - kiểm tra xem còn đủ ghế trống k
        const availableSeats = await transaction.showtimeSeat.findMany({
          where: {
            id: { in: canonicalSeatIds },
            showtimeId: dto.showtimeId,
            status: ShowtimeSeatStatus.AVAILABLE,
          },
          include: { seat: true },
        });
        if (availableSeats.length !== canonicalSeatIds.length) {
          recordHoldConflict();
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
        //NOTE - update hold
        const claimedSeats = await transaction.showtimeSeat.updateMany({
          where: {
            id: { in: canonicalSeatIds },
            status: ShowtimeSeatStatus.AVAILABLE,
          },
          data: {
            status: ShowtimeSeatStatus.HELD,
            heldUntil: expiresAt,
            heldByBookingId: createdBooking.id,
          },
        });
        if (claimedSeats.count !== canonicalSeatIds.length) {
          recordHoldConflict();
          throw new ConflictException(
            'One or more seats are no longer available',
          );
        }

        return createdBooking.id;
      },
      { maxWait: 15_000, timeout: 15_000 },
    );

      const booking = await this.prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: this.bookingInclude,
      });
      logOperationalEvent('info', 'booking_held', {
        bookingId: booking.id,
        showtimeId: booking.showtimeId,
        seatCount: booking.items.length,
      });
      return toPublicResponse(booking);
    } catch (error) {
      //NOTE - nếu lỗi thì nhả lock redis
      await this.releaseSeatLocks(dto.showtimeId, acquiredSeatIds, holdToken);

      if (isUniqueConstraintError(error) && normalizedIdempotencyKey) {
        const previousBooking = await this.findIdempotentBooking(
          userId,
          normalizedIdempotencyKey,
          requestHash,
        );
        if (previousBooking) {
          return toPublicResponse(previousBooking);
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
    return bookings.map((booking) => toPublicResponse(booking));
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
    return toPublicResponse(booking);
  }

  async cancel(userId: string, id: string) {
    // NOTE trước khi huỷ thì check xem booking đó đã expire chưa
    await this.expireBooking(id);
    const booking = await this.prisma.booking.findFirst({
      where: { id, userId },
      include: this.bookingInclude,
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    //NOTE - trước khi cancel thì kiểm tra xem booking đã bị cancel hay expired chưa
    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.EXPIRED
    ) {
      await this.releaseSeatLocks(
        booking.showtimeId,
        booking.items.map((item) => item.showtimeSeatId),
        booking.holdToken,
      );
      return toPublicResponse(booking);
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
        const current = await transaction.booking.findUnique({
          where: { id },
          include: this.bookingInclude,
        });
        if (
          current?.status === BookingStatus.CANCELLED ||
          current?.status === BookingStatus.EXPIRED
        ) {
          return current;
        }
        throw new ConflictException('Booking is no longer pending');
      }

      await transaction.payment.updateMany({
        where: { bookingId: id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
      await transaction.sepayPaymentIntent.updateMany({
        where: { bookingId: id, status: SepayIntentStatus.PENDING },
        data: { status: SepayIntentStatus.CANCELLED },
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

    logOperationalEvent('info', 'booking_cancelled', {
      bookingId: cancelled.id,
      showtimeId: cancelled.showtimeId,
    });
    return toPublicResponse(cancelled);
  }

  async expireBookings() {
    let expiredCount = 0;

    while (true) {
      const expiredBookings = await this.prisma.booking.findMany({
        where: { status: BookingStatus.PENDING, expiresAt: { lte: new Date() } },
        select: { id: true },
        orderBy: { expiresAt: 'asc' },
        take: BOOKING_EXPIRY_BATCH_SIZE,
      });
      if (!expiredBookings.length) break;

      for (const booking of expiredBookings) {
        await this.expireBooking(booking.id);
        expiredCount += 1;
      }
      if (expiredBookings.length < BOOKING_EXPIRY_BATCH_SIZE) break;
    }

    return { processed: expiredCount };
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
      await transaction.sepayPaymentIntent.updateMany({
        where: { bookingId: id, status: SepayIntentStatus.PENDING },
        data: { status: SepayIntentStatus.EXPIRED },
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
      recordBookingExpired();
      logOperationalEvent('info', 'booking_expired', {
        bookingId: booking.id,
        showtimeId: booking.showtimeId,
      });
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

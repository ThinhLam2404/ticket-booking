import { createHash } from 'node:crypto';
import { Prisma, ShowtimeSeatStatus } from '@prisma/client';
import { BookingsService } from './bookings.service.js';

describe('BookingsService Couple seat handling', () => {
  function createService(showtimeSeats: Array<Record<string, unknown>>) {
    const showtimeSeatFindMany = vi.fn().mockResolvedValue(showtimeSeats);
    const redis = {
      setIfAbsent: vi.fn().mockResolvedValue('OK'),
      releaseIfOwned: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      showtime: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'showtime-1',
          startsAt: new Date(Date.now() + 60 * 60 * 1000),
          movie: { status: 'PUBLISHED' },
        }),
      },
      showtimeSeat: { findMany: showtimeSeatFindMany },
      booking: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'booking-1',
          totalAmount: new Prisma.Decimal(264000),
          items: [],
        }),
      },
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback({
          showtimeSeat: {
            updateMany: vi.fn().mockResolvedValue({ count: showtimeSeats.length }),
            findMany: vi.fn().mockResolvedValue(showtimeSeats),
          },
          booking: {
            create: vi.fn().mockResolvedValue({ id: 'booking-1' }),
            findUniqueOrThrow: vi.fn().mockResolvedValue({
              id: 'booking-1',
              totalAmount: new Prisma.Decimal(264000),
              items: [],
            }),
          },
        }),
      ),
    };
    return {
      service: new BookingsService(prisma as never, redis as never),
      prisma,
      redis,
    };
  }

  it('holds both physical seats when one Couple seat is requested', async () => {
    const seats = [
      {
        id: 'couple-1',
        showtimeId: 'showtime-1',
        price: new Prisma.Decimal(132000),
        status: ShowtimeSeatStatus.AVAILABLE,
        seat: { id: 'seat-1', row: 'G', number: 1, type: 'COUPLE' },
      },
      {
        id: 'couple-2',
        showtimeId: 'showtime-1',
        price: new Prisma.Decimal(132000),
        status: ShowtimeSeatStatus.AVAILABLE,
        seat: { id: 'seat-2', row: 'G', number: 2, type: 'COUPLE' },
      },
    ];
    const { service, prisma, redis } = createService(seats);

    await expect(
      service.hold('user-1', {
        showtimeId: 'showtime-1',
        showtimeSeatIds: ['couple-1'],
      }),
    ).resolves.toMatchObject({ id: 'booking-1', totalAmount: '264000.00' });

    expect(redis.setIfAbsent).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('rejects a Couple request that expands beyond ten physical seats', async () => {
    const seats = Array.from({ length: 12 }, (_, index) => ({
      id: `couple-${index + 1}`,
      showtimeId: 'showtime-1',
      price: new Prisma.Decimal(132000),
      status: ShowtimeSeatStatus.AVAILABLE,
      seat: {
        id: `seat-${index + 1}`,
        row: 'G',
        number: index + 1,
        type: 'COUPLE',
      },
    }));
    const { service, prisma, redis } = createService(seats);

    await expect(
      service.hold('user-1', {
        showtimeId: 'showtime-1',
        showtimeSeatIds: ['couple-1', 'couple-3', 'couple-5', 'couple-7', 'couple-9', 'couple-11'],
      }),
    ).rejects.toThrow('A maximum of 10 physical seats can be held');

    expect(redis.setIfAbsent).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an incomplete Couple pair', async () => {
    const seats = [
      {
        id: 'couple-1',
        showtimeId: 'showtime-1',
        price: new Prisma.Decimal(132000),
        status: ShowtimeSeatStatus.AVAILABLE,
        seat: { id: 'seat-1', row: 'G', number: 1, type: 'COUPLE' },
      },
    ];
    const { service, redis } = createService(seats);

    await expect(
      service.hold('user-1', {
        showtimeId: 'showtime-1',
        showtimeSeatIds: ['couple-1'],
      }),
    ).rejects.toThrow('Couple seat must have a valid partner');

    expect(redis.setIfAbsent).not.toHaveBeenCalled();
  });

  it('expires bookings in bounded batches', async () => {
    const bookingIds = Array.from({ length: 51 }, (_, index) => `booking-${index + 1}`);
    const expireBooking = vi.fn().mockResolvedValue(undefined);
    const findMany = vi
      .fn()
      .mockResolvedValueOnce(bookingIds.slice(0, 50).map((id) => ({ id })))
      .mockResolvedValueOnce(bookingIds.slice(50).map((id) => ({ id })))
      .mockResolvedValueOnce([]);
    const prisma = {
      booking: { findMany },
    };
    const service = new BookingsService(prisma as never, {} as never);
    (service as unknown as { expireBooking: typeof expireBooking }).expireBooking = expireBooking;

    await expect(service.expireBookings()).resolves.toEqual({ processed: 51 });
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ take: 50 }));
    expect(expireBooking).toHaveBeenCalledTimes(51);
  });

  it('returns an idempotent booking even when the showtime is no longer bookable', async () => {
    const existingBooking = {
      id: 'booking-1',
      status: 'CONFIRMED',
      showtimeId: 'showtime-1',
      requestHash: createHash('sha256')
        .update(JSON.stringify({ showtimeId: 'showtime-1', showtimeSeatIds: ['seat-1'] }))
        .digest('hex'),
    };
    const prisma = {
      showtime: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'showtime-1',
          startsAt: new Date(Date.now() - 60 * 1000),
          movie: { status: 'ARCHIVED' },
        }),
      },
      showtimeSeat: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'seat-1',
          showtimeId: 'showtime-1',
          price: new Prisma.Decimal(100000),
          status: ShowtimeSeatStatus.SOLD,
          seat: { id: 'seat-1', row: 'A', number: 1, type: 'STANDARD' },
        }]),
      },
      booking: {
        findFirst: vi.fn().mockResolvedValue(existingBooking),
      },
    };
    const redis = { setIfAbsent: vi.fn(), releaseIfOwned: vi.fn() };
    const service = new BookingsService(prisma as never, redis as never);

    await expect(service.hold('user-1', {
      showtimeId: 'showtime-1',
      showtimeSeatIds: ['seat-1'],
    }, 'retry-key')).resolves.toMatchObject({
      id: existingBooking.id,
      status: existingBooking.status,
      showtimeId: existingBooking.showtimeId,
    });
    expect(redis.setIfAbsent).not.toHaveBeenCalled();
  });
});

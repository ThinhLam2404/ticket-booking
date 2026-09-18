import { BadRequestException, ConflictException } from '@nestjs/common';
import { ShowtimeSeatStatus } from '@prisma/client';
import { ShowtimesService } from './showtimes.service.js';

describe('ShowtimesService province filtering', () => {
  it('filters public showtimes through the cinema province', async () => {
    const showtimeFindMany = vi.fn().mockResolvedValue([]);
    const showtimeCount = vi.fn().mockResolvedValue(0);
    const prisma = {
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
      showtime: { findMany: showtimeFindMany, count: showtimeCount },
    };
    const service = new ShowtimesService(prisma as never);

    await expect(service.findAll({ page: 1, pageSize: 20, provinceCode: 48 })).resolves.toMatchObject({
      data: [],
      meta: { total: 0 },
    });
    expect(showtimeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        room: { cinema: { provinceCode: 48 } },
      }),
    }));
    expect(showtimeCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        room: { cinema: { provinceCode: 48 } },
      }),
    }));
  });
});

describe('ShowtimesService admin updates', () => {
  it('rejects malformed room layouts before creating a showtime', async () => {
    const showtimeCreate = vi.fn();
    const prisma = {
      movie: { findUnique: vi.fn().mockResolvedValue({ status: 'PUBLISHED' }) },
      room: {
        findUnique: vi.fn().mockResolvedValue({
          seats: [{ id: 'seat-1', row: 'A', number: 1, type: 'STANDARD' }],
        }),
      },
      showtime: { findFirst: vi.fn().mockResolvedValue(null), create: showtimeCreate },
    };
    const service = new ShowtimesService(prisma as never);

    await expect(
      service.create({
        movieId: 'movie-1',
        roomId: 'room-1',
        startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        basePrice: 100000,
      }),
    ).rejects.toEqual(new BadRequestException('Seat layout requires at least five rows'));
    expect(showtimeCreate).not.toHaveBeenCalled();
  });

  it('keeps the existing seat prices when only the schedule changes', async () => {
    const showtimeSeatUpdate = vi.fn();
    const showtimeUpdate = vi.fn();
    const showtimeFindUniqueOrThrow = vi.fn().mockResolvedValue({ id: 'showtime-1' });
    const showtimeFindUnique = vi.fn().mockResolvedValue({
      id: 'showtime-1',
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      movieId: 'movie-1',
      roomId: 'room-1',
      basePrice: { toNumber: () => 100000 },
      vipMultiplier: { toNumber: () => 1.1 },
      coupleMultiplier: { toNumber: () => 1.2 },
      _count: { bookings: 0 },
      showtimeSeats: [{
        id: 'showtime-seat-1',
        price: { toNumber: () => 100000 },
        status: ShowtimeSeatStatus.AVAILABLE,
        seat: { type: 'STANDARD' },
      }],
    });
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback({
          showtime: {
            findUnique: showtimeFindUnique,
            findFirst: vi.fn().mockResolvedValue(null),
            update: showtimeUpdate,
            findUniqueOrThrow: showtimeFindUniqueOrThrow,
          },
          movie: { findUnique: vi.fn().mockResolvedValue({ status: 'PUBLISHED' }) },
          room: { findUnique: vi.fn().mockResolvedValue({ seats: [] }) },
          showtimeSeat: { update: showtimeSeatUpdate },
        }),
      ),
    };
    const service = new ShowtimesService(prisma as never);

    await expect(
      service.update('showtime-1', {
        startsAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
      }),
    ).resolves.toEqual({ id: 'showtime-1' });
    expect(showtimeUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'showtime-1' },
      data: expect.not.objectContaining({ basePrice: expect.anything() }),
    }));
    expect(showtimeSeatUpdate).not.toHaveBeenCalled();
  });

  it('reprices couple seats from the VIP price when pricing changes', async () => {
    const showtimeSeatUpdate = vi.fn().mockResolvedValue({});
    const showtimeFindUniqueOrThrow = vi.fn().mockResolvedValue({ id: 'showtime-1' });
    const current = {
      id: 'showtime-1',
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      movieId: 'movie-1',
      roomId: 'room-1',
      basePrice: { toNumber: () => 100000 },
      vipMultiplier: { toNumber: () => 1.1 },
      coupleMultiplier: { toNumber: () => 1.2 },
      _count: { bookings: 0 },
      showtimeSeats: [
        { id: 'standard', price: { toNumber: () => 100000 }, status: ShowtimeSeatStatus.AVAILABLE, seat: { type: 'STANDARD' } },
        { id: 'vip', price: { toNumber: () => 110000 }, status: ShowtimeSeatStatus.AVAILABLE, seat: { type: 'VIP' } },
        { id: 'couple', price: { toNumber: () => 132000 }, status: ShowtimeSeatStatus.AVAILABLE, seat: { type: 'COUPLE' } },
      ],
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback({
          showtime: {
            findUnique: vi.fn().mockResolvedValue(current),
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findUniqueOrThrow: showtimeFindUniqueOrThrow,
          },
          movie: { findUnique: vi.fn().mockResolvedValue({ status: 'PUBLISHED' }) },
          room: { findUnique: vi.fn().mockResolvedValue({ seats: [] }) },
          showtimeSeat: { update: showtimeSeatUpdate },
        }),
      ),
    };
    const service = new ShowtimesService(prisma as never);

    await service.update('showtime-1', { coupleMultiplier: 1.3 });

    expect(showtimeSeatUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 'standard' },
      data: { price: '100000.00' },
    });
    expect(showtimeSeatUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: 'vip' },
      data: { price: '110000.00' },
    });
    expect(showtimeSeatUpdate).toHaveBeenNthCalledWith(3, {
      where: { id: 'couple' },
      data: { price: '143000.00' },
    });
  });

  it('refuses an update when bookings already exist', async () => {
    const showtimeFindUnique = vi.fn().mockResolvedValue({
      id: 'showtime-1',
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      movieId: 'movie-1',
      roomId: 'room-1',
      basePrice: null,
      vipMultiplier: null,
      coupleMultiplier: null,
      _count: { bookings: 1 },
      showtimeSeats: [
        {
          id: 'showtime-seat-1',
          price: { toNumber: () => 100000 },
          status: ShowtimeSeatStatus.AVAILABLE,
          seat: { type: 'STANDARD' },
        },
      ],
    });
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback({ showtime: { findUnique: showtimeFindUnique } }),
      ),
    };
    const service = new ShowtimesService(prisma as never);

    await expect(
      service.update('showtime-1', {
        startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      }),
    ).rejects.toEqual(
      new ConflictException('Showtime cannot be updated after bookings exist'),
    );
  });
});

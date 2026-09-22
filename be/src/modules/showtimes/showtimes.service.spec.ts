import { BadRequestException, ConflictException } from '@nestjs/common';
import { ShowtimeSeatStatus } from '@prisma/client';
import { ShowtimesService } from './showtimes.service.js';

function vnDatePart(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function futureVnStartsAt(time: string): Date {
  const candidate = new Date(`${vnDatePart(new Date())}T${time}+07:00`);
  if (candidate.getTime() <= Date.now() + 60 * 1000) {
    return new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return candidate;
}

describe('ShowtimesService expiry lifecycle', () => {
  it('delegates expired booking cleanup before reading a showtime', async () => {
    const expireBookingsForShowtime = vi.fn().mockResolvedValue(undefined);
    const showtime = {
      id: 'showtime-1',
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      movie: { status: 'PUBLISHED' },
      room: { cinema: {} },
      showtimeSeats: [],
    };
    const prisma = {
      showtime: { findUnique: vi.fn().mockResolvedValue(showtime) },
    };
    const service = new ShowtimesService(
      prisma as never,
      { expireBookingsForShowtime } as never,
    );

    await service.findOne('showtime-1');

    expect(expireBookingsForShowtime).toHaveBeenCalledWith('showtime-1');
  });
});

describe('ShowtimesService province filtering', () => {
  it('filters public showtimes through the cinema province', async () => {
    const showtimeFindMany = vi.fn().mockResolvedValue([]);
    const showtimeCount = vi.fn().mockResolvedValue(0);
    const prisma = {
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
      showtime: { findMany: showtimeFindMany, count: showtimeCount },
    };
    const service = new ShowtimesService(prisma as never, { expireBookingsForShowtime: vi.fn() } as never);

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

function validRoomSeats() {
  return [
    ...['A', 'B', 'C'].flatMap((row) =>
      Array.from({ length: 2 }, (_, index) => ({
        id: `${row}-${index + 1}`,
        row,
        number: index + 1,
        type: 'STANDARD' as const,
      })),
    ),
    ...['D'].flatMap((row) =>
      Array.from({ length: 2 }, (_, index) => ({
        id: `${row}-${index + 1}`,
        row,
        number: index + 1,
        type: 'VIP' as const,
      })),
    ),
    ...['E'].flatMap((row) =>
      Array.from({ length: 2 }, (_, index) => ({
        id: `${row}-${index + 1}`,
        row,
        number: index + 1,
        type: 'COUPLE' as const,
      })),
    ),
  ];
}

describe('ShowtimesService scheduling', () => {
  it('requires an explicit timezone on the start time', async () => {
    const service = new ShowtimesService({} as never, { expireBookingsForShowtime: vi.fn() } as never);

    await expect(service.create({
      movieId: 'movie-1',
      roomId: 'room-1',
      startsAt: '2026-10-01T19:00',
      basePrice: 100000,
    })).rejects.toEqual(new BadRequestException('Showtime start must include an explicit timezone offset'));
  });

  it('derives the end time from the published movie duration', async () => {
    const seats = validRoomSeats();
    const showtimeCreate = vi.fn().mockResolvedValue({ id: 'showtime-1' });
    const prisma = {
      movie: { findUnique: vi.fn().mockResolvedValue({ id: 'movie-1', duration: 120, status: 'PUBLISHED' }) },
      room: { findUnique: vi.fn().mockResolvedValue({ id: 'room-1', seats }) },
      showtime: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback({
        showtime: {
          create: showtimeCreate,
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'showtime-1' }),
        },
        showtimeSeat: { createMany: vi.fn().mockResolvedValue({ count: seats.length }) },
      })),
    };
    const service = new ShowtimesService(prisma as never, { expireBookingsForShowtime: vi.fn() } as never);
    const startsAt = futureVnStartsAt('10:00:00');

    await service.create({
      movieId: 'movie-1',
      roomId: 'room-1',
      startsAt: startsAt.toISOString(),
      basePrice: 100000,
    });

    expect(showtimeCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        startsAt,
        endsAt: new Date(startsAt.getTime() + 120 * 60 * 1000),
      }),
    }));
  });

  it('builds a bulk preview sequentially using duration and turnaround', async () => {
    const seats = validRoomSeats();
    const prisma = {
      movie: { findUnique: vi.fn().mockResolvedValue({ id: 'movie-1', duration: 120, status: 'PUBLISHED' }) },
      room: { findUnique: vi.fn().mockResolvedValue({ id: 'room-1', seats }) },
      showtime: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ShowtimesService(prisma as never, { expireBookingsForShowtime: vi.fn() } as never);
    const firstStartsAt = futureVnStartsAt('10:00:00');

    const result = await service.previewBulk({
      movieId: 'movie-1',
      roomId: 'room-1',
      firstStartsAt: firstStartsAt.toISOString(),
      count: 2,
      turnaroundMinutes: 20,
      basePrice: 100000,
    });

    expect(result.valid).toBe(true);
    expect(result.slots).toHaveLength(2);
    expect(result.slots[1]?.startsAt).toEqual(new Date(firstStartsAt.getTime() + 140 * 60 * 1000));
    expect(result.slots[1]?.endsAt).toEqual(new Date(firstStartsAt.getTime() + 260 * 60 * 1000));
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
    const service = new ShowtimesService(prisma as never, { expireBookingsForShowtime: vi.fn() } as never);

    await expect(
      service.create({
        movieId: 'movie-1',
        roomId: 'room-1',
        startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
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
    const service = new ShowtimesService(prisma as never, { expireBookingsForShowtime: vi.fn() } as never);

    await expect(
      service.update('showtime-1', {
        startsAt: futureVnStartsAt('10:00:00').toISOString(),
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
    const service = new ShowtimesService(prisma as never, { expireBookingsForShowtime: vi.fn() } as never);

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
    const service = new ShowtimesService(prisma as never, { expireBookingsForShowtime: vi.fn() } as never);

    await expect(
      service.update('showtime-1', {
        startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      }),
    ).rejects.toEqual(
      new ConflictException('Showtime cannot be updated after bookings exist'),
    );
  });
});

describe('ShowtimesService operating hours', () => {
  function createService(prisma: Record<string, unknown>) {
    return new ShowtimesService(
      prisma as never,
      { expireBookingsForShowtime: vi.fn() } as never,
    );
  }

  it('rejects a showtime starting outside 08:00-23:00 VN', async () => {
    const seats = validRoomSeats();
    const prisma = {
      movie: { findUnique: vi.fn().mockResolvedValue({ id: 'movie-1', duration: 120, status: 'PUBLISHED' }) },
      room: { findUnique: vi.fn().mockResolvedValue({ id: 'room-1', seats }) },
      showtime: { findFirst: vi.fn() },
    };
    const service = createService(prisma);

    await expect(service.create({
      movieId: 'movie-1',
      roomId: 'room-1',
      startsAt: futureVnStartsAt('02:00:00').toISOString(),
      basePrice: 100000,
    })).rejects.toEqual(
      new ConflictException('Showtime starts outside venue operating hours'),
    );
    expect(prisma.showtime.findFirst).not.toHaveBeenCalled();
  });

  it('accepts a showtime starting at 23:00 VN', async () => {
    const seats = validRoomSeats();
    const showtimeCreate = vi.fn().mockResolvedValue({ id: 'showtime-1' });
    const prisma = {
      movie: { findUnique: vi.fn().mockResolvedValue({ id: 'movie-1', duration: 120, status: 'PUBLISHED' }) },
      room: { findUnique: vi.fn().mockResolvedValue({ id: 'room-1', seats }) },
      showtime: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback({
        showtime: {
          create: showtimeCreate,
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'showtime-1' }),
        },
        showtimeSeat: { createMany: vi.fn().mockResolvedValue({ count: seats.length }) },
      })),
    };
    const service = createService(prisma);

    await service.create({
      movieId: 'movie-1',
      roomId: 'room-1',
      startsAt: futureVnStartsAt('23:00:00').toISOString(),
      basePrice: 100000,
    });

    expect(showtimeCreate).toHaveBeenCalled();
  });

  it('marks bulk slots with conflicts and out-of-hours reasons', async () => {
    const seats = validRoomSeats();
    const firstStartsAt = futureVnStartsAt('10:00:00');
    const overlapping = {
      startsAt: new Date(firstStartsAt.getTime() + 30 * 60 * 1000),
      endsAt: new Date(firstStartsAt.getTime() + 90 * 60 * 1000),
    };
    const prisma = {
      movie: { findUnique: vi.fn().mockResolvedValue({ id: 'movie-1', duration: 120, status: 'PUBLISHED' }) },
      room: { findUnique: vi.fn().mockResolvedValue({ id: 'room-1', seats }) },
      showtime: { findMany: vi.fn().mockResolvedValue([overlapping]) },
    };
    const service = createService(prisma);

    const result = await service.previewBulk({
      movieId: 'movie-1',
      roomId: 'room-1',
      firstStartsAt: firstStartsAt.toISOString(),
      count: 2,
      turnaroundMinutes: 20,
      basePrice: 100000,
    });

    expect(result.valid).toBe(false);
    expect(result.slots[0]?.available).toBe(false);
    expect(result.slots[0]?.reasonCode).toBe('SHOWTIME_OVERLAP');
    expect(result.slots[0]?.conflicts).toEqual([
      { startsAt: overlapping.startsAt, endsAt: overlapping.endsAt },
    ]);
    expect(result.slots[1]?.available).toBe(true);
    expect(result.slots[1]?.reasonCode).toBeUndefined();
  });

  it('rejects an update that moves the start outside operating hours', async () => {
    const current = {
      id: 'showtime-1',
      startsAt: futureVnStartsAt('10:00:00'),
      endsAt: new Date(futureVnStartsAt('10:00:00').getTime() + 2 * 60 * 60 * 1000),
      movieId: 'movie-1',
      roomId: 'room-1',
      _count: { bookings: 0 },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback({
          showtime: { findUnique: vi.fn().mockResolvedValue(current) },
        }),
      ),
    };
    const service = createService(prisma);

    await expect(service.update('showtime-1', {
      startsAt: futureVnStartsAt('02:00:00').toISOString(),
    })).rejects.toEqual(
      new ConflictException('Showtime starts outside venue operating hours'),
    );
  });
});

describe('ShowtimesService free slots', () => {
  it('returns free windows between busy showtimes with turnaround', async () => {
    const prisma = {
      room: { findUnique: vi.fn().mockResolvedValue({ id: 'room-1' }) },
      showtime: {
        findMany: vi.fn().mockResolvedValue([
          {
            startsAt: new Date('2026-10-05T14:00:00+07:00'),
            endsAt: new Date('2026-10-05T16:00:00+07:00'),
          },
        ]),
      },
    };
    const service = new ShowtimesService(
      prisma as never,
      { expireBookingsForShowtime: vi.fn() } as never,
    );

    const result = await service.findFreeSlots('room-1', {
      date: '2026-10-05',
      durationMinutes: 120,
      turnaroundMinutes: 20,
    });

    expect(result.busy).toHaveLength(1);
    expect(result.freeWindows[0]?.startsAt).toEqual(new Date('2026-10-05T08:00:00+07:00'));
    expect(result.freeWindows[0]?.endsAt).toEqual(new Date('2026-10-05T13:40:00+07:00'));
    const last = result.freeWindows[result.freeWindows.length - 1];
    expect(last?.startsAt).toEqual(new Date('2026-10-05T16:20:00+07:00'));
    expect(last?.endsAt).toEqual(new Date('2026-10-05T23:00:00+07:00'));
  });

  it('drops windows shorter than the requested duration', async () => {
    const prisma = {
      room: { findUnique: vi.fn().mockResolvedValue({ id: 'room-1' }) },
      showtime: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ShowtimesService(
      prisma as never,
      { expireBookingsForShowtime: vi.fn() } as never,
    );

    const result = await service.findFreeSlots('room-1', {
      date: '2026-10-05',
      durationMinutes: 960,
      turnaroundMinutes: 20,
    });

    expect(result.freeWindows).toHaveLength(0);
  });

  it('throws when the room does not exist', async () => {
    const prisma = {
      room: { findUnique: vi.fn().mockResolvedValue(null) },
      showtime: { findMany: vi.fn() },
    };
    const service = new ShowtimesService(
      prisma as never,
      { expireBookingsForShowtime: vi.fn() } as never,
    );

    await expect(service.findFreeSlots('missing', {
      date: '2026-10-05',
      durationMinutes: 120,
      turnaroundMinutes: 20,
    })).rejects.toMatchObject({ message: 'Room not found' });
    expect(prisma.showtime.findMany).not.toHaveBeenCalled();
  });
});

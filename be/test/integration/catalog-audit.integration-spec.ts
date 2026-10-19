import type { INestApplication } from '@nestjs/common';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { CinemasService } from '../../src/modules/cinemas/cinemas.service.js';
import { RoomsService } from '../../src/modules/rooms/rooms.service.js';
import { SeatsService } from '../../src/modules/seats/seats.service.js';
import { ShowtimesService } from '../../src/modules/showtimes/showtimes.service.js';
import {
  adminPrisma,
  adminRedis,
  createFixture,
  createIntegrationApp,
  resetIntegrationState,
} from './helpers.js';

describe('Catalog mutations and transactional audit', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createIntegrationApp();
  });
  beforeEach(async () => {
    await resetIntegrationState();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await app?.close();
    await adminPrisma.$disconnect();
    await adminRedis.quit();
  });

  it.each(['single', 'room-bulk', 'cinema-bulk'] as const)(
    'audits %s scheduling and rolls back seats when audit fails',
    async (kind) => {
      const fixture = await createFixture(app);
      const room = await adminPrisma.room.findUniqueOrThrow({
        where: { id: fixture.roomId },
      });
      await app.get(ShowtimesService).remove(fixture.showtimeId);
      await adminPrisma.auditLog.deleteMany();
      const startsAt = new Date();
      startsAt.setUTCDate(startsAt.getUTCDate() + 3);
      startsAt.setUTCHours(3, 0, 0, 0); // 10:00 Asia/Ho_Chi_Minh
      const service = app.get(ShowtimesService);
      const schedule = () =>
        kind === 'single'
          ? service.create({
              movieId: fixture.movieId,
              roomId: fixture.roomId,
              startsAt: startsAt.toISOString(),
            })
          : kind === 'room-bulk'
            ? service.createBulk({
                movieId: fixture.movieId,
                roomId: fixture.roomId,
                firstStartsAt: startsAt.toISOString(),
                count: 2,
                turnaroundMinutes: 20,
              })
            : service.createCinemaBulk({
                movieId: fixture.movieId,
                cinemaId: room.cinemaId,
                date: startsAt.toISOString().slice(0, 10),
                count: 2,
                turnaroundMinutes: 20,
                randomSeed: 42,
              });
      const spy = vi
        .spyOn(app.get(AuditService), 'record')
        .mockRejectedValue(new Error('audit unavailable'));
      await expect(schedule()).rejects.toThrow('audit unavailable');
      expect(await adminPrisma.showtime.count()).toBe(0);
      expect(await adminPrisma.showtimeSeat.count()).toBe(0);
      expect(await adminPrisma.auditLog.count()).toBe(0);
      spy.mockRestore();
      await schedule();
      const logs = await adminPrisma.auditLog.findMany({
        where: { action: 'SHOWTIME_CREATED' },
      });
      expect(logs).toHaveLength(kind === 'single' ? 1 : 2);
      expect(logs[0].after).toMatchObject({
        movieId: fixture.movieId,
        roomId: fixture.roomId,
      });
      const showtime = await adminPrisma.showtime.findFirstOrThrow();
      await service.update(showtime.id, { basePrice: 150000 });
      const updated = await adminPrisma.auditLog.findFirstOrThrow({
        where: { action: 'SHOWTIME_UPDATED' },
      });
      expect(updated.after).toMatchObject({ basePrice: '150000' });
    },
  );

  it('records cinema, room and seat before/after without related payloads', async () => {
    const cinemas = app.get(CinemasService);
    const rooms = app.get(RoomsService);
    const seats = app.get(SeatsService);
    const cinema = await cinemas.create({
      name: 'Audit cinema',
      address: 'Test address',
      provinceCode: 79,
    });
    await cinemas.update(cinema.id, { name: 'Renamed cinema' });
    const room = await rooms.create({ cinemaId: cinema.id, name: 'Room A' });
    await rooms.update(room.id, { name: 'Room B' });
    const seat = await seats.create(room.id, { row: 'a', number: 1 });
    await seats.update(seat.id, { type: 'VIP' });
    await seats.remove(seat.id);
    await rooms.remove(room.id);
    await cinemas.remove(cinema.id);
    const logs = await adminPrisma.auditLog.findMany();
    expect(logs).toHaveLength(9);
    expect(logs.find((log) => log.action === 'ROOM_UPDATED')).toMatchObject({
      before: { name: 'Room A' },
      after: { name: 'Room B' },
    });
    expect(logs.find((log) => log.action === 'SEAT_UPDATED')).toMatchObject({
      before: { type: 'STANDARD' },
      after: { type: 'VIP' },
    });
    expect(logs.find((log) => log.action === 'CINEMA_UPDATED')).toMatchObject({
      before: { name: 'Audit cinema' },
      after: { name: 'Renamed cinema' },
    });
  });

  it.each(['cinema', 'room', 'seat', 'showtime'] as const)(
    'rolls back %s updates when audit storage fails',
    async (kind) => {
      const fixture = await createFixture(app);
      const room = await adminPrisma.room.findUniqueOrThrow({
        where: { id: fixture.roomId },
      });
      const spare = await adminPrisma.room.create({
        data: { cinemaId: room.cinemaId, name: 'Spare' },
      });
      const seat = await adminPrisma.seat.create({
        data: { roomId: spare.id, row: 'A', number: 1 },
      });
      vi.spyOn(app.get(AuditService), 'record').mockRejectedValue(
        new Error('audit unavailable'),
      );
      const mutation = {
        cinema: () =>
          app
            .get(CinemasService)
            .update(room.cinemaId, { name: 'Must rollback' }),
        room: () =>
          app.get(RoomsService).update(spare.id, { name: 'Must rollback' }),
        seat: () => app.get(SeatsService).update(seat.id, { type: 'VIP' }),
        showtime: () => app.get(ShowtimesService).remove(fixture.showtimeId),
      }[kind];
      await expect(mutation()).rejects.toThrow('audit unavailable');
      expect(
        (
          await adminPrisma.cinema.findUniqueOrThrow({
            where: { id: room.cinemaId },
          })
        ).name,
      ).not.toBe('Must rollback');
      expect(
        (await adminPrisma.room.findUniqueOrThrow({ where: { id: spare.id } }))
          .name,
      ).toBe('Spare');
      expect(
        (await adminPrisma.seat.findUniqueOrThrow({ where: { id: seat.id } }))
          .type,
      ).toBe('STANDARD');
      expect(
        await adminPrisma.showtime.findUnique({
          where: { id: fixture.showtimeId },
        }),
      ).not.toBeNull();
      expect(await adminPrisma.auditLog.count()).toBe(0);
    },
  );

  it('rolls back catalog creation, deletion and layout replacement on audit failure', async () => {
    const fixture = await createFixture(app);
    const room = await adminPrisma.room.findUniqueOrThrow({
      where: { id: fixture.roomId },
    });
    const spare = await adminPrisma.room.create({
      data: { cinemaId: room.cinemaId, name: 'Spare' },
    });
    const seat = await adminPrisma.seat.create({
      data: { roomId: spare.id, row: 'A', number: 1 },
    });
    const emptyCinema = await adminPrisma.cinema.create({
      data: { name: 'Empty', address: 'Address', provinceCode: 79 },
    });
    vi.spyOn(app.get(AuditService), 'record').mockRejectedValue(
      new Error('audit unavailable'),
    );
    const mutations = [
      () =>
        app
          .get(CinemasService)
          .create({ name: 'Rollback', address: 'Address', provinceCode: 79 }),
      () =>
        app
          .get(RoomsService)
          .create({ cinemaId: room.cinemaId, name: 'Rollback' }),
      () => app.get(SeatsService).create(spare.id, { row: 'B', number: 1 }),
      () => app.get(CinemasService).remove(emptyCinema.id),
      () => app.get(RoomsService).remove(spare.id),
      () => app.get(SeatsService).remove(seat.id),
      () =>
        app.get(SeatsService).replaceLayout(
          spare.id,
          ['A', 'B', 'C', 'D', 'E'].flatMap((row) =>
            [1, 2].map((number) => ({
              row,
              number,
              type:
                row === 'E'
                  ? ('COUPLE' as const)
                  : row === 'D'
                    ? ('VIP' as const)
                    : ('STANDARD' as const),
            })),
          ),
        ),
    ];
    for (const mutate of mutations)
      await expect(mutate()).rejects.toThrow('audit unavailable');
    expect(await adminPrisma.cinema.count()).toBe(2);
    expect(await adminPrisma.room.count()).toBe(2);
    expect(await adminPrisma.seat.count({ where: { roomId: spare.id } })).toBe(
      1,
    );
    expect(
      await adminPrisma.seat.findUnique({ where: { id: seat.id } }),
    ).not.toBeNull();
    expect(await adminPrisma.auditLog.count()).toBe(0);
  });

  it('records layout counts and showtime deletion without storing whole seat maps', async () => {
    const fixture = await createFixture(app);
    const room = await adminPrisma.room.findUniqueOrThrow({
      where: { id: fixture.roomId },
    });
    const spare = await adminPrisma.room.create({
      data: { cinemaId: room.cinemaId, name: 'Layout room' },
    });
    const layout = ['A', 'B', 'C', 'D', 'E'].flatMap((row) =>
      [1, 2].map((number) => ({
        row,
        number,
        type:
          row === 'E'
            ? ('COUPLE' as const)
            : row === 'D'
              ? ('VIP' as const)
              : ('STANDARD' as const),
      })),
    );
    await app.get(SeatsService).replaceLayout(spare.id, layout);
    await app.get(ShowtimesService).remove(fixture.showtimeId);
    const logs = await adminPrisma.auditLog.findMany();
    expect(
      logs.find((log) => log.action === 'SEAT_LAYOUT_REPLACED'),
    ).toMatchObject({ before: { count: 0 }, after: { count: 10 } });
    expect(logs.find((log) => log.action === 'SHOWTIME_DELETED')).toMatchObject(
      { before: { movieId: fixture.movieId, basePrice: '100000' } },
    );
    expect(JSON.stringify(logs)).not.toContain('showtimeSeats');
  });
});

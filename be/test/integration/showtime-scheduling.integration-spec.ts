import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ShowtimesService } from '../../src/modules/showtimes/showtimes.service.js';
import {
  adminPrisma,
  adminRedis,
  createFixture,
  createIntegrationApp,
  resetIntegrationState,
  type IntegrationFixture,
} from './helpers.js';

describe('Showtime batch scheduling on PostgreSQL', () => {
  let app: INestApplication;
  let fixture: IntegrationFixture;
  const startsAt = () => {
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(Date.now() + 7 * 86400000));
    return `${day}T10:00:00+07:00`;
  };
  beforeAll(async () => {
    app = await createIntegrationApp();
  });
  beforeEach(async () => {
    await resetIntegrationState();
    fixture = await createFixture(app);
  });
  afterAll(async () => {
    await app?.close();
    await adminPrisma.$disconnect();
    await adminRedis.quit();
  });

  it('persists complete snapshots and reprices/deletes the committed showtime', async () => {
    const service = app.get(ShowtimesService);
    const created = await service.createBulk({
      movieId: fixture.movieId,
      roomId: fixture.roomId,
      firstStartsAt: startsAt(),
      count: 2,
      turnaroundMinutes: 20,
    });
    expect(created).toHaveLength(2);
    for (const showtime of created) {
      expect(
        await adminPrisma.showtimeSeat.count({
          where: { showtimeId: showtime.id },
        }),
      ).toBe(10);
    }
    const id = created[0]!.id;
    await service.update(id, {
      basePrice: 100000,
      vipMultiplier: 1.1,
      coupleMultiplier: 1.3,
    });
    const seats = await adminPrisma.showtimeSeat.findMany({
      where: { showtimeId: id },
      include: { seat: true },
    });
    for (const item of seats) {
      expect(item.price.toNumber()).toBe(
        item.seat.type === 'COUPLE'
          ? 143000
          : item.seat.type === 'VIP'
            ? 110000
            : 100000,
      );
    }
    await service.remove(id);
    expect(await adminPrisma.showtime.findUnique({ where: { id } })).toBeNull();
    expect(
      await adminPrisma.showtimeSeat.count({ where: { showtimeId: id } }),
    ).toBe(0);
  });

  it('rolls back a batch rejected by the database exclusion constraint', async () => {
    const before = await adminPrisma.showtime.count();
    // Deliberately bypass DTO validation to exercise the database's last line of defense.
    await expect(
      app
        .get(ShowtimesService)
        .createBulk({
          movieId: fixture.movieId,
          roomId: fixture.roomId,
          firstStartsAt: startsAt(),
          count: 2,
          turnaroundMinutes: -60,
        }),
    ).rejects.toThrow();
    expect(await adminPrisma.showtime.count()).toBe(before);
    expect(await adminPrisma.showtimeSeat.count()).toBe(
      fixture.showtimeSeatIds.length,
    );
  });

  it('allows only one competing batch for the same room/time', async () => {
    const body = {
      movieId: fixture.movieId,
      roomId: fixture.roomId,
      firstStartsAt: startsAt(),
      count: 2,
      turnaroundMinutes: 20,
    };
    const send = () =>
      request(app.getHttpServer())
        .post('/api/v1/showtimes/bulk')
        .set('Authorization', `Bearer ${fixture.admin.token}`)
        .send(body);
    const results = await Promise.all([send(), send()]);
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await adminPrisma.showtime.count({
        where: { startsAt: { gte: new Date(body.firstStartsAt) } },
      }),
    ).toBe(2);
  });
});

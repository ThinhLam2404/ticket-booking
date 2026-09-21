import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { BookingStatus, PaymentStatus, ShowtimeSeatStatus } from '@prisma/client';
import { BookingsService } from '../../src/modules/bookings/bookings.service.js';
import {
  adminPrisma,
  adminRedis,
  createFixture,
  createIntegrationApp,
  resetIntegrationState,
  type IntegrationFixture,
} from './helpers.js';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function hold(app: INestApplication, token: string, showtimeId: string, seatIds: string[], key: string) {
  return request(app.getHttpServer())
    .post('/api/v1/bookings/hold')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send({ showtimeId, showtimeSeatIds: seatIds });
}

describe('Booking flow integration', () => {
  let appA: INestApplication;
  let appB: INestApplication;
  let fixture: IntegrationFixture;

  beforeAll(async () => {
    appA = await createIntegrationApp();
    appB = await createIntegrationApp();
  });

  beforeEach(async () => {
    await resetIntegrationState();
    fixture = await createFixture(appA);
  });

  afterEach(async () => {
    await resetIntegrationState();
  });

  afterAll(async () => {
    await Promise.all([appA.close(), appB.close()]);
    await Promise.all([adminPrisma.$disconnect(), adminRedis.quit()]);
  });

  it('reports real database and Redis readiness', async () => {
    const response = await request(appA.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('creates bulk showtimes from movie duration and rolls back on overlap', async () => {
    const firstStartsAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const body = {
      movieId: fixture.movieId,
      roomId: fixture.roomId,
      firstStartsAt,
      count: 2,
      turnaroundMinutes: 20,
      basePrice: 100000,
    };
    const created = await request(appA.getHttpServer())
      .post('/api/v1/showtimes/bulk')
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send(body)
      .expect(201);

    expect(created.body).toHaveLength(2);
    expect(new Date(created.body[0].endsAt).getTime() - new Date(created.body[0].startsAt).getTime()).toBe(120 * 60 * 1000);
    expect(await adminPrisma.showtime.count({ where: { movieId: fixture.movieId } })).toBe(3);

    const conflict = await request(appA.getHttpServer())
      .post('/api/v1/showtimes/bulk')
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ ...body, firstStartsAt: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString() })
      .expect(409);

    expect(conflict.body.code).toBe('SHOWTIME_OVERLAP');
    expect(await adminPrisma.showtime.count({ where: { movieId: fixture.movieId } })).toBe(3);
  });

  it('allows only one user to hold a seat concurrently', async () => {
    const gate = deferred<void>();
    const contenders = [
      (async () => {
        await gate.promise;
        return hold(appA, fixture.customerA.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], `hold-a-${Date.now()}`);
      })(),
      (async () => {
        await gate.promise;
        return hold(appB, fixture.customerB.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], `hold-b-${Date.now()}`);
      })(),
    ];
    gate.resolve(undefined);
    const responses = await Promise.all(contenders);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 409]);
    expect(await adminPrisma.booking.count({ where: { status: BookingStatus.PENDING } })).toBe(1);
    expect(await adminPrisma.bookingItem.count({ where: { showtimeSeatId: fixture.showtimeSeatIds[0] } })).toBe(1);
    expect(await adminPrisma.showtimeSeat.findUnique({ where: { id: fixture.showtimeSeatIds[0] } })).toMatchObject({
      status: ShowtimeSeatStatus.HELD,
    });
  });

  it('returns the canonical booking for a repeated hold key and payload', async () => {
    const key = `hold-retry-${Date.now()}`;
    const first = await hold(appA, fixture.customerA.token, fixture.showtimeId, fixture.showtimeSeatIds.slice(0, 2), key).expect(201);
    const second = await hold(appA, fixture.customerA.token, fixture.showtimeId, fixture.showtimeSeatIds.slice(0, 2).reverse(), key).expect(201);

    expect(second.body.id).toBe(first.body.id);
    expect(await adminPrisma.booking.count({ where: { userId: fixture.customerA.id } })).toBe(1);
    expect(await adminPrisma.bookingItem.count({ where: { bookingId: first.body.id } })).toBe(2);
  });

  it('returns one canonical booking for concurrent same-key holds', async () => {
    const key = `hold-concurrent-${Date.now()}`;
    const responses = await Promise.all([
      hold(appA, fixture.customerA.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], key),
      hold(appB, fixture.customerA.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], key),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    expect(await adminPrisma.booking.count({ where: { userId: fixture.customerA.id } })).toBe(1);
    expect(await adminPrisma.bookingItem.count({ where: { showtimeSeatId: fixture.showtimeSeatIds[0] } })).toBe(1);
  });

  it('rejects a reused hold key with a different payload without locking the losing seat', async () => {
    const key = `hold-mismatch-${Date.now()}`;
    await hold(appA, fixture.customerA.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], key).expect(201);
    const response = await hold(appA, fixture.customerA.token, fixture.showtimeId, [fixture.showtimeSeatIds[1]], key).expect(409);

    expect(response.body.message).toBe('Idempotency-Key was already used with a different request');
    expect(await adminPrisma.showtimeSeat.findUnique({ where: { id: fixture.showtimeSeatIds[1] } })).toMatchObject({
      status: ShowtimeSeatStatus.AVAILABLE,
    });
    expect(await adminRedis.get(`booking:seat:${fixture.showtimeId}:${fixture.showtimeSeatIds[1]}`)).toBeNull();
  });

  it('cancels a booking idempotently and releases the seat', async () => {
    const held = await hold(appA, fixture.customerA.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], `hold-cancel-${Date.now()}`).expect(201);
    const path = `/api/v1/bookings/${held.body.id}/cancel`;
    const first = await request(appA.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(201);
    const second = await request(appA.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(201);

    expect(first.body.status).toBe(BookingStatus.CANCELLED);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.status).toBe(BookingStatus.CANCELLED);
    expect(await adminPrisma.showtimeSeat.findUnique({ where: { id: fixture.showtimeSeatIds[0] } })).toMatchObject({
      status: ShowtimeSeatStatus.AVAILABLE,
      heldUntil: null,
      heldByBookingId: null,
    });
    expect(await adminRedis.get(`booking:seat:${fixture.showtimeId}:${fixture.showtimeSeatIds[0]}`)).toBeNull();
  });

  it('expires a booking and releases the seat for another user', async () => {
    const held = await hold(appA, fixture.customerA.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], `hold-expire-${Date.now()}`).expect(201);
    await request(appA.getHttpServer())
      .post(`/api/v1/bookings/${held.body.id}/checkout`)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(201);
    await adminPrisma.booking.update({
      where: { id: held.body.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await appA.get(BookingsService).expireBookings();
    const expired = await adminPrisma.booking.findUnique({ where: { id: held.body.id } });
    const seat = await adminPrisma.showtimeSeat.findUnique({ where: { id: fixture.showtimeSeatIds[0] } });

    expect(expired?.status).toBe(BookingStatus.EXPIRED);
    expect(expired && await adminPrisma.payment.findUnique({ where: { bookingId: expired.id } })).toMatchObject({ status: PaymentStatus.FAILED });
    expect(seat).toMatchObject({ status: ShowtimeSeatStatus.AVAILABLE, heldUntil: null, heldByBookingId: null });
    expect(await adminRedis.get(`booking:seat:${fixture.showtimeId}:${fixture.showtimeSeatIds[0]}`)).toBeNull();
    await hold(appB, fixture.customerB.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], `hold-after-expire-${Date.now()}`).expect(201);
  });

  it('rejects a hold in the purchase window and completes atomic purchase', async () => {
    const nearShowtime = await adminPrisma.showtime.update({
      where: { id: fixture.showtimeId },
      data: {
        startsAt: new Date(Date.now() + 15 * 60 * 1000),
        endsAt: new Date(Date.now() + 17 * 60 * 60 * 1000),
      },
    });
    const holdResponse = await hold(appA, fixture.customerA.token, nearShowtime.id, [fixture.showtimeSeatIds[0]], `hold-direct-${Date.now()}`);
    expect(holdResponse.status).toBe(409);
    expect(holdResponse.body.code).toBe('PURCHASE_REQUIRED');

    const response = await request(appA.getHttpServer())
      .post('/api/v1/payments/mock/purchase')
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .set('Idempotency-Key', `purchase-${Date.now()}`)
      .send({ showtimeId: nearShowtime.id, showtimeSeatIds: [fixture.showtimeSeatIds[0]], success: true })
      .expect(201);

    expect(response.body.booking.status).toBe(BookingStatus.CONFIRMED);
    expect(response.body.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(await adminPrisma.ticket.count({ where: { bookingId: response.body.booking.id } })).toBe(1);
    expect(await adminPrisma.showtimeSeat.findUnique({ where: { id: fixture.showtimeSeatIds[0] } })).toMatchObject({ status: ShowtimeSeatStatus.SOLD });
  });

  it('keeps one payment and one ticket per item on successful payment retry', async () => {
    const held = await hold(appA, fixture.customerA.token, fixture.showtimeId, fixture.showtimeSeatIds.slice(0, 2), `hold-payment-${Date.now()}`).expect(201);
    await request(appA.getHttpServer())
      .post(`/api/v1/bookings/${held.body.id}/checkout`)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(201);
    const key = `payment-success-${Date.now()}`;
    const paymentPath = `/api/v1/payments/mock/${held.body.id}`;
    const first = await request(appA.getHttpServer())
      .post(paymentPath)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .set('Idempotency-Key', key)
      .send({ success: true, reference: `ref-${Date.now()}` })
      .expect(201);
    const second = await request(appA.getHttpServer())
      .post(paymentPath)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .set('Idempotency-Key', key)
      .send({ success: true })
      .expect(201);

    expect(second.body.payment.id).toBe(first.body.payment.id);
    expect(await adminPrisma.payment.count({ where: { bookingId: held.body.id } })).toBe(1);
    expect(await adminPrisma.ticket.count({ where: { bookingId: held.body.id } })).toBe(2);
    expect(await adminPrisma.booking.findUnique({ where: { id: held.body.id } })).toMatchObject({ status: BookingStatus.CONFIRMED });
  });

  it('returns a canonical result for concurrent successful payment retries', async () => {
    const held = await hold(appA, fixture.customerA.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], `hold-concurrent-payment-${Date.now()}`).expect(201);
    await request(appA.getHttpServer())
      .post(`/api/v1/bookings/${held.body.id}/checkout`)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(201);
    const key = `payment-concurrent-${Date.now()}`;
    const paymentPath = `/api/v1/payments/mock/${held.body.id}`;
    const responses = await Promise.all([
      request(appA.getHttpServer())
        .post(paymentPath)
        .set('Authorization', `Bearer ${fixture.customerA.token}`)
        .set('Idempotency-Key', key)
        .send({ success: true }),
      request(appB.getHttpServer())
        .post(paymentPath)
        .set('Authorization', `Bearer ${fixture.customerA.token}`)
        .set('Idempotency-Key', key)
        .send({ success: true }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 201]);
    expect(responses[0].body.payment.id).toBe(responses[1].body.payment.id);
    expect(await adminPrisma.payment.count({ where: { bookingId: held.body.id } })).toBe(1);
    expect(await adminPrisma.ticket.count({ where: { bookingId: held.body.id } })).toBe(1);
  });

  it('cancels on payment failure and releases the seat', async () => {
    const held = await hold(appA, fixture.customerA.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], `hold-failure-${Date.now()}`).expect(201);
    await request(appA.getHttpServer())
      .post(`/api/v1/bookings/${held.body.id}/checkout`)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(201);
    await request(appA.getHttpServer())
      .post(`/api/v1/payments/mock/${held.body.id}`)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .set('Idempotency-Key', `payment-failure-${Date.now()}`)
      .send({ success: false })
      .expect(201);

    expect(await adminPrisma.payment.findUnique({ where: { bookingId: held.body.id } })).toMatchObject({ status: PaymentStatus.FAILED });
    expect(await adminPrisma.booking.findUnique({ where: { id: held.body.id } })).toMatchObject({ status: BookingStatus.CANCELLED });
    expect(await adminPrisma.ticket.count({ where: { bookingId: held.body.id } })).toBe(0);
    expect(await adminPrisma.showtimeSeat.findUnique({ where: { id: fixture.showtimeSeatIds[0] } })).toMatchObject({
      status: ShowtimeSeatStatus.AVAILABLE,
      heldUntil: null,
      heldByBookingId: null,
    });
    await hold(appB, fixture.customerB.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], `hold-after-failure-${Date.now()}`).expect(201);
  });
});

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { BookingStatus, SepayIntentStatus, SepayTransactionStatus, ShowtimeSeatStatus } from '@prisma/client';
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

function sepayWebhook(app: INestApplication, payload: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post('/api/v1/payments/sepay/webhook')
    .set('Authorization', 'Apikey integration-webhook-key')
    .send(payload);
}

function paymentWebhookPayload(intent: { paymentCode: string; amount: string }, id: number) {
  return {
    id,
    gateway: 'IntegrationBank',
    transactionDate: new Date().toISOString(),
    accountNumber: 'integration-account',
    transferType: 'in',
    transferAmount: Number(intent.amount),
    content: `Thanh toan ${intent.paymentCode}`,
    referenceCode: `INTEGRATION-${id}`,
  };
}

function vnMorningStartsAt(daysAhead: number): Date {
  const target = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target);
  return new Date(`${parts}T10:00:00+07:00`);
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

  it('does not enqueue another verification email during the resend cooldown', async () => {
    const email = `resend-${Date.now()}@example.com`;
    await request(appA.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Resend Customer', email, password: 'Password123!' })
      .expect(201);

    const before = await Promise.all([
      adminPrisma.emailVerificationToken.count(),
      adminPrisma.mailOutbox.count(),
    ]);
    const resend = await request(appA.getHttpServer())
      .post('/api/v1/auth/email/resend')
      .send({ email })
      .expect(200);

    expect(resend.body).toEqual({ sent: true });
    expect(await adminPrisma.emailVerificationToken.count()).toBe(before[0]);
    expect(await adminPrisma.mailOutbox.count()).toBe(before[1]);
  });

  it('rotates refresh tokens atomically and revokes the family after reuse', async () => {
    const email = `refresh-${Date.now()}@example.com`;
    const password = 'Password123!';
    await request(appA.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Refresh Customer', email, password })
      .expect(201);
    const user = await adminPrisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
    const login = await request(appA.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const originalRefreshToken = login.body.refreshToken as string;

    const concurrent = await Promise.all([
      request(appA.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalRefreshToken }),
      request(appB.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalRefreshToken }),
    ]);

    expect(concurrent.map((response) => response.status).sort()).toEqual([200, 401]);
    const rotated = concurrent.find((response) => response.status === 200);
    expect(rotated?.body.refreshToken).toBeTruthy();
    expect(
      await adminPrisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await adminPrisma.refreshToken.count({
        where: { userId: user.id, reuseDetectedAt: { not: null } },
      }),
    ).toBeGreaterThan(0);

    await request(appA.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated?.body.refreshToken })
      .expect(401);
    expect(
      await adminPrisma.refreshToken.count({
        where: { userId: user.id, reuseDetectedAt: { not: null } },
      }),
    ).toBeGreaterThan(0);
  });

  it('creates bulk showtimes from movie duration and rolls back on overlap', async () => {
    const firstStartsAt = vnMorningStartsAt(2).toISOString();
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
      .send({ ...body, firstStartsAt: new Date(vnMorningStartsAt(2).getTime() + 60 * 60 * 1000).toISOString() })
      .expect(409);

    expect(conflict.body.code).toBe('SHOWTIME_OVERLAP');
    expect(await adminPrisma.showtime.count({ where: { movieId: fixture.movieId } })).toBe(3);
  });

  it('allows only one concurrent bulk schedule request to commit', async () => {
    const body = {
      movieId: fixture.movieId,
      roomId: fixture.roomId,
      firstStartsAt: vnMorningStartsAt(3).toISOString(),
      count: 2,
      turnaroundMinutes: 20,
      basePrice: 100000,
    };
    const responses = await Promise.all([
      request(appA.getHttpServer())
        .post('/api/v1/showtimes/bulk')
        .set('Authorization', `Bearer ${fixture.admin.token}`)
        .send(body),
      request(appB.getHttpServer())
        .post('/api/v1/showtimes/bulk')
        .set('Authorization', `Bearer ${fixture.admin.token}`)
        .send(body),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body.code).toBe('SHOWTIME_OVERLAP');
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
    const checkout = await request(appA.getHttpServer())
      .post(`/api/v1/payments/bookings/${held.body.id}/checkout`)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(201);
    await adminPrisma.booking.update({
      where: { id: held.body.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await appA.get(BookingsService).expireBookings();
    const expired = await adminPrisma.booking.findUnique({ where: { id: held.body.id } });
    const intent = await adminPrisma.sepayPaymentIntent.findUnique({ where: { id: checkout.body.intentId } });
    const seat = await adminPrisma.showtimeSeat.findUnique({ where: { id: fixture.showtimeSeatIds[0] } });

    expect(expired?.status).toBe(BookingStatus.EXPIRED);
    expect(intent?.status).toBe(SepayIntentStatus.EXPIRED);
    expect(await adminPrisma.payment.findUnique({ where: { bookingId: held.body.id } })).toBeNull();
    expect(seat).toMatchObject({ status: ShowtimeSeatStatus.AVAILABLE, heldUntil: null, heldByBookingId: null });
    expect(await adminRedis.get(`booking:seat:${fixture.showtimeId}:${fixture.showtimeSeatIds[0]}`)).toBeNull();
    await hold(appB, fixture.customerB.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], `hold-after-expire-${Date.now()}`).expect(201);
  });

  it('rejects a hold when the showtime starts within the booking buffer', async () => {
    const nearShowtime = await adminPrisma.showtime.update({
      where: { id: fixture.showtimeId },
      data: {
        startsAt: new Date(Date.now() + 4 * 60 * 1000),
        endsAt: new Date(Date.now() + 124 * 60 * 1000),
      },
    });
    const holdResponse = await hold(
      appA,
      fixture.customerA.token,
      nearShowtime.id,
      [fixture.showtimeSeatIds[0]],
      `hold-too-close-${Date.now()}`,
    );

    expect(holdResponse.status).toBe(409);
    expect(holdResponse.body.code).toBe('SHOWTIME_TOO_CLOSE');
    expect(await adminPrisma.booking.count({ where: { showtimeId: nearShowtime.id } })).toBe(0);
    expect(await adminPrisma.showtimeSeat.findUnique({ where: { id: fixture.showtimeSeatIds[0] } })).toMatchObject({
      status: ShowtimeSeatStatus.AVAILABLE,
    });
  });

  it('confirms a booking from a matched SePay webhook and ignores duplicate delivery', async () => {
    const held = await hold(appA, fixture.customerA.token, fixture.showtimeId, fixture.showtimeSeatIds.slice(0, 2), `hold-payment-${Date.now()}`).expect(201);
    const checkout = await request(appA.getHttpServer())
      .post(`/api/v1/payments/bookings/${held.body.id}/checkout`)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(201);
    const payload = paymentWebhookPayload(checkout.body, 2001);

    await sepayWebhook(appA, payload).expect(201, { success: true });
    await sepayWebhook(appA, payload).expect(201, { success: true });

    expect(await adminPrisma.payment.count({ where: { bookingId: held.body.id } })).toBe(1);
    expect(await adminPrisma.ticket.count({ where: { bookingId: held.body.id } })).toBe(2);
    const tickets = await request(appA.getHttpServer())
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(200);
    expect(tickets.body).toHaveLength(2);
    expect(tickets.body.every((ticket: { bookingId: string }) => ticket.bookingId === held.body.id)).toBe(true);
    expect(new Set(tickets.body.map((ticket: { bookingItem?: { id?: string } }) => ticket.bookingItem?.id)).size).toBe(2);
    expect(await adminPrisma.booking.findUnique({ where: { id: held.body.id } })).toMatchObject({ status: BookingStatus.CONFIRMED });
    expect(await adminPrisma.sepayTransaction.findUnique({ where: { sepayId: 2001 } })).toMatchObject({
      status: SepayTransactionStatus.CONFIRMED,
    });
  });

  it('returns success for concurrent duplicate SePay webhook deliveries', async () => {
    const held = await hold(appA, fixture.customerA.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], `hold-concurrent-payment-${Date.now()}`).expect(201);
    const checkout = await request(appA.getHttpServer())
      .post(`/api/v1/payments/bookings/${held.body.id}/checkout`)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(201);
    const payload = paymentWebhookPayload(checkout.body, 2002);
    const responses = await Promise.all([
      sepayWebhook(appA, payload),
      sepayWebhook(appB, payload),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 201]);
    expect(responses.map((response) => response.body)).toEqual([{ success: true }, { success: true }]);
    expect(await adminPrisma.sepayTransaction.count({ where: { sepayId: 2002 } })).toBe(1);
    expect(await adminPrisma.payment.count({ where: { bookingId: held.body.id } })).toBe(1);
    expect(await adminPrisma.ticket.count({ where: { bookingId: held.body.id } })).toBe(1);
  });

  it('marks a mismatched SePay payment for review without confirming the booking', async () => {
    const held = await hold(appA, fixture.customerA.token, fixture.showtimeId, [fixture.showtimeSeatIds[0]], `hold-payment-review-${Date.now()}`).expect(201);
    const checkout = await request(appA.getHttpServer())
      .post(`/api/v1/payments/bookings/${held.body.id}/checkout`)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(201);
    const payload = paymentWebhookPayload(checkout.body, 2003);
    payload.transferAmount = Number(checkout.body.amount) - 1;

    await sepayWebhook(appA, payload).expect(201, { success: true });

    expect(await adminPrisma.sepayTransaction.findUnique({ where: { sepayId: 2003 } })).toMatchObject({
      status: SepayTransactionStatus.REVIEW_REQUIRED,
    });
    expect(await adminPrisma.payment.findUnique({ where: { bookingId: held.body.id } })).toBeNull();
    expect(await adminPrisma.booking.findUnique({ where: { id: held.body.id } })).toMatchObject({ status: BookingStatus.PENDING });
    expect(await adminPrisma.ticket.count({ where: { bookingId: held.body.id } })).toBe(0);

    await request(appA.getHttpServer())
      .post(`/api/v1/bookings/${held.body.id}/cancel`)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(201);
    expect(await adminPrisma.sepayPaymentIntent.findUnique({ where: { id: checkout.body.intentId } })).toMatchObject({
      status: SepayIntentStatus.CANCELLED,
    });
  });
});

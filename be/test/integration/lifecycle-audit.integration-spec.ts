import type { INestApplication } from '@nestjs/common';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { MoviesService } from '../../src/modules/movies/movies.service.js';
import { TmdbClient } from '../../src/modules/movies/tmdb.client.js';
import { BookingsService } from '../../src/modules/bookings/bookings.service.js';
import { SepayService } from '../../src/modules/sepay/sepay.service.js';
import { UsersService } from '../../src/modules/users/users.service.js';
import {
  adminPrisma,
  adminRedis,
  createFixture,
  createIntegrationApp,
  resetIntegrationState,
} from './helpers.js';

describe('Movie and booking lifecycle audit', () => {
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

  it('records permission arrays before/after and rolls back access changes and session revocation', async () => {
    const fixture = await createFixture(app);
    const actor = await adminPrisma.user.findUniqueOrThrow({
      where: { id: fixture.admin.id },
    });
    const users = app.get(UsersService);
    await users.updateAccess(actor, fixture.customerA.id, {
      role: 'ADMIN',
      permissions: ['VIEW_SYSTEM'],
    });
    const log = await adminPrisma.auditLog.findFirstOrThrow({
      where: { action: 'USER_ACCESS_UPDATED' },
    });
    expect(log).toMatchObject({
      before: { role: 'CUSTOMER', permissions: [] },
      after: { role: 'ADMIN', permissions: ['VIEW_SYSTEM'] },
    });
    const session = await adminPrisma.authSession.findFirstOrThrow({
      where: { userId: fixture.customerA.id },
    });
    const spy = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValue(new Error('audit unavailable'));
    await expect(
      users.updateAccess(actor, fixture.customerA.id, {
        disabled: true,
        permissions: [],
      }),
    ).rejects.toThrow('audit unavailable');
    await expect(
      users.revokeSession(actor, fixture.customerA.id, session.id),
    ).rejects.toThrow('audit unavailable');
    await expect(
      users.revokeAllSessions(actor, fixture.customerA.id),
    ).rejects.toThrow('audit unavailable');
    expect(
      (
        await adminPrisma.user.findUniqueOrThrow({
          where: { id: fixture.customerA.id },
        })
      ).disabledAt,
    ).toBeNull();
    expect(
      await adminPrisma.userAdminPermission.count({
        where: { userId: fixture.customerA.id },
      }),
    ).toBe(1);
    expect(
      (
        await adminPrisma.authSession.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).revokedAt,
    ).toBeNull();
    spy.mockRestore();
    await users.revokeSession(actor, fixture.customerA.id, session.id);
    expect(
      await adminPrisma.auditLog.count({
        where: { action: 'ADMIN_SESSION_REVOKED' },
      }),
    ).toBe(1);
  });

  it('rolls back refund with tickets, seats and outbox, then audits exactly once', async () => {
    const fixture = await createFixture(app);
    const booking = await app
      .get(BookingsService)
      .hold(fixture.customerA.id, {
        showtimeId: fixture.showtimeId,
        showtimeSeatIds: [fixture.showtimeSeatIds[0]],
      });
    const payments = app.get(SepayService);
    await payments.checkout(fixture.customerA.id, booking.id);
    const intent = await adminPrisma.sepayPaymentIntent.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    await payments.handleWebhook({
      id: 88003,
      gateway: 'TestBank',
      accountNumber: 'integration-account',
      transactionDate: new Date().toISOString(),
      transferType: 'in',
      transferAmount: intent.expectedAmount.toNumber(),
      content: intent.paymentCode,
    });
    const outboxCount = await adminPrisma.mailOutbox.count();
    const spy = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValue(new Error('audit unavailable'));
    await expect(
      payments.refundBooking(fixture.admin.id, booking.id, {
        reason: 'Customer request',
      }),
    ).rejects.toThrow('audit unavailable');
    expect(await adminPrisma.refund.count()).toBe(0);
    expect(
      (
        await adminPrisma.booking.findUniqueOrThrow({
          where: { id: booking.id },
        })
      ).status,
    ).toBe('CONFIRMED');
    expect(
      (
        await adminPrisma.payment.findUniqueOrThrow({
          where: { bookingId: booking.id },
        })
      ).status,
    ).toBe('SUCCEEDED');
    expect(
      await adminPrisma.ticket.count({
        where: { bookingId: booking.id, status: 'ACTIVE' },
      }),
    ).toBe(1);
    expect(
      (
        await adminPrisma.showtimeSeat.findUniqueOrThrow({
          where: { id: fixture.showtimeSeatIds[0] },
        })
      ).status,
    ).toBe('SOLD');
    expect(await adminPrisma.mailOutbox.count()).toBe(outboxCount);
    spy.mockRestore();
    await payments.refundBooking(fixture.admin.id, booking.id, {
      reason: 'Customer request',
    });
    await payments.refundBooking(fixture.admin.id, booking.id, {
      reason: 'Customer request',
    });
    expect(
      await adminPrisma.auditLog.count({
        where: { action: 'BOOKING_REFUNDED', actorUserId: fixture.admin.id },
      }),
    ).toBe(1);
  });

  it('rolls back automatic review and uses the internal transaction id in audit', async () => {
    await createFixture(app);
    const tx = await adminPrisma.sepayTransaction.create({
      data: {
        sepayId: 88004,
        gateway: 'TestBank',
        accountNumber: 'integration-account',
        transferAmount: 1,
        content: '',
        transferType: 'in',
        transactionDate: new Date(),
        status: 'MATCHED',
      },
    });
    const payload = {
      id: 88004,
      gateway: 'TestBank',
      accountNumber: 'integration-account',
      transactionDate: new Date().toISOString(),
      transferType: 'in',
      transferAmount: 1,
      content: '',
    };
    const spy = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValue(new Error('audit unavailable'));
    await expect(app.get(SepayService).handleWebhook(payload)).rejects.toThrow(
      'audit unavailable',
    );
    expect(
      (
        await adminPrisma.sepayTransaction.findUniqueOrThrow({
          where: { id: tx.id },
        })
      ).status,
    ).toBe('MATCHED');
    spy.mockRestore();
    await app.get(SepayService).handleWebhook(payload);
    const log = await adminPrisma.auditLog.findFirstOrThrow({
      where: { action: 'PAYMENT_REVIEW_REQUIRED' },
    });
    expect(log.resourceId).toBe(tx.id);
    expect(log.metadata).toMatchObject({ source: 'WEBHOOK' });
  });

  it('audits movie import/resync/update/archive and rolls each mutation back on audit failure', async () => {
    const tmdb = app.get(TmdbClient);
    vi.spyOn(tmdb, 'movie').mockResolvedValue({
      id: 42,
      title: 'Imported title',
      runtime: 120,
      poster_path: '/poster.jpg',
    } as never);
    const movies = app.get(MoviesService);
    const audit = app.get(AuditService);
    let spy = vi
      .spyOn(audit, 'record')
      .mockRejectedValue(new Error('audit unavailable'));
    await expect(movies.importTmdbMovie(42)).rejects.toThrow(
      'audit unavailable',
    );
    expect(await adminPrisma.movie.count()).toBe(0);
    spy.mockRestore();
    const imported = await movies.importTmdbMovie(42);
    await movies.importTmdbMovie(42);
    expect(await adminPrisma.auditLog.count()).toBe(1);
    await adminPrisma.movie.update({
      where: { id: imported.movie.id },
      data: { posterUrl: 'old-poster' },
    });
    const before = await adminPrisma.movie.findUniqueOrThrow({
      where: { id: imported.movie.id },
    });
    spy = vi
      .spyOn(audit, 'record')
      .mockRejectedValue(new Error('audit unavailable'));
    await expect(movies.resyncTmdbMovie(42)).rejects.toThrow(
      'audit unavailable',
    );
    await expect(
      movies.update(before.id, { title: 'Rollback' }),
    ).rejects.toThrow('audit unavailable');
    await expect(movies.archive(before.id)).rejects.toThrow(
      'audit unavailable',
    );
    expect(
      await adminPrisma.movie.findUniqueOrThrow({ where: { id: before.id } }),
    ).toEqual(before);
    spy.mockRestore();
    await movies.resyncTmdbMovie(42);
    await movies.update(before.id, { title: 'Edited title' });
    await movies.archive(before.id);
    const logs = await adminPrisma.auditLog.findMany();
    expect(logs).toHaveLength(4);
    expect(logs.find((log) => log.action === 'MOVIE_ARCHIVED')).toMatchObject({
      before: { status: 'DRAFT' },
      after: { status: 'ARCHIVED' },
    });
    expect(logs.find((log) => log.action === 'MOVIE_RESYNCED')).toMatchObject({
      before: { posterUrl: 'old-poster' },
    });
  });

  it('rolls back holds and releases Redis locks when audit fails', async () => {
    const fixture = await createFixture(app);
    const service = app.get(BookingsService);
    const spy = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValue(new Error('audit unavailable'));
    await expect(
      service.hold(fixture.customerA.id, {
        showtimeId: fixture.showtimeId,
        showtimeSeatIds: [fixture.showtimeSeatIds[0]],
      }),
    ).rejects.toThrow('audit unavailable');
    expect(await adminPrisma.booking.count()).toBe(0);
    expect(
      await adminPrisma.showtimeSeat.count({ where: { status: 'HELD' } }),
    ).toBe(0);
    spy.mockRestore();
    const booking = await service.hold(fixture.customerA.id, {
      showtimeId: fixture.showtimeId,
      showtimeSeatIds: [fixture.showtimeSeatIds[0]],
    });
    const log = await adminPrisma.auditLog.findFirstOrThrow({
      where: { action: 'BOOKING_HELD' },
    });
    expect(log.actorUserId).toBe(fixture.customerA.id);
    expect(JSON.stringify(log)).not.toMatch(
      /holdToken|requestHash|idempotencyKey/,
    );
    expect(booking.status).toBe('PENDING');
  });

  it.each(['cancel', 'expire'] as const)(
    'rolls back %s with payment intent and seats, then audits once',
    async (kind) => {
      const fixture = await createFixture(app);
      const service = app.get(BookingsService);
      const booking = await service.hold(fixture.customerA.id, {
        showtimeId: fixture.showtimeId,
        showtimeSeatIds: [fixture.showtimeSeatIds[0]],
      });
      await app.get(SepayService).checkout(fixture.customerA.id, booking.id);
      if (kind === 'expire')
        await adminPrisma.booking.update({
          where: { id: booking.id },
          data: { expiresAt: new Date(0) },
        });
      const mutate = () =>
        kind === 'cancel'
          ? service.cancel(fixture.customerA.id, booking.id)
          : service.expireBookingById(booking.id);
      const spy = vi
        .spyOn(app.get(AuditService), 'record')
        .mockRejectedValue(new Error('audit unavailable'));
      await expect(mutate()).rejects.toThrow('audit unavailable');
      expect(
        (
          await adminPrisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
          })
        ).status,
      ).toBe('PENDING');
      expect(
        (
          await adminPrisma.sepayPaymentIntent.findUniqueOrThrow({
            where: { bookingId: booking.id },
          })
        ).status,
      ).toBe('PENDING');
      expect(
        (
          await adminPrisma.showtimeSeat.findUniqueOrThrow({
            where: { id: fixture.showtimeSeatIds[0] },
          })
        ).status,
      ).toBe('HELD');
      spy.mockRestore();
      await mutate();
      await mutate();
      expect(
        await adminPrisma.auditLog.count({
          where: {
            action: kind === 'cancel' ? 'BOOKING_CANCELLED' : 'BOOKING_EXPIRED',
          },
        }),
      ).toBe(1);
    },
  );

  it('rolls back checkout and webhook confirmation, then confirms with a redacted audit', async () => {
    const fixture = await createFixture(app);
    const booking = await app.get(BookingsService).hold(fixture.customerA.id, {
      showtimeId: fixture.showtimeId,
      showtimeSeatIds: [fixture.showtimeSeatIds[0]],
    });
    const payments = app.get(SepayService);
    let spy = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValue(new Error('audit unavailable'));
    await expect(
      payments.checkout(fixture.customerA.id, booking.id),
    ).rejects.toThrow('audit unavailable');
    expect(await adminPrisma.sepayPaymentIntent.count()).toBe(0);
    spy.mockRestore();
    await payments.checkout(fixture.customerA.id, booking.id);
    const intent = await adminPrisma.sepayPaymentIntent.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    const payload = {
      id: 88001,
      gateway: 'TestBank',
      accountNumber: 'integration-account',
      transactionDate: new Date().toISOString(),
      transferType: 'in',
      transferAmount: intent.expectedAmount.toNumber(),
      content: intent.paymentCode,
    };
    await adminPrisma.sepayTransaction.create({
      data: {
        sepayId: payload.id,
        gateway: 'TestBank',
        accountNumber: payload.accountNumber,
        transferAmount: intent.expectedAmount,
        content: payload.content,
        transferType: 'in',
        transactionDate: new Date(),
        status: 'MATCHED',
        paymentIntentId: intent.id,
      },
    });
    spy = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValue(new Error('audit unavailable'));
    await expect(payments.handleWebhook(payload)).rejects.toThrow(
      'audit unavailable',
    );
    expect(
      (
        await adminPrisma.booking.findUniqueOrThrow({
          where: { id: booking.id },
        })
      ).status,
    ).toBe('PENDING');
    expect(await adminPrisma.ticket.count()).toBe(0);
    expect(await adminPrisma.payment.count()).toBe(0);
    expect(await adminPrisma.mailOutbox.count()).toBe(0);
    expect(
      (
        await adminPrisma.sepayPaymentIntent.findUniqueOrThrow({
          where: { id: intent.id },
        })
      ).status,
    ).toBe('PENDING');
    spy.mockRestore();
    await payments.handleWebhook(payload);
    await payments.handleWebhook(payload);
    const logs = await adminPrisma.auditLog.findMany({
      where: { action: 'PAYMENT_CONFIRMED' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      before: { status: 'PENDING' },
      after: { status: 'CONFIRMED' },
      metadata: { source: 'WEBHOOK' },
    });
    expect(JSON.stringify(logs)).not.toMatch(
      /accountNumber|paymentCode|holdToken/,
    );
  });

  it('audits transaction receipt/status and manual confirmation atomically with admin attribution', async () => {
    const fixture = await createFixture(app);
    const booking = await app.get(BookingsService).hold(fixture.customerA.id, {
      showtimeId: fixture.showtimeId,
      showtimeSeatIds: [fixture.showtimeSeatIds[0]],
    });
    const payments = app.get(SepayService);
    await payments.checkout(fixture.customerA.id, booking.id);
    const intent = await adminPrisma.sepayPaymentIntent.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    const payload = {
      id: 88002,
      gateway: 'TestBank',
      accountNumber: 'integration-account',
      transactionDate: new Date().toISOString(),
      transferType: 'in',
      transferAmount: 1,
      content: intent.paymentCode,
    };
    let spy = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValue(new Error('audit unavailable'));
    await expect(payments.handleWebhook(payload)).rejects.toThrow(
      'audit unavailable',
    );
    expect(await adminPrisma.sepayTransaction.count()).toBe(0);
    spy.mockRestore();
    await payments.handleWebhook(payload);
    const tx = await adminPrisma.sepayTransaction.findUniqueOrThrow({
      where: { sepayId: payload.id },
    });
    spy = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValue(new Error('audit unavailable'));
    await expect(
      payments.updateTransactionStatus(tx.id, { status: 'MATCHED' }),
    ).rejects.toThrow('audit unavailable');
    await expect(
      payments.manualConfirmTransaction(fixture.admin.id, tx.id, {
        force: true,
        adminNote: 'Private operator note',
      }),
    ).rejects.toThrow('audit unavailable');
    expect(
      (
        await adminPrisma.sepayTransaction.findUniqueOrThrow({
          where: { id: tx.id },
        })
      ).status,
    ).toBe('REVIEW_REQUIRED');
    expect(
      (
        await adminPrisma.booking.findUniqueOrThrow({
          where: { id: booking.id },
        })
      ).status,
    ).toBe('PENDING');
    expect(await adminPrisma.ticket.count()).toBe(0);
    spy.mockRestore();
    await payments.updateTransactionStatus(tx.id, {
      status: 'REVIEW_REQUIRED',
    });
    await payments.manualConfirmTransaction(fixture.admin.id, tx.id, {
      force: true,
      adminNote: 'Private operator note',
    });
    const log = await adminPrisma.auditLog.findFirstOrThrow({
      where: { action: 'PAYMENT_MANUALLY_CONFIRMED' },
    });
    expect(log.actorUserId).toBe(fixture.admin.id);
    expect(log.metadata).toMatchObject({ source: 'ADMIN' });
    expect(JSON.stringify(log)).not.toContain('Private operator note');
    expect(
      (
        await adminPrisma.sepayTransaction.findUniqueOrThrow({
          where: { id: tx.id },
        })
      ).adminNote,
    ).toBe('Private operator note');
  });
});

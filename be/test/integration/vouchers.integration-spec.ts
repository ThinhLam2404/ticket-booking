import type { INestApplication } from '@nestjs/common';
import { VoucherDiscountType, VoucherScope } from '@prisma/client';
import { BookingsService } from '../../src/modules/bookings/bookings.service.js';
import { SepayService } from '../../src/modules/sepay/sepay.service.js';
import {
  adminPrisma,
  adminRedis,
  createFixture,
  createIntegrationApp,
  resetIntegrationState,
} from './helpers.js';

describe('Voucher assignment and checkout lifecycle', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createIntegrationApp();
  });
  beforeEach(resetIntegrationState);
  afterAll(async () => {
    await app?.close();
    await adminPrisma.$disconnect();
    await adminRedis.quit();
  });

  async function createVoucher(
    cinemaId: string,
    overrides: Partial<{ code: string; usageLimit: number }> = {},
  ) {
    return adminPrisma.voucher.create({
      data: {
        code: overrides.code ?? 'WELCOME10',
        discountType: VoucherDiscountType.PERCENT,
        scope: VoucherScope.ORDER,
        value: 10,
        minimumSpend: 0,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 86_400_000),
        defaultUsageLimit: overrides.usageLimit ?? 1,
        cinemas: { create: { cinemaId } },
      },
    });
  }

  async function assign(voucherId: string, userIds: string[], usageLimit = 1) {
    await adminPrisma.voucherAssignment.createMany({
      data: userIds.map((userId) => ({ voucherId, userId, usageLimit })),
    });
  }

  async function hold(
    bookings: BookingsService,
    userId: string,
    showtimeId: string,
    showtimeSeatId: string,
    voucherCode: string,
  ) {
    return bookings.hold(userId, {
      showtimeId,
      showtimeSeatIds: [showtimeSeatId],
      voucherCode,
    });
  }

  it('quotes without reserving and reserves the assigned voucher at checkout', async () => {
    const fixture = await createFixture(app);
    const room = await adminPrisma.room.findUniqueOrThrow({ where: { id: fixture.roomId } });
    const voucher = await createVoucher(room.cinemaId);
    await assign(voucher.id, [fixture.customerA.id]);
    const bookings = app.get(BookingsService);

    const quote = await bookings.quote(fixture.customerA.id, {
      showtimeId: fixture.showtimeId,
      showtimeSeatIds: [fixture.showtimeSeatIds[0]],
      voucherCode: ' welcome10 ',
    });
    expect(quote).toMatchObject({
      ticketSubtotal: '100000.00',
      discountAmount: '10000.00',
      totalAmount: '90000.00',
      voucherCode: 'WELCOME10',
    });

    const booking = await hold(
      bookings,
      fixture.customerA.id,
      fixture.showtimeId,
      fixture.showtimeSeatIds[0],
      'welcome10',
    );
    expect(booking.totalAmount).toBe('100000.00');
    expect(await adminPrisma.voucherRedemption.count()).toBe(0);

    const intent = await app.get(SepayService).checkout(fixture.customerA.id, booking.id);
    const persisted = await adminPrisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(persisted.totalAmount.toString()).toBe('90000');
    expect(persisted.discountAmount.toString()).toBe('10000');
    expect((await adminPrisma.voucherRedemption.count({ where: { bookingId: booking.id, status: 'RESERVED' } }))).toBe(1);
    expect((await adminPrisma.sepayPaymentIntent.findUniqueOrThrow({ where: { bookingId: booking.id } })).expectedAmount.toString()).toBe('90000');
    expect(intent.amount).toBe('90000');
  });

  it('lets the first checkout win, not the first seat hold, and releases on cancellation', async () => {
    const fixture = await createFixture(app);
    const room = await adminPrisma.room.findUniqueOrThrow({ where: { id: fixture.roomId } });
    const voucher = await createVoucher(room.cinemaId, { code: 'FIRSTONE' });
    await assign(voucher.id, [fixture.customerA.id, fixture.customerB.id]);
    const bookings = app.get(BookingsService);
    const firstHold = await hold(bookings, fixture.customerA.id, fixture.showtimeId, fixture.showtimeSeatIds[0], 'FIRSTONE');
    const secondHold = await hold(bookings, fixture.customerB.id, fixture.showtimeId, fixture.showtimeSeatIds[1], 'FIRSTONE');

    await app.get(SepayService).checkout(fixture.customerB.id, secondHold.id);
    await expect(app.get(SepayService).checkout(fixture.customerA.id, firstHold.id)).resolves.toBeDefined();
    expect(await adminPrisma.voucherRedemption.count({ where: { status: 'RESERVED' } })).toBe(2);

    await app.get(BookingsService).cancel(fixture.customerA.id, firstHold.id);
    expect(await adminPrisma.voucherRedemption.count({ where: { status: 'RELEASED' } })).toBe(1);
  });

  it('serializes two checkout attempts against one assigned usage limit', async () => {
    const fixture = await createFixture(app);
    const room = await adminPrisma.room.findUniqueOrThrow({ where: { id: fixture.roomId } });
    const voucher = await createVoucher(room.cinemaId, { code: 'RACEONE' });
    await assign(voucher.id, [fixture.customerA.id]);
    const bookings = app.get(BookingsService);
    const first = await hold(bookings, fixture.customerA.id, fixture.showtimeId, fixture.showtimeSeatIds[0], 'RACEONE');
    const second = await hold(bookings, fixture.customerA.id, fixture.showtimeId, fixture.showtimeSeatIds[1], 'RACEONE');

    const results = await Promise.allSettled([
      app.get(SepayService).checkout(fixture.customerA.id, first.id),
      app.get(SepayService).checkout(fixture.customerA.id, second.id),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await adminPrisma.voucherRedemption.count({ where: { status: 'RESERVED' } })).toBe(1);
  });

  it('keeps idempotent hold retries to one booking and reserves once at checkout', async () => {
    const fixture = await createFixture(app);
    const room = await adminPrisma.room.findUniqueOrThrow({ where: { id: fixture.roomId } });
    const voucher = await createVoucher(room.cinemaId, { code: 'RETRY10' });
    await assign(voucher.id, [fixture.customerA.id]);
    const bookings = app.get(BookingsService);
    const request = { showtimeId: fixture.showtimeId, showtimeSeatIds: [fixture.showtimeSeatIds[0]], voucherCode: ' retry10 ' };
    const results = await Promise.all([
      bookings.hold(fixture.customerA.id, request, 'same-voucher-key'),
      bookings.hold(fixture.customerA.id, { ...request, voucherCode: 'RETRY10' }, 'same-voucher-key'),
    ]);
    expect(new Set(results.map((booking) => booking.id)).size).toBe(1);
    expect(await adminPrisma.voucherRedemption.count()).toBe(0);
    await app.get(SepayService).checkout(fixture.customerA.id, results[0].id);
    expect(await adminPrisma.voucherRedemption.count()).toBe(1);
  });

  it('consumes once on payment confirmation and does not restore usage on refund', async () => {
    const fixture = await createFixture(app);
    const room = await adminPrisma.room.findUniqueOrThrow({ where: { id: fixture.roomId } });
    const voucher = await createVoucher(room.cinemaId, { code: 'PAY10', usageLimit: 1 });
    await assign(voucher.id, [fixture.customerA.id]);
    const booking = await hold(app.get(BookingsService), fixture.customerA.id, fixture.showtimeId, fixture.showtimeSeatIds[0], 'PAY10');
    const payments = app.get(SepayService);
    const intent = await payments.checkout(fixture.customerA.id, booking.id);
    await payments.handleWebhook({ id: 77101, gateway: 'TestBank', accountNumber: 'integration-account', transactionDate: new Date().toISOString(), transferType: 'in', transferAmount: 90000, content: intent.paymentCode });
    expect(await adminPrisma.voucherRedemption.findUniqueOrThrow({ where: { bookingId: booking.id } })).toMatchObject({ status: 'CONSUMED', consumedAt: expect.any(Date) });
    await payments.refundBooking(fixture.admin.id, booking.id, { reason: 'Customer request' });
    expect((await adminPrisma.voucherRedemption.findUniqueOrThrow({ where: { bookingId: booking.id } })).status).toBe('CONSUMED');
    const second = await hold(app.get(BookingsService), fixture.customerA.id, fixture.showtimeId, fixture.showtimeSeatIds[1], 'PAY10');
    await expect(payments.checkout(fixture.customerA.id, second.id)).rejects.toThrow('usage limit');
  });
});

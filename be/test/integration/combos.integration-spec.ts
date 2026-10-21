import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CombosService } from '../../src/modules/combos/combos.service.js';
import { BookingsService } from '../../src/modules/bookings/bookings.service.js';
import { SepayService } from '../../src/modules/sepay/sepay.service.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import {
  adminPrisma,
  adminRedis,
  createFixture,
  createIntegrationApp,
  resetIntegrationState,
} from './helpers.js';

describe('Immutable booking combo purchase', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createIntegrationApp();
  });
  beforeEach(resetIntegrationState);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
    await adminPrisma.$disconnect();
    await adminRedis.quit();
  });

  async function setup() {
    const fixture = await createFixture(app);
    const room = await adminPrisma.room.findUniqueOrThrow({
      where: { id: fixture.roomId },
    });
    const service = app.get(CombosService);
    const combo = await service.create({
      name: 'Combo đôi',
      description: 'Một bắp, hai nước',
    });
    const offer = await service.setMenu(room.cinemaId, combo.id, {
      price: 99000,
    });
    const dto = {
      showtimeId: fixture.showtimeId,
      showtimeSeatIds: [fixture.showtimeSeatIds[0]],
      combos: [{ cinemaComboId: offer.id, quantity: 2 }],
    };
    return { fixture, room, service, combo, offer, dto };
  }

  it('creates tickets and combo snapshots together, charges their total and preserves snapshots', async () => {
    const { fixture, service, combo, room, dto } = await setup();
    const booking = await app
      .get(BookingsService)
      .hold(fixture.customerA.id, dto);
    expect(booking.comboSubtotal).toBe('198000.00');
    expect(booking.totalAmount).toBe('298000.00');
    expect(booking.pricingVersion).toBe(1);
    await service.update(combo.id, { name: 'New name' });
    await service.setMenu(room.cinemaId, combo.id, { price: 120000 });
    const stored = await adminPrisma.bookingComboItem.findFirstOrThrow({
      where: { bookingId: booking.id },
    });
    expect(stored.name).toBe('Combo đôi');
    expect(stored.unitPrice.toString()).toBe('99000');
    await app.get(SepayService).checkout(fixture.customerA.id, booking.id);
    const intent = await adminPrisma.sepayPaymentIntent.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    expect(intent.expectedAmount.toString()).toBe('298000');
    // Neither selection edits nor staff fulfillment are part of this application.
    await request(app.getHttpServer())
      .put(`/api/v1/combos/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .send({ items: [] })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/combos/admin/bookings/${booking.id}/fulfill`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .expect(404);
  });

  it('rejects another cinema, disabled offers and invalid quantities without creating a booking', async () => {
    const { fixture, service, combo, dto } = await setup();
    const otherCinema = await adminPrisma.cinema.create({
      data: { name: 'Other', address: 'Other', provinceCode: 79 },
    });
    const foreign = await service.setMenu(otherCinema.id, combo.id, {
      price: 10000,
    });
    const bookings = app.get(BookingsService);
    await expect(
      bookings.hold(fixture.customerA.id, {
        ...dto,
        combos: [{ cinemaComboId: foreign.id, quantity: 1 }],
      }),
    ).rejects.toThrow('unavailable');
    await expect(
      bookings.hold(fixture.customerA.id, {
        ...dto,
        combos: [{ ...dto.combos[0], quantity: 11 }],
      }),
    ).rejects.toThrow('Invalid');
    await service.update(combo.id, { active: false });
    await expect(bookings.hold(fixture.customerA.id, dto)).rejects.toThrow(
      'unavailable',
    );
    expect(await adminPrisma.booking.count()).toBe(0);
    expect(
      await adminPrisma.showtimeSeat.count({ where: { status: 'HELD' } }),
    ).toBe(0);
  });

  it('rolls back booking, combo and seat hold on audit failure, then retries successfully', async () => {
    const { fixture, dto } = await setup();
    const bookings = app.get(BookingsService);
    const spy = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValue(new Error('audit unavailable'));
    await expect(
      bookings.hold(fixture.customerA.id, dto, 'combo-audit'),
    ).rejects.toThrow('audit unavailable');
    expect(await adminPrisma.booking.count()).toBe(0);
    expect(await adminPrisma.bookingComboItem.count()).toBe(0);
    expect(
      await adminPrisma.showtimeSeat.count({ where: { status: 'HELD' } }),
    ).toBe(0);
    spy.mockRestore();
    await expect(
      bookings.hold(fixture.customerA.id, dto, 'combo-audit'),
    ).resolves.toMatchObject({ totalAmount: '298000.00' });
  });

  it('retries the same purchase without duplicating combos and rejects changed contents for the same key', async () => {
    const { fixture, service, combo, room, dto } = await setup();
    const bookings = app.get(BookingsService);
    const first = await bookings.hold(
      fixture.customerA.id,
      dto,
      'immutable-purchase',
    );
    await service.setMenu(room.cinemaId, combo.id, { price: 120000 });
    const retry = await bookings.hold(
      fixture.customerA.id,
      dto,
      'immutable-purchase',
    );
    expect(retry.id).toBe(first.id);
    expect(retry.totalAmount).toBe('298000.00');
    expect(await adminPrisma.bookingComboItem.count()).toBe(1);
    await expect(
      bookings.hold(
        fixture.customerA.id,
        { ...dto, combos: [] },
        'immutable-purchase',
      ),
    ).rejects.toThrow();
    await expect(
      bookings.hold(
        fixture.customerA.id,
        { ...dto, combos: [{ ...dto.combos[0], quantity: 1 }] },
        'immutable-purchase',
      ),
    ).rejects.toThrow();
  });

  it('treats combo ordering as irrelevant for idempotent requests', async () => {
    const { fixture, service, room, dto } = await setup();
    const secondCombo = await service.create({
      name: 'Combo nhỏ',
      description: 'Một nước',
    });
    const secondOffer = await service.setMenu(room.cinemaId, secondCombo.id, {
      price: 20000,
    });
    const combos = [
      ...dto.combos,
      { cinemaComboId: secondOffer.id, quantity: 1 },
    ];
    const bookings = app.get(BookingsService);
    const first = await bookings.hold(
      fixture.customerA.id,
      { ...dto, combos },
      'ordered',
    );
    expect(
      (
        await bookings.hold(
          fixture.customerA.id,
          { ...dto, combos: [...combos].reverse() },
          'ordered',
        )
      ).id,
    ).toBe(first.id);
    expect(await adminPrisma.bookingComboItem.count()).toBe(2);
  });

  it('enforces catalog permissions and purchase DTO limits', async () => {
    const { fixture, dto } = await setup();
    await request(app.getHttpServer())
      .get('/api/v1/combos/admin')
      .set('Authorization', `Bearer ${fixture.customerA.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/combos/admin')
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ name: 'Test', description: 'Test' })
      .expect(201);
    for (const combos of [
      [{ ...dto.combos[0], quantity: 0 }],
      [dto.combos[0], dto.combos[0]],
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/bookings/hold')
        .set('Authorization', `Bearer ${fixture.customerA.token}`)
        .send({ ...dto, combos })
        .expect(400);
    }
  });

  it('refunds a combined purchase at its paid total without a fulfillment workflow', async () => {
    const { fixture, dto } = await setup();
    const booking = await app
      .get(BookingsService)
      .hold(fixture.customerA.id, dto);
    const payments = app.get(SepayService);
    await payments.checkout(fixture.customerA.id, booking.id);
    const intent = await adminPrisma.sepayPaymentIntent.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    await payments.handleWebhook({
      id: 99002,
      gateway: 'Test',
      accountNumber: 'integration-account',
      transactionDate: new Date().toISOString(),
      transferType: 'in',
      transferAmount: intent.expectedAmount.toNumber(),
      content: intent.paymentCode,
    });
    const refund = await payments.refundBooking(fixture.admin.id, booking.id, {
      reason: 'Customer request',
    });
    expect(refund.amount.toString()).toBe('298000');
    expect(
      await adminPrisma.bookingComboItem.count({
        where: { bookingId: booking.id },
      }),
    ).toBe(1);
  });
});

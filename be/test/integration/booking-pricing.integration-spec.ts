import { readFile } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { BookingsService } from '../../src/modules/bookings/bookings.service.js';
import { SepayService } from '../../src/modules/sepay/sepay.service.js';
import {
  adminPrisma,
  adminRedis,
  createFixture,
  createIntegrationApp,
  resetIntegrationState,
} from './helpers.js';

describe('Booking pricing foundation', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createIntegrationApp();
  });
  beforeEach(async () => {
    await resetIntegrationState();
  });
  afterAll(async () => {
    await app?.close();
    await adminPrisma.$disconnect();
    await adminRedis.quit();
  });

  it('backfills historical totals without changing their value', async () => {
    const migration = await readFile(
      new URL(
        '../../prisma/migrations/20261019100000_booking_price_breakdown/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await adminPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'CREATE TEMP TABLE "HistoricalBooking" ("totalAmount" DECIMAL(10,2) NOT NULL) ON COMMIT DROP',
      );
      await tx.$executeRawUnsafe(
        'INSERT INTO "HistoricalBooking" VALUES (210000.00), (123.45)',
      );
      for (const statement of migration
        .replaceAll('"Booking"', '"HistoricalBooking"')
        .split(';')
        .filter((sql) => sql.trim())) {
        await tx.$executeRawUnsafe(statement);
      }
      const rows = await tx.$queryRaw<
        Array<{
          totalAmount: { toString(): string };
          ticketSubtotal: { toString(): string };
          comboSubtotal: { toString(): string };
          discountAmount: { toString(): string };
          pricingVersion: number;
        }>
      >`SELECT * FROM "HistoricalBooking"`;
      expect(rows.map((row) => row.totalAmount.toString())).toEqual([
        '210000',
        '123.45',
      ]);
      for (const row of rows) {
        expect(row.ticketSubtotal.toString()).toBe(row.totalAmount.toString());
        expect(row.comboSubtotal.toString()).toBe('0');
        expect(row.discountAmount.toString()).toBe('0');
        expect(row.pricingVersion).toBe(1);
      }
    });
  });

  it('persists a balanced ticket-only snapshot and charges its unchanged total', async () => {
    const fixture = await createFixture(app);
    const booking = await app
      .get(BookingsService)
      .hold(fixture.customerA.id, {
        showtimeId: fixture.showtimeId,
        showtimeSeatIds: [fixture.showtimeSeatIds[0]],
      });
    const stored = await adminPrisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(stored.ticketSubtotal.toString()).toBe(
      stored.totalAmount.toString(),
    );
    expect(stored.comboSubtotal.toString()).toBe('0');
    expect(stored.discountAmount.toString()).toBe('0');
    expect(stored.pricingVersion).toBe(1);
    await app.get(SepayService).checkout(fixture.customerA.id, booking.id);
    const intent = await adminPrisma.sepayPaymentIntent.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    expect(intent.expectedAmount.equals(stored.totalAmount)).toBe(true);
    await expect(
      adminPrisma.booking.update({
        where: { id: booking.id },
        data: { discountAmount: 1 },
      }),
    ).rejects.toThrow();
    await expect(
      adminPrisma.booking.update({
        where: { id: booking.id },
        data: { pricingVersion: 0 },
      }),
    ).rejects.toThrow();
  });
});

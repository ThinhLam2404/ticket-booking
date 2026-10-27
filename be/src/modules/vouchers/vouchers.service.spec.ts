import { Prisma, VoucherDiscountType, VoucherScope } from '@prisma/client';
import { VouchersService } from './vouchers.service.js';

describe('VouchersService', () => {
  const voucher = {
    id: 'voucher-1',
    code: 'WELCOME10',
    discountType: VoucherDiscountType.PERCENT,
    scope: VoucherScope.ORDER,
    value: new Prisma.Decimal(10),
    minimumSpend: new Prisma.Decimal(0),
    maximumDiscount: null,
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2027-01-01T00:00:00Z'),
    active: true,
    defaultUsageLimit: 1,
    revision: 1,
    cinemas: [],
    assignments: [{ id: 'assignment-1', usageLimit: 1, userId: 'user-1' }],
  };

  function createService() {
    const client = {
      voucher: { findUnique: vi.fn().mockResolvedValue(voucher) },
      voucherRedemption: { count: vi.fn().mockResolvedValue(0), create: vi.fn(), updateMany: vi.fn() },
      $queryRaw: vi.fn(),
    };
    const prisma = { ...client };
    const service = new VouchersService(prisma as never, { record: vi.fn() } as never);
    return { service, client };
  }

  it('normalizes voucher codes and rejects unsafe syntax', () => {
    const { service } = createService();
    expect(service.normalizeCode(' welcome10 ')).toBe('WELCOME10');
    expect(() => service.normalizeCode('WELCOME 10')).toThrow();
  });

  it('calculates a quote without creating a redemption', async () => {
    const { service, client } = createService();
    const quote = await service.quote({ code: 'welcome10', userId: 'user-1', cinemaId: 'cinema-1', ticketPrices: [100000], combos: [] });
    expect(quote.discountAmount).toBe('10000.00');
    expect(quote.totalAmount).toBe('90000.00');
    expect(client.voucherRedemption.create).not.toHaveBeenCalled();
  });

  it('does not inspect or reserve usage quota during quote', async () => {
    const { service, client } = createService();
    client.voucherRedemption.count.mockResolvedValue(1);
    const quote = await service.quote({ code: 'WELCOME10', userId: 'user-1', cinemaId: 'cinema-1', ticketPrices: [100000], combos: [] });
    expect(quote.totalAmount).toBe('90000.00');
    expect(client.voucherRedemption.count).not.toHaveBeenCalled();
    expect(client.voucherRedemption.create).not.toHaveBeenCalled();
  });
});

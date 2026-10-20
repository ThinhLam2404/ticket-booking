import { calculateBookingPrice } from './booking-pricing.js';

describe('Booking price breakdown', () => {
  it('preserves ticket-only totals', () => {
    const price = calculateBookingPrice({ ticketPrices: ['100000', '110000'] });
    expect(price.ticketSubtotal.toString()).toBe('210000');
    expect(price.comboSubtotal.toString()).toBe('0');
    expect(price.discountAmount.toString()).toBe('0');
    expect(price.totalAmount.toString()).toBe('210000');
  });

  it('discounts only eligible combo prices', () => {
    const price = calculateBookingPrice({
      ticketPrices: [100000, 100000],
      combos: [{ unitPrice: 120000, quantity: 1 }],
      discount: { scope: 'COMBOS', type: 'PERCENT', value: 20 },
    });
    expect(price.comboSubtotal.toString()).toBe('120000');
    expect(price.discountAmount.toString()).toBe('24000');
    expect(price.totalAmount.toString()).toBe('296000');
  });

  it('uses precise arithmetic and rounds discounts down to whole VND', () => {
    const price = calculateBookingPrice({
      ticketPrices: ['100.10', '0.20'],
      discount: { scope: 'ORDER', type: 'PERCENT', value: '12.5' },
    });
    expect(price.ticketSubtotal.toString()).toBe('100.3');
    expect(price.discountAmount.toString()).toBe('12');
    expect(price.totalAmount.toString()).toBe('88.3');
  });

  it('caps fixed discounts at eligible prices and percentage at maximum discount', () => {
    expect(
      calculateBookingPrice({
        ticketPrices: [100],
        discount: { scope: 'TICKETS', type: 'FIXED', value: 1000 },
      }).totalAmount.toString(),
    ).toBe('0');
    expect(
      calculateBookingPrice({
        ticketPrices: [1000],
        discount: {
          scope: 'ORDER',
          type: 'PERCENT',
          value: 50,
          maximumDiscount: 100,
        },
      }).discountAmount.toString(),
    ).toBe('100');
    expect(
      calculateBookingPrice({
        ticketPrices: [1000],
        discount: { scope: 'COMBOS', type: 'FIXED', value: 100 },
      }).discountAmount.toString(),
    ).toBe('0');
  });

  it.each([-1, NaN, Infinity, '0.001'])('rejects invalid money %s', (value) => {
    expect(() => calculateBookingPrice({ ticketPrices: [value] })).toThrow();
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid quantity %s',
    (quantity) => {
      expect(() =>
        calculateBookingPrice({
          ticketPrices: [],
          combos: [{ unitPrice: 10, quantity }],
        }),
      ).toThrow();
    },
  );

  it('rejects unsupported percentages and decimal overflow', () => {
    expect(() =>
      calculateBookingPrice({
        ticketPrices: [100],
        discount: { scope: 'ORDER', type: 'PERCENT', value: 101 },
      }),
    ).toThrow();
    expect(() =>
      calculateBookingPrice({ ticketPrices: [99999999, 1] }),
    ).toThrow();
  });
});

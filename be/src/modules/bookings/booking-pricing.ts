import { Prisma } from '@prisma/client';

type Money = Prisma.Decimal | string | number;
type ComboPrice = { unitPrice: Money; quantity: number };
export type BookingDiscount = {
  scope: 'TICKETS' | 'COMBOS' | 'ORDER';
  type: 'FIXED' | 'PERCENT';
  value: Money;
  maximumDiscount?: Money;
};

// This is arithmetic only, not voucher authorization or quota reservation.
// Callers must load trusted prices and validate voucher eligibility separately.
export function calculateBookingPrice(input: {
  ticketPrices: Money[];
  combos?: ComboPrice[];
  discount?: BookingDiscount;
}) {
  const ticketSubtotal = input.ticketPrices.reduce<Prisma.Decimal>(
    (sum, price) => sum.plus(money(price)),
    new Prisma.Decimal(0),
  );
  const comboSubtotal = (input.combos ?? []).reduce((sum, combo) => {
    if (!Number.isSafeInteger(combo.quantity) || combo.quantity < 1) {
      throw new RangeError('Combo quantity must be a positive integer');
    }
    return sum.plus(money(combo.unitPrice).times(combo.quantity));
  }, new Prisma.Decimal(0));
  const subtotal = ticketSubtotal.plus(comboSubtotal);
  let discountAmount = new Prisma.Decimal(0);
  if (input.discount) {
    const { scope, type, maximumDiscount } = input.discount;
    const value = money(input.discount.value);
    const eligible =
      scope === 'TICKETS'
        ? ticketSubtotal
        : scope === 'COMBOS'
          ? comboSubtotal
          : subtotal;
    if (type === 'PERCENT' && value.gt(100))
      throw new RangeError('Discount percentage cannot exceed 100');
    discountAmount =
      type === 'PERCENT' ? eligible.times(value).div(100) : value;
    if (maximumDiscount !== undefined)
      //NOTE - kiểm tra tiền giảm giá có vượt mức giảm tối đa của voucher ko
      discountAmount = Prisma.Decimal.min(
        discountAmount,
        money(maximumDiscount),
      );
    // VND discounts round down to whole dong and never exceed eligible items.
    discountAmount = Prisma.Decimal.min(discountAmount, eligible).floor();
  }
  const totalAmount = subtotal.minus(discountAmount);
  for (const value of [
    ticketSubtotal,
    comboSubtotal,
    discountAmount,
    totalAmount,
  ]) {
    if (value.gt('99999999.99'))
      throw new RangeError('Booking amount exceeds supported limit');
  }
  return { ticketSubtotal, comboSubtotal, discountAmount, totalAmount };
}

function money(value: Money): Prisma.Decimal {
  const amount = new Prisma.Decimal(value);
  if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) {
    throw new RangeError(
      'Money must be finite, non-negative and have at most two decimals',
    );
  }
  return amount;
}

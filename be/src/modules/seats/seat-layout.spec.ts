import { SeatType } from '@prisma/client';
import { buildSeatLayout, couplePartnerNumber, SEAT_LAYOUT_PRESETS, validateSeatLayout } from './seat-layout.js';

describe('seat layout rules', () => {
  it('creates three standard rows, vip middle rows, and a wider couple row', () => {
    const layout = buildSeatLayout(SEAT_LAYOUT_PRESETS.standard);
    const rows = new Map<string, typeof layout>();
    for (const seat of layout) rows.set(seat.row, [...(rows.get(seat.row) ?? []), seat]);

    expect(rows.get('A')?.every((seat) => seat.type === SeatType.STANDARD)).toBe(true);
    expect(rows.get('C')?.every((seat) => seat.type === SeatType.STANDARD)).toBe(true);
    expect(rows.get('D')?.every((seat) => seat.type === SeatType.VIP)).toBe(true);
    expect(rows.get('F')?.every((seat) => seat.type === SeatType.VIP)).toBe(true);
    expect(rows.get('G')?.every((seat) => seat.type === SeatType.COUPLE)).toBe(true);
    expect(rows.get('A')).toHaveLength(9);
    expect(rows.get('G')).toHaveLength(10);
  });

  it('allows odd regular columns but requires an even couple row', () => {
    expect(() => validateSeatLayout(buildSeatLayout({ rows: 6, regularColumns: 7, coupleColumns: 8 }))).not.toThrow();
    expect(() => buildSeatLayout({ rows: 6, regularColumns: 7, coupleColumns: 7 })).toThrow('Couple seat columns must be a positive even number');
    expect(() => validateSeatLayout(buildSeatLayout({ rows: 6, regularColumns: 7, coupleColumns: 8 }).filter((seat) => seat.row !== 'F' || seat.number !== 8))).toThrow('Couple row must contain an even number of seats');
  });

  it('pairs odd seats with the next number and even seats with the previous number', () => {
    expect(couplePartnerNumber(1)).toBe(2);
    expect(couplePartnerNumber(4)).toBe(3);
  });
});

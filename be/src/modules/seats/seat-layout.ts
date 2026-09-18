import { SeatType } from '@prisma/client';

export type SeatLayoutItem = {
  row: string;
  number: number;
  type: SeatType;
};

export type SeatLayoutPreset = {
  rows: number;
  regularColumns: number;
  coupleColumns: number;
};

export const SEAT_LAYOUT_PRESETS: Record<string, SeatLayoutPreset> = {
  compact: { rows: 6, regularColumns: 7, coupleColumns: 8 },
  standard: { rows: 7, regularColumns: 9, coupleColumns: 10 },
  large: { rows: 8, regularColumns: 11, coupleColumns: 12 },
};

export function buildSeatLayout(preset: SeatLayoutPreset): SeatLayoutItem[] {
  const { rows, regularColumns, coupleColumns } = preset;
  if (!Number.isInteger(rows) || rows < 5) {
    throw new Error('Seat layout requires at least five rows');
  }
  if (!Number.isInteger(regularColumns) || regularColumns < 1) {
    throw new Error('Regular seat columns must be positive');
  }
  if (!Number.isInteger(coupleColumns) || coupleColumns < 2 || coupleColumns % 2 !== 0) {
    throw new Error('Couple seat columns must be a positive even number');
  }

  const layout: SeatLayoutItem[] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const type = rowIndex < 3 ? SeatType.STANDARD : rowIndex === rows - 1 ? SeatType.COUPLE : SeatType.VIP;
    const columns = type === SeatType.COUPLE ? coupleColumns : regularColumns;
    for (let number = 1; number <= columns; number += 1) {
      layout.push({ row: String.fromCharCode(65 + rowIndex), number, type });
    }
  }
  return layout;
}

export function validateSeatLayout(layout: Array<{ row: string; number: number; type: SeatType }>) {
  const rows = new Map<string, Array<{ number: number; type: SeatType }>>();
  const coordinates = new Set<string>();
  for (const seat of layout) {
    const row = seat.row.trim().toUpperCase();
    if (!row || row.length !== 1 || row < 'A' || row > 'Z') {
      throw new Error('Seat rows must use letters from A to Z');
    }
    if (!Number.isInteger(seat.number) || seat.number < 1) {
      throw new Error('Seat numbers must be positive integers');
    }
    const coordinate = `${row}:${seat.number}`;
    if (coordinates.has(coordinate)) throw new Error('Duplicate seat coordinate in layout');
    coordinates.add(coordinate);
    rows.set(row, [...(rows.get(row) ?? []), { number: seat.number, type: seat.type }]);
  }
  const orderedRows = [...rows.entries()].sort(([left], [right]) => left.localeCompare(right));
  if (orderedRows.length < 5) throw new Error('Seat layout requires at least five rows');
  if (orderedRows.some(([row], index) => row !== String.fromCharCode(65 + index))) {
    throw new Error('Seat rows must be continuous from A');
  }

  for (let index = 0; index < orderedRows.length; index += 1) {
    const [, seats] = orderedRows[index];
    const expectedType = index < 3 ? SeatType.STANDARD : index === orderedRows.length - 1 ? SeatType.COUPLE : SeatType.VIP;
    if (seats.some((seat) => seat.type !== expectedType)) throw new Error('Seat layout has invalid row types');
    const numbers = seats.map((seat) => seat.number).sort((left, right) => left - right);
    if (numbers.some((number, position) => number !== position + 1)) throw new Error('Seat numbers must be continuous from one');
    if (expectedType === SeatType.COUPLE) {
      if (numbers.length < 2 || numbers.length % 2 !== 0) throw new Error('Couple row must contain an even number of seats');
    }
  }
  return true;
}

export function couplePartnerNumber(number: number) {
  return number % 2 === 1 ? number + 1 : number - 1;
}

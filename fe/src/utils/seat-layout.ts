import type { CreateSeatRequest, SeatType } from '../types';

export type SeatLayoutPreset = {
  rows: number;
  regularColumns: number;
  coupleColumns: number;
};

export function validateSeatPreset({ rows, regularColumns, coupleColumns }: SeatLayoutPreset) {
  if (!Number.isInteger(rows) || rows < 5) return 'Sơ đồ cần tối thiểu 5 hàng.';
  if (!Number.isInteger(regularColumns) || regularColumns < 1) return 'Số ghế Standard/VIP phải lớn hơn 0.';
  if (!Number.isInteger(coupleColumns) || coupleColumns < 2 || coupleColumns % 2 !== 0) return 'Số ghế hàng Couple phải là số chẵn từ 2 trở lên.';
  return null;
}

export function buildSeatLayout(preset: SeatLayoutPreset): CreateSeatRequest[] {
  const error = validateSeatPreset(preset);
  if (error) throw new Error(error);
  const layout: CreateSeatRequest[] = [];
  for (let rowIndex = 0; rowIndex < preset.rows; rowIndex += 1) {
    const type: SeatType = rowIndex < 3 ? 'STANDARD' : rowIndex === preset.rows - 1 ? 'COUPLE' : 'VIP';
    const columns = type === 'COUPLE' ? preset.coupleColumns : preset.regularColumns;
    for (let number = 1; number <= columns; number += 1) {
      layout.push({ row: String.fromCharCode(65 + rowIndex), number, type });
    }
  }
  return layout;
}

export function couplePartnerNumber(number: number) {
  return number % 2 === 1 ? number + 1 : number - 1;
}

export function isCompleteSeatLayout(
  layout: Array<{ row: string; number: number; type: SeatType }>,
) {
  if (layout.length < 5) return false;
  const rows = new Map<string, Array<{ number: number; type: SeatType }>>();
  for (const seat of layout) {
    const row = seat.row.trim().toUpperCase();
    rows.set(row, [...(rows.get(row) ?? []), { number: seat.number, type: seat.type }]);
  }
  const orderedRows = [...rows.entries()].sort(([left], [right]) => left.localeCompare(right));
  if (orderedRows.length < 5 || orderedRows.some(([row], index) => row !== String.fromCharCode(65 + index))) return false;

  return orderedRows.every(([, seats], index) => {
    const expectedType: SeatType = index < 3 ? 'STANDARD' : index === orderedRows.length - 1 ? 'COUPLE' : 'VIP';
    const numbers = seats.map((seat) => seat.number).sort((left, right) => left - right);
    return seats.every((seat) => seat.type === expectedType)
      && numbers.every((number, position) => number === position + 1)
      && (expectedType !== 'COUPLE' || numbers.length >= 2 && numbers.length % 2 === 0);
  });
}

import { describe, expect, it } from 'vitest';
import { roomFormatLabel, showtimeFormatLabel } from './components';

describe('catalog feature helpers', () => {
  it('formats room and showtime labels', () => {
    expect(roomFormatLabel('IMAX')).toBe('IMAX');
    expect(roomFormatLabel('UNKNOWN')).toBe('Tiêu chuẩn');
    expect(showtimeFormatLabel('THREE_D_DUBBED')).toBe('3D · Lồng tiếng');
    expect(showtimeFormatLabel('UNKNOWN')).toBe('Chưa phân loại');
  });
});

import { describe, expect, it } from 'vitest';
import { seatTypeLabel } from './components';

describe('booking feature helpers', () => {
  it('formats seat types for customer copy', () => {
    expect(seatTypeLabel('STANDARD')).toBe('Ghế thường');
    expect(seatTypeLabel('VIP')).toBe('Ghế VIP · Trung tâm');
    expect(seatTypeLabel('COUPLE')).toBe('Ghế đôi · 2 chỗ');
  });
});

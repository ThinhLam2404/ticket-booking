import { PROVINCES } from './provinces.js';

describe('Vietnamese province reference data', () => {
  it('contains 34 unique province and city codes including the default location', () => {
    expect(PROVINCES).toHaveLength(34);
    expect(new Set(PROVINCES.map((province) => province.code)).size).toBe(34);
    expect(PROVINCES.some((province) => province.code === 79)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { queryFingerprint } from './prisma.service.js';

describe('queryFingerprint', () => {
  it('normalizes values without exposing SQL parameters', () => {
    const fingerprint = queryFingerprint(
      `SELECT * FROM "User" WHERE "email" = 'customer@example.com' AND "id" = 123`,
    );

    expect(fingerprint).toBe(
      'SELECT * FROM "User" WHERE "email" = ? AND "id" = ?',
    );
    expect(fingerprint).not.toContain('customer@example.com');
  });
});

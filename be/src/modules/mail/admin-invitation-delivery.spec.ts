import { describe, expect, it } from 'vitest';
import { invitationDeliveryToken, invitationTokenHash } from './admin-invitation-delivery.js';

describe('invitation delivery payload', () => {
  it('rejects cleared, malformed and missing tokens', () => {
    for (const payload of [null, {}, { sent: true }, { token: 42 }, { token: 'invalid' }]) {
      expect(invitationDeliveryToken(payload)).toBeNull();
    }
  });
  it('accepts an issued token and hashes deterministically', () => {
    const token = 'a'.repeat(64);
    expect(invitationDeliveryToken({ token })).toBe(token);
    expect(invitationTokenHash(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(invitationTokenHash(token)).not.toBe(token);
  });
});

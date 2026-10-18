import { createHash } from 'node:crypto';

/** Token must still identify the current, unconsumed invitation before SMTP. */
export function invitationDeliveryToken(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('token' in payload)) return null;
  const token = payload.token;
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function invitationTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

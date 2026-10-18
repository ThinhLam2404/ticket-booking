import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { MaintenanceScheduler } from './maintenance.scheduler.js';

function createScheduler(config: Record<string, string> = {}) {
  const prisma = {
    refreshToken: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    emailVerificationToken: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    mailOutbox: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    adminInvitation: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return {
    prisma,
    scheduler: new MaintenanceScheduler(
      prisma as never,
      new ConfigService(config),
    ),
  };
}

describe('MaintenanceScheduler', () => {
  it('uses configured retention cutoffs and preserves retryable mail', async () => {
    const { prisma, scheduler } = createScheduler({
      REFRESH_TOKEN_RETENTION_DAYS: '10',
      VERIFICATION_TOKEN_RETENTION_DAYS: '3',
      MAIL_OUTBOX_RETENTION_DAYS: '90',
    });
    const before = Date.now();

    await scheduler.cleanupExpiredData();

    const refreshWhere = prisma.refreshToken.deleteMany.mock.calls[0][0].where;
    const verificationWhere = prisma.emailVerificationToken.deleteMany.mock.calls[0][0].where;
    const outboxWhere = prisma.mailOutbox.deleteMany.mock.calls[0][0].where;
    const refreshCutoff = refreshWhere.OR[1].revokedAt.lt.getTime();
    const verificationCutoff = verificationWhere.OR[1].consumedAt.lt.getTime();
    const outboxCutoff = outboxWhere.sentAt.lt.getTime();

    expect(refreshWhere.OR).toHaveLength(2);
    expect(verificationWhere.OR).toHaveLength(2);
    expect(outboxWhere.status).toBe('SENT');
    expect(outboxWhere.sentAt).toEqual({ lt: expect.any(Date) });
    expect(before - refreshCutoff).toBeGreaterThanOrEqual(10 * 24 * 60 * 60 * 1000 - 1000);
    expect(before - refreshCutoff).toBeLessThan(10 * 24 * 60 * 60 * 1000 + 1000);
    expect(before - verificationCutoff).toBeGreaterThanOrEqual(3 * 24 * 60 * 60 * 1000 - 1000);
    expect(before - verificationCutoff).toBeLessThan(3 * 24 * 60 * 60 * 1000 + 1000);
    expect(before - outboxCutoff).toBeGreaterThanOrEqual(90 * 24 * 60 * 60 * 1000 - 1000);
    expect(before - outboxCutoff).toBeLessThan(90 * 24 * 60 * 60 * 1000 + 1000);
  });
});

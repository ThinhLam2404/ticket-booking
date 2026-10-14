import { describe, expect, it, vi } from 'vitest';
import { OperationsService } from './operations.service.js';

describe('OperationsService', () => {
  it('returns dependency, outbox and payment review status', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{
        pending: 4,
        failed: 2,
        reviewRequired: 3,
        oldestPending: new Date(Date.now() - 120_000),
      }]),
      mailOutbox: {},
      sepayTransaction: {},
    };
    const redis = { ping: vi.fn().mockResolvedValue('PONG') };
    const worker = {
      getStatus: vi.fn().mockReturnValue('up'),
      getRecentRestartCount: vi.fn().mockReturnValue(2),
    };
    const service = new OperationsService(
      prisma as never,
      redis as never,
      worker as never,
      { get: vi.fn() } as never,
    );

    const status = await service.getStatus();

    expect(status.database).toBe('up');
    expect(status.redis).toBe('up');
    expect(status.mailWorker).toEqual({
      status: 'up',
      restartsLast5Minutes: 2,
    });
    expect(status.mailOutbox).toMatchObject({ pending: 4, failed: 2 });
    expect(status.mailOutbox.oldestPendingSeconds).toBeGreaterThanOrEqual(119);
    expect(status.payments.reviewRequired).toBe(3);
  });

  it('degrades safely when database and Redis are unavailable', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('db down')),
      mailOutbox: {},
      sepayTransaction: {},
    };
    const redis = { ping: vi.fn().mockRejectedValue(new Error('redis down')) };
    const worker = {
      getStatus: vi.fn().mockReturnValue('restarting'),
      getRecentRestartCount: vi.fn().mockReturnValue(3),
    };
    const service = new OperationsService(
      prisma as never,
      redis as never,
      worker as never,
      { get: vi.fn() } as never,
    );

    const status = await service.getStatus();

    expect(status).toMatchObject({
      database: 'down',
      redis: 'down',
      mailWorker: { status: 'restarting', restartsLast5Minutes: 3 },
      mailOutbox: { pending: 0, failed: 0 },
      payments: { reviewRequired: 0 },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it('marks the database down when an operational query fails', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('query failed')),
      mailOutbox: {},
      sepayTransaction: {},
    };
    const redis = { ping: vi.fn().mockResolvedValue('PONG') };
    const worker = {
      getStatus: vi.fn().mockReturnValue('up'),
      getRecentRestartCount: vi.fn().mockReturnValue(0),
    };
    const service = new OperationsService(
      prisma as never,
      redis as never,
      worker as never,
      { get: vi.fn() } as never,
    );

    await expect(service.getStatus()).resolves.toMatchObject({
      database: 'down',
      mailOutbox: { pending: 0, failed: 0 },
      payments: { reviewRequired: 0 },
    });
  });
});

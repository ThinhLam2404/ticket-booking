import { describe, expect, it, vi } from 'vitest';
import { OperationalMonitorScheduler } from './operational-monitor.scheduler.js';

describe('OperationalMonitorScheduler', () => {
  it('does not resolve database-backed alerts while the database is down', async () => {
    const config = { get: vi.fn() };
    const operations = {
      getStatus: vi.fn().mockResolvedValue({
        database: 'down',
        redis: 'up',
        mailWorker: { status: 'up', restartsLast5Minutes: 0 },
        mailOutbox: { pending: 0, failed: 0, oldestPendingSeconds: 0 },
        payments: { reviewRequired: 0 },
        timestamp: new Date().toISOString(),
      }),
    };
    const metrics = { updateOperationalMetrics: vi.fn() };
    const alerts = {
      isEnabled: vi.fn().mockReturnValue(true),
      update: vi.fn(),
    };
    const scheduler = new OperationalMonitorScheduler(
      config as never,
      operations as never,
      metrics as never,
      alerts as never,
    );

    await scheduler.monitor();

    expect(alerts.update).toHaveBeenCalledWith(
      'database-down',
      true,
      expect.any(String),
      expect.any(Object),
    );
    expect(alerts.update).not.toHaveBeenCalledWith(
      'mail-outbox-backlog',
      expect.any(Boolean),
      expect.any(String),
      expect.any(Object),
    );
    expect(alerts.update).not.toHaveBeenCalledWith(
      'payment-review-required',
      expect.any(Boolean),
      expect.any(String),
      expect.any(Object),
    );
  });

  it('alerts on worker restart loops and failed outbox entries', async () => {
    const config = { get: vi.fn() };
    const operations = {
      getStatus: vi.fn().mockResolvedValue({
        database: 'up',
        redis: 'up',
        mailWorker: { status: 'up', restartsLast5Minutes: 3 },
        mailOutbox: { pending: 0, failed: 1, oldestPendingSeconds: 0 },
        payments: { reviewRequired: 0 },
        timestamp: new Date().toISOString(),
      }),
    };
    const metrics = { updateOperationalMetrics: vi.fn() };
    const alerts = {
      isEnabled: vi.fn().mockReturnValue(true),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = new OperationalMonitorScheduler(
      config as never,
      operations as never,
      metrics as never,
      alerts as never,
    );

    await scheduler.monitor();

    expect(alerts.update).toHaveBeenCalledWith(
      'mail-worker-restarting',
      true,
      expect.any(String),
      expect.any(Object),
    );
    expect(alerts.update).toHaveBeenCalledWith(
      'mail-outbox-failed',
      true,
      expect.any(String),
      expect.any(Object),
    );
  });
});

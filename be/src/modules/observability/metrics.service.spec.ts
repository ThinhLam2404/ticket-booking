import { beforeEach, describe, expect, it } from 'vitest';
import {
  MetricsService,
  normalizeMetricRoute,
  recordHttpRequest,
} from './metrics.service.js';

describe('MetricsService', () => {
  const service = new MetricsService();

  beforeEach(() => service.resetForTests());

  it('normalizes dynamic path segments before using them as labels', () => {
    expect(
      normalizeMetricRoute(
        '/api/v1/bookings/clx12345678901234567890?include=tickets',
      ),
    ).toBe('/api/v1/bookings/:id');
  });

  it('exports HTTP and operational metrics in Prometheus format', async () => {
    recordHttpRequest(
      'GET',
      '/api/v1/bookings/clx12345678901234567890',
      200,
      25,
    );
    service.updateOperationalMetrics({
      databaseUp: true,
      redisUp: true,
      mailWorkerUp: false,
      mailOutboxPending: 3,
      mailOutboxFailed: 1,
      mailOutboxOldestPendingSeconds: 120,
    });
    service.updateOperationalMetrics({
      databaseUp: false,
      redisUp: true,
      mailWorkerUp: false,
      mailOutboxPending: 0,
      mailOutboxFailed: 0,
      mailOutboxOldestPendingSeconds: 0,
    });

    const output = await service.metrics();

    expect(output).toContain('cinebook_http_requests_total');
    expect(output).toContain('route="/api/v1/bookings/:id"');
    expect(output).toContain('cinebook_mail_outbox_pending 3');
    expect(output).toContain('cinebook_mail_outbox_data_up 0');
    expect(output).toContain('dependency="database"} 0');
    expect(output).toContain('dependency="mail_worker"} 0');
  });
});

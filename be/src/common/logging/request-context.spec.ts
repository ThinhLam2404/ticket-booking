import { describe, expect, it } from 'vitest';
import {
  getCurrentDbQueryMetrics,
  getCurrentRequestId,
  recordDbQuery,
  runWithRequestContext,
} from './request-context.js';

describe('request context database metrics', () => {
  it('aggregates query count, duration and slow-query count per request', () => {
    const metrics = runWithRequestContext(
      { requestId: 'req_test' },
      () => {
        recordDbQuery(12.345, false);
        recordDbQuery(250, true);
        return {
          requestId: getCurrentRequestId(),
          metrics: getCurrentDbQueryMetrics(),
        };
      },
    );

    expect(metrics).toEqual({
      requestId: 'req_test',
      metrics: {
        queryCount: 2,
        dbQueryDurationMs: 262.35,
        slowQueryCount: 1,
      },
    });
  });

  it('returns empty metrics outside a request context', () => {
    expect(getCurrentDbQueryMetrics()).toEqual({
      queryCount: 0,
      dbQueryDurationMs: 0,
      slowQueryCount: 0,
    });
  });
});

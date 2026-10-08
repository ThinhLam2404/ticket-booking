import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from '@prometheus-io/client';

const registry = new Registry();

collectDefaultMetrics({
  prefix: 'cinebook_process_',
  register: registry,
});
//NOTE - đếm tổng số req
const httpRequests = new Counter({
  name: 'cinebook_http_requests_total',
  help: 'Total HTTP requests handled by the API',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});
//NOTE -đo thời gian xử lí từng req
const httpDuration = new Histogram({
  name: 'cinebook_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});
//NOTE - đếm số req đang xử lí
const httpInFlight = new Gauge({
  name: 'cinebook_http_requests_in_flight',
  help: 'HTTP requests currently being handled',
  registers: [registry],
});

const holdConflicts = new Counter({
  name: 'cinebook_hold_conflicts_total',
  help: 'Seat hold attempts rejected because seats are unavailable',
  registers: [registry],
});

const bookingsExpired = new Counter({
  name: 'cinebook_bookings_expired_total',
  help: 'Bookings transitioned to expired',
  registers: [registry],
});

const paymentReviewRequired = new Counter({
  name: 'cinebook_payment_review_required_total',
  help: 'SePay transactions transitioned to review required',
  registers: [registry],
});

const mailWorkerRestarts = new Counter({
  name: 'cinebook_mail_worker_restarts_total',
  help: 'Mail worker unexpected exits that triggered a restart',
  registers: [registry],
});

const mailOutboxPending = new Gauge({
  name: 'cinebook_mail_outbox_pending',
  help: 'Current pending mail outbox entries',
  registers: [registry],
});

const mailOutboxFailed = new Gauge({
  name: 'cinebook_mail_outbox_failed',
  help: 'Current failed mail outbox entries',
  registers: [registry],
});

const mailOutboxOldestPendingSeconds = new Gauge({
  name: 'cinebook_mail_outbox_oldest_pending_seconds',
  help: 'Age of the oldest pending mail outbox entry in seconds',
  registers: [registry],
});

const mailOutboxDataUp = new Gauge({
  name: 'cinebook_mail_outbox_data_up',
  help: 'Whether the current mail outbox gauges were read successfully',
  registers: [registry],
});

const dependencyUp = new Gauge({
  name: 'cinebook_dependency_up',
  help: 'Whether a runtime dependency is available',
  labelNames: ['dependency'] as const,
  registers: [registry],
});

export function normalizeMetricRoute(path: string): string {
  const normalized = path
    .split('?')[0]
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      if (/^\d+$/.test(segment)) return ':id';
      if (/^[0-9a-f-]{32,}$/i.test(segment)) return ':id';
      if (/^[a-z0-9_-]{20,}$/i.test(segment)) return ':id';
      return segment;
    })
    .join('/');
  return normalized || '/';
}

export function beginHttpRequest(): () => void {
  httpInFlight.inc();
  let completed = false;
  return () => {
    if (completed) return;
    completed = true;
    httpInFlight.dec();
  };
}
//NOTE - dùng chuẩn hóa
export function recordHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
): void {
  const labels = {
    method: method.toUpperCase(),
    route: normalizeMetricRoute(path),
    status_code: String(statusCode),
  };
  httpRequests.inc(labels);
  httpDuration.observe(labels, durationMs / 1000);
}

export function recordHoldConflict(): void {
  holdConflicts.inc();
}

export function recordBookingExpired(): void {
  bookingsExpired.inc();
}

export function recordPaymentReviewRequired(): void {
  paymentReviewRequired.inc();
}

export function recordMailWorkerRestart(): void {
  mailWorkerRestarts.inc();
}

export type OperationalMetricSnapshot = {
  databaseUp: boolean;
  redisUp: boolean;
  mailWorkerUp: boolean;
  mailOutboxPending: number;
  mailOutboxFailed: number;
  mailOutboxOldestPendingSeconds: number;
};

@Injectable()
export class MetricsService {
  readonly contentType = registry.contentType;

  updateOperationalMetrics(snapshot: OperationalMetricSnapshot): void {
    dependencyUp.set({ dependency: 'database' }, snapshot.databaseUp ? 1 : 0);
    dependencyUp.set({ dependency: 'redis' }, snapshot.redisUp ? 1 : 0);
    dependencyUp.set(
      { dependency: 'mail_worker' },
      snapshot.mailWorkerUp ? 1 : 0,
    );
    mailOutboxDataUp.set(snapshot.databaseUp ? 1 : 0);
    if (snapshot.databaseUp) {
      mailOutboxPending.set(snapshot.mailOutboxPending);
      mailOutboxFailed.set(snapshot.mailOutboxFailed);
      mailOutboxOldestPendingSeconds.set(
        snapshot.mailOutboxOldestPendingSeconds,
      );
    }
  }

  metrics(): Promise<string> {
    return registry.metrics();
  }

  resetForTests(): void {
    registry.resetMetrics();
  }
}

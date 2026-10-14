import { getCurrentRequestId } from './request-context.js';
//NOTE - File này dùng để log các sự kiện nghiệp vụ hoặc vận hành quan trọng.
type LogLevel = 'info' | 'warn' | 'error';
type SafeMetadata = Record<
  string,
  boolean | number | string | null | undefined
>;

export function logOperationalEvent(
  level: LogLevel,
  event: string,
  metadata: SafeMetadata = {},
): void {
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(getCurrentRequestId() && { requestId: getCurrentRequestId() }),
      ...metadata,
    })}\n`,
  );
}

export async function measureServiceTiming<T>(
  operation: string,
  action: () => Promise<T>,
): Promise<T> {
  if (process.env.DB_QUERY_LOGGING !== 'true') return action();

  const startedAt = performance.now();
  try {
    return await action();
  } finally {
    logOperationalEvent('info', 'service_timing', {
      operation,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
  }
}

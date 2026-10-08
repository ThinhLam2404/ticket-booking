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

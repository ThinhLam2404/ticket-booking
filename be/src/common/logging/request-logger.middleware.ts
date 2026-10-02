import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function getRequestId(request: Request): string {
  const candidate = request.header('X-Request-Id')?.trim();
  return candidate && requestIdPattern.test(candidate)
    ? candidate
    : `req_${randomUUID()}`;
}

export function requestLogger(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const startedAt = performance.now();
  const requestId = getRequestId(request);
  request.headers['x-request-id'] = requestId;
  response.setHeader('X-Request-Id', requestId);

  response.on('finish', () => {
    process.stdout.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        event: 'http_request',
        requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      })}\n`,
    );
  });

  next();
}

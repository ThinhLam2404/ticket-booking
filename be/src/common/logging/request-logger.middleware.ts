import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  getCurrentDbQueryMetrics,
  runWithRequestContext,
} from './request-context.js';
import {
  beginHttpRequest,
  recordHttpRequest,
} from '../../modules/observability/metrics.service.js';
//NOTE - Đây là middleware chạy cho mọi HTTP request.

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
  const completeInFlight = beginHttpRequest();
  request.headers['x-request-id'] = requestId;
  response.setHeader('X-Request-Id', requestId);

  runWithRequestContext({ requestId }, () => {
    response.on('finish', () => {
      const durationMs =
        Math.round((performance.now() - startedAt) * 100) / 100;
      const dbQueryMetrics = getCurrentDbQueryMetrics();
      completeInFlight();
      recordHttpRequest(
        request.method,
        typeof request.route?.path === 'string'
          ? request.route.path
          : request.path,
        response.statusCode,
        durationMs,
      );
      process.stdout.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          event: 'http_request',
          requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs,
          ...dbQueryMetrics,
        })}\n`,
      );
    });

    response.on('close', completeInFlight);
    next();
  });
}

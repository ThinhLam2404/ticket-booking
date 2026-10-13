import { describe, expect, it, vi } from 'vitest';
import { getRequestId, requestLogger } from './request-logger.middleware.js';

describe('requestLogger', () => {
  it('keeps a valid request id and logs only safe request metadata', () => {
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const finishHandlers: Array<() => void> = [];
    const request = {
      method: 'POST',
      path: '/api/v1/auth/login',
      headers: { authorization: 'Bearer secret', 'x-request-id': 'req_test' },
      header: (name: string) =>
        name.toLowerCase() === 'x-request-id' ? 'req_test' : undefined,
    };
    const response = {
      setHeader: vi.fn(),
      on: vi.fn((_event: string, handler: () => void) =>
        finishHandlers.push(handler),
      ),
      statusCode: 401,
    };
    const next = vi.fn();

    requestLogger(request as never, response as never, next);
    finishHandlers[0]?.();

    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', 'req_test');
    expect(next).toHaveBeenCalledOnce();
    expect(output.mock.calls[0]?.[0]).toContain('"event":"http_request"');
    expect(output.mock.calls[0]?.[0]).toContain('"queryCount":0');
    expect(output.mock.calls[0]?.[0]).toContain('"dbQueryDurationMs":');
    expect(output.mock.calls[0]?.[0]).not.toContain('secret');
    expect(output.mock.calls[0]?.[0]).not.toContain('authorization');
    output.mockRestore();
  });

  it('replaces malformed or oversized request ids', () => {
    const request = {
      header: (name: string) =>
        name.toLowerCase() === 'x-request-id'
          ? `${'x'.repeat(129)}`
          : undefined,
    };

    const requestId = getRequestId(request as never);

    expect(requestId).toMatch(/^req_[0-9a-f-]{36}$/);
  });
});

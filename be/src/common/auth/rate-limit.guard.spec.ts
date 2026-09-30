import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RateLimitGuard } from './rate-limit.guard.js';

function createContext(path: string): ExecutionContext {
  const request = {
    path,
    method: 'POST',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    header: vi.fn(),
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => createContext,
    getClass: () => Object,
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  it('rejects a request after the configured login window is exhausted', async () => {
    const redis = { incrementWithExpiry: vi.fn().mockResolvedValue(11) };
    const guard = new RateLimitGuard(redis as never, new Reflector());

    await expect(guard.canActivate(createContext('/api/v1/auth/login'))).rejects.toSatisfy(
      (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
    );
    expect(redis.incrementWithExpiry).toHaveBeenCalledOnce();
  });

  it('does not count unrelated routes', async () => {
    const redis = { incrementWithExpiry: vi.fn() };
    const guard = new RateLimitGuard(redis as never, new Reflector());

    await expect(guard.canActivate(createContext('/api/v1/movies'))).resolves.toBe(true);
    expect(redis.incrementWithExpiry).not.toHaveBeenCalled();
  });
});

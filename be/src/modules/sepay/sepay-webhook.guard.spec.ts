import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SepayWebhookGuard } from './sepay-webhook.guard.js';

describe('SepayWebhookGuard', () => {
  function context(authorization?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: authorization ? { authorization } : {} }),
      }),
    } as never;
  }

  it('fails closed in production when the webhook key is missing', () => {
    const guard = new SepayWebhookGuard({
      get: vi.fn((key: string) => (key === 'NODE_ENV' ? 'production' : undefined)),
    } as never);

    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });

  it('allows local development without a configured key', () => {
    const guard = new SepayWebhookGuard({
      get: vi.fn((key: string) => (key === 'NODE_ENV' ? 'development' : undefined)),
    } as never);

    expect(guard.canActivate(context())).toBe(true);
  });

  it('requires the configured Apikey header', () => {
    const guard = new SepayWebhookGuard({
      get: vi.fn((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'SEPAY_WEBHOOK_API_KEY') return 'secret';
        return undefined;
      }),
    } as never);

    expect(() => guard.canActivate(context('Bearer secret'))).toThrow(UnauthorizedException);
    expect(guard.canActivate(context('Apikey secret'))).toBe(true);
  });
});

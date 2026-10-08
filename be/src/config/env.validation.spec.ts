import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './env.validation.js';

function validEnvironment(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    ...overrides,
  };
}

describe('validateEnvironment', () => {
  it('requires the webhook key and CORS origins in production', () => {
    expect(() =>
      validateEnvironment(
        validEnvironment({
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'a'.repeat(32),
          JWT_REFRESH_SECRET: 'b'.repeat(32),
        }),
      ),
    ).toThrow(
      'Missing required production environment variables: SEPAY_WEBHOOK_API_KEY, CORS_ORIGINS, METRICS_TOKEN',
    );
  });

  it('rejects an unknown node environment', () => {
    expect(() =>
      validateEnvironment(validEnvironment({ NODE_ENV: 'prod' })),
    ).toThrow('Invalid environment configuration');
  });

  it('rejects an invalid trusted proxy setting', () => {
    expect(() =>
      validateEnvironment(validEnvironment({ TRUST_PROXY: 'yes' })),
    ).toThrow('Invalid environment configuration');
  });

  it('rejects public placeholder JWT secrets in production', () => {
    expect(() =>
      validateEnvironment(
        validEnvironment({
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'local-access-secret-change-me-32-chars-minimum',
          JWT_REFRESH_SECRET: 'local-refresh-secret-change-me-32-chars-minimum',
          SEPAY_WEBHOOK_API_KEY: 'sepay-secret',
          CORS_ORIGINS: 'https://cinebook.example.com',
          METRICS_TOKEN: 'm'.repeat(32),
        }),
      ),
    ).toThrow(
      'JWT secrets must not use example or placeholder values in production',
    );
  });

  it('accepts production settings with distinct long JWT secrets', () => {
    expect(
      validateEnvironment(
        validEnvironment({
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'a'.repeat(32),
          JWT_REFRESH_SECRET: 'b'.repeat(32),
          SEPAY_WEBHOOK_API_KEY: 'sepay-secret',
          CORS_ORIGINS: 'https://cinebook.example.com',
          METRICS_TOKEN: 'm'.repeat(32),
        }),
      ).CORS_ORIGINS,
    ).toBe('https://cinebook.example.com');
  });

  it('requires a valid Discord webhook when operational alerts are enabled', () => {
    expect(() =>
      validateEnvironment(
        validEnvironment({
          OPS_ALERTS_ENABLED: 'true',
          DISCORD_ALERT_WEBHOOK_URL: '',
        }),
      ),
    ).toThrow('Invalid environment configuration');
  });

  it('requires a strong metrics token in production', () => {
    expect(() =>
      validateEnvironment(
        validEnvironment({
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'a'.repeat(32),
          JWT_REFRESH_SECRET: 'b'.repeat(32),
          SEPAY_WEBHOOK_API_KEY: 'sepay-secret',
          CORS_ORIGINS: 'https://cinebook.example.com',
          METRICS_TOKEN: 'short-token',
        }),
      ),
    ).toThrow('METRICS_TOKEN must be at least 32 characters in production');
  });

  it('accepts Discord operational alert settings', () => {
    expect(
      validateEnvironment(
        validEnvironment({
          OPS_ALERTS_ENABLED: 'true',
          DISCORD_ALERT_WEBHOOK_URL:
            'https://discord.com/api/webhooks/example/token',
        }),
      ).OPS_ALERTS_ENABLED,
    ).toBe('true');
  });
});

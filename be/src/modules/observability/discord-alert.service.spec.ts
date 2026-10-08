import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordAlertService } from './discord-alert.service.js';

describe('DiscordAlertService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends one alert when the Redis cooldown lock is acquired', async () => {
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'OPS_ALERTS_ENABLED') return 'true';
        if (key === 'DISCORD_ALERT_WEBHOOK_URL') {
          return 'https://discord.com/api/webhooks/example/token';
        }
        return undefined;
      }),
    };
    const redis = {
      setIfAbsent: vi
        .fn()
        .mockResolvedValueOnce('OK')
        .mockResolvedValueOnce(null),
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn(),
      delete: vi.fn(),
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const service = new DiscordAlertService(config as never, redis as never);

    await service.update('database-down', true, 'Database down', {
      status: 'down',
    });
    await service.update('database-down', true, 'Database down', {
      status: 'down',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenCalledWith(
      'ops-alert:state:database-down',
      'active',
    );
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1])).not.toContain('token');
  });

  it('does nothing when operational alerts are disabled', async () => {
    const config = { get: vi.fn().mockReturnValue('false') };
    const redis = { setIfAbsent: vi.fn() };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new DiscordAlertService(config as never, redis as never);

    await service.update('database-down', true, 'Database down', {
      status: 'down',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(redis.setIfAbsent).not.toHaveBeenCalled();
  });

  it('retries an alert when Discord delivery fails', async () => {
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'OPS_ALERTS_ENABLED') return 'true';
        if (key === 'DISCORD_ALERT_WEBHOOK_URL') {
          return 'https://discord.com/api/webhooks/example/token';
        }
        return undefined;
      }),
    };
    const redis = {
      setIfAbsent: vi.fn().mockResolvedValue('OK'),
      set: vi.fn().mockResolvedValue('OK'),
      delete: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const service = new DiscordAlertService(config as never, redis as never);

    await service.update('database-down', true, 'Database down', {
      status: 'down',
    });
    await service.update('database-down', true, 'Database down', {
      status: 'down',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(redis.set).toHaveBeenCalledTimes(1);
  });

  it('keeps recovery state when Discord delivery fails', async () => {
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'OPS_ALERTS_ENABLED') return 'true';
        if (key === 'DISCORD_ALERT_WEBHOOK_URL') {
          return 'https://discord.com/api/webhooks/example/token';
        }
        return undefined;
      }),
    };
    const redis = {
      setIfAbsent: vi.fn().mockResolvedValue('OK'),
      set: vi.fn().mockResolvedValue('OK'),
      delete: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue('active'),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const service = new DiscordAlertService(config as never, redis as never);

    await service.update('database-down', false, 'Database down', {
      status: 'up',
    });
    await service.update('database-down', false, 'Database down', {
      status: 'up',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(redis.delete).toHaveBeenCalledTimes(2);
  });

  it('sends a recovery after Redis becomes available again', async () => {
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'OPS_ALERTS_ENABLED') return 'true';
        if (key === 'DISCORD_ALERT_WEBHOOK_URL') {
          return 'https://discord.com/api/webhooks/example/token';
        }
        return undefined;
      }),
    };
    const redis = {
      setIfAbsent: vi
        .fn()
        .mockRejectedValueOnce(new Error('redis down'))
        .mockResolvedValueOnce('OK'),
      set: vi.fn().mockRejectedValueOnce(new Error('redis down')),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(1),
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const service = new DiscordAlertService(config as never, redis as never);

    await service.update('redis-down', true, 'Redis down', { status: 'down' });
    await service.update('redis-down', false, 'Redis down', { status: 'up' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('Đã phục hồi');
  });
});

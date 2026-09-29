import { describe, expect, it } from 'vitest';
import { dashboardShowtimeStatus, youtubeKey } from './shared';

describe('admin feature helpers', () => {
  it('accepts supported YouTube URLs and rejects other hosts', () => {
    expect(youtubeKey('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeKey('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeKey('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('categorizes showtime status from current time', () => {
    const now = Date.now();
    expect(dashboardShowtimeStatus({ startsAt: new Date(now - 5 * 60_000).toISOString(), endsAt: new Date(now + 5 * 60_000).toISOString() } as never).tone).toBe('live');
    expect(dashboardShowtimeStatus({ startsAt: new Date(now + 10 * 60_000).toISOString(), endsAt: new Date(now + 120 * 60_000).toISOString() } as never).tone).toBe('soon');
    expect(dashboardShowtimeStatus({ startsAt: new Date(now + 120 * 60_000).toISOString(), endsAt: new Date(now + 240 * 60_000).toISOString() } as never).tone).toBe('scheduled');
  });
});

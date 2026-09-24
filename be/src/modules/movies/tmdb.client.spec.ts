import { ConfigService } from '@nestjs/config';
import { TmdbClient } from './tmdb.client.js';

describe('TmdbClient trailer selection', () => {
  it('prefers Vietnamese trailer before English trailer', () => {
    const client = new TmdbClient(new ConfigService({ TMDB_ACCESS_TOKEN: 'token' }));

    expect(client.trailerKey([
      { key: 'en-official', site: 'YouTube', type: 'Trailer', official: true, iso_639_1: 'en' },
      { key: 'vi-trailer', site: 'YouTube', type: 'Trailer', official: false, iso_639_1: 'vi' },
    ])).toBe('vi-trailer');
  });

  it('falls back to English video detail when Vietnamese detail has no trailer', async () => {
    const client = new TmdbClient(new ConfigService({ TMDB_ACCESS_TOKEN: 'token' }));
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      requests.push(input);
      const isEnglish = input.includes('language=en-US');
      return new Response(JSON.stringify({
        id: 10,
        title: isEnglish ? 'English title' : 'Tên tiếng Việt',
        videos: {
          results: isEnglish
            ? [{ key: 'en-trailer', site: 'YouTube', type: 'Trailer', official: true, iso_639_1: 'en' }]
            : [],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    await expect(client.movie(10)).resolves.toMatchObject({
      title: 'Tên tiếng Việt',
      videos: { results: [{ key: 'en-trailer' }] },
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain('language=vi-VN');
    expect(requests[1]).toContain('language=en-US');
    vi.unstubAllGlobals();
  });
});

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { TmdbMovieImportResponse, TmdbMoviesResponse } from '../types';
import {
  patchTmdbMovieCaches,
  runTmdbImportQueue,
  TMDB_IMPORT_CONCURRENCY,
  TMDB_IMPORT_LIMIT,
} from './tmdb-import';

function response(tmdbId: number): TmdbMovieImportResponse {
  return {
    imported: true,
    movie: {
      id: `movie-${tmdbId}`,
      tmdbId,
      title: `Movie ${tmdbId}`,
      description: null,
      posterUrl: null,
      backdropUrl: null,
       trailerKey: null,
       releaseDate: null,
       rating: null,
       genres: [],
       ageRating: null,
       duration: 120,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

function moviesResponse(ids: number[]): TmdbMoviesResponse {
  return {
    data: ids.map((tmdbId) => ({
      tmdbId,
      title: `Movie ${tmdbId}`,
      description: null,
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
      rating: null,
      imported: false,
      importedMovieId: null,
    })),
    meta: { page: 1, pageSize: ids.length, total: ids.length, totalPages: 1 },
  };
}

describe('TMDB import helpers', () => {
  it('keeps concurrency at three and continues after partial failure', async () => {
    let active = 0;
    let peak = 0;
    const importMovie = vi.fn(async (tmdbId: number) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, tmdbId === 2 ? 10 : 1));
      active -= 1;
      if (tmdbId === 2) throw new Error('failed');
      return response(tmdbId);
    });

    const results = await runTmdbImportQueue([1, 2, 3, 4, 4], importMovie);

    expect(peak).toBeLessThanOrEqual(TMDB_IMPORT_CONCURRENCY);
    expect(importMovie).toHaveBeenCalledTimes(4);
    expect(results).toHaveLength(4);
    expect(results.find((result) => result.tmdbId === 2)?.ok).toBe(false);
    expect(results.filter((result) => result.ok)).toHaveLength(3);
  });

  it('rejects more than twenty unique movies', async () => {
    await expect(
      runTmdbImportQueue(
        Array.from({ length: TMDB_IMPORT_LIMIT + 1 }, (_, index) => index + 1),
        async (tmdbId) => response(tmdbId),
      ),
    ).rejects.toThrow(`Không thể nhập quá ${TMDB_IMPORT_LIMIT} phim mỗi lần.`);
  });

  it('patches every cached TMDB page and preserves metadata', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['tmdb-movies', '', 1], moviesResponse([10, 20]));
    queryClient.setQueryData(['tmdb-movies', 'dune', 2], moviesResponse([10, 30]));
    queryClient.setQueryData(['admin-movies'], { data: [] });

    patchTmdbMovieCaches(queryClient, 10, 'movie-10');

    const first = queryClient.getQueryData<TmdbMoviesResponse>(['tmdb-movies', '', 1]);
    const second = queryClient.getQueryData<TmdbMoviesResponse>(['tmdb-movies', 'dune', 2]);
    expect(first?.meta).toEqual({ page: 1, pageSize: 2, total: 2, totalPages: 1 });
    expect(first?.data[0]).toMatchObject({ tmdbId: 10, imported: true, importedMovieId: 'movie-10' });
    expect(first?.data[1].imported).toBe(false);
    expect(second?.data[0]).toMatchObject({ tmdbId: 10, imported: true, importedMovieId: 'movie-10' });
    expect(queryClient.getQueryData(['admin-movies'])).toEqual({ data: [] });
  });
});

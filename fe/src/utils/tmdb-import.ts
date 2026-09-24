import type { QueryClient } from '@tanstack/react-query';
import type { TmdbMovieImportResponse, TmdbMoviesResponse } from '../types';

export const TMDB_IMPORT_LIMIT = 20;
export const TMDB_IMPORT_CONCURRENCY = 3;

export type TmdbQueueResult =
  | { tmdbId: number; ok: true; response: TmdbMovieImportResponse }
  | { tmdbId: number; ok: false; error: unknown };

export async function runTmdbImportQueue(
  tmdbIds: number[],
  importMovie: (tmdbId: number) => Promise<TmdbMovieImportResponse>,
  onSettled?: (result: TmdbQueueResult) => void,
): Promise<TmdbQueueResult[]> {
  const ids = [...new Set(tmdbIds)];
  if (ids.length > TMDB_IMPORT_LIMIT) {
    throw new RangeError(`Không thể nhập quá ${TMDB_IMPORT_LIMIT} phim mỗi lần.`);
  }
  if (!ids.length) return [];

  const results: TmdbQueueResult[] = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < ids.length) {
      const index = nextIndex;
      nextIndex += 1;
      const tmdbId = ids[index];
      try {
        const response = await importMovie(tmdbId);
        const result: TmdbQueueResult = { tmdbId, ok: true, response };
        results[index] = result;
        onSettled?.(result);
      } catch (error) {
        const result: TmdbQueueResult = { tmdbId, ok: false, error };
        results[index] = result;
        onSettled?.(result);
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(TMDB_IMPORT_CONCURRENCY, ids.length) },
      () => worker(),
    ),
  );
  return results;
}

export function patchTmdbMovieCaches(
  queryClient: QueryClient,
  tmdbId: number,
  importedMovieId: string,
) {
  const queries = queryClient.getQueriesData<TmdbMoviesResponse>({
    queryKey: ['tmdb-movies'],
  });
  for (const [queryKey, data] of queries) {
    if (!data) continue;
    queryClient.setQueryData<TmdbMoviesResponse>(queryKey, {
      ...data,
      data: data.data.map((movie) =>
        movie.tmdbId === tmdbId
          ? { ...movie, imported: true, importedMovieId }
          : movie,
      ),
    });
  }
}

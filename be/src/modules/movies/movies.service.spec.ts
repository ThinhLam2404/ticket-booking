import { MovieStatus } from '@prisma/client';
import { MoviesService } from './movies.service.js';
import { TmdbClient } from './tmdb.client.js';

describe('MoviesService TMDB import', () => {
  it('normalizes TMDB results and marks imported movies', async () => {
    const prisma = {
      movie: {
        findMany: vi.fn().mockResolvedValue([{ id: 'movie-1', tmdbId: 10 }]),
      },
    };
    const tmdb = {
      listMovies: vi.fn().mockResolvedValue({
        page: 1,
        results: [
          {
            id: 10,
            title: 'Dune: Part Two',
            overview: 'A desert story',
            poster_path: '/poster.jpg',
            backdrop_path: '/backdrop.jpg',
            release_date: '2024-02-27',
            vote_average: 8.7,
          },
        ],
        total_pages: 1,
        total_results: 1,
      }),
      image: vi.fn((path: string | null, size: string) => path ? `${size}${path}` : null),
    };
    const service = new MoviesService(prisma as never, tmdb as never);

    await expect(service.findTmdb({ page: 1 })).resolves.toEqual({
      data: [{
        tmdbId: 10,
        title: 'Dune: Part Two',
        description: 'A desert story',
        posterUrl: 'w500/poster.jpg',
        backdropUrl: 'w1280/backdrop.jpg',
        releaseDate: '2024-02-27',
        rating: 8.7,
        imported: true,
        importedMovieId: 'movie-1',
      }],
      meta: { page: 1, pageSize: 1, total: 1, totalPages: 1 },
    });
  });

  it('returns Prisma Decimal ratings as numbers for admin updates', async () => {
    const movie = {
      id: 'movie-1',
      title: 'Dune: Part Two',
      rating: { toFixed: () => '8.70' },
      genres: [],
      duration: 166,
      status: MovieStatus.DRAFT,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      movie: {
        findMany: vi.fn().mockResolvedValue([movie]),
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn().mockResolvedValue([[movie], 1]),
    };
    const service = new MoviesService(prisma as never, {} as never);

    const response = await service.findAll({ page: 1, pageSize: 10 });

    expect(response.data[0].rating).toBe(8.7);
  });

  it('imports the preferred official Vietnamese trailer key', async () => {
    const prisma = {
      movie: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'movie-2',
          tmdbId: 20,
          title: 'Dune: Part Two',
          description: null,
          posterUrl: null,
          backdropUrl: null,
          trailerKey: 'vi-official',
          duration: 166,
          status: MovieStatus.DRAFT,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };
    const tmdb = {
      movie: vi.fn().mockResolvedValue({
        id: 20,
        title: 'Dune: Part Two',
        videos: {
          results: [
            { key: 'en-official', site: 'YouTube', type: 'Trailer', official: true, iso_639_1: 'en' },
            { key: 'vi-official', site: 'YouTube', type: 'Trailer', official: true, iso_639_1: 'vi' },
          ],
        },
      }),
      image: vi.fn().mockReturnValue(null),
      trailerKey: TmdbClient.prototype.trailerKey,
    };
    const service = new MoviesService(prisma as never, tmdb as never);

    await expect(service.importTmdbMovie(20)).resolves.toMatchObject({
      imported: true,
      movie: { trailerKey: 'vi-official' },
    });
    expect(prisma.movie.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ trailerKey: 'vi-official' }),
    });
  });

  it('returns an existing movie without importing it again', async () => {
    const existing = {
      id: 'movie-1',
      tmdbId: 10,
      title: 'Dune: Part Two',
      description: null,
      posterUrl: null,
      backdropUrl: null,
      duration: 120,
      status: MovieStatus.DRAFT,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      movie: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
      },
    };
    const tmdb = { movie: vi.fn() };
    const service = new MoviesService(prisma as never, tmdb as never);

    await expect(service.importTmdbMovie(10)).resolves.toMatchObject({
      imported: false,
      movie: { id: 'movie-1', tmdbId: 10 },
    });
    expect(tmdb.movie).not.toHaveBeenCalled();
    expect(prisma.movie.create).not.toHaveBeenCalled();
  });

  it('resyncs only available TMDB media fields', async () => {
    const existing = {
      id: 'movie-1',
      tmdbId: 10,
      title: 'Tên phim đã biên tập',
      description: 'Mô tả nội bộ',
      posterUrl: 'https://old/poster.jpg',
      backdropUrl: 'https://old/backdrop.jpg',
      trailerKey: 'oldTrailer',
      duration: 140,
      status: MovieStatus.PUBLISHED,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const updated = {
      ...existing,
      posterUrl: 'w500/new-poster.jpg',
      trailerKey: 'newTrailer',
    };
    const prisma = {
      movie: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    };
    const tmdb = {
      movie: vi.fn().mockResolvedValue({
        id: 10,
        poster_path: '/new-poster.jpg',
        backdrop_path: null,
        videos: { results: [{ key: 'newTrailer', site: 'YouTube', type: 'Trailer', official: true, iso_639_1: 'vi' }] },
      }),
      image: vi.fn((path: string | null, size: string) => path ? `${size}${path}` : null),
      trailerKey: TmdbClient.prototype.trailerKey,
    };
    const service = new MoviesService(prisma as never, tmdb as never);

    await expect(service.resyncTmdbMovie(10)).resolves.toMatchObject({
      title: 'Tên phim đã biên tập',
      description: 'Mô tả nội bộ',
      posterUrl: 'w500/new-poster.jpg',
      backdropUrl: 'https://old/backdrop.jpg',
      trailerKey: 'newTrailer',
      duration: 140,
      status: MovieStatus.PUBLISHED,
    });
    expect(prisma.movie.update).toHaveBeenCalledWith({
      where: { id: 'movie-1' },
      data: { posterUrl: 'w500/new-poster.jpg', trailerKey: 'newTrailer' },
    });
  });

  it('does not clear existing media when TMDB has no media', async () => {
    const existing = {
      id: 'movie-1',
      tmdbId: 10,
      posterUrl: 'https://old/poster.jpg',
      backdropUrl: 'https://old/backdrop.jpg',
      trailerKey: 'oldTrailer',
    };
    const prisma = {
      movie: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(existing),
      },
    };
    const tmdb = {
      movie: vi.fn().mockResolvedValue({ id: 10, poster_path: null, backdrop_path: null, videos: { results: [] } }),
      image: vi.fn().mockReturnValue(null),
      trailerKey: vi.fn().mockReturnValue(null),
    };
    const service = new MoviesService(prisma as never, tmdb as never);

    await expect(service.resyncTmdbMovie(10)).resolves.toMatchObject(existing);
    expect(prisma.movie.update).not.toHaveBeenCalled();
  });
});

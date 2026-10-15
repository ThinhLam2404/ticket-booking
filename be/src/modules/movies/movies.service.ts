import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { MovieStatus, Prisma, RoomFormat, ShowtimeFormat } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { measureServiceTiming } from '../../common/logging/operational-logger.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { TmdbClient } from './tmdb.client.js';
import type { ListTmdbMoviesDto } from './dto/tmdb-movie.dto.js';
import { CreateMovieDto } from './dto/create-movie.dto.js';
import { ListAdminMoviesDto, ListMoviesDto, MovieCatalogCategory } from './dto/list-movies.dto.js';
import { UpdateMovieDto } from './dto/update-movie.dto.js';

function normalizeMovieRatings<T>(value: T): T {
  if (value === null || value === undefined || value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => normalizeMovieRatings(item)) as T;
  }
  if (typeof value !== 'object') return value;

  const result = Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      normalizeMovieRatings(nestedValue),
    ]),
  );
  if (typeof result.rating === 'string') result.rating = Number(result.rating);
  return result as T;
}

function toMovieResponse<T>(value: T): T {
  return normalizeMovieRatings(toPublicResponse(value));
}

@Injectable()
export class MoviesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdb: TmdbClient,
    @Optional() private readonly audit: AuditService = null as unknown as AuditService,
  ) {}

  async findAll(query: ListMoviesDto) {
    return measureServiceTiming('movies.findAll', () =>
      this.findMovies(query, { publishedOnly: true }),
    );
  }

  async findAllAdmin(query: ListAdminMoviesDto) {
    return measureServiceTiming('movies.findAllAdmin', () =>
      this.findMovies(query, { publishedOnly: false }),
    );
  }

  async findTmdb(query: ListTmdbMoviesDto) {
    const page = query.page;
    const response = await this.tmdb.listMovies(query.search, page);
    const ids = response.results.map((movie) => movie.id);
    //NOTE - id của các phim đã import
    const importedMovies = ids.length
      ? await this.prisma.movie.findMany({
          where: { tmdbId: { in: ids } },
          select: { id: true, tmdbId: true },
        })
      : [];
    //NOTE - tạo map dạng (tmdbid, movie.id) để get movie id nếu đã import rồi
    const importedByTmdbId = new Map(
      importedMovies.map((movie) => [movie.tmdbId, movie.id]),
    );

    return {
      data: response.results.map((movie) => ({
        tmdbId: movie.id,
        title: movie.title,
        description: movie.overview ?? null,
        posterUrl: this.tmdb.image(movie.poster_path, 'w500'),
        backdropUrl: this.tmdb.image(movie.backdrop_path, 'w1280'),
        releaseDate: movie.release_date || null,
        rating: movie.vote_average ?? null,
        imported: importedByTmdbId.has(movie.id),
        importedMovieId: importedByTmdbId.get(movie.id) ?? null,
      })),
      meta: {
        page: response.page,
        pageSize: response.results.length,
        total: response.total_results,
        totalPages: response.total_pages,
      },
    };
  }

  async importTmdbMovie(tmdbId: number) {
    const existing = await this.prisma.movie.findUnique({ where: { tmdbId } });
    if (existing) return { movie: toMovieResponse(existing), imported: false };

    const movie = await this.tmdb.movie(tmdbId);
    const data = {
      tmdbId: movie.id,
      title: movie.title.trim(),
      description: movie.overview?.trim() || null,
      posterUrl: this.tmdb.image(movie.poster_path, 'w500'),
       backdropUrl: this.tmdb.image(movie.backdrop_path, 'w1280'),
       trailerKey: this.tmdb.trailerKey(movie.videos?.results),
       releaseDate: movie.release_date ? new Date(`${movie.release_date}T00:00:00.000Z`) : null,
       rating: movie.vote_average ?? null,
       genres: movie.genres?.map((genre) => genre.name).filter(Boolean) ?? [],
       duration: movie.runtime && movie.runtime > 0 ? movie.runtime : 120,
       status: MovieStatus.DRAFT,
    };

    try {
      const created = await this.prisma.movie.create({ data });
      return { movie: toMovieResponse(created), imported: true };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const concurrent = await this.prisma.movie.findUnique({
          where: { tmdbId },
        });
        if (concurrent)
          return { movie: toMovieResponse(concurrent), imported: false };
        throw new ConflictException('Movie was imported concurrently');
      }
      throw error;
    }
  }

  async resyncTmdbMovie(tmdbId: number) {
    const existing = await this.prisma.movie.findUnique({ where: { tmdbId } });
    if (!existing) throw new NotFoundException('Movie not found');

    const movie = await this.tmdb.movie(tmdbId);
    const posterUrl = this.tmdb.image(movie.poster_path, 'w500');
    const backdropUrl = this.tmdb.image(movie.backdrop_path, 'w1280');
    const trailerKey = this.tmdb.trailerKey(movie.videos?.results);
    const data = {
      ...(posterUrl && { posterUrl }),
      ...(backdropUrl && { backdropUrl }),
      ...(trailerKey && { trailerKey }),
    };
    if (!Object.keys(data).length) return toMovieResponse(existing);

    const updated = await this.prisma.movie.update({
      where: { id: existing.id },
      data,
    });

    return toMovieResponse(updated);
  }

  private async findMovies(
    query: ListMoviesDto | ListAdminMoviesDto,
    options: { publishedOnly: boolean },
  ) {
    const page = query.page;
    const pageSize = query.pageSize;
    const now = new Date();
    const futureShowtime: Prisma.ShowtimeWhereInput = {
      startsAt: { gte: now },
      ...(query.provinceCode && { room: { cinema: { provinceCode: query.provinceCode } } }),
    };
    const specialShowtime: Prisma.ShowtimeWhereInput = {
      ...futureShowtime,
      OR: [
        { room: { format: { not: RoomFormat.STANDARD } } },
        { format: { in: [ShowtimeFormat.THREE_D_SUBTITLED, ShowtimeFormat.THREE_D_DUBBED] } },
      ],
    };
    const priceShowtimeWhere = query.category === MovieCatalogCategory.SPECIAL
      ? specialShowtime
      : futureShowtime;
    const where: Prisma.MovieWhereInput = options.publishedOnly
      ? { status: MovieStatus.PUBLISHED }
      : 'status' in query && query.status
        ? { status: query.status }
        : {};

    if (options.publishedOnly) {
      if (query.category === MovieCatalogCategory.COMING_SOON) {
        where.releaseDate = { gt: now };
      } else if (query.category === MovieCatalogCategory.SPECIAL) {
        where.showtimes = {
          some: specialShowtime,
        };
      } else {
        where.showtimes = { some: futureShowtime };
      }
    }

    if (query.search?.trim()) {
      where.title = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.movie.findMany({
        where,
        include: {
          showtimes: {
            where: priceShowtimeWhere,
            select: { basePrice: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.movie.count({ where }),
    ]);

    return {
      data: toMovieResponse(data.map((movie) => {
        const showtimes = movie.showtimes ?? [];
        const startingPrice = showtimes.length
          ? Math.min(...showtimes.map((showtime) => showtime.basePrice.toNumber()))
          : null;
        const { showtimes: _showtimes, ...movieData } = movie;
        return { ...movieData, startingPrice };
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string, provinceCode?: number) {
    return measureServiceTiming('movies.findOne', async () => {
      const movie = await this.prisma.movie.findFirst({
      where: { id, status: MovieStatus.PUBLISHED },
      include: {
        showtimes: {
          where: {
            startsAt: { gte: new Date() },
            ...(provinceCode && { room: { cinema: { provinceCode } } }),
          },
          include: { room: { include: { cinema: true } } },
          orderBy: { startsAt: 'asc' },
        },
      },
    });

    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

      return toMovieResponse(movie);
    });
  }

  async create(dto: CreateMovieDto) {
    return this.prisma.$transaction(async (transaction) => {
      const movie = await transaction.movie.create({
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim() ?? null,
          posterUrl: dto.posterUrl?.trim() ?? null,
          backdropUrl: dto.backdropUrl?.trim() ?? null,
          trailerKey: dto.trailerKey?.trim() ?? null,
          releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : null,
          rating: dto.rating ?? null,
          genres: dto.genres?.map((genre) => genre.trim()).filter(Boolean) ?? [],
          ageRating: dto.ageRating?.trim() ?? null,
          duration: dto.duration,
          status: dto.status ?? MovieStatus.DRAFT,
        },
      });
      if (this.audit) await this.audit.record({ action: 'MOVIE_CREATED', resourceType: 'Movie', resourceId: movie.id, after: { id: movie.id, status: movie.status } }, transaction);
      return toMovieResponse(movie);
    });
  }

  async update(id: string, dto: UpdateMovieDto) {
    await this.getById(id);

    const movie = await this.prisma.movie.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.description !== undefined && {
          description: dto.description?.trim() ?? null,
        }),
        ...(dto.posterUrl !== undefined && {
          posterUrl: dto.posterUrl?.trim() ?? null,
        }),
        ...(dto.backdropUrl !== undefined && {
          backdropUrl: dto.backdropUrl?.trim() ?? null,
        }),
        ...(dto.trailerKey !== undefined && {
          trailerKey: dto.trailerKey?.trim() ?? null,
        }),
        ...(dto.releaseDate !== undefined && {
          releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : null,
        }),
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.genres !== undefined && {
          genres: dto.genres.map((genre) => genre.trim()).filter(Boolean),
        }),
        ...(dto.ageRating !== undefined && {
          ageRating: dto.ageRating?.trim() ?? null,
        }),
        ...(dto.duration !== undefined && { duration: dto.duration }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
    return toMovieResponse(movie);
  }

  async archive(id: string) {
    await this.getById(id);
    return this.prisma.$transaction(async (transaction) => {
      const movie = await transaction.movie.update({ where: { id }, data: { status: MovieStatus.ARCHIVED } });
      if (this.audit) await this.audit.record({ action: 'MOVIE_ARCHIVED', resourceType: 'Movie', resourceId: id, before: { id, status: 'PUBLISHED' }, after: { id, status: movie.status } }, transaction);
      return toMovieResponse(movie);
    });
  }

  private async getById(id: string) {
    const movie = await this.prisma.movie.findUnique({ where: { id } });
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }
    return movie;
  }
}

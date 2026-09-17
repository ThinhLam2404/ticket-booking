import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MovieStatus, Prisma } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
import { TmdbClient } from './tmdb.client.js';
import type { ListTmdbMoviesDto } from './dto/tmdb-movie.dto.js';
import { CreateMovieDto } from './dto/create-movie.dto.js';
import { ListAdminMoviesDto, ListMoviesDto } from './dto/list-movies.dto.js';
import { UpdateMovieDto } from './dto/update-movie.dto.js';

@Injectable()
export class MoviesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdb: TmdbClient,
  ) {}

  async findAll(query: ListMoviesDto) {
    return this.findMovies(query, { publishedOnly: true });
  }

  async findAllAdmin(query: ListAdminMoviesDto) {
    return this.findMovies(query, { publishedOnly: false });
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
    if (existing) return { movie: toPublicResponse(existing), imported: false };

    const movie = await this.tmdb.movie(tmdbId);
    const data = {
      tmdbId: movie.id,
      title: movie.title.trim(),
      description: movie.overview?.trim() || null,
      posterUrl: this.tmdb.image(movie.poster_path, 'w500'),
      backdropUrl: this.tmdb.image(movie.backdrop_path, 'w1280'),
      trailerKey: this.tmdb.trailerKey(movie.videos?.results),
      duration: movie.runtime && movie.runtime > 0 ? movie.runtime : 120,
      status: MovieStatus.DRAFT,
    };

    try {
      const created = await this.prisma.movie.create({ data });
      return { movie: toPublicResponse(created), imported: true };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const concurrent = await this.prisma.movie.findUnique({
          where: { tmdbId },
        });
        if (concurrent)
          return { movie: toPublicResponse(concurrent), imported: false };
        throw new ConflictException('Movie was imported concurrently');
      }
      throw error;
    }
  }

  private async findMovies(
    query: ListMoviesDto | ListAdminMoviesDto,
    options: { publishedOnly: boolean },
  ) {
    const page = query.page;
    const pageSize = query.pageSize;
    const where: Prisma.MovieWhereInput = options.publishedOnly
      ? { status: MovieStatus.PUBLISHED }
      : 'status' in query && query.status
        ? { status: query.status }
        : {};

    if (options.publishedOnly && query.provinceCode) {
      where.showtimes = {
        some: {
          startsAt: { gte: new Date() },
          room: { cinema: { provinceCode: query.provinceCode } },
        },
      };
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
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.movie.count({ where }),
    ]);

    return {
      data: toPublicResponse(data),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string, provinceCode?: number) {
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

    return toPublicResponse(movie);
  }

  async create(dto: CreateMovieDto) {
    const movie = await this.prisma.movie.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() ?? null,
        posterUrl: dto.posterUrl?.trim() ?? null,
        backdropUrl: dto.backdropUrl?.trim() ?? null,
        trailerKey: dto.trailerKey?.trim() ?? null,
        duration: dto.duration,
        status: dto.status ?? MovieStatus.DRAFT,
      },
    });
    return toPublicResponse(movie);
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
        ...(dto.duration !== undefined && { duration: dto.duration }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
    return toPublicResponse(movie);
  }

  async archive(id: string) {
    await this.getById(id);

    const movie = await this.prisma.movie.update({
      where: { id },
      data: { status: MovieStatus.ARCHIVED },
    });
    return toPublicResponse(movie);
  }

  private async getById(id: string) {
    const movie = await this.prisma.movie.findUnique({ where: { id } });
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }
    return movie;
  }
}

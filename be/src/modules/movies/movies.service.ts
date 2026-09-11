import { Injectable, NotFoundException } from '@nestjs/common';
import { MovieStatus, Prisma } from '@prisma/client';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateMovieDto } from './dto/create-movie.dto.js';
import { ListMoviesDto } from './dto/list-movies.dto.js';
import { UpdateMovieDto } from './dto/update-movie.dto.js';

@Injectable()
export class MoviesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListMoviesDto) {
    const page = query.page;
    const pageSize = query.pageSize;
    const where: Prisma.MovieWhereInput = {
      status: MovieStatus.PUBLISHED,
    };

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

  async findOne(id: string) {
    const movie = await this.prisma.movie.findFirst({
      where: { id, status: MovieStatus.PUBLISHED },
      include: {
        showtimes: {
          where: { startsAt: { gte: new Date() } },
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
        description: dto.description?.trim(),
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
          description: dto.description.trim(),
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

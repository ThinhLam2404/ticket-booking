import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateCinemaDto, UpdateCinemaDto } from './dto/cinema.dto.js';
import { ListCinemasDto } from './dto/list-cinemas.dto.js';
import { PROVINCES } from '../locations/provinces.js';

@Injectable()
export class CinemasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListCinemasDto = {}) {
    const cinemas = await this.prisma.cinema.findMany({
      where: query.provinceCode ? { provinceCode: query.provinceCode } : undefined,
      include: {
        _count: { select: { rooms: true } },
      },
      orderBy: { name: 'asc' },
    });
    return toPublicResponse(cinemas.map((cinema) => ({
      ...cinema,
      province: PROVINCES.find((province) => province.code === cinema.provinceCode) ?? null,
    })));
  }

  async findOne(id: string) {
    const cinema = await this.prisma.cinema.findUnique({
      where: { id },
      include: {
        rooms: {
          include: {
            _count: { select: { seats: true } },
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!cinema) {
      throw new NotFoundException('Cinema not found');
    }

    return toPublicResponse({
      ...cinema,
      province: PROVINCES.find((province) => province.code === cinema.provinceCode) ?? null,
    });
  }

  async create(dto: CreateCinemaDto) {
    try {
      const cinema = await this.prisma.cinema.create({
        data: {
          name: dto.name.trim(),
          address: dto.address.trim(),
          provinceCode: dto.provinceCode,
        },
      });
      return toPublicResponse({
        ...cinema,
        province: PROVINCES.find((province) => province.code === cinema.provinceCode) ?? null,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Cinema already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCinemaDto) {
    await this.getById(id);

    const cinema = await this.prisma.cinema.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.address !== undefined && { address: dto.address.trim() }),
        ...(dto.provinceCode !== undefined && { provinceCode: dto.provinceCode }),
      },
    });
    return toPublicResponse({
      ...cinema,
      province: PROVINCES.find((province) => province.code === cinema.provinceCode) ?? null,
    });
  }

  async remove(id: string) {
    await this.getById(id);

    try {
      const cinema = await this.prisma.cinema.delete({ where: { id } });
      return toPublicResponse({
        ...cinema,
        province: PROVINCES.find((province) => province.code === cinema.provinceCode) ?? null,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Cinema cannot be deleted while it has active showtimes',
        );
      }
      throw error;
    }
  }

  private async getById(id: string) {
    const cinema = await this.prisma.cinema.findUnique({ where: { id } });
    if (!cinema) {
      throw new NotFoundException('Cinema not found');
    }
    return cinema;
  }
}

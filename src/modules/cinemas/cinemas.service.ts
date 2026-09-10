import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateCinemaDto, UpdateCinemaDto } from './dto/cinema.dto.js';

@Injectable()
export class CinemasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.cinema.findMany({
      include: {
        _count: { select: { rooms: true } },
      },
      orderBy: { name: 'asc' },
    });
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

    return cinema;
  }

  async create(dto: CreateCinemaDto) {
    try {
      return await this.prisma.cinema.create({
        data: {
          name: dto.name.trim(),
          address: dto.address.trim(),
        },
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

    return this.prisma.cinema.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.address !== undefined && { address: dto.address.trim() }),
      },
    });
  }

  async remove(id: string) {
    await this.getById(id);

    try {
      return await this.prisma.cinema.delete({ where: { id } });
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

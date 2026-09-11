import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateSeatDto, UpdateSeatDto } from './dto/seat.dto.js';

@Injectable()
export class SeatsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByRoom(roomId: string) {
    const seats = await this.prisma.seat.findMany({
      where: { roomId },
      orderBy: [{ row: 'asc' }, { number: 'asc' }],
    });
    return toPublicResponse(seats);
  }

  async create(roomId: string, dto: CreateSeatDto) {
    try {
      const seat = await this.prisma.seat.create({
        data: {
          roomId,
          row: dto.row.trim().toUpperCase(),
          number: dto.number,
          type: dto.type ?? 'STANDARD',
        },
      });
      return toPublicResponse(seat);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Seat already exists in this room');
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Room not found');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateSeatDto) {
    await this.getById(id);
    const seat = await this.prisma.seat.update({
      where: { id },
      data: dto.type === undefined ? {} : { type: dto.type },
    });
    return toPublicResponse(seat);
  }

  async remove(id: string) {
    await this.getById(id);
    try {
      const seat = await this.prisma.seat.delete({ where: { id } });
      return toPublicResponse(seat);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Seat cannot be deleted while it is used by a showtime',
        );
      }
      throw error;
    }
  }

  private async getById(id: string) {
    const seat = await this.prisma.seat.findUnique({ where: { id } });
    if (!seat) {
      throw new NotFoundException('Seat not found');
    }
    return seat;
  }
}

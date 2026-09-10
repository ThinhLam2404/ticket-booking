import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto.js';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  findByCinema(cinemaId: string) {
    return this.prisma.room.findMany({
      where: { cinemaId },
      include: { _count: { select: { seats: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        cinema: true,
        seats: { orderBy: [{ row: 'asc' }, { number: 'asc' }] },
      },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }

  async create(dto: CreateRoomDto) {
    try {
      return await this.prisma.room.create({
        data: { name: dto.name.trim(), cinemaId: dto.cinemaId },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Room already exists in this cinema');
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Cinema not found');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateRoomDto) {
    await this.getById(id);
    try {
      return await this.prisma.room.update({
        where: { id },
        data: dto.name === undefined ? {} : { name: dto.name.trim() },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Room already exists in this cinema');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.getById(id);
    try {
      return await this.prisma.room.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Room cannot be deleted while it has showtimes',
        );
      }
      throw error;
    }
  }

  private async getById(id: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }
}

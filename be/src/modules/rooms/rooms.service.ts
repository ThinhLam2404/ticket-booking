import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto.js';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit: AuditService = null as unknown as AuditService) {}

  async findByCinema(cinemaId: string) {
    const rooms = await this.prisma.room.findMany({
      where: { cinemaId },
      include: { _count: { select: { seats: true } } },
      orderBy: { name: 'asc' },
    });
    return toPublicResponse(rooms);
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
    return toPublicResponse(room);
  }

  async create(dto: CreateRoomDto) {
    try {
      const room = await this.prisma.room.create({
        data: {
          name: dto.name.trim(),
          cinemaId: dto.cinemaId,
          format: dto.format,
        },
      });
      return toPublicResponse(room);
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
    const current = await this.prisma.room.findUnique({
      where: { id },
      include: { _count: { select: { showtimes: true } } },
    });
    if (!current) throw new NotFoundException('Room not found');
    if (dto.format !== undefined && dto.format !== current.format && current._count.showtimes > 0) {
      throw new ConflictException('Room format cannot be changed while it has showtimes');
    }
    try {
      const room = await this.prisma.room.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.format !== undefined && { format: dto.format }),
        },
      });
      return toPublicResponse(room);
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
      const room = await this.prisma.room.delete({ where: { id } });
      return toPublicResponse(room);
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

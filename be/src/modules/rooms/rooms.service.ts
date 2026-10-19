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
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly audit: AuditService = null as unknown as AuditService,
  ) {}

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
      const room = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.room.create({
          data: {
            name: dto.name.trim(),
            cinemaId: dto.cinemaId,
            format: dto.format,
          },
        });
        await this.audit?.record(
          {
            action: 'ROOM_CREATED',
            resourceType: 'Room',
            resourceId: created.id,
            after: created,
          },
          transaction,
        );
        return created;
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
    try {
      const room = await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.room.findUnique({
          where: { id },
          include: { _count: { select: { showtimes: true } } },
        });
        if (!current) throw new NotFoundException('Room not found');
        if (
          dto.format !== undefined &&
          dto.format !== current.format &&
          current._count.showtimes > 0
        ) {
          throw new ConflictException(
            'Room format cannot be changed while it has showtimes',
          );
        }
        const room = await transaction.room.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name.trim() }),
            ...(dto.format !== undefined && { format: dto.format }),
          },
        });
        await this.audit?.record(
          {
            action: 'ROOM_UPDATED',
            resourceType: 'Room',
            resourceId: id,
            before: current,
            after: room,
          },
          transaction,
        );
        return room;
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
    try {
      const room = await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.room.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Room not found');
        const deleted = await transaction.room.delete({ where: { id } });
        await this.audit?.record(
          {
            action: 'ROOM_DELETED',
            resourceType: 'Room',
            resourceId: id,
            before: current,
          },
          transaction,
        );
        return deleted;
      });
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
}

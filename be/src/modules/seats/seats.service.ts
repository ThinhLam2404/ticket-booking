import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  BulkSeatLayoutItemDto,
  CreateSeatDto,
  UpdateSeatDto,
} from './dto/seat.dto.js';

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

  async replaceLayout(roomId: string, layout: BulkSeatLayoutItemDto[]) {
    //NOTE - chuẩn hoá dữ liệu a-> A; không có type -> standard
    const normalizedLayout = layout.map((seat) => ({
      row: seat.row.trim().toUpperCase(),
      number: seat.number,
      type: seat.type ?? 'STANDARD',
    }));
    const coordinates = new Set<string>();
    //NOTE - kiểm tra ghế trùng
    for (const seat of normalizedLayout) {
      const coordinate = `${seat.row}:${seat.number}`;
      if (coordinates.has(coordinate)) {
        throw new ConflictException('Duplicate seat coordinate in layout');
      }
      coordinates.add(coordinate);
    }

    try {
      return await this.prisma
        .$transaction(async (transaction) => {
          const room = await transaction.room.findUnique({
            where: { id: roomId },
            include: { _count: { select: { showtimes: true } } },
          });
          if (!room) {
            throw new NotFoundException('Room not found');
          }
          //NOTE - nếu phòng đã có suất chiếu thì k cho đổi layout
          if (room._count.showtimes > 0) {
            throw new ConflictException(
              'Room layout cannot be replaced while it has showtimes',
            );
          }

          await transaction.seat.deleteMany({ where: { roomId } });
          if (normalizedLayout.length) {
            await transaction.seat.createMany({
              data: normalizedLayout.map((seat) => ({ ...seat, roomId })),
            });
          }
          return transaction.seat.findMany({
            where: { roomId },
            orderBy: [{ row: 'asc' }, { number: 'asc' }],
          });
        })
        .then((seats) => toPublicResponse(seats));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Room layout cannot be replaced while it is used by a showtime',
        );
      }
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Duplicate seat coordinate in layout');
      }
      throw error;
    }
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

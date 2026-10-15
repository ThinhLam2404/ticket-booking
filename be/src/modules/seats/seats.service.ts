import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, SeatType } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  BulkSeatLayoutItemDto,
  CreateSeatDto,
  UpdateSeatDto,
} from './dto/seat.dto.js';
import { validateSeatLayout } from './seat-layout.js';

@Injectable()
export class SeatsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit: AuditService = null as unknown as AuditService) {}

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

           try {
             validateSeatLayout(normalizedLayout);
           } catch (error) {
             throw new ConflictException(
               error instanceof Error ? error.message : 'Invalid seat layout',
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
    const row = dto.row.trim().toUpperCase();
    const type = dto.type ?? SeatType.STANDARD;
    if (type === SeatType.COUPLE) {
      throw new ConflictException('Couple seats must be managed as a complete room layout');
    }
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        _count: { select: { showtimes: true } },
        seats: true,
      },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room._count.showtimes > 0) {
      throw new ConflictException('Seat cannot be changed while the room has showtimes');
    }
    if (this.isCompleteLayout(room.seats)) {
      throw new ConflictException(
        'Complete seat layouts must be managed in bulk',
      );
    }
    try {
      const seat = await this.prisma.seat.create({
        data: { roomId, row, number: dto.number, type },
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
    const seat = await this.getById(id);
    if (dto.type === undefined) return toPublicResponse(seat);
    const room = await this.prisma.room.findUnique({
      where: { id: seat.roomId },
      include: {
        _count: { select: { showtimes: true } },
        seats: true,
      },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room._count.showtimes > 0) {
      throw new ConflictException('Seat cannot be changed while the room has showtimes');
    }
    if (dto.type === SeatType.COUPLE || seat.type === SeatType.COUPLE) {
      throw new ConflictException('Couple seats must be managed as a complete room layout');
    }
    if (this.isCompleteLayout(room.seats)) {
      throw new ConflictException(
        'Complete seat layouts must be managed in bulk',
      );
    }
    const updated = await this.prisma.seat.update({
      where: { id },
      data: { type: dto.type },
    });
    return toPublicResponse(updated);
  }

  async remove(id: string) {
    const seat = await this.getById(id);
    const room = await this.prisma.room.findUnique({
      where: { id: seat.roomId },
      include: {
        _count: { select: { showtimes: true } },
        seats: true,
      },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room._count.showtimes > 0) {
      throw new ConflictException('Seat cannot be changed while the room has showtimes');
    }
    if (seat.type === SeatType.COUPLE) {
      throw new ConflictException('Couple seats must be managed as a complete room layout');
    }
    if (this.isCompleteLayout(room.seats)) {
      throw new ConflictException(
        'Complete seat layouts must be managed in bulk',
      );
    }
    try {
      const deleted = await this.prisma.seat.delete({ where: { id } });
      return toPublicResponse(deleted);
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

  private isCompleteLayout(
    seats: Array<{ row: string; number: number; type: SeatType }>,
  ) {
    try {
      validateSeatLayout(seats);
      return true;
    } catch {
      return false;
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

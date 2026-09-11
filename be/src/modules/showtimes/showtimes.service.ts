import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, MovieStatus, SeatType } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateShowtimeDto } from './dto/create-showtime.dto.js';
import { ListShowtimesDto } from './dto/list-showtimes.dto.js';

@Injectable()
export class ShowtimesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListShowtimesDto) {
    const now = new Date();
    const from = query.from ? new Date(query.from) : now;
    const to = query.to ? new Date(query.to) : undefined;
    const where: Prisma.ShowtimeWhereInput = {
      startsAt: {
        gte: from > now ? from : now,
        ...(to && { lt: to }),
      },
      movie: {
        status: MovieStatus.PUBLISHED,
        ...(query.movieId && { id: query.movieId }),
      },
      ...(query.cinemaId && { room: { cinemaId: query.cinemaId } }),
    };

    if (to && to <= from) {
      throw new BadRequestException(
        'The end of the date range must be after the start',
      );
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.showtime.findMany({
        where,
        include: {
          movie: true,
          room: { include: { cinema: true } },
        },
        orderBy: { startsAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.showtime.count({ where }),
    ]);

    return {
      data: toPublicResponse(data),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async findOne(id: string) {
    const showtime = await this.prisma.showtime.findUnique({
      where: { id },
      include: {
        movie: true,
        room: { include: { cinema: true } },
        showtimeSeats: {
          include: { seat: true },
          orderBy: [{ seat: { row: 'asc' } }, { seat: { number: 'asc' } }],
        },
      },
    });

    if (!showtime || showtime.movie.status !== MovieStatus.PUBLISHED) {
      throw new NotFoundException('Showtime not found');
    }

    return toPublicResponse(showtime);
  }

  async findSeats(id: string) {
    const showtime = await this.findOne(id);
    return toPublicResponse({
      showtimeId: showtime.id,
      startsAt: showtime.startsAt,
      endsAt: showtime.endsAt,
      seats: showtime.showtimeSeats,
    });
  }

  async create(dto: CreateShowtimeDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (startsAt >= endsAt) {
      throw new BadRequestException('Showtime end must be after its start');
    }

    if (startsAt <= new Date()) {
      throw new BadRequestException('Showtime must start in the future');
    }

    const [movie, room, overlappingShowtime] = await Promise.all([
      this.prisma.movie.findUnique({ where: { id: dto.movieId } }),
      this.prisma.room.findUnique({
        where: { id: dto.roomId },
        include: { seats: true },
      }),
      this.prisma.showtime.findFirst({
        where: {
          roomId: dto.roomId,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      }),
    ]);

    if (!movie) {
      throw new NotFoundException('Movie not found');
    }
    if (movie.status !== MovieStatus.PUBLISHED) {
      throw new ConflictException('Movie must be published before scheduling');
    }

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (!room.seats.length) {
      throw new BadRequestException('Room must have at least one seat');
    }

    if (overlappingShowtime) {
      throw new ConflictException('Room already has an overlapping showtime');
    }

    const vipMultiplier = dto.vipMultiplier ?? 1.5;
    const coupleMultiplier = dto.coupleMultiplier ?? 2;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const showtime = await transaction.showtime.create({
          data: {
            movieId: dto.movieId,
            roomId: dto.roomId,
            startsAt,
            endsAt,
          },
        });

        await transaction.showtimeSeat.createMany({
          data: room.seats.map((seat) => ({
            showtimeId: showtime.id,
            seatId: seat.id,
            price: this.calculatePrice(
              dto.basePrice,
              seat.type,
              vipMultiplier,
              coupleMultiplier,
            ),
          })),
        });

        const result = await transaction.showtime.findUniqueOrThrow({
          where: { id: showtime.id },
          include: {
            movie: true,
            room: { include: { cinema: true } },
            showtimeSeats: { include: { seat: true } },
          },
        });
        return toPublicResponse(result);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Showtime seats could not be initialized');
      }
      throw error;
    }
  }

  async remove(id: string) {
    const showtime = await this.prisma.showtime.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true } } },
    });

    if (!showtime) {
      throw new NotFoundException('Showtime not found');
    }

    if (showtime._count.bookings > 0) {
      throw new ConflictException(
        'Showtime cannot be deleted after bookings exist',
      );
    }

    const deleted = await this.prisma.showtime.delete({ where: { id } });
    return toPublicResponse(deleted);
  }

  private calculatePrice(
    basePrice: number,
    seatType: SeatType,
    vipMultiplier: number,
    coupleMultiplier: number,
  ): string {
    const multiplier =
      seatType === SeatType.VIP
        ? vipMultiplier
        : seatType === SeatType.COUPLE
          ? coupleMultiplier
          : 1;
    return (basePrice * multiplier).toFixed(2);
  }
}

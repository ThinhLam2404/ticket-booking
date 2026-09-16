import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MovieStatus, Prisma, SeatType } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateShowtimeDto } from './dto/create-showtime.dto.js';
import {
  ListAdminShowtimesDto,
  ListShowtimesDto,
} from './dto/list-showtimes.dto.js';
import { UpdateShowtimeDto } from './dto/update-showtime.dto.js';

type ShowtimeListQuery = ListShowtimesDto & { status?: MovieStatus };

type ShowtimePricing = {
  basePrice: number;
  vipMultiplier: number;
  coupleMultiplier: number;
};

@Injectable()
export class ShowtimesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListShowtimesDto) {
    return this.findShowtimes(query, {
      publishedOnly: true,
      includePast: false,
    });
  }

  async findAllAdmin(query: ListAdminShowtimesDto) {
    return this.findShowtimes(query, {
      publishedOnly: false,
      includePast: query.includePast,
    });
  }

  private async findShowtimes(
    query: ShowtimeListQuery,
    options: { publishedOnly: boolean; includePast: boolean },
  ) {
    const now = new Date();
    const from = query.from
      ? new Date(query.from)
      : options.includePast
        ? new Date(0)
        : now;
    const to = query.to ? new Date(query.to) : undefined;
    const where: Prisma.ShowtimeWhereInput = {
      startsAt: {
        gte: options.includePast ? from : from > now ? from : now,
        ...(to && { lt: to }),
      },
      movie: {
        ...(options.publishedOnly && { status: MovieStatus.PUBLISHED }),
        ...(!options.publishedOnly && query.status && { status: query.status }),
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

    const pricing = this.resolvePricing({
      basePrice: dto.basePrice,
      vipMultiplier: dto.vipMultiplier,
      coupleMultiplier: dto.coupleMultiplier,
    });

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const showtime = await transaction.showtime.create({
          data: {
            movieId: dto.movieId,
            roomId: dto.roomId,
            startsAt,
            endsAt,
            basePrice: this.toDecimalString(pricing.basePrice),
            vipMultiplier: this.toDecimalString(pricing.vipMultiplier),
            coupleMultiplier: this.toDecimalString(pricing.coupleMultiplier),
          },
        });

        await transaction.showtimeSeat.createMany({
          data: room.seats.map((seat) => ({
            showtimeId: showtime.id,
            seatId: seat.id,
            price: this.calculatePrice(
              pricing.basePrice,
              seat.type,
              pricing.vipMultiplier,
              pricing.coupleMultiplier,
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

  async update(id: string, dto: UpdateShowtimeDto) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const current = await transaction.showtime.findUnique({
            where: { id },
            include: {
              _count: { select: { bookings: true } },
              showtimeSeats: { include: { seat: true } },
            },
          });

          if (!current) {
            throw new NotFoundException('Showtime not found');
          }

          if (current._count.bookings > 0) {
            throw new ConflictException(
              'Showtime cannot be updated after bookings exist',
            );
          }

          const startsAt = dto.startsAt
            ? new Date(dto.startsAt)
            : current.startsAt;
          const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
          const movieId = dto.movieId ?? current.movieId;
          const roomId = dto.roomId ?? current.roomId;

          if (startsAt >= endsAt) {
            throw new BadRequestException(
              'Showtime end must be after its start',
            );
          }
          if (startsAt <= new Date()) {
            throw new BadRequestException('Showtime must start in the future');
          }

          const [movie, room, overlappingShowtime] = await Promise.all([
            transaction.movie.findUnique({ where: { id: movieId } }),
            transaction.room.findUnique({
              where: { id: roomId },
              include: { seats: true },
            }),
            //NOTE - check xem có trùng suất chiếu ko: Start A < End B || End A > Start B => trùng
            transaction.showtime.findFirst({
              where: {
                id: { not: id },
                roomId,
                startsAt: { lt: endsAt },
                endsAt: { gt: startsAt },
              },
            }),
          ]);

          if (!movie) {
            throw new NotFoundException('Movie not found');
          }
          if (movie.status !== MovieStatus.PUBLISHED) {
            throw new ConflictException(
              'Movie must be published before scheduling',
            );
          }
          if (!room) {
            throw new NotFoundException('Room not found');
          }
          if (!room.seats.length) {
            throw new BadRequestException('Room must have at least one seat');
          }
          if (overlappingShowtime) {
            throw new ConflictException(
              'Room already has an overlapping showtime',
            );
          }

          const roomChanged = roomId !== current.roomId;
          const pricingChanged =
            dto.basePrice !== undefined ||
            dto.vipMultiplier !== undefined ||
            dto.coupleMultiplier !== undefined;
          //NOTE - nếu phòng hoặc giá thay đổi thì tính lại giá. VD phòng A giá < phòng vip
          const shouldReprice = roomChanged || pricingChanged;
          const pricing = shouldReprice
            ? this.resolvePricing(
                {
                  basePrice: dto.basePrice,
                  vipMultiplier: dto.vipMultiplier,
                  coupleMultiplier: dto.coupleMultiplier,
                },
                current,
              )
            : null;

          await transaction.showtime.update({
            where: { id },
            data: {
              movieId,
              roomId,
              startsAt,
              endsAt,
              ...(pricing && {
                basePrice: this.toDecimalString(pricing.basePrice),
                vipMultiplier: this.toDecimalString(pricing.vipMultiplier),
                coupleMultiplier: this.toDecimalString(
                  pricing.coupleMultiplier,
                ),
              }),
            },
          });
          //NOTE - nếu đổi phòng xoá toàn bộ ghế cũ suất chiếu cũ, tạo lại ghế, giá suất đó dựa trên layout
          if (roomChanged) {
            await transaction.showtimeSeat.deleteMany({
              where: { showtimeId: id },
            });
            await transaction.showtimeSeat.createMany({
              data: room.seats.map((seat) => ({
                showtimeId: id,
                seatId: seat.id,
                price: this.calculatePrice(
                  pricing!.basePrice,
                  seat.type,
                  pricing!.vipMultiplier,
                  pricing!.coupleMultiplier,
                ),
              })),
            });
            //NOTE - nếu chỉ đổi giá
          } else if (pricing) {
            await Promise.all(
              current.showtimeSeats.map((showtimeSeat) =>
                transaction.showtimeSeat.update({
                  where: { id: showtimeSeat.id },
                  data: {
                    price: this.calculatePrice(
                      pricing.basePrice,
                      showtimeSeat.seat.type,
                      pricing.vipMultiplier,
                      pricing.coupleMultiplier,
                    ),
                  },
                }),
              ),
            );
          }

          const result = await transaction.showtime.findUniqueOrThrow({
            where: { id },
            include: {
              movie: true,
              room: { include: { cinema: true } },
              showtimeSeats: { include: { seat: true } },
            },
          });
          return toPublicResponse(result);
        },
        //NOTE - Mục đích là hạn chế hai request cập nhật cùng lúc tạo ra dữ liệu trùng hoặc không nhất quán
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Room already has an overlapping showtime');
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

  private resolvePricing(
    values: Partial<ShowtimePricing>,
    current?: {
      basePrice: Prisma.Decimal | null;
      vipMultiplier: Prisma.Decimal | null;
      coupleMultiplier: Prisma.Decimal | null;
      showtimeSeats: Array<{
        price: Prisma.Decimal;
        seat: { type: SeatType };
      }>;
    },
  ): ShowtimePricing {
    const inferredBasePrice = current?.showtimeSeats
      .find((showtimeSeat) => showtimeSeat.seat.type === SeatType.STANDARD)
      ?.price.toNumber();
    const fallbackBasePrice =
      inferredBasePrice ?? current?.showtimeSeats[0]?.price.toNumber();
    const basePrice =
      values.basePrice ?? current?.basePrice?.toNumber() ?? fallbackBasePrice;

    if (basePrice === undefined) {
      throw new BadRequestException(
        'Base price is required when the showtime has no pricing snapshot',
      );
    }

    return {
      basePrice,
      vipMultiplier:
        values.vipMultiplier ?? current?.vipMultiplier?.toNumber() ?? 1.5,
      coupleMultiplier:
        values.coupleMultiplier ?? current?.coupleMultiplier?.toNumber() ?? 2,
    };
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

  private toDecimalString(value: number): string {
    return value.toFixed(2);
  }
}

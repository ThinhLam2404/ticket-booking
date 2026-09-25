import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MovieStatus, Prisma, RoomFormat, SeatType, ShowtimeFormat } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { validateSeatLayout } from '../seats/seat-layout.js';
import { CreateShowtimeDto } from './dto/create-showtime.dto.js';
import {
  ListAdminShowtimesDto,
  ListShowtimesDto,
} from './dto/list-showtimes.dto.js';
import { UpdateShowtimeDto } from './dto/update-showtime.dto.js';
import {
  BulkShowtimeDto,
  BulkSlotReasonCode,
} from './dto/bulk-showtime.dto.js';
import { FreeSlotsQueryDto } from './dto/free-slots.dto.js';
import {
  dayBoundsVn,
  isWithinOperatingHours,
} from './showtime-policy.js';

type ShowtimeListQuery = ListShowtimesDto & { status?: MovieStatus };

type ShowtimeContext = {
  movie: { id: string; duration: number; status: MovieStatus };
  room: {
    id: string;
    seats: Array<{ id: string; row: string; number: number; type: SeatType }>;
  };
};

const SHOWTIME_TIMEZONE_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;

type ShowtimePricing = {
  basePrice: number;
  vipMultiplier: number;
  coupleMultiplier: number;
};

@Injectable()
export class ShowtimesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
  ) {}

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
      ...(query.format && { format: query.format }),
      ...(query.specialOnly && {
        OR: [
          { room: { format: { not: RoomFormat.STANDARD } } },
          { format: { in: [ShowtimeFormat.THREE_D_SUBTITLED, ShowtimeFormat.THREE_D_DUBBED] } },
        ],
      }),
      ...((query.cinemaId || query.provinceCode || query.roomFormat) && {
        room: {
          ...(query.cinemaId && { cinemaId: query.cinemaId }),
          ...(query.provinceCode && { cinema: { provinceCode: query.provinceCode } }),
          ...(query.roomFormat && { format: query.roomFormat }),
        },
      }),
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
    //NOTE - xử lí expire cho seat, booking, payment
    await this.bookingsService.expireBookingsForShowtime(id);
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

  async findFreeSlots(roomId: string, query: FreeSlotsQueryDto) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    const { openAt, closeAt } = dayBoundsVn(query.date);
    const turnaroundMs = (query.turnaroundMinutes ?? 20) * 60 * 1000;
    const durationMs = query.durationMinutes * 60 * 1000;

    const existing = await this.prisma.showtime.findMany({
      where: {
        roomId,
        startsAt: { lt: closeAt },
        endsAt: { gt: openAt },
      },
      select: { startsAt: true, endsAt: true },
      orderBy: { startsAt: 'asc' },
    });

    const busy = existing.map((candidate) => ({
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
    }));

    const blocked = existing
      .map((candidate) => ({
        startsAt: new Date(candidate.startsAt.getTime() - turnaroundMs),
        endsAt: new Date(candidate.endsAt.getTime() + turnaroundMs),
      }))
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());

    const freeWindows: Array<{ startsAt: Date; endsAt: Date; minutes: number }> =
      [];
    let cursor = openAt;
    for (const slot of blocked) {
      const windowStart = cursor > openAt ? cursor : openAt;
      const windowEnd = slot.startsAt < closeAt ? slot.startsAt : closeAt;
      if (windowEnd.getTime() - windowStart.getTime() >= durationMs) {
        freeWindows.push({
          startsAt: windowStart,
          endsAt: windowEnd,
          minutes: Math.floor(
            (windowEnd.getTime() - windowStart.getTime()) / 60000,
          ),
        });
      }
      if (slot.endsAt > cursor) {
        cursor = slot.endsAt;
      }
    }
    if (closeAt.getTime() - cursor.getTime() >= durationMs) {
      const windowStart = cursor > openAt ? cursor : openAt;
      freeWindows.push({
        startsAt: windowStart,
        endsAt: closeAt,
        minutes: Math.floor((closeAt.getTime() - windowStart.getTime()) / 60000),
      });
    }

    return toPublicResponse({
      roomId,
      date: query.date,
      durationMinutes: query.durationMinutes,
      turnaroundMinutes: query.turnaroundMinutes ?? 20,
      freeWindows,
      busy,
    });
  }

  async previewBulk(dto: BulkShowtimeDto) {
    const movie = await this.prisma.movie.findUnique({
      where: { id: dto.movieId },
    });
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      include: { seats: true },
    });
    const context = this.getSchedulingContext(movie, room);
    const { movie: validMovie } = context;
    //NOTE - tạo các suất chiếu tuần tự endsAt = startsAt + movie.duration, slot kế tiếp bắt đầu sau endAt+turnAroundMin
    const slots = this.buildBulkSlots(
      this.parseStartsAt(dto.firstStartsAt),
      validMovie.duration,
      dto.count,
      dto.turnaroundMinutes,
    );

    //NOTE - kiểm tra các suất chiếu tạo, có đụng với suất chiếu hiện có ko
    const existing = await this.prisma.showtime.findMany({
      where: {
        roomId: dto.roomId,
        startsAt: { lt: slots[slots.length - 1]!.endsAt },
        endsAt: { gt: slots[0]!.startsAt },
      },
      select: { startsAt: true, endsAt: true },
      orderBy: { startsAt: 'asc' },
    });
    const previewSlots = slots.map((slot, index) => {
      const overlapping = existing.filter(
        (candidate) =>
          candidate.startsAt < slot.endsAt && candidate.endsAt > slot.startsAt,
      );
      const withinHours = isWithinOperatingHours(slot.startsAt);
      const available = overlapping.length === 0 && withinHours;
      let reasonCode: BulkSlotReasonCode | undefined;
      if (overlapping.length > 0) {
        reasonCode = 'SHOWTIME_OVERLAP';
      } else if (!withinHours) {
        reasonCode = 'SHOWTIME_OUTSIDE_HOURS';
      }
      return {
        index: index + 1,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        available,
        ...(reasonCode && { reasonCode }),
        ...(overlapping.length > 0 && {
          conflicts: overlapping.map((candidate) => ({
            startsAt: candidate.startsAt,
            endsAt: candidate.endsAt,
          })),
        }),
      };
    });

    return {
      movieId: dto.movieId,
      roomId: dto.roomId,
      durationMinutes: validMovie.duration,
      slots: previewSlots,
      valid: previewSlots.every((slot) => slot.available),
    };
  }

  async createBulk(dto: BulkShowtimeDto) {
    try {
      const created = await this.prisma.$transaction(
        async (transaction) => {
          const movie = await transaction.movie.findUnique({
            where: { id: dto.movieId },
          });
          const room = await transaction.room.findUnique({
            where: { id: dto.roomId },
            include: { seats: true },
          });
          const context = this.getSchedulingContext(movie, room);
          const { movie: validMovie, room: validRoom } = context;

          const slots = this.buildBulkSlots(
            this.parseStartsAt(dto.firstStartsAt),
            validMovie.duration,
            dto.count,
            dto.turnaroundMinutes,
          );
          for (const slot of slots) {
            this.assertWithinOperatingHours(slot.startsAt);
          }
          const existing = await transaction.showtime.findFirst({
            where: {
              roomId: dto.roomId,
              startsAt: { lt: slots[slots.length - 1]!.endsAt },
              endsAt: { gt: slots[0]!.startsAt },
            },
          });
          if (existing) {
            throw new ConflictException(
              'Room already has an overlapping showtime',
            );
          }

          const showtimeIds: string[] = [];
          const pricing = this.resolvePricing({
            basePrice: dto.basePrice,
            vipMultiplier: dto.vipMultiplier,
            coupleMultiplier: dto.coupleMultiplier,
          });
          for (const slot of slots) {
            const showtime = await transaction.showtime.create({
              data: {
                movieId: dto.movieId,
                roomId: dto.roomId,
                format: dto.format,
                startsAt: slot.startsAt,
                endsAt: slot.endsAt,
                basePrice: this.toDecimalString(pricing.basePrice),
                vipMultiplier: this.toDecimalString(pricing.vipMultiplier),
                coupleMultiplier: this.toDecimalString(
                  pricing.coupleMultiplier,
                ),
              },
            });
            showtimeIds.push(showtime.id);
            await transaction.showtimeSeat.createMany({
              data: validRoom.seats.map((seat) => ({
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
          }

          return transaction.showtime.findMany({
            where: { id: { in: showtimeIds } },
            include: {
              movie: true,
              room: { include: { cinema: true } },
              showtimeSeats: { include: { seat: true } },
            },
            orderBy: { startsAt: 'asc' },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return toPublicResponse(created);
    } catch (error) {
      if (this.isShowtimeOverlapError(error)) {
        throw new ConflictException('Room already has an overlapping showtime');
      }
      throw error;
    }
  }

  async create(dto: CreateShowtimeDto) {
    const startsAt = this.parseStartsAt(dto.startsAt);
    const [movie, room] = await Promise.all([
      this.prisma.movie.findUnique({ where: { id: dto.movieId } }),
      this.prisma.room.findUnique({
        where: { id: dto.roomId },
        include: { seats: true },
      }),
    ]);
    const context = this.getSchedulingContext(movie, room);
    const { movie: validMovie, room: validRoom } = context;
    const endsAt = this.calculateEndsAt(startsAt, validMovie.duration);
    this.assertWithinOperatingHours(startsAt);
    const overlappingShowtime = await this.prisma.showtime.findFirst({
      where: {
        roomId: dto.roomId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });

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
            format: dto.format,
            startsAt,
            endsAt,
            basePrice: this.toDecimalString(pricing.basePrice),
            vipMultiplier: this.toDecimalString(pricing.vipMultiplier),
            coupleMultiplier: this.toDecimalString(pricing.coupleMultiplier),
          },
        });

        await transaction.showtimeSeat.createMany({
          data: validRoom.seats.map((seat) => ({
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
      if (this.isShowtimeOverlapError(error)) {
        throw new ConflictException('Room already has an overlapping showtime');
      }
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
            ? this.parseStartsAt(dto.startsAt)
            : current.startsAt;
          if (dto.startsAt) {
            this.assertWithinOperatingHours(startsAt);
          }
          const movieId = dto.movieId ?? current.movieId;
          const roomId = dto.roomId ?? current.roomId;
          const roomChanged = roomId !== current.roomId;
          const movieChanged = movieId !== current.movieId;

          if (startsAt <= new Date()) {
            throw new BadRequestException('Showtime must start in the future');
          }

          const [movie, room] = await Promise.all([
            transaction.movie.findUnique({ where: { id: movieId } }),
            transaction.room.findUnique({
              where: { id: roomId },
              include: { seats: true },
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
          const validRoom = roomChanged
            ? this.getSchedulingContext(movie, room).room
            : room;
          const endsAt =
            dto.startsAt || movieChanged
              ? this.calculateEndsAt(startsAt, movie.duration)
              : current.endsAt;
          const overlappingShowtime = await transaction.showtime.findFirst({
            where: {
              id: { not: id },
              roomId,
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
          });

          if (roomChanged) {
            try {
              validateSeatLayout(validRoom.seats);
            } catch (error) {
              throw new BadRequestException(
                error instanceof Error
                  ? error.message
                  : 'Room has an invalid seat layout',
              );
            }
          }
          if (overlappingShowtime) {
            throw new ConflictException(
              'Room already has an overlapping showtime',
            );
          }

          const pricingChanged =
            (dto.basePrice !== undefined &&
              dto.basePrice !== current.basePrice?.toNumber()) ||
            (dto.vipMultiplier !== undefined &&
              dto.vipMultiplier !== current.vipMultiplier?.toNumber()) ||
            (dto.coupleMultiplier !== undefined &&
              dto.coupleMultiplier !== current.coupleMultiplier?.toNumber());
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
              format: dto.format ?? current.format,
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
              data: validRoom.seats.map((seat) => ({
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
      if (
        this.isShowtimeOverlapError(error) ||
        isUniqueConstraintError(error)
      ) {
        throw new ConflictException('Room already has an overlapping showtime');
      }
      throw error;
    }
  }
  //NOTE - dùng kiểm tra movie tồn tại và publish, validate seat layout
  private getSchedulingContext(
    movie: { id: string; duration: number; status: MovieStatus } | null,
    room: {
      id: string;
      seats: Array<{ id: string; row: string; number: number; type: SeatType }>;
    } | null,
  ): ShowtimeContext {
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
    try {
      validateSeatLayout(room.seats);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Room has an invalid seat layout',
      );
    }
    return { movie, room };
  }

  private assertWithinOperatingHours(startsAt: Date): void {
    if (!isWithinOperatingHours(startsAt)) {
      throw new ConflictException(
        'Showtime starts outside venue operating hours',
      );
    }
  }

  private parseStartsAt(value: string): Date {    if (!SHOWTIME_TIMEZONE_PATTERN.test(value)) {
      throw new BadRequestException(
        'Showtime start must include an explicit timezone offset',
      );
    }
    const startsAt = new Date(value);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Showtime start is invalid');
    }
    return startsAt;
  }

  private calculateEndsAt(startsAt: Date, durationMinutes: number): Date {
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
    if (startsAt <= new Date()) {
      throw new BadRequestException('Showtime must start in the future');
    }
    return endsAt;
  }

  private buildBulkSlots(
    startsAt: Date,
    durationMinutes: number,
    count: number,
    turnaroundMinutes: number,
  ) {
    if (startsAt <= new Date()) {
      throw new BadRequestException('Showtime must start in the future');
    }
    const slots: Array<{ startsAt: Date; endsAt: Date }> = [];
    const durationMs = durationMinutes * 60 * 1000;
    const turnaroundMs = turnaroundMinutes * 60 * 1000;
    for (let index = 0; index < count; index += 1) {
      const slotStartsAt = new Date(
        startsAt.getTime() + index * (durationMs + turnaroundMs),
      );
      slots.push({
        startsAt: slotStartsAt,
        endsAt: new Date(slotStartsAt.getTime() + durationMs),
      });
    }
    return slots;
  }

  private isShowtimeOverlapError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code === 'P2004' || error.code === 'P2034';
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      ((error as { code?: unknown }).code === 'P2004' ||
        (error as { code?: unknown }).code === 'P2034')
    ) {
      return true;
    }
    return error instanceof Error && error.message.includes('23P01');
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
        values.vipMultiplier ?? current?.vipMultiplier?.toNumber() ?? 1.1,
      coupleMultiplier:
        values.coupleMultiplier ?? current?.coupleMultiplier?.toNumber() ?? 1.2,
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
          ? vipMultiplier * coupleMultiplier
          : 1;
    return (basePrice * multiplier).toFixed(2);
  }

  private toDecimalString(value: number): string {
    return value.toFixed(2);
  }
}

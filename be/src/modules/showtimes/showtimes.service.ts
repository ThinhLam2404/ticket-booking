import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MovieStatus,
  Prisma,
  RoomFormat,
  SeatType,
  ShowtimeFormat,
} from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
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
import {
  CinemaBulkShowtimeDto,
  CinemaBulkPreviewResponseDto,
} from './dto/cinema-bulk-showtime.dto.js';
import { FreeSlotsQueryDto } from './dto/free-slots.dto.js';
import {
  DEFAULT_COUPLE_MULTIPLIER,
  DEFAULT_VIP_MULTIPLIER,
  dayBoundsVn,
  getPricingQuote,
  isWithinOperatingHours,
} from './showtime-policy.js';
import {
  ShowtimePricingQuoteDto,
  ShowtimePricingQuoteResponseDto,
} from './dto/pricing-quote.dto.js';

type ShowtimeListQuery = ListShowtimesDto & { status?: MovieStatus };

type ShowtimeContext = {
  movie: { id: string; duration: number; status: MovieStatus };
  room: {
    id: string;
    format: RoomFormat;
    seats: Array<{ id: string; row: string; number: number; type: SeatType }>;
  };
};

const SHOWTIME_TIMEZONE_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;

type ShowtimePricing = {
  basePrice: number;
  vipMultiplier: number;
  coupleMultiplier: number;
};

type CinemaSlot = {
  roomId: string;
  roomName: string;
  roomFormat: RoomFormat;
  startsAt: Date;
  endsAt: Date;
};

type CinemaRoomSchedule = {
  roomId: string;
  roomName: string;
  roomFormat: RoomFormat;
  slots: CinemaSlot[];
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
      ...(query.format && { format: query.format }),
      ...(query.specialOnly && {
        OR: [
          { room: { format: { not: RoomFormat.STANDARD } } },
          {
            format: {
              in: [
                ShowtimeFormat.THREE_D_SUBTITLED,
                ShowtimeFormat.THREE_D_DUBBED,
              ],
            },
          },
        ],
      }),
      ...((query.cinemaId || query.provinceCode || query.roomFormat) && {
        room: {
          ...(query.cinemaId && { cinemaId: query.cinemaId }),
          ...(query.provinceCode && {
            cinema: { provinceCode: query.provinceCode },
          }),
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
      //NOTE - chi lay cac cot can thiet
      this.prisma.showtime.findMany({
        where,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          movieId: true,
          roomId: true,
          format: true,
          basePrice: true,
          vipMultiplier: true,
          coupleMultiplier: true,
          createdAt: true,
          updatedAt: true,
          movie: {
            select: {
              id: true,
              title: true,
              posterUrl: true,
              rating: true,
              genres: true,
              ageRating: true,
              duration: true,
              status: true,
            },
          },
          room: {
            select: {
              id: true,
              name: true,
              cinemaId: true,
              format: true,
              cinema: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                  provinceCode: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
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
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        movieId: true,
        roomId: true,
        format: true,
        basePrice: true,
        vipMultiplier: true,
        coupleMultiplier: true,
        createdAt: true,
        updatedAt: true,
        movie: {
          select: {
            id: true,
            tmdbId: true,
            title: true,
            description: true,
            posterUrl: true,
            backdropUrl: true,
            trailerKey: true,
            releaseDate: true,
            rating: true,
            genres: true,
            ageRating: true,
            duration: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        room: {
          select: {
            id: true,
            name: true,
            cinemaId: true,
            format: true,
            cinema: {
              select: {
                id: true,
                name: true,
                address: true,
                provinceCode: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
        showtimeSeats: {
          select: {
            id: true,
            price: true,
            status: true,
            heldUntil: true,
            showtimeId: true,
            seatId: true,
            seat: {
              select: {
                id: true,
                row: true,
                number: true,
                type: true,
                roomId: true,
              },
            },
          },
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
    const showtime = await this.prisma.showtime.findUnique({
      where: { id },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        movie: { select: { status: true } },
        showtimeSeats: {
          select: {
            id: true,
            price: true,
            status: true,
            heldUntil: true,
            showtimeId: true,
            seatId: true,
            seat: {
              select: {
                id: true,
                row: true,
                number: true,
                type: true,
                roomId: true,
              },
            },
          },
          orderBy: [{ seat: { row: 'asc' } }, { seat: { number: 'asc' } }],
        },
      },
    });

    if (!showtime || showtime.movie.status !== MovieStatus.PUBLISHED) {
      throw new NotFoundException('Showtime not found');
    }

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

    const schedulingEndAt = new Date(closeAt.getTime() + durationMs);
    const existing = await this.prisma.showtime.findMany({
      where: {
        roomId,
        startsAt: {
          lt: new Date(schedulingEndAt.getTime() + turnaroundMs),
        },
        endsAt: { gt: new Date(openAt.getTime() - turnaroundMs) },
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
      .sort(
        (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
      );

    const freeWindows: Array<{
      startsAt: Date;
      endsAt: Date;
      minutes: number;
    }> = [];
    let cursor = openAt;
    for (const slot of blocked) {
      const windowStart = cursor > openAt ? cursor : openAt;
      const windowEnd =
        slot.startsAt < schedulingEndAt ? slot.startsAt : schedulingEndAt;
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
    if (schedulingEndAt.getTime() - cursor.getTime() >= durationMs) {
      const windowStart = cursor > openAt ? cursor : openAt;
      freeWindows.push({
        startsAt: windowStart,
        endsAt: schedulingEndAt,
        minutes: Math.floor(
          (schedulingEndAt.getTime() - windowStart.getTime()) / 60000,
        ),
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

  async findCinemaFreeSlots(cinemaId: string, query: FreeSlotsQueryDto) {
    const schedules = await this.buildCinemaRoomSchedules(
      this.prisma,
      cinemaId,
      query.date,
      query.durationMinutes,
      query.turnaroundMinutes ?? 20,
    );
    return {
      cinemaId,
      date: query.date,
      schedulableCount: schedules.reduce(
        (total, room) => total + room.slots.length,
        0,
      ),
      rooms: schedules.map((room) => ({
        roomId: room.roomId,
        roomName: room.roomName,
        roomFormat: room.roomFormat,
        freeSlots: room.slots.map((slot) => ({
          roomId: slot.roomId,
          roomName: slot.roomName,
          roomFormat: slot.roomFormat,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
        })),
      })),
    };
  }
  //NOTE - preview số suất tạo cho 1 rạp
  async previewCinemaBulk(
    dto: CinemaBulkShowtimeDto,
  ): Promise<CinemaBulkPreviewResponseDto> {
    const plan = await this.buildCinemaBulkPlan(this.prisma, dto);
    return plan;
  }
  //NOTE - tạo suất cho nhiều phòng trong 1 rạp
  async createCinemaBulk(dto: CinemaBulkShowtimeDto) {
    try {
      const created = await this.schedulingTransaction(
        async (transaction) => {
          const roomsById = new Map<string, ShowtimeContext['room']>();
          const plan = await this.buildCinemaBulkPlan(
            transaction,
            dto,
            roomsById,
          );
          if (!plan.valid) {
            throw new ConflictException({
              code: 'SHOWTIME_BULK_SHORTAGE',
              message: `Chỉ còn trống ${plan.schedulableCount} suất chiếu, không đủ ${plan.requestedCount} suất đã yêu cầu`,
            });
          }

          const inserted = await transaction.showtime.createManyAndReturn({
            data: plan.assignments.map((assignment) => ({
              movieId: dto.movieId,
              roomId: assignment.roomId,
              format: dto.format ?? ShowtimeFormat.TWO_D_SUBTITLED,
              startsAt: new Date(assignment.startsAt),
              endsAt: new Date(assignment.endsAt),
              basePrice: this.toDecimalString(assignment.basePrice),
              vipMultiplier: this.toDecimalString(assignment.vipMultiplier),
              coupleMultiplier: this.toDecimalString(
                assignment.coupleMultiplier,
              ),
            })),
          });
          const ids = inserted.map((showtime) => showtime.id);
          const showtimeSeatData: Array<{
            showtimeId: string;
            seatId: string;
            price: string;
          }> = [];
          for (const showtime of inserted) {
            //NOTE - dau ! noi room chac chan ton tai
            const room = roomsById.get(showtime.roomId)!;
            showtimeSeatData.push(
              ...room.seats.map((seat) => ({
                showtimeId: showtime.id,
                seatId: seat.id,
                price: this.calculatePrice(
                  showtime.basePrice.toNumber(),
                  seat.type,
                  showtime.vipMultiplier.toNumber(),
                  showtime.coupleMultiplier.toNumber(),
                ),
              })),
            );
          }
          await transaction.showtimeSeat.createMany({ data: showtimeSeatData });

          return transaction.showtime.findMany({
            where: { id: { in: ids } },
            include: {
              movie: true,
              room: { include: { cinema: true } },
              showtimeSeats: { include: { seat: true } },
            },
            orderBy: { startsAt: 'asc' },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
      return toPublicResponse(created);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        this.isShowtimeOverlapError(error)
      ) {
        if (error instanceof ConflictException) throw error;
        throw new ConflictException('Room already has an overlapping showtime');
      }
      throw error;
    }
  }
  //NOTE - review giá
  async quotePricing(
    dto: ShowtimePricingQuoteDto,
  ): Promise<ShowtimePricingQuoteResponseDto> {
    const startsAt = this.parseStartsAt(dto.startsAt);
    return getPricingQuote({
      roomFormat: dto.roomFormat,
      showtimeFormat: dto.showtimeFormat,
      startsAt,
      basePrice: dto.basePrice,
      vipMultiplier: dto.vipMultiplier,
      coupleMultiplier: dto.coupleMultiplier,
    });
  }
  private async buildCinemaBulkPlan(
    client: PrismaService | Prisma.TransactionClient,
    dto: CinemaBulkShowtimeDto,
    //NOTE - optional vi ham nay dung cho ca preview va create; voi review thi ko can
    roomsById?: Map<string, ShowtimeContext['room']>,
  ): Promise<CinemaBulkPreviewResponseDto> {
    const movie = await client.movie.findUnique({ where: { id: dto.movieId } });
    if (!movie) throw new NotFoundException('Movie not found');
    if (movie.status !== MovieStatus.PUBLISHED) {
      throw new ConflictException('Movie must be published before scheduling');
    }

    const schedules = await this.buildCinemaRoomSchedules(
      client,
      dto.cinemaId,
      dto.date,
      movie.duration,
      dto.turnaroundMinutes,
      roomsById,
    );
    const roomIndexes = new Map(schedules.map((room) => [room.roomId, 0]));
    const selected: CinemaSlot[] = [];

    while (selected.length < dto.count) {
      let added = false;
      for (const schedule of schedules) {
        const index = roomIndexes.get(schedule.roomId) ?? 0;
        const slot = schedule.slots[index];
        if (!slot) continue;
        selected.push(slot);
        roomIndexes.set(schedule.roomId, index + 1);
        added = true;
        if (selected.length === dto.count) break;
      }
      if (!added) break;
    }

    const format = dto.format ?? ShowtimeFormat.TWO_D_SUBTITLED;
    const assignments = selected
      .sort(
        (left, right) =>
          left.startsAt.getTime() - right.startsAt.getTime() ||
          left.roomId.localeCompare(right.roomId),
      )
      .map((assignment) => {
        const pricing = getPricingQuote({
          roomFormat: assignment.roomFormat,
          showtimeFormat: format,
          startsAt: assignment.startsAt,
          basePrice: dto.basePrice,
          vipMultiplier: dto.vipMultiplier,
          coupleMultiplier: dto.coupleMultiplier,
        });
        return {
          roomId: assignment.roomId,
          roomName: assignment.roomName,
          roomFormat: assignment.roomFormat,
          pricingDayType: pricing.pricingDayType,
          basePrice: pricing.basePrice,
          vipMultiplier: pricing.vipMultiplier,
          coupleMultiplier: pricing.coupleMultiplier,
          prices: pricing.prices,
          startsAt: assignment.startsAt.toISOString(),
          endsAt: assignment.endsAt.toISOString(),
        };
      });
    const shortages = schedules.map((room) => ({
      roomId: room.roomId,
      roomName: room.roomName,
      availableSlots: room.slots.length,
      assignedSlots: assignments.filter(
        (assignment) => assignment.roomId === room.roomId,
      ).length,
    }));
    const schedulableCount = schedules.reduce(
      (total, room) => total + room.slots.length,
      0,
    );

    return {
      movieId: dto.movieId,
      cinemaId: dto.cinemaId,
      date: dto.date,
      requestedCount: dto.count,
      schedulableCount,
      valid: schedulableCount >= dto.count,
      assignments,
      shortages,
    };
  }

  private async buildCinemaRoomSchedules(
    client: PrismaService | Prisma.TransactionClient,
    cinemaId: string,
    date: string,
    durationMinutes: number,
    turnaroundMinutes: number,
    roomsById?: Map<string, ShowtimeContext['room']>,
  ): Promise<CinemaRoomSchedule[]> {
    const { openAt, closeAt } = dayBoundsVn(date);
    if (Number.isNaN(openAt.getTime()) || Number.isNaN(closeAt.getTime())) {
      throw new BadRequestException('Date must use the YYYY-MM-DD format');
    }
    const rooms = await client.room.findMany({
      where: { cinemaId },
      select: {
        id: true,
        name: true,
        format: true,
        seats: { select: { id: true, row: true, number: true, type: true } },
      },
      orderBy: { id: 'asc' },
    });
    if (!rooms.length) throw new NotFoundException('Room not found');
    for (const room of rooms) roomsById?.set(room.id, room);

    const durationMs = durationMinutes * 60 * 1000;
    const turnaroundMs = turnaroundMinutes * 60 * 1000;
    const existing = await client.showtime.findMany({
      where: {
        roomId: { in: rooms.map((room) => room.id) },
        startsAt: { lt: new Date(closeAt.getTime() + turnaroundMs) },
        endsAt: { gt: new Date(openAt.getTime() - turnaroundMs) },
      },
      select: { roomId: true, startsAt: true, endsAt: true },
    });
    const now = new Date();

    return rooms.map((room) => {
      if (!room.seats.length) {
        return {
          roomId: room.id,
          roomName: room.name,
          roomFormat: room.format,
          slots: [],
        };
      }
      try {
        validateSeatLayout(room.seats);
      } catch {
        return {
          roomId: room.id,
          roomName: room.name,
          roomFormat: room.format,
          slots: [],
        };
      }

      const busy = existing
        .filter((showtime) => showtime.roomId === room.id)
        .map((showtime) => ({
          startsAt: new Date(showtime.startsAt.getTime() - turnaroundMs),
          endsAt: new Date(showtime.endsAt.getTime() + turnaroundMs),
        }));
      const candidates: CinemaSlot[] = [];
      for (
        let cursor = new Date(openAt);
        cursor.getTime() <= closeAt.getTime();
        cursor = new Date(cursor.getTime() + 15 * 60 * 1000)
      ) {
        const endsAt = new Date(cursor.getTime() + durationMs);
        if (
          cursor <= now ||
          busy.some((slot) => slot.startsAt < endsAt && slot.endsAt > cursor)
        )
          continue;
        candidates.push({
          roomId: room.id,
          roomName: room.name,
          roomFormat: room.format,
          startsAt: cursor,
          endsAt,
        });
      }

      const slots: CinemaSlot[] = [];
      for (const candidate of candidates) {
        const previous = slots.at(-1);
        if (
          !previous ||
          previous.endsAt.getTime() + turnaroundMs <=
            candidate.startsAt.getTime()
        ) {
          slots.push(candidate);
        }
      }
      return {
        roomId: room.id,
        roomName: room.name,
        roomFormat: room.format,
        slots,
      };
    });
  }
  //NOTE - preview xem có thể tạo số suất đó cho 1 phòng ko
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
  //NOTE - tạo nhiều suất cho 1 phòng
  async createBulk(dto: BulkShowtimeDto) {
    try {
      const created = await this.schedulingTransaction(
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

          const format = dto.format ?? ShowtimeFormat.TWO_D_SUBTITLED;
          const data = slots.map((slot) => {
            const pricing = this.resolvePricing(
              {
                basePrice: dto.basePrice,
                vipMultiplier: dto.vipMultiplier,
                coupleMultiplier: dto.coupleMultiplier,
              },
              undefined,
              {
                roomFormat: validRoom.format ?? RoomFormat.STANDARD,
                showtimeFormat: format,
                startsAt: slot.startsAt,
              },
            );
            //NOTE - dựng dữ liệu truoc sau do moi insert vao de toi uu
            return {
              movieId: dto.movieId,
              roomId: dto.roomId,
              format,
              startsAt: slot.startsAt,
              endsAt: slot.endsAt,
              basePrice: this.toDecimalString(pricing.basePrice),
              vipMultiplier: this.toDecimalString(pricing.vipMultiplier),
              coupleMultiplier: this.toDecimalString(pricing.coupleMultiplier),
            };
          });
          const inserted = await transaction.showtime.createManyAndReturn({
            data,
          });
          const showtimeIds = inserted.map((showtime) => showtime.id);
          //NOTE - dung flatmap de bien 2x10 ghe thanh array 20 gia tri
          const showtimeSeatData = inserted.flatMap((showtime) =>
            validRoom.seats.map((seat) => ({
              showtimeId: showtime.id,
              seatId: seat.id,
              price: this.calculatePrice(
                showtime.basePrice.toNumber(),
                seat.type,
                showtime.vipMultiplier.toNumber(),
                showtime.coupleMultiplier.toNumber(),
              ),
            })),
          );
          await transaction.showtimeSeat.createMany({ data: showtimeSeatData });

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
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
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

    const format = dto.format ?? ShowtimeFormat.TWO_D_SUBTITLED;
    const pricing = this.resolvePricing(
      {
        basePrice: dto.basePrice,
        vipMultiplier: dto.vipMultiplier,
        coupleMultiplier: dto.coupleMultiplier,
      },
      undefined,
      {
        roomFormat: validRoom.format ?? RoomFormat.STANDARD,
        showtimeFormat: format,
        startsAt,
      },
    );

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const showtime = await transaction.showtime.create({
          data: {
            movieId: dto.movieId,
            roomId: dto.roomId,
            format,
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
      return await this.schedulingTransaction(
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
            //NOTE - gom theo loai ghe
            //NOTE - thay vi loop update tung seat thi gom theo tung loai update => giam so lan update db xuong
            for (const type of [
              SeatType.STANDARD,
              SeatType.VIP,
              SeatType.COUPLE,
            ]) {
              const ids = current.showtimeSeats
                .filter((item) => item.seat.type === type)
                .map((item) => item.id);
              if (!ids.length) continue;
              await transaction.showtimeSeat.updateMany({
                where: { showtimeId: id, id: { in: ids } },
                data: {
                  price: this.calculatePrice(
                    pricing.basePrice,
                    type,
                    pricing.vipMultiplier,
                    pricing.coupleMultiplier,
                  ),
                },
              });
            }
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
      format: RoomFormat;
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

  private parseStartsAt(value: string): Date {
    if (!SHOWTIME_TIMEZONE_PATTERN.test(value)) {
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

  private async schedulingTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    options: {
      isolationLevel: Prisma.TransactionIsolationLevel;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, options);
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034'
        ) {
          throw error;
        }
        if (attempt === 2) {
          throw new ConflictException({
            code: 'SHOWTIME_CONCURRENT_CHANGE',
            message: 'Lịch chiếu đang được thay đổi. Vui lòng thử lại.',
          });
        }
        // Backoff happens outside the rolled-back transaction/connection.
        await new Promise<void>((resolve) =>
          setTimeout(
            resolve,
            50 * 2 ** attempt + Math.floor(Math.random() * 50),
          ),
        );
      }
    }
    throw new Error('Unreachable scheduling retry state');
  }

  private isShowtimeOverlapError(error: unknown) {
    if (!(error instanceof Error)) return false;
    const evidence =
      error.message +
      (error instanceof Prisma.PrismaClientKnownRequestError
        ? JSON.stringify(error.meta ?? {})
        : '');
    return (
      evidence.includes('Showtime_room_time_exclusion') ||
      evidence.includes('23P01')
    );
  }

  async remove(id: string) {
    try {
      const deleted = await this.prisma.$transaction(async (transaction) => {
        const showtime = await transaction.showtime.findUnique({
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

        return transaction.showtime.delete({ where: { id } });
      });
      return toPublicResponse(deleted);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Showtime cannot be deleted after bookings exist',
        );
      }
      throw error;
    }
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
    policy?: {
      roomFormat: RoomFormat;
      showtimeFormat: ShowtimeFormat;
      startsAt: Date;
    },
  ): ShowtimePricing {
    const inferredBasePrice = current?.showtimeSeats
      .find((showtimeSeat) => showtimeSeat.seat.type === SeatType.STANDARD)
      ?.price.toNumber();
    const fallbackBasePrice =
      inferredBasePrice ?? current?.showtimeSeats[0]?.price.toNumber();
    const policyPricing = policy ? getPricingQuote(policy) : undefined;
    const basePrice =
      values.basePrice ??
      current?.basePrice?.toNumber() ??
      fallbackBasePrice ??
      policyPricing?.basePrice;

    if (basePrice === undefined) {
      throw new BadRequestException(
        'Base price is required when the showtime has no pricing snapshot',
      );
    }

    return {
      basePrice,
      vipMultiplier:
        values.vipMultiplier ??
        current?.vipMultiplier?.toNumber() ??
        policyPricing?.vipMultiplier ??
        DEFAULT_VIP_MULTIPLIER,
      coupleMultiplier:
        values.coupleMultiplier ??
        current?.coupleMultiplier?.toNumber() ??
        policyPricing?.coupleMultiplier ??
        DEFAULT_COUPLE_MULTIPLIER,
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

import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { MovieStatus, Prisma } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateCinemaDto, UpdateCinemaDto } from './dto/cinema.dto.js';
import { ListCinemasDto } from './dto/list-cinemas.dto.js';
import { PROVINCES } from '../locations/provinces.js';

@Injectable()
export class CinemasService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly audit: AuditService = null as unknown as AuditService,
  ) {}

  async findAll(query: ListCinemasDto = {}) {
    const cinemas = await this.prisma.cinema.findMany({
      where: query.provinceCode
        ? { provinceCode: query.provinceCode }
        : undefined,
      include: {
        _count: { select: { rooms: true } },
        rooms: {
          select: {
            showtimes: {
              where: {
                startsAt: { gte: new Date() },
                movie: { status: MovieStatus.PUBLISHED },
              },
              select: { basePrice: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return toPublicResponse(
      cinemas.map((cinema) => {
        const prices = (cinema.rooms ?? []).flatMap((room) =>
          (room.showtimes ?? []).map((showtime) =>
            showtime.basePrice.toNumber(),
          ),
        );
        const { rooms: _rooms, ...cinemaData } = cinema;
        return {
          ...cinemaData,
          province:
            PROVINCES.find(
              (province) => province.code === cinema.provinceCode,
            ) ?? null,
          startingPrice: prices.length ? Math.min(...prices) : null,
        };
      }),
    );
  }

  async findOne(id: string) {
    const cinema = await this.prisma.cinema.findUnique({
      where: { id },
      include: {
        rooms: {
          include: {
            _count: { select: { seats: true } },
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!cinema) {
      throw new NotFoundException('Cinema not found');
    }

    return toPublicResponse({
      ...cinema,
      province:
        PROVINCES.find((province) => province.code === cinema.provinceCode) ??
        null,
    });
  }

  async create(dto: CreateCinemaDto) {
    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const cinema = await transaction.cinema.create({
          data: {
            name: dto.name.trim(),
            address: dto.address.trim(),
            provinceCode: dto.provinceCode,
          },
        });
        if (this.audit)
          await this.audit.record(
            {
              action: 'CINEMA_CREATED',
              resourceType: 'Cinema',
              resourceId: cinema.id,
              after: cinema,
            },
            transaction,
          );
        return cinema;
      });
      return toPublicResponse({
        ...result,
        province:
          PROVINCES.find((province) => province.code === result.provinceCode) ??
          null,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Cinema already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCinemaDto) {
    const cinema = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.cinema.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Cinema not found');
      const updated = await transaction.cinema.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.address !== undefined && { address: dto.address.trim() }),
          ...(dto.provinceCode !== undefined && {
            provinceCode: dto.provinceCode,
          }),
        },
      });
      await this.audit?.record(
        {
          action: 'CINEMA_UPDATED',
          resourceType: 'Cinema',
          resourceId: id,
          before: current,
          after: updated,
        },
        transaction,
      );
      return updated;
    });
    return toPublicResponse({
      ...cinema,
      province:
        PROVINCES.find((province) => province.code === cinema.provinceCode) ??
        null,
    });
  }

  async remove(id: string) {
    try {
      const cinema = await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.cinema.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Cinema not found');
        const deleted = await transaction.cinema.delete({ where: { id } });
        await this.audit?.record(
          {
            action: 'CINEMA_DELETED',
            resourceType: 'Cinema',
            resourceId: id,
            before: current,
          },
          transaction,
        );
        return deleted;
      });
      return toPublicResponse({
        ...cinema,
        province:
          PROVINCES.find((province) => province.code === cinema.provinceCode) ??
          null,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Cinema cannot be deleted while it has active showtimes',
        );
      }
      throw error;
    }
  }
}

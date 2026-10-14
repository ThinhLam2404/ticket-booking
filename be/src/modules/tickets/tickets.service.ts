import { Injectable, NotFoundException } from '@nestjs/common';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { assertCursorDirection, buildCursorMeta, cursorWhere, decodeCursor } from '../../common/http/cursor-pagination.js';
import type { ListTicketsDto } from './dto/list-tickets.dto.js';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string, query: ListTicketsDto) {
    const limit = query.limit ?? 20;
    assertCursorDirection(query.after, query.before);
    const direction = query.before ? 'before' : 'after';
    const cursor = query.before ?? query.after;
    const scope = `tickets:${userId}:${query.status ?? ''}:${query.search?.trim() ?? ''}:${query.from ?? ''}:${query.to ?? ''}`;
    const payload = cursor ? decodeCursor(cursor, scope, direction) : undefined;
    const search = query.search?.trim();
    const where = {
      booking: { userId },
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' as const } }, { id: { contains: search, mode: 'insensitive' as const } }, { bookingId: { contains: search, mode: 'insensitive' as const } }, { booking: { showtime: { movie: { title: { contains: search, mode: 'insensitive' as const } } } } }] } : {}),
      ...(payload ? cursorWhere(payload, 'createdAt') : {}),
    };
    const tickets = await this.prisma.ticket.findMany({
      where,
      include: { booking: { include: { showtime: { include: { movie: true, room: { include: { cinema: true } } } } } }, bookingItem: { include: { showtimeSeat: { include: { seat: true } } } } },
      orderBy: direction === 'before' ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const result = buildCursorMeta(tickets, limit, scope, direction, (row) => row.createdAt, Boolean(cursor));
    return { ...result, data: result.data.map((ticket) => toPublicResponse(ticket)) };
  }

  async findOne(userId: string, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, booking: { userId } },
      include: {
        booking: {
          include: {
            showtime: {
              include: { movie: true, room: { include: { cinema: true } } },
            },
          },
        },
        bookingItem: {
          include: { showtimeSeat: { include: { seat: true } } },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return toPublicResponse(ticket);
  }
}

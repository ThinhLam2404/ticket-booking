import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string) {
    return this.prisma.ticket.findMany({
      where: { booking: { userId } },
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
      orderBy: { createdAt: 'desc' },
    });
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

    return ticket;
  }
}

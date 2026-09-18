import { ConflictException } from '@nestjs/common';
import { SeatsService } from './seats.service.js';

describe('SeatsService admin layout replacement', () => {
  it('rejects duplicate normalized coordinates before changing the room', async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new SeatsService(prisma as never);

    await expect(
      service.replaceLayout('room-1', [
        { row: 'a', number: 1, type: 'STANDARD' },
        { row: 'A', number: 1, type: 'VIP' },
      ]),
    ).rejects.toEqual(new ConflictException('Duplicate seat coordinate in layout'));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a room with showtimes without deleting its seats', async () => {
    const seatDeleteMany = vi.fn();
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback({
          room: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'room-1',
              _count: { showtimes: 1 },
            }),
          },
          seat: { deleteMany: seatDeleteMany },
        }),
      ),
    };
    const service = new SeatsService(prisma as never);

    await expect(
      service.replaceLayout('room-1', [{ row: 'A', number: 1 }]),
    ).rejects.toEqual(
      new ConflictException(
        'Room layout cannot be replaced while it has showtimes',
      ),
    );
    expect(seatDeleteMany).not.toHaveBeenCalled();
  });

  it('rejects creating a Couple seat outside bulk layout replacement', async () => {
    const prisma = { room: { findUnique: vi.fn() }, seat: { create: vi.fn() } };
    const service = new SeatsService(prisma as never);

    await expect(
      service.create('room-1', { row: 'A', number: 1, type: 'COUPLE' }),
    ).rejects.toEqual(
      new ConflictException(
        'Couple seats must be managed as a complete room layout',
      ),
    );
    expect(prisma.room.findUnique).not.toHaveBeenCalled();
  });

  it('allows standard and vip changes while a room is still being built', async () => {
    const seatCreate = vi.fn().mockResolvedValue({
      id: 'seat-1',
      roomId: 'room-1',
      row: 'A',
      number: 1,
      type: 'VIP',
    });
    const prisma = {
      room: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'room-1',
          _count: { showtimes: 0 },
          seats: [{ row: 'A', number: 2, type: 'STANDARD' }],
        }),
      },
      seat: { create: seatCreate },
    };
    const service = new SeatsService(prisma as never);

    await expect(
      service.create('room-1', { row: 'a', number: 1, type: 'VIP' }),
    ).resolves.toMatchObject({ row: 'A', type: 'VIP' });
    expect(seatCreate).toHaveBeenCalledWith({
      data: { roomId: 'room-1', row: 'A', number: 1, type: 'VIP' },
    });
  });

  it('rejects editing a complete room layout through single-seat CRUD', async () => {
    const completeSeats = [
      { row: 'A', number: 1, type: 'STANDARD' },
      { row: 'B', number: 1, type: 'STANDARD' },
      { row: 'C', number: 1, type: 'STANDARD' },
      { row: 'D', number: 1, type: 'VIP' },
      { row: 'E', number: 1, type: 'COUPLE' },
      { row: 'E', number: 2, type: 'COUPLE' },
    ];
    const prisma = {
      seat: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'seat-1',
          roomId: 'room-1',
          row: 'A',
          number: 1,
          type: 'STANDARD',
        }),
        update: vi.fn(),
      },
      room: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'room-1',
          _count: { showtimes: 0 },
          seats: completeSeats,
        }),
      },
    };
    const service = new SeatsService(prisma as never);

    await expect(
      service.update('seat-1', { type: 'VIP' }),
    ).rejects.toEqual(
      new ConflictException('Complete seat layouts must be managed in bulk'),
    );
    expect(prisma.seat.update).not.toHaveBeenCalled();
  });

  it('rejects deleting a Couple seat even when its room is incomplete', async () => {
    const prisma = {
      seat: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'seat-1',
          roomId: 'room-1',
          row: 'E',
          number: 1,
          type: 'COUPLE',
        }),
        delete: vi.fn(),
      },
      room: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'room-1',
          _count: { showtimes: 0 },
          seats: [{ row: 'E', number: 1, type: 'COUPLE' }],
        }),
      },
    };
    const service = new SeatsService(prisma as never);

    await expect(service.remove('seat-1')).rejects.toEqual(
      new ConflictException(
        'Couple seats must be managed as a complete room layout',
      ),
    );
  });
});

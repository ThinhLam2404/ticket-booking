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
});

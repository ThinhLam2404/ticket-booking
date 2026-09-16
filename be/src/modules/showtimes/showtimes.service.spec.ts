import { ConflictException } from '@nestjs/common';
import { ShowtimeSeatStatus } from '@prisma/client';
import { ShowtimesService } from './showtimes.service.js';

describe('ShowtimesService admin updates', () => {
  it('refuses an update when bookings already exist', async () => {
    const showtimeFindUnique = vi.fn().mockResolvedValue({
      id: 'showtime-1',
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      movieId: 'movie-1',
      roomId: 'room-1',
      basePrice: null,
      vipMultiplier: null,
      coupleMultiplier: null,
      _count: { bookings: 1 },
      showtimeSeats: [
        {
          id: 'showtime-seat-1',
          price: { toNumber: () => 100000 },
          status: ShowtimeSeatStatus.AVAILABLE,
          seat: { type: 'STANDARD' },
        },
      ],
    });
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback({ showtime: { findUnique: showtimeFindUnique } }),
      ),
    };
    const service = new ShowtimesService(prisma as never);

    await expect(
      service.update('showtime-1', {
        startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      }),
    ).rejects.toEqual(
      new ConflictException('Showtime cannot be updated after bookings exist'),
    );
  });
});

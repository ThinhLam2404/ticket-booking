import { BookingExpiryScheduler } from './booking-expiry.scheduler.js';

describe('BookingExpiryScheduler', () => {
  it('delegates expiration to the booking service', async () => {
    const bookingsService = {
      expireBookings: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = new BookingExpiryScheduler(bookingsService as never);

    await scheduler.expirePendingBookings();

    expect(bookingsService.expireBookings).toHaveBeenCalledOnce();
  });
});

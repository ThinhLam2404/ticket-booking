import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { logOperationalEvent } from '../../common/logging/operational-logger.js';
import { BookingsService } from './bookings.service.js';

@Injectable()
export class BookingExpiryScheduler {
  constructor(private readonly bookingsService: BookingsService) {}

  @Cron('30 * * * * *')
  async expirePendingBookings(): Promise<void> {
    const startedAt = performance.now();
    const result = await this.bookingsService.expireBookings();
    logOperationalEvent('info', 'scheduler_run', {
      name: 'booking_expiry',
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      processed: result.processed,
    });
  }
}

import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { BookingExpiryScheduler } from './booking-expiry.scheduler.js';

@Module({
  imports: [AuthModule, RedisModule, AuditModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingExpiryScheduler],
  exports: [BookingsService],
})
export class BookingsModule {}

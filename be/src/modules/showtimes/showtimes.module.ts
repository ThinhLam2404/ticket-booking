import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { ShowtimesController } from './showtimes.controller.js';
import { ShowtimesService } from './showtimes.service.js';

@Module({
  imports: [AuthModule, BookingsModule],
  controllers: [ShowtimesController],
  providers: [ShowtimesService],
  exports: [ShowtimesService],
})
export class ShowtimesModule {}

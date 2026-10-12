import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ShowtimesController } from './showtimes.controller.js';
import { ShowtimesService } from './showtimes.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ShowtimesController],
  providers: [ShowtimesService],
  exports: [ShowtimesService],
})
export class ShowtimesModule {}

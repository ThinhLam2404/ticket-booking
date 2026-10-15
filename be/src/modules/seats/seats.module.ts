import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { SeatsController } from './seats.controller.js';
import { SeatsService } from './seats.service.js';

@Module({
  imports: [AuthModule, RoomsModule, AuditModule],
  controllers: [SeatsController],
  providers: [SeatsService],
  exports: [SeatsService],
})
export class SeatsModule {}

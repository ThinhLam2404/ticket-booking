import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { MaintenanceScheduler } from './maintenance.scheduler.js';

@Module({
  imports: [DatabaseModule],
  providers: [MaintenanceScheduler],
})
export class MaintenanceModule {}

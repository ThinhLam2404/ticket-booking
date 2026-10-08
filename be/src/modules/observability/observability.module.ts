import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { DiscordAlertService } from './discord-alert.service.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';
import { OperationalMonitorScheduler } from './operational-monitor.scheduler.js';
import { OperationsController } from './operations.controller.js';
import { OperationsService } from './operations.service.js';

@Global()
@Module({
  imports: [AuthModule, MailModule],
  controllers: [MetricsController, OperationsController],
  providers: [
    MetricsService,
    OperationsService,
    DiscordAlertService,
    OperationalMonitorScheduler,
  ],
  exports: [MetricsService, OperationsService, DiscordAlertService],
})
export class ObservabilityModule {}

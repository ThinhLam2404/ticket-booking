import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { MailService } from './mail.service.js';
import { MailWorkerSupervisor } from './mail-worker.supervisor.js';

@Module({
  imports: [DatabaseModule],
  providers: [MailWorkerSupervisor, MailService],
  exports: [MailWorkerSupervisor, MailService],
})
export class MailModule {}

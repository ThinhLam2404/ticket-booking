import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { MailService } from './mail.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

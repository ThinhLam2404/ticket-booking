import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { SepayController } from './sepay.controller.js';
import { SepayService } from './sepay.service.js';
import { SepayWebhookGuard } from './sepay-webhook.guard.js';

@Module({
  imports: [AuthModule, BookingsModule, MailModule],
  controllers: [SepayController],
  providers: [SepayService, SepayWebhookGuard],
  exports: [SepayService],
})
export class SepayModule {}

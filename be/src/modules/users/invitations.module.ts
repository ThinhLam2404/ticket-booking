import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { MailModule } from '../mail/mail.module.js';
import { InvitationsService } from './invitations.service.js';
import { InvitationsController } from './invitations.controller.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { JwtTokenService } from '../auth/jwt-token.service.js';

@Module({
  imports: [DatabaseModule, AuditModule, MailModule],
  controllers: [InvitationsController],
  providers: [InvitationsService, JwtAuthGuard, PermissionsGuard, JwtTokenService],
  exports: [InvitationsService],
})
export class InvitationsModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { MailModule } from '../mail/mail.module.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtTokenService } from './jwt-token.service.js';
import { InvitationsModule } from '../users/invitations.module.js';

@Module({
  imports: [DatabaseModule, MailModule, AuditModule, InvitationsModule],
  controllers: [AuthController],
  providers: [AuthService, JwtTokenService, JwtAuthGuard, RolesGuard, PermissionsGuard],
  exports: [AuthService, JwtTokenService, JwtAuthGuard, RolesGuard, PermissionsGuard],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuditService } from './audit.service.js';
import { AuditController } from './audit.controller.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { JwtTokenService } from '../auth/jwt-token.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AuditController],
  providers: [AuditService, JwtAuthGuard, PermissionsGuard, JwtTokenService],
  exports: [AuditService],
})
export class AuditModule {}

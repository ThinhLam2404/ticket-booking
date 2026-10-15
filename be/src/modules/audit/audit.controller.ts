import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { AdminPermission } from '@prisma/client';
import { AuditService } from './audit.service.js';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto.js';

@ApiTags('admin-audit')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions(AdminPermission.VIEW_AUDIT_LOGS)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiResponse({ status: 200, description: 'Filtered audit log entries.' })
  list(@Query() query: ListAuditLogsDto) {
    return this.audit.list(query);
  }
}

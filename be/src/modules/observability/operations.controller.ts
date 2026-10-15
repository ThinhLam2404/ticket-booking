import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { AdminPermission } from '@prisma/client';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { OperationsStatusDto } from './operations.dto.js';
import { OperationsService } from './operations.service.js';

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN)
@Permissions(AdminPermission.VIEW_SYSTEM)
@Controller('admin/operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('status')
  @ApiResponse({ status: 200, type: OperationsStatusDto })
  @ApiErrorResponses(401, 403)
  status() {
    return this.operationsService.getStatus();
  }
}

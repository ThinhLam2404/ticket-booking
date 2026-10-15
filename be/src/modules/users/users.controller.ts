import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminPermission } from '@prisma/client';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { UsersService } from './users.service.js';
import { AdminUserResponseDto, AdminUserSessionDto, ListAdminUsersDto, UpdateUserAccessDto } from './dto/admin-users.dto.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  @ApiErrorResponses(401, 404)
  me(@CurrentUser() user: AuthUser) {
    return this.usersService.findPublicById(user.id);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(AdminPermission.MANAGE_USERS)
  @ApiResponse({ status: 200, type: [AdminUserResponseDto] })
  @ApiErrorResponses(401, 403)
  listAdmin(@Query() query: ListAdminUsersDto) {
    return this.usersService.listAdmin(query);
  }

  @Get('admin/:id/sessions')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(AdminPermission.MANAGE_USERS)
  @ApiResponse({ status: 200, type: [AdminUserSessionDto] })
  @ApiErrorResponses(401, 403, 404)
  sessions(@Param('id') id: string) {
    return this.usersService.listSessions(id);
  }

  @Delete('admin/:id/sessions/:sessionId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(AdminPermission.MANAGE_USERS)
  @ApiResponse({ status: 204, description: 'Session revoked.' })
  @ApiErrorResponses(401, 403, 404)
  revokeSession(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Param('sessionId') sessionId: string) {
    return this.usersService.revokeSession({ id: actor.id, email: actor.email }, id, sessionId);
  }

  @Post('admin/:id/sessions/revoke-all')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(AdminPermission.MANAGE_USERS)
  @ApiResponse({ status: 204, description: 'All user sessions revoked.' })
  @ApiErrorResponses(401, 403, 404)
  revokeAllSessions(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.usersService.revokeAllSessions({ id: actor.id, email: actor.email }, id);
  }

  @Patch('admin/:id/access')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(AdminPermission.MANAGE_USERS)
  @ApiResponse({ status: 200, type: AdminUserResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  updateAccess(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserAccessDto) {
    return this.usersService.updateAccess({ id: actor.id, email: actor.email }, id, dto);
  }
}

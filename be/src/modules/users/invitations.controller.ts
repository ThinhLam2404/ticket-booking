import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminPermission } from '@prisma/client';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { InvitationsService } from './invitations.service.js';
import { AdminInvitationMutationResponseDto, AdminInvitationResponseDto, CreateAdminInvitationDto, ListAdminInvitationsDto } from './dto/admin-invitation.dto.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users/admin/invitations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions(AdminPermission.MANAGE_USERS)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @ApiResponse({ status: 200, type: [AdminInvitationResponseDto] })
  @ApiErrorResponses(401, 403)
  list(@CurrentUser() actor: AuthUser, @Query() query: ListAdminInvitationsDto) {
    return this.invitations.list({ id: actor.id, email: actor.email }, query);
  }

  @Post()
  @ApiResponse({ status: 201, type: AdminInvitationMutationResponseDto })
  @ApiErrorResponses(400, 401, 403, 409)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateAdminInvitationDto) {
    return this.invitations.create({ id: actor.id, email: actor.email }, dto);
  }

  @Post(':id/resend')
  @ApiResponse({ status: 201, type: AdminInvitationMutationResponseDto })
  @ApiErrorResponses(401, 403, 404, 409)
  resend(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.invitations.resend({ id: actor.id, email: actor.email }, id);
  }

  @Post(':id/revoke')
  @ApiResponse({ status: 201, type: AdminInvitationMutationResponseDto })
  @ApiErrorResponses(401, 403, 404, 409)
  revoke(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.invitations.revoke({ id: actor.id, email: actor.email }, id);
  }
}

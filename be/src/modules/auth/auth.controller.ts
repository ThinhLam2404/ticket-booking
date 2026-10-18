import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  Optional,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import {
  ChangePasswordDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './dto/password-reset.dto.js';
import { AuthSessionResponseDto, PasswordChangedResponseDto } from './dto/session.dto.js';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthResponseDto } from '../../common/http/dto/response.dto.js';
import {
  EmailVerificationRequiredResponseDto,
  EmailVerificationResponseDto,
  EmailVerificationResendResponseDto,
  ResendVerificationEmailDto,
  VerifyEmailDto,
} from './dto/email-verification.dto.js';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { AcceptAdminInvitationDto, PreviewAdminInvitationDto, AdminInvitationPreviewResponseDto, AdminInvitationAcceptedResponseDto } from './dto/admin-invitation.dto.js';
import { InvitationsService } from '../users/invitations.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Optional() private readonly invitations: InvitationsService = null as unknown as InvitationsService,
  ) {}

  @Post('admin-invitations/preview')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: AdminInvitationPreviewResponseDto, description: 'Preview an active admin invitation.' })
  @ApiErrorResponses(400, 401)
  previewAdminInvitation(@Body() dto: PreviewAdminInvitationDto) {
    return this.invitations.preview(dto.token);
  }

  @Post('admin-invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: AdminInvitationAcceptedResponseDto, description: 'Accept an admin invitation.' })
  @ApiErrorResponses(400, 401, 409)
  acceptAdminInvitation(@Body() dto: AcceptAdminInvitationDto) {
    return this.invitations.accept(dto);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'Always returns the same response to avoid account enumeration.' })
  @ApiErrorResponses(400)
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'Password reset completed and all sessions revoked.' })
  @ApiErrorResponses(400, 401)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, type: [AuthSessionResponseDto], description: 'Active sessions for the authenticated user.' })
  @ApiErrorResponses(401)
  sessions(@CurrentUser() user: AuthUser) {
    return this.authService.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Session revoked.' })
  @ApiErrorResponses(401)
  revokeSession(@CurrentUser() user: AuthUser, @Req() request: Request) {
    const sessionId = request.params.sessionId;
    if (typeof sessionId !== 'string') throw new UnauthorizedException('Session is no longer active');
    return this.authService.revokeSession(user.id, sessionId);
  }

  @Post('sessions/revoke-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'All sessions revoked.' })
  @ApiErrorResponses(401)
  revokeAllSessions(@CurrentUser() user: AuthUser) {
    return this.authService.revokeAllSessions(user.id);
  }

  @Post('sessions/revoke-others')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'All other sessions revoked.' })
  @ApiErrorResponses(401)
  revokeOtherSessions(@CurrentUser() user: AuthUser) {
    if (!user.sessionId) throw new UnauthorizedException('Session is no longer active');
    return this.authService.revokeOtherSessions(user.id, user.sessionId);
  }

  @Post('password/change')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: PasswordChangedResponseDto, description: 'Password changed and all sessions revoked.' })
  @ApiErrorResponses(400, 401)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }

  @Post('register')
  @ApiResponse({ status: 201, type: EmailVerificationRequiredResponseDto })
  @ApiErrorResponses(400, 409)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: EmailVerificationResponseDto })
  @ApiErrorResponses(400, 401)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('email/resend')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: EmailVerificationResendResponseDto })
  @ApiErrorResponses(400)
  resendVerificationEmail(@Body() dto: ResendVerificationEmailDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiErrorResponses(400, 401, 403)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiErrorResponses(400, 401, 403)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204 })
  @ApiErrorResponses(400, 401)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }
}

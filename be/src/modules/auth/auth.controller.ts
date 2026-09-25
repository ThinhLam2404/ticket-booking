import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
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

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

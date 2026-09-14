import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserResponseDto } from '../../common/http/dto/response.dto.js';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiErrorResponses(401, 404)
  me(@CurrentUser() user: AuthUser) {
    return this.usersService.findPublicById(user.id);
  }
}

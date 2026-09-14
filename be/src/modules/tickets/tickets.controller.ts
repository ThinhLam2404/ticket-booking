import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TicketResponseDto } from '../../common/http/dto/response.dto.js';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { TicketsService } from './tickets.service.js';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @ApiResponse({ status: 200, type: TicketResponseDto, isArray: true })
  @ApiErrorResponses(401)
  findMine(@CurrentUser() user: AuthUser) {
    return this.ticketsService.findMine(user.id);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: TicketResponseDto })
  @ApiErrorResponses(401, 404)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ticketsService.findOne(user.id, id);
  }
}

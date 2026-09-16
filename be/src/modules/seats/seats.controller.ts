import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SeatResponseDto } from '../../common/http/dto/response.dto.js';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import {
  BulkSeatLayoutItemDto,
  CreateSeatDto,
  UpdateSeatDto,
} from './dto/seat.dto.js';
import { SeatsService } from './seats.service.js';

@ApiTags('seats')
@Controller('seats')
export class SeatsController {
  constructor(private readonly seatsService: SeatsService) {}

  @Get('room/:roomId')
  @ApiResponse({ status: 200, type: SeatResponseDto, isArray: true })
  findByRoom(@Param('roomId') roomId: string) {
    return this.seatsService.findByRoom(roomId);
  }

  @Put('room/:roomId/layout')
  @ApiBody({ type: BulkSeatLayoutItemDto, isArray: true })
  @ApiResponse({ status: 200, type: SeatResponseDto, isArray: true })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  replaceLayout(
    @Param('roomId') roomId: string,
    @Body(new ParseArrayPipe({ items: BulkSeatLayoutItemDto }))
    layout: BulkSeatLayoutItemDto[],
  ) {
    return this.seatsService.replaceLayout(roomId, layout);
  }

  @Post(':roomId')
  @ApiResponse({ status: 201, type: SeatResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Param('roomId') roomId: string, @Body() dto: CreateSeatDto) {
    return this.seatsService.create(roomId, dto);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: SeatResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateSeatDto) {
    return this.seatsService.update(id, dto);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, type: SeatResponseDto })
  @ApiErrorResponses(401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.seatsService.remove(id);
  }
}

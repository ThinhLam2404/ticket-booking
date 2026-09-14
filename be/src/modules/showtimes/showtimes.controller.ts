import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  PaginatedShowtimesResponseDto,
  ShowtimeResponseDto,
  ShowtimeSeatsResponseDto,
} from '../../common/http/dto/response.dto.js';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import { CreateShowtimeDto } from './dto/create-showtime.dto.js';
import { ListShowtimesDto } from './dto/list-showtimes.dto.js';
import { ShowtimesService } from './showtimes.service.js';

@ApiTags('showtimes')
@Controller('showtimes')
export class ShowtimesController {
  constructor(private readonly showtimesService: ShowtimesService) {}

  @Get()
  @ApiResponse({ status: 200, type: PaginatedShowtimesResponseDto })
  @ApiErrorResponses(400)
  findAll(@Query() query: ListShowtimesDto) {
    return this.showtimesService.findAll(query);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: ShowtimeResponseDto })
  @ApiErrorResponses(404)
  findOne(@Param('id') id: string) {
    return this.showtimesService.findOne(id);
  }

  @Get(':id/seats')
  @ApiResponse({ status: 200, type: ShowtimeSeatsResponseDto })
  @ApiErrorResponses(404)
  findSeats(@Param('id') id: string) {
    return this.showtimesService.findSeats(id);
  }

  @Post()
  @ApiResponse({ status: 201, type: ShowtimeResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateShowtimeDto) {
    return this.showtimesService.create(dto);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, type: ShowtimeResponseDto })
  @ApiErrorResponses(401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.showtimesService.remove(id);
  }
}

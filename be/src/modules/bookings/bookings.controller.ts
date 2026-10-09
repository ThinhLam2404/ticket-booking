import {
  Body,
  Controller,
  Get,
  Query,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErrorResponses,
} from '../../common/http/swagger.decorators.js';
import {
  BookingResponseDto,
} from '../../common/http/dto/response.dto.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { AdminBookingsQueryDto } from './dto/admin-bookings.dto.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { BookingsService } from './bookings.service.js';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post('hold')
  @ApiResponse({ status: 201, type: BookingResponseDto })
  @ApiErrorResponses(400, 401, 404, 409, 503)
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'Client-generated key used to safely retry a hold request',
  })
  hold(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.bookingsService.hold(user.id, dto, idempotencyKey);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiResponse({ status: 200 })
  findAllAdmin(@Query() query: AdminBookingsQueryDto) {
    return this.bookingsService.findAllAdmin(query);
  }

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiResponse({ status: 200 })
  findOneAdmin(@Param('id') id: string) {
    return this.bookingsService.findOneAdmin(id);
  }

  @Get()
  @ApiResponse({ status: 200, type: BookingResponseDto, isArray: true })
  @ApiErrorResponses(401)
  findMine(@CurrentUser() user: AuthUser) {
    return this.bookingsService.findMine(user.id);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: BookingResponseDto })
  @ApiErrorResponses(401, 404)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.findOne(user.id, id);
  }

  @Post(':id/cancel')
  @ApiResponse({ status: 201, type: BookingResponseDto })
  @ApiErrorResponses(401, 404, 409)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.cancel(user.id, id);
  }
}

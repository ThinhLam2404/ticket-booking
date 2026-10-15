import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import {
  BulkShowtimeDto,
  BulkShowtimePreviewResponseDto,
} from './dto/bulk-showtime.dto.js';
import {
  FreeSlotsQueryDto,
  FreeSlotsResponseDto,
} from './dto/free-slots.dto.js';
import {
  CinemaBulkPreviewResponseDto,
  CinemaBulkShowtimeDto,
  CinemaFreeSlotsResponseDto,
} from './dto/cinema-bulk-showtime.dto.js';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { AdminPermission } from '@prisma/client';
import { CreateShowtimeDto } from './dto/create-showtime.dto.js';
import {
  ListAdminShowtimesDto,
  ListShowtimesDto,
} from './dto/list-showtimes.dto.js';
import { UpdateShowtimeDto } from './dto/update-showtime.dto.js';
import { ShowtimePricingQuoteDto, ShowtimePricingQuoteResponseDto } from './dto/pricing-quote.dto.js';
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

  @Get('admin')
  @ApiResponse({ status: 200, type: PaginatedShowtimesResponseDto })
  @ApiErrorResponses(400, 401, 403)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Permissions(AdminPermission.MANAGE_SHOWTIMES)
  findAllAdmin(@Query() query: ListAdminShowtimesDto) {
    return this.showtimesService.findAllAdmin(query);
  }

  @Get('rooms/:roomId/free-slots')
  @ApiResponse({ status: 200, type: FreeSlotsResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Permissions(AdminPermission.MANAGE_SHOWTIMES)
  findFreeSlots(
    @Param('roomId') roomId: string,
    @Query() query: FreeSlotsQueryDto,
  ) {
    return this.showtimesService.findFreeSlots(roomId, query);
  }

  @Get('cinemas/:cinemaId/free-slots')
  @ApiResponse({ status: 200, type: CinemaFreeSlotsResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Permissions(AdminPermission.MANAGE_SHOWTIMES)
  findCinemaFreeSlots(
    @Param('cinemaId') cinemaId: string,
    @Query() query: FreeSlotsQueryDto,
  ) {
    return this.showtimesService.findCinemaFreeSlots(cinemaId, query);
  }

  @Post('pricing/quote')
  @ApiResponse({ status: 201, type: ShowtimePricingQuoteResponseDto })
  @ApiErrorResponses(400, 401, 403)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Permissions(AdminPermission.MANAGE_SHOWTIMES)
  quotePricing(@Body() dto: ShowtimePricingQuoteDto) {
    return this.showtimesService.quotePricing(dto);
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

  @Post('cinema-bulk/preview')
  @ApiResponse({ status: 200, type: CinemaBulkPreviewResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Permissions(AdminPermission.MANAGE_SHOWTIMES)
  previewCinemaBulk(@Body() dto: CinemaBulkShowtimeDto) {
    return this.showtimesService.previewCinemaBulk(dto);
  }

  @Post('cinema-bulk')
  @ApiResponse({ status: 201, type: ShowtimeResponseDto, isArray: true })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Permissions(AdminPermission.MANAGE_SHOWTIMES)
  createCinemaBulk(@Body() dto: CinemaBulkShowtimeDto) {
    return this.showtimesService.createCinemaBulk(dto);
  }

  @Post('bulk/preview')
  @ApiResponse({ status: 200, type: BulkShowtimePreviewResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Permissions(AdminPermission.MANAGE_SHOWTIMES)
  previewBulk(@Body() dto: BulkShowtimeDto) {
    return this.showtimesService.previewBulk(dto);
  }

  @Post('bulk')
  @ApiResponse({ status: 201, type: ShowtimeResponseDto, isArray: true })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Permissions(AdminPermission.MANAGE_SHOWTIMES)
  createBulk(@Body() dto: BulkShowtimeDto) {
    return this.showtimesService.createBulk(dto);
  }

  @Post()
  @ApiResponse({ status: 201, type: ShowtimeResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Permissions(AdminPermission.MANAGE_SHOWTIMES)
  create(@Body() dto: CreateShowtimeDto) {
    return this.showtimesService.create(dto);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: ShowtimeResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Permissions(AdminPermission.MANAGE_SHOWTIMES)
  update(@Param('id') id: string, @Body() dto: UpdateShowtimeDto) {
    return this.showtimesService.update(id, dto);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, type: ShowtimeResponseDto })
  @ApiErrorResponses(401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Permissions(AdminPermission.MANAGE_SHOWTIMES)
  remove(@Param('id') id: string) {
    return this.showtimesService.remove(id);
  }
}

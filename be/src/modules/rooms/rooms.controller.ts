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
import { RoomResponseDto } from '../../common/http/dto/response.dto.js';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import { CreateRoomDto, ListRoomsDto, UpdateRoomDto } from './dto/room.dto.js';
import { RoomsService } from './rooms.service.js';

@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiResponse({ status: 200, type: RoomResponseDto, isArray: true })
  @ApiErrorResponses(400)
  findByCinema(@Query() query: ListRoomsDto) {
    return this.roomsService.findByCinema(query.cinemaId);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: RoomResponseDto })
  @ApiErrorResponses(404)
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }

  @Post()
  @ApiResponse({ status: 201, type: RoomResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateRoomDto) {
    return this.roomsService.create(dto);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: RoomResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.roomsService.update(id, dto);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, type: RoomResponseDto })
  @ApiErrorResponses(401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.roomsService.remove(id);
  }
}

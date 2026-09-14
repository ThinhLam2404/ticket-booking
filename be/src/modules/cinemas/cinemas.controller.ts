import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CinemaDetailsResponseDto,
  CinemaResponseDto,
} from '../../common/http/dto/response.dto.js';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import { CreateCinemaDto, UpdateCinemaDto } from './dto/cinema.dto.js';
import { CinemasService } from './cinemas.service.js';

@ApiTags('cinemas')
@Controller('cinemas')
export class CinemasController {
  constructor(private readonly cinemasService: CinemasService) {}

  @Get()
  @ApiResponse({ status: 200, type: CinemaResponseDto, isArray: true })
  findAll() {
    return this.cinemasService.findAll();
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: CinemaDetailsResponseDto })
  @ApiErrorResponses(404)
  findOne(@Param('id') id: string) {
    return this.cinemasService.findOne(id);
  }

  @Post()
  @ApiResponse({ status: 201, type: CinemaResponseDto })
  @ApiErrorResponses(400, 401, 403, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateCinemaDto) {
    return this.cinemasService.create(dto);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: CinemaResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateCinemaDto) {
    return this.cinemasService.update(id, dto);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, type: CinemaResponseDto })
  @ApiErrorResponses(401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.cinemasService.remove(id);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
} from '../../common/http/swagger.decorators.js';
import {
  MovieDetailsResponseDto,
  MovieResponseDto,
  PaginatedMoviesResponseDto,
} from '../../common/http/dto/response.dto.js';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import { CreateMovieDto } from './dto/create-movie.dto.js';
import {
  ListAdminMoviesDto,
  ListMoviesDto,
} from './dto/list-movies.dto.js';
import { UpdateMovieDto } from './dto/update-movie.dto.js';
import {
  ListTmdbMoviesDto,
  PaginatedTmdbMoviesResponseDto,
  TmdbMovieImportResponseDto,
} from './dto/tmdb-movie.dto.js';
import { MoviesService } from './movies.service.js';

@ApiTags('movies')
@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Get()
  @ApiResponse({ status: 200, type: PaginatedMoviesResponseDto })
  @ApiErrorResponses(400)
  findAll(@Query() query: ListMoviesDto) {
    return this.moviesService.findAll(query);
  }

  @Get('admin')
  @ApiResponse({ status: 200, type: PaginatedMoviesResponseDto })
  @ApiErrorResponses(400, 401, 403)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllAdmin(@Query() query: ListAdminMoviesDto) {
    return this.moviesService.findAllAdmin(query);
  }

  @Get('admin/tmdb')
  @ApiResponse({ status: 200, type: PaginatedTmdbMoviesResponseDto })
  @ApiErrorResponses(400, 401, 403, 502, 503, 504)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findTmdb(@Query() query: ListTmdbMoviesDto) {
    return this.moviesService.findTmdb(query);
  }

  @Put('admin/tmdb/:tmdbId/import')
  @ApiResponse({ status: 200, type: TmdbMovieImportResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409, 502, 503, 504)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  importTmdb(@Param('tmdbId', ParseIntPipe) tmdbId: number) {
    return this.moviesService.importTmdbMovie(tmdbId);
  }

  @Put('admin/tmdb/:tmdbId/resync')
  @ApiResponse({ status: 200, type: MovieResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 502, 503, 504)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  resyncTmdb(@Param('tmdbId', ParseIntPipe) tmdbId: number) {
    return this.moviesService.resyncTmdbMovie(tmdbId);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: MovieDetailsResponseDto })
  @ApiErrorResponses(404)
  findOne(@Param('id') id: string, @Query() query: ListMoviesDto) {
    return this.moviesService.findOne(id, query.provinceCode);
  }

  @Post()
  @ApiResponse({ status: 201, type: MovieResponseDto })
  @ApiErrorResponses(400, 401, 403, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateMovieDto) {
    return this.moviesService.create(dto);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: MovieResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateMovieDto) {
    return this.moviesService.update(id, dto);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, type: MovieResponseDto })
  @ApiErrorResponses(401, 403, 404)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  archive(@Param('id') id: string) {
    return this.moviesService.archive(id);
  }
}

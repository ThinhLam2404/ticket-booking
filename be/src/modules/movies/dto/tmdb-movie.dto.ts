import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MovieResponseDto } from '../../../common/http/dto/response.dto.js';

export class ListTmdbMoviesDto {
  @ApiPropertyOptional({ example: 'Dune' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ type: Number, example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  page = 1;
}

export class TmdbMovieResponseDto {
  @ApiProperty({ type: Number, example: 693134 })
  tmdbId!: number;

  @ApiProperty({ example: 'Dune: Part Two' })
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Paul Atreides...' })
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'https://image.tmdb.org/t/p/w500/poster.jpg' })
  posterUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg' })
  backdropUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '2024-02-27' })
  releaseDate?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 8.7 })
  rating?: number | null;

  @ApiProperty({ example: false })
  imported!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'clx-movie-id' })
  importedMovieId?: string | null;
}

export class TmdbPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ example: 5 })
  totalPages!: number;
}

export class PaginatedTmdbMoviesResponseDto {
  @ApiProperty({ type: [TmdbMovieResponseDto] })
  data!: TmdbMovieResponseDto[];

  @ApiProperty({ type: TmdbPaginationMetaDto })
  meta!: TmdbPaginationMetaDto;
}

export class TmdbMovieImportResponseDto {
  @ApiProperty({ type: () => MovieResponseDto })
  movie!: MovieResponseDto;

  @ApiProperty({ example: true })
  imported!: boolean;
}

import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { MovieStatus } from '@prisma/client';

export class ListShowtimesDto {
  @ApiPropertyOptional({ example: 'clx123movie' })
  @IsOptional()
  @IsString()
  movieId?: string;

  @ApiPropertyOptional({ example: 'clx123cinema' })
  @IsOptional()
  @IsString()
  cinemaId?: string;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-02T00:00:00.000Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ type: Number, example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class ListAdminShowtimesDto extends ListShowtimesDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: true,
    description: 'Include showtimes that have already started',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includePast = true;

  @ApiPropertyOptional({
    enum: MovieStatus,
    description: 'Filter by the linked movie status',
  })
  @IsOptional()
  @IsEnum(MovieStatus)
  status?: MovieStatus;
}

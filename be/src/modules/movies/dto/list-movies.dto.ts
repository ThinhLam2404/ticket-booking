import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MovieStatus } from '@prisma/client';

export class ListMoviesDto {
  @ApiPropertyOptional({
    example: 'interstellar',
    description: 'Search by movie title',
  })
  @IsOptional()
  @IsString()
  search?: string;

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

export class ListAdminMoviesDto extends ListMoviesDto {
  @ApiPropertyOptional({ enum: MovieStatus, example: MovieStatus.PUBLISHED })
  @IsOptional()
  @IsEnum(MovieStatus)
  status?: MovieStatus;
}

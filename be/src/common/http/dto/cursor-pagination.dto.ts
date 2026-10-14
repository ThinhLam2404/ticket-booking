import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CursorPaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Opaque cursor returned by the previous page.',
    maxLength: 512,
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  after?: string;

  @ApiPropertyOptional({
    description: 'Opaque cursor returned by the next page when moving backwards.',
    maxLength: 512,
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  before?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

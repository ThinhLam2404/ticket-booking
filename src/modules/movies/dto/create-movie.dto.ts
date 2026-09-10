import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MovieStatus } from '@prisma/client';

export class CreateMovieDto {
  @ApiProperty({ example: 'Interstellar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    example: 'A science fiction film about space exploration.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: 169, description: 'Duration in minutes' })
  @IsInt()
  @Min(1)
  @Max(600)
  duration!: number;

  @ApiPropertyOptional({ enum: MovieStatus, default: MovieStatus.DRAFT })
  @IsOptional()
  @IsEnum(MovieStatus)
  status?: MovieStatus;
}

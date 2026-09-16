import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
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

  @ApiPropertyOptional({
    type: String,
    example: 'https://cdn.example.com/posters/interstellar.jpg',
    format: 'uri',
    nullable: true,
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  posterUrl?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'https://cdn.example.com/backdrops/interstellar.jpg',
    format: 'uri',
    nullable: true,
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  backdropUrl?: string | null;

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

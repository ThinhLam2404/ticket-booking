import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
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

  @ApiPropertyOptional({
    type: String,
    example: 'Way9Dexny3w',
    nullable: true,
    description: 'YouTube trailer video key',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{11}$/)
  trailerKey?: string | null;

  @ApiPropertyOptional({ type: String, example: '2024-02-27', format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  releaseDate?: string | null;

  @ApiPropertyOptional({ type: Number, example: 8.7, minimum: 0, maximum: 10, nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(10)
  rating?: number | null;

  @ApiPropertyOptional({ type: [String], example: ['Hành động', 'Khoa học viễn tưởng'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  genres?: string[];

  @ApiPropertyOptional({ type: String, example: 'T13', nullable: true, maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ageRating?: string | null;

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

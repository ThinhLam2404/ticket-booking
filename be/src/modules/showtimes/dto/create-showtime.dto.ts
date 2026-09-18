import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateShowtimeDto {
  @ApiProperty({ example: 'clx123movie' })
  @IsString()
  @IsNotEmpty()
  movieId!: string;

  @ApiProperty({ example: 'clx123room' })
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @ApiProperty({ example: '2026-10-01T19:00:00.000Z' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ example: '2026-10-01T21:49:00.000Z' })
  @IsDateString()
  endsAt!: string;

  @ApiProperty({
    example: 100000,
    description: 'Base price for standard seats',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice!: number;

  @ApiPropertyOptional({ example: 1.1, description: 'VIP price multiplier, defaults to 1.1' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  vipMultiplier?: number;

  @ApiPropertyOptional({
    example: 1.2,
    description: 'Couple seat price multiplier applied after the VIP multiplier, defaults to 1.2',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  coupleMultiplier?: number;
}

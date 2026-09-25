import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShowtimeFormat } from '@prisma/client';
import {
  IsDateString,
  IsNotEmpty,
  IsEnum,
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

  @ApiProperty({ example: '2026-10-01T19:00:00+07:00', format: 'date-time' })
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional({ enum: ShowtimeFormat, default: ShowtimeFormat.TWO_D_SUBTITLED })
  @IsOptional()
  @IsEnum(ShowtimeFormat)
  format?: ShowtimeFormat = ShowtimeFormat.TWO_D_SUBTITLED;

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

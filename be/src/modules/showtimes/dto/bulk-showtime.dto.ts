import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShowtimeFormat } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class BulkShowtimeDto {
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
  firstStartsAt!: string;

  @ApiPropertyOptional({ enum: ShowtimeFormat, default: ShowtimeFormat.TWO_D_SUBTITLED })
  @IsOptional()
  @IsEnum(ShowtimeFormat)
  format?: ShowtimeFormat = ShowtimeFormat.TWO_D_SUBTITLED;

  @ApiProperty({ example: 5, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;

  @ApiProperty({ example: 20, minimum: 0, maximum: 180, description: 'Minutes between the end of one showtime and the start of the next' })
  @IsInt()
  @Min(0)
  @Max(180)
  turnaroundMinutes!: number;

  @ApiPropertyOptional({ example: 100000, description: 'Base price override for standard seats; omitted values use the centralized pricing policy' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice?: number;

  @ApiPropertyOptional({ example: 1.1, description: 'VIP price multiplier, defaults to 1.1' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  vipMultiplier?: number;

  @ApiPropertyOptional({ example: 1.2, description: 'Couple price multiplier applied after the VIP multiplier, defaults to 1.2' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  coupleMultiplier?: number;
}

export class BulkShowtimeConflictDto {
  @ApiProperty({ example: '2026-10-01T14:00:00.000Z', format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ example: '2026-10-01T16:00:00.000Z', format: 'date-time' })
  endsAt!: string;
}

export const BULK_SLOT_REASON_CODES = [
  'SHOWTIME_OVERLAP',
  'SHOWTIME_OUTSIDE_HOURS',
] as const;

export type BulkSlotReasonCode = (typeof BULK_SLOT_REASON_CODES)[number];

export class BulkShowtimeSlotResponseDto {
  @ApiProperty({ example: 1 })
  index!: number;

  @ApiProperty({ example: '2026-10-01T19:00:00.000Z', format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ example: '2026-10-01T21:00:00.000Z', format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ example: true })
  available!: boolean;

  @ApiPropertyOptional({
    enum: BULK_SLOT_REASON_CODES,
    example: 'SHOWTIME_OVERLAP',
  })
  reasonCode?: BulkSlotReasonCode;

  @ApiPropertyOptional({ type: [BulkShowtimeConflictDto] })
  conflicts?: BulkShowtimeConflictDto[];
}

export class BulkShowtimePreviewResponseDto {
  @ApiProperty({ example: 'clx123movie' })
  movieId!: string;

  @ApiProperty({ example: 'clx123room' })
  roomId!: string;

  @ApiProperty({ example: 120 })
  durationMinutes!: number;

  @ApiProperty({ type: [BulkShowtimeSlotResponseDto] })
  slots!: BulkShowtimeSlotResponseDto[];

  @ApiProperty({ example: true })
  valid!: boolean;
}

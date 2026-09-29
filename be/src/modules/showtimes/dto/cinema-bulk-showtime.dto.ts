import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoomFormat, ShowtimeFormat } from '@prisma/client';
import { ShowtimePricingQuotePricesDto } from './pricing-quote.dto.js';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CinemaBulkShowtimeDto {
  @ApiProperty({ example: 'clx123movie' })
  @IsString()
  @IsNotEmpty()
  movieId!: string;

  @ApiProperty({ example: 'clx123cinema' })
  @IsString()
  @IsNotEmpty()
  cinemaId!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ example: 6, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;

  @ApiPropertyOptional({ example: 12345, description: 'Seed để preview và commit cho cùng một kết quả' })
  @IsOptional()
  @IsInt()
  randomSeed?: number;

  @ApiPropertyOptional({ enum: ShowtimeFormat, default: ShowtimeFormat.TWO_D_SUBTITLED })
  @IsOptional()
  @IsEnum(ShowtimeFormat)
  format?: ShowtimeFormat = ShowtimeFormat.TWO_D_SUBTITLED;

  @ApiProperty({ example: 20, minimum: 0, maximum: 180 })
  @IsInt()
  @Min(0)
  @Max(180)
  turnaroundMinutes!: number;

  @ApiPropertyOptional({ example: 100000, description: 'Base price override for standard seats; omitted values use the centralized pricing policy' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice?: number;

  @ApiPropertyOptional({ example: 1.1 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  vipMultiplier?: number;

  @ApiPropertyOptional({ example: 1.2 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  coupleMultiplier?: number;
}

export class CinemaBulkAssignmentDto {
  @ApiProperty({ example: 'clx123room' })
  roomId!: string;

  @ApiProperty({ example: 'Phòng IMAX' })
  roomName!: string;

  @ApiProperty({ enum: RoomFormat, example: RoomFormat.IMAX })
  roomFormat!: RoomFormat;

  @ApiProperty({ example: 'WEEKEND', enum: ['WEEKDAY', 'WEEKEND'] })
  pricingDayType!: 'WEEKDAY' | 'WEEKEND';

  @ApiProperty({ example: 190000 })
  basePrice!: number;

  @ApiProperty({ example: 1.1 })
  vipMultiplier!: number;

  @ApiProperty({ example: 1.2 })
  coupleMultiplier!: number;

  @ApiProperty({ type: ShowtimePricingQuotePricesDto })
  prices!: ShowtimePricingQuotePricesDto;

  @ApiProperty({ example: '2026-10-01T12:00:00.000Z', format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ example: '2026-10-01T14:49:00.000Z', format: 'date-time' })
  endsAt!: string;
}

export class CinemaFreeSlotDto {
  @ApiProperty({ example: 'clx123room' })
  roomId!: string;

  @ApiProperty({ example: 'Phòng IMAX' })
  roomName!: string;

  @ApiProperty({ enum: RoomFormat, example: RoomFormat.IMAX })
  roomFormat!: RoomFormat;

  @ApiProperty({ example: '2026-10-01T12:00:00.000Z', format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ example: '2026-10-01T14:49:00.000Z', format: 'date-time' })
  endsAt!: string;
}

export class CinemaRoomFreeSlotsDto {
  @ApiProperty({ example: 'clx123room' })
  roomId!: string;

  @ApiProperty({ example: 'Phòng IMAX' })
  roomName!: string;

  @ApiProperty({ enum: RoomFormat, example: RoomFormat.IMAX })
  roomFormat!: RoomFormat;

  @ApiProperty({ type: [CinemaFreeSlotDto] })
  freeSlots!: CinemaFreeSlotDto[];
}

export class CinemaFreeSlotsResponseDto {
  @ApiProperty({ example: 'clx123cinema' })
  cinemaId!: string;

  @ApiProperty({ example: '2026-10-01' })
  date!: string;

  @ApiProperty({ example: 6 })
  schedulableCount!: number;

  @ApiProperty({ type: [CinemaRoomFreeSlotsDto] })
  rooms!: CinemaRoomFreeSlotsDto[];
}

export class CinemaBulkShortageDto {
  @ApiProperty({ example: 'clx123room' })
  roomId!: string;

  @ApiProperty({ example: 'Phòng IMAX' })
  roomName!: string;

  @ApiProperty({ example: 2 })
  availableSlots!: number;

  @ApiProperty({ example: 2 })
  assignedSlots!: number;
}

export class CinemaBulkPreviewResponseDto {
  @ApiProperty({ example: 'clx123movie' })
  movieId!: string;

  @ApiProperty({ example: 'clx123cinema' })
  cinemaId!: string;

  @ApiProperty({ example: '2026-10-01' })
  date!: string;

  @ApiProperty({ example: 6 })
  requestedCount!: number;

  @ApiProperty({ example: 6 })
  schedulableCount!: number;

  @ApiProperty({ example: true })
  valid!: boolean;

  @ApiProperty({ type: [CinemaBulkAssignmentDto] })
  assignments!: CinemaBulkAssignmentDto[];

  @ApiProperty({ type: [CinemaBulkShortageDto] })
  shortages!: CinemaBulkShortageDto[];
}

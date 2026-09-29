import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoomFormat, ShowtimeFormat } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class ShowtimePricingQuoteDto {
  @ApiProperty({ enum: RoomFormat, example: RoomFormat.IMAX })
  @IsEnum(RoomFormat)
  roomFormat!: RoomFormat;

  @ApiProperty({ enum: ShowtimeFormat, example: ShowtimeFormat.THREE_D_SUBTITLED })
  @IsEnum(ShowtimeFormat)
  showtimeFormat!: ShowtimeFormat;

  @ApiProperty({ example: '2026-10-02T19:00:00+07:00', format: 'date-time' })
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional({ example: 190000, description: 'Giá cơ bản override; bỏ trống để dùng pricing policy' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice?: number;

  @ApiPropertyOptional({ example: 1.1, description: 'Hệ số VIP override; mặc định 1.1' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  vipMultiplier?: number;

  @ApiPropertyOptional({ example: 1.2, description: 'Hệ số ghế đôi override; mặc định 1.2' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  coupleMultiplier?: number;
}

export class ShowtimePricingQuotePricesDto {
  @ApiProperty({ example: 190000 })
  standard!: number;

  @ApiProperty({ example: 209000 })
  vip!: number;

  @ApiProperty({ example: 250800 })
  couple!: number;
}

export class ShowtimePricingQuoteOverridesDto {
  @ApiProperty({ example: false })
  basePrice!: boolean;

  @ApiProperty({ example: false })
  vipMultiplier!: boolean;

  @ApiProperty({ example: false })
  coupleMultiplier!: boolean;
}

export class ShowtimePricingQuoteResponseDto {
  @ApiProperty({ enum: RoomFormat, example: RoomFormat.IMAX })
  roomFormat!: RoomFormat;

  @ApiProperty({ enum: ShowtimeFormat, example: ShowtimeFormat.THREE_D_SUBTITLED })
  showtimeFormat!: ShowtimeFormat;

  @ApiProperty({ enum: ['WEEKDAY', 'WEEKEND'], example: 'WEEKEND' })
  pricingDayType!: 'WEEKDAY' | 'WEEKEND';

  @ApiProperty({ example: 190000 })
  basePrice!: number;

  @ApiProperty({ example: 1.1 })
  vipMultiplier!: number;

  @ApiProperty({ example: 1.2 })
  coupleMultiplier!: number;

  @ApiProperty({ type: ShowtimePricingQuotePricesDto })
  prices!: ShowtimePricingQuotePricesDto;

  @ApiProperty({ type: ShowtimePricingQuoteOverridesDto })
  overridden!: ShowtimePricingQuoteOverridesDto;
}

export type ShowtimePricingQuoteInput = ShowtimePricingQuoteDto;

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { VoucherDiscountType, VoucherScope } from '@prisma/client';

const VOUCHER_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

export class CreateVoucherDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(VOUCHER_CODE_PATTERN)
  code!: string;

  @ApiProperty({ enum: VoucherDiscountType })
  @IsEnum(VoucherDiscountType)
  discountType!: VoucherDiscountType;

  @ApiProperty({ enum: VoucherScope })
  @IsEnum(VoucherScope)
  scope!: VoucherScope;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100000000)
  value!: number;

  @ApiPropertyOptional({ type: Number, example: 200000, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimumSpend?: number;

  @ApiPropertyOptional({ type: Number, example: 50000, nullable: true })
  @IsOptional()
  @Min(0)
  maximumDiscount?: number | null;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  usageLimit?: number;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cinemaIds?: string[];
}

export class UpdateVoucherDto extends PartialType(CreateVoucherDto) {}

export class AssignVoucherDto {
  @ApiPropertyOptional({ type: [String], description: 'Bỏ trống để phát cho toàn bộ khách hàng' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @ApiPropertyOptional({ example: 1, default: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  usageLimit?: number;
}

export class AssignVoucherResponseDto {
  @ApiProperty() voucherId!: string;
  @ApiProperty() assignedCount!: number;
  @ApiProperty() skippedCount!: number;
  @ApiProperty() usageLimit!: number;
}

export class VoucherCodeDto {
  @ApiPropertyOptional({ type: String, example: 'WELCOME10', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string | null;
}

export class VoucherResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: VoucherDiscountType }) discountType!: VoucherDiscountType;
  @ApiProperty({ enum: VoucherScope }) scope!: VoucherScope;
  @ApiProperty() value!: string;
  @ApiProperty() minimumSpend!: string;
  @ApiProperty({ type: String, nullable: true }) maximumDiscount!: string | null;
  @ApiProperty({ format: 'date-time' }) startsAt!: string;
  @ApiProperty({ format: 'date-time' }) endsAt!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty() usageLimit!: number;
  @ApiProperty() assignedUserCount!: number;
  @ApiProperty() revision!: number;
  @ApiProperty({ type: [String] }) cinemaIds!: string[];
}

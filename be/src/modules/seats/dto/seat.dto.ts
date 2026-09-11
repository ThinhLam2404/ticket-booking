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
import { SeatType } from '@prisma/client';

export class CreateSeatDto {
  @ApiProperty({ example: 'A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3)
  row!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(100)
  number!: number;

  @ApiPropertyOptional({ enum: SeatType })
  @IsOptional()
  @IsEnum(SeatType)
  type?: SeatType;
}

export class UpdateSeatDto {
  @ApiPropertyOptional({ enum: SeatType })
  @IsOptional()
  @IsEnum(SeatType)
  type?: SeatType;
}

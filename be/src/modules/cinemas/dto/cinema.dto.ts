import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PROVINCE_CODES } from '../../locations/provinces.js';

export class CreateCinemaDto {
  @ApiProperty({ example: 'CGV Landmark 81' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: '208 Nguyen Huu Canh, Ho Chi Minh City' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address!: string;

  @ApiProperty({ example: 79, description: 'Vietnamese province or city code' })
  @IsInt()
  @IsIn(PROVINCE_CODES)
  provinceCode!: number;
}

export class UpdateCinemaDto {
  @ApiPropertyOptional({ example: 'CGV Landmark 81' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: '208 Nguyen Huu Canh, Ho Chi Minh City' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 79, description: 'Vietnamese province or city code' })
  @IsOptional()
  @IsInt()
  @IsIn(PROVINCE_CODES)
  provinceCode?: number;
}

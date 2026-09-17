import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { PROVINCE_CODES } from '../../locations/provinces.js';

export class ListCinemasDto {
  @ApiPropertyOptional({ type: Number, example: 79 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(PROVINCE_CODES)
  provinceCode?: number;
}

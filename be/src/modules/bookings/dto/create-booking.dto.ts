import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ComboSelectionDto } from '../../combos/combo.dto.js';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  IsOptional,
  ValidateNested,
} from 'class-validator';

export class CreateBookingDto {
  @ApiPropertyOptional({ type: [ComboSelectionDto], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique((item: ComboSelectionDto) => item.cinemaComboId)
  @ValidateNested({ each: true })
  @Type(() => ComboSelectionDto)
  combos?: ComboSelectionDto[];
  @ApiProperty({ example: 'clx123showtime' })
  @IsString()
  @IsNotEmpty()
  showtimeId!: string;

  @ApiProperty({
    example: ['clx123showtimeSeatA1', 'clx123showtimeSeatA2'],
    type: [String],
    minItems: 1,
    maxItems: 10,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  showtimeSeatIds!: string[];
}

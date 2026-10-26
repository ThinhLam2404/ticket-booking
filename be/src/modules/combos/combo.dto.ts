import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateComboDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateComboDto extends PartialType(CreateComboDto) {}
export class CinemaComboDto {
  @ApiProperty({ example: 99000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(99999999.99)
  price!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
export class ComboSelectionDto {
  @ApiProperty() @IsString() @IsNotEmpty() cinemaComboId!: string;
  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;
}
export class ComboResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty() active!: boolean;
}
export class CinemaComboResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() cinemaId!: string;
  @ApiProperty() comboId!: string;
  @ApiProperty({ example: '99000.00' }) price!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: ComboResponseDto }) combo!: ComboResponseDto;
}

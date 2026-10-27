import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ManualConfirmDto {
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;
}

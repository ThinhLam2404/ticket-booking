import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ManualConfirmDto {
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  adminNote?: string;
}

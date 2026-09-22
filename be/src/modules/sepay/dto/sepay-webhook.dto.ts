import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SepayWebhookDto {
  @ApiProperty()
  @IsInt()
  @Type(() => Number)
  id!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  gateway!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  transactionDate!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  transferType!: string;

  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  transferAmount!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  referenceCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subAccount?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  accumulated?: number;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminBookingsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: BookingStatus }) @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 20;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RefundBookingDto {
  @ApiProperty({ example: 'Khách yêu cầu hoàn tiền do thay đổi lịch.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ example: 'Đã xác nhận qua hotline.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;
}

export class RefundResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  bookingId!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty()
  adminId!: string;

  @ApiProperty()
  createdAt!: string;
}

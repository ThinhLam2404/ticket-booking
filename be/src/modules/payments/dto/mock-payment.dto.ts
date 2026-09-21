import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateBookingDto } from '../../bookings/dto/create-booking.dto.js';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

class PaymentAttemptDto {
  @ApiPropertyOptional({ example: 'MOCK-PAYMENT-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  success?: boolean;

  @ApiPropertyOptional({
    example: 'payment-attempt-001',
    minLength: 8,
    maxLength: 100,
    description: 'Use the same key when retrying the same payment request',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey?: string;
}

export class MockPaymentDto extends PaymentAttemptDto {}

export class PurchaseSeatsDto extends CreateBookingDto {
  @ApiPropertyOptional({ example: 'MOCK-PURCHASE-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  success?: boolean;

  @ApiPropertyOptional({
    example: 'purchase-attempt-001',
    minLength: 8,
    maxLength: 100,
    description: 'Use the same key when retrying the same purchase request',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey?: string;
}

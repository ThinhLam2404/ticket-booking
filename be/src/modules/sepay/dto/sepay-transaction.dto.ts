import { ApiProperty } from '@nestjs/swagger';
import { SepayTransactionStatus } from '@prisma/client';

export class SepayTransactionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sepayId!: number;

  @ApiProperty()
  gateway!: string;

  @ApiProperty()
  accountNumber!: string;

  @ApiProperty()
  transferAmount!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ nullable: true })
  referenceCode!: string | null;

  @ApiProperty()
  transferType!: string;

  @ApiProperty()
  transactionDate!: string;

  @ApiProperty({ enum: SepayTransactionStatus })
  status!: SepayTransactionStatus;

  @ApiProperty({ nullable: true })
  adminNote!: string | null;

  @ApiProperty({ nullable: true })
  paymentIntentId!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class UpdateTransactionStatusDto {
  @ApiProperty({ enum: ['REVIEW_REQUIRED', 'REFUNDED', 'CONFIRMED'] })
  status!: 'REVIEW_REQUIRED' | 'REFUNDED' | 'CONFIRMED';

  @ApiProperty({ required: false })
  adminNote?: string;
}

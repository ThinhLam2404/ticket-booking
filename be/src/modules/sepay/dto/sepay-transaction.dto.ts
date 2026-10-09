import { ApiProperty } from '@nestjs/swagger';
import { SepayTransactionStatus, BookingStatus } from '@prisma/client';

export class AdminBookingSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: BookingStatus })
  status!: BookingStatus;

  @ApiProperty()
  totalAmount!: string;

  @ApiProperty()
  userEmail!: string;

  @ApiProperty()
  movieTitle!: string;

  @ApiProperty()
  showtimeStartsAt!: string;

  @ApiProperty({ type: [String] })
  seatLabels!: string[];
}

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

  @ApiProperty({ nullable: true, type: AdminBookingSummaryDto })
  booking?: AdminBookingSummaryDto | null;

  @ApiProperty()
  createdAt!: string;
}

export class UpdateTransactionStatusDto {
  @ApiProperty({ enum: ['REVIEW_REQUIRED', 'REFUNDED', 'CONFIRMED'] })
  status!: 'REVIEW_REQUIRED' | 'REFUNDED' | 'CONFIRMED';

  @ApiProperty({ required: false })
  adminNote?: string;
}

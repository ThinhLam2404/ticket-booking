import { ApiProperty } from '@nestjs/swagger';

export class SepayCheckoutResponseDto {
  @ApiProperty()
  intentId!: string;

  @ApiProperty()
  paymentCode!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  bankCode!: string;

  @ApiProperty()
  accountNumber!: string;

  @ApiProperty()
  accountName!: string;

  @ApiProperty()
  qrUrl!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty()
  status!: string;
}

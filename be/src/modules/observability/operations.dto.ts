import { ApiProperty } from '@nestjs/swagger';

export class MailOutboxOperationsDto {
  @ApiProperty({ example: 2 })
  pending!: number;

  @ApiProperty({ example: 1 })
  failed!: number;

  @ApiProperty({ example: 120 })
  oldestPendingSeconds!: number;
}

export class PaymentOperationsDto {
  @ApiProperty({ example: 1 })
  reviewRequired!: number;
}

export class MailWorkerOperationsDto {
  @ApiProperty({
    enum: ['disabled', 'starting', 'up', 'restarting', 'stopping'],
    example: 'up',
  })
  status!: 'disabled' | 'starting' | 'up' | 'restarting' | 'stopping';

  @ApiProperty({ example: 0 })
  restartsLast5Minutes!: number;
}

export class OperationsStatusDto {
  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  database!: 'down' | 'up';

  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  redis!: 'down' | 'up';

  @ApiProperty({ type: MailWorkerOperationsDto })
  mailWorker!: MailWorkerOperationsDto;

  @ApiProperty({ type: MailOutboxOperationsDto })
  mailOutbox!: MailOutboxOperationsDto;

  @ApiProperty({ type: PaymentOperationsDto })
  payments!: PaymentOperationsDto;

  @ApiProperty({ example: '2026-10-02T08:00:00.000Z', format: 'date-time' })
  timestamp!: string;
}

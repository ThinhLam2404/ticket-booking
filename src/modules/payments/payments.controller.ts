import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { MockPaymentDto } from './dto/mock-payment.dto.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('mock/:bookingId')
  processMockPayment(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: MockPaymentDto,
    @Headers('idempotency-key') headerIdempotencyKey?: string,
  ) {
    dto.idempotencyKey = headerIdempotencyKey?.trim() || dto.idempotencyKey;
    if (!dto.idempotencyKey) {
      throw new BadRequestException('Payment idempotency key is required');
    }
    return this.paymentsService.processMockPayment(user.id, bookingId, dto);
  }
}

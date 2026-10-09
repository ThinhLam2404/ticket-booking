import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SepayTransactionStatus } from '@prisma/client';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { SepayCheckoutResponseDto } from './dto/sepay-checkout.dto.js';
import {
  SepayTransactionResponseDto,
  UpdateTransactionStatusDto,
} from './dto/sepay-transaction.dto.js';
import { SepayWebhookDto } from './dto/sepay-webhook.dto.js';
import { SepayWebhookGuard } from './sepay-webhook.guard.js';
import { RefundBookingDto, RefundResponseDto } from './dto/refund.dto.js';
import { ManualConfirmDto } from './dto/manual-confirm.dto.js';
import { SepayService } from './sepay.service.js';

@ApiTags('payments')
@Controller('payments')
export class SepayController {
  constructor(private readonly sepayService: SepayService) {}

  @Post('bookings/:bookingId/checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 201, type: SepayCheckoutResponseDto })
  @ApiErrorResponses(401, 404, 409)
  checkout(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.sepayService.checkout(user.id, bookingId);
  }

  @Post('sepay/webhook')
  @UseGuards(SepayWebhookGuard)
  @ApiBody({ type: SepayWebhookDto })
  @ApiResponse({ status: 201 })
  handleWebhook(@Body() body: Record<string, unknown>) {
    return this.sepayService.handleWebhook(body);
  }

  @Get('admin/sepay/transactions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiResponse({ status: 200, type: SepayTransactionResponseDto, isArray: true })
  @ApiQuery({ name: 'status', required: false, enum: SepayTransactionStatus })
  @ApiErrorResponses(401, 403)
  findTransactions(@Query('status') status?: SepayTransactionStatus) {
    return this.sepayService.findTransactions(status ? { status } : undefined);
  }

  @Post('admin/bookings/:bookingId/refund')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiResponse({ status: 201, type: RefundResponseDto })
  @ApiErrorResponses(401, 403, 404, 409)
  refundBooking(@CurrentUser() user: AuthUser, @Param('bookingId') bookingId: string, @Body() dto: RefundBookingDto) {
    return this.sepayService.refundBooking(user.id, bookingId, dto);
  }

  @Post('admin/sepay/transactions/:id/confirm')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiResponse({ status: 200, type: SepayTransactionResponseDto })
  @ApiErrorResponses(401, 403, 404, 409)
  confirmTransaction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ManualConfirmDto,
  ) {
    return this.sepayService.manualConfirmTransaction(user.id, id, dto);
  }

  @Patch('admin/sepay/transactions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiResponse({ status: 200, type: SepayTransactionResponseDto })
  @ApiErrorResponses(401, 403, 404)
  updateTransaction(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionStatusDto,
  ) {
    return this.sepayService.updateTransactionStatus(id, dto);
  }
}


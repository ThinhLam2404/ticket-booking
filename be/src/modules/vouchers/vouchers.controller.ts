import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminPermission } from '@prisma/client';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { VouchersService } from './vouchers.service.js';
import {
  AssignVoucherDto,
  AssignVoucherResponseDto,
  CreateVoucherDto,
  CustomerVoucherResponseDto,
  UpdateVoucherDto,
  VoucherResponseDto,
} from './voucher.dto.js';

@ApiTags('vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vouchers')
export class CustomerVouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Get('mine')
  @ApiResponse({ status: 200, type: CustomerVoucherResponseDto, isArray: true })
  listMine(@CurrentUser() user: AuthUser) { return this.vouchers.listMine(user.id); }
}

@ApiTags('vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN')
@Permissions(AdminPermission.MANAGE_VOUCHERS)
@Controller('vouchers/admin')
export class VouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Get()
  @ApiResponse({ status: 200, type: VoucherResponseDto, isArray: true })
  list() { return this.vouchers.list(); }


  @Post()
  @ApiResponse({ status: 201, type: VoucherResponseDto })
  create(@Body() dto: CreateVoucherDto) { return this.vouchers.create(dto); }

  @Post(':id/assign')
  @ApiResponse({ status: 201, type: AssignVoucherResponseDto })
  assign(@Param('id') id: string, @Body() dto: AssignVoucherDto) { return this.vouchers.assign(id, dto); }

  @Patch(':id')
  @ApiResponse({ status: 200, type: VoucherResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateVoucherDto) { return this.vouchers.update(id, dto); }
}

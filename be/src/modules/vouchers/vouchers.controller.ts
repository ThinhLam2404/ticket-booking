import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminPermission } from '@prisma/client';
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
  UpdateVoucherDto,
  VoucherResponseDto,
} from './voucher.dto.js';

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

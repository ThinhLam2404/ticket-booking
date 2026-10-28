import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CustomerVouchersController, VouchersController } from './vouchers.controller.js';
import { VouchersService } from './vouchers.service.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [CustomerVouchersController, VouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}

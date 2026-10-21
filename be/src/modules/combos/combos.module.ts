import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CombosController } from './combos.controller.js';
import { CombosService } from './combos.service.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [CombosController],
  providers: [CombosService],
})
export class CombosModule {}

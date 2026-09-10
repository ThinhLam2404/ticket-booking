import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CinemasController } from './cinemas.controller.js';
import { CinemasService } from './cinemas.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CinemasController],
  providers: [CinemasService],
  exports: [CinemasService],
})
export class CinemasModule {}

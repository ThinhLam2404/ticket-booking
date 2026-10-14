import { ApiPropertyOptional } from '@nestjs/swagger';
import { SepayTransactionStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CursorPaginationQueryDto } from '../../../common/http/dto/cursor-pagination.dto.js';

export class ListTransactionsDto extends CursorPaginationQueryDto {
  @ApiPropertyOptional({ enum: SepayTransactionStatus })
  @IsOptional()
  @IsEnum(SepayTransactionStatus)
  status?: SepayTransactionStatus;
}

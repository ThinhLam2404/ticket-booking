import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ApiErrorResponseDto } from './dto/response.dto.js';

export function ApiErrorResponses(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, type: ApiErrorResponseDto }),
    ),
  );
}

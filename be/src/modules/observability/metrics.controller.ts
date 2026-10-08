import {
  Controller,
  Get,
  Headers,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { MetricsService } from './metrics.service.js';
import { OperationsService } from './operations.service.js';

@ApiTags('metrics')
@ApiBearerAuth('metrics')
@ApiProduces('text/plain')
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly config: ConfigService,
    private readonly metricsService: MetricsService,
    private readonly operationsService: OperationsService,
  ) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'Prometheus exposition metrics',
    content: {
      'text/plain': {
        schema: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid metrics token' })
  @ApiResponse({
    status: 503,
    description: 'Metrics endpoint is not configured',
  })
  async metrics(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const configuredToken = this.config.get<string>('METRICS_TOKEN')?.trim();
    if (!configuredToken) {
      throw new ServiceUnavailableException(
        'Metrics endpoint is not configured',
      );
    }

    const suppliedToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!suppliedToken || !this.tokensMatch(configuredToken, suppliedToken)) {
      throw new UnauthorizedException('Invalid metrics token');
    }

    const status = await this.operationsService.getStatus();
    this.metricsService.updateOperationalMetrics({
      databaseUp: status.database === 'up',
      redisUp: status.redis === 'up',
      mailWorkerUp:
        status.mailWorker.status === 'up' ||
        status.mailWorker.status === 'disabled',
      mailOutboxPending: status.mailOutbox.pending,
      mailOutboxFailed: status.mailOutbox.failed,
      mailOutboxOldestPendingSeconds: status.mailOutbox.oldestPendingSeconds,
    });
    response.type(this.metricsService.contentType);
    return this.metricsService.metrics();
  }

  private tokensMatch(expected: string, supplied: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    return (
      expectedBuffer.length === suppliedBuffer.length &&
      timingSafeEqual(expectedBuffer, suppliedBuffer)
    );
  }
}

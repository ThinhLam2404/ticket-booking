import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from '../../common/http/dto/response.dto.js';
import { ApiErrorResponses } from '../../common/http/swagger.decorators.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiResponse({ status: 200, type: HealthResponseDto })
  liveness() {
    return this.healthService.liveness();
  }

  @Get('ready')
  @ApiResponse({ status: 200, type: HealthResponseDto })
  @ApiErrorResponses(503)
  async readiness() {
    const result = await this.healthService.readiness();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}

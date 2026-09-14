import { Controller, Get } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiResponse({ status: 200, schema: { type: 'string', example: 'Hello World!' } })
  getHello(): string {
    return this.appService.getHello();
  }
}

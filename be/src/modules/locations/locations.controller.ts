import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Controller, Get } from '@nestjs/common';
import { ProvinceResponseDto } from './dto/province.dto.js';
import { PROVINCES } from './provinces.js';

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  @Get('provinces')
  @ApiResponse({ status: 200, type: ProvinceResponseDto, isArray: true })
  listProvinces() {
    return PROVINCES;
  }
}

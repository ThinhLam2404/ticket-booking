import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminPermission } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { CombosService } from './combos.service.js';
import {
  CinemaComboDto,
  CinemaComboResponseDto,
  ComboResponseDto,
  CreateComboDto,
  UpdateComboDto,
} from './combo.dto.js';

@ApiTags('combos')
@Controller('combos')
export class CombosController {
  constructor(private readonly combos: CombosService) {}

  @Get('cinemas/:cinemaId')
  @ApiResponse({ status: 200, type: CinemaComboResponseDto, isArray: true })
  menu(@Param('cinemaId') id: string) {
    return this.combos.menu(id);
  }

  @Get('admin/cinemas/:cinemaId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions(AdminPermission.MANAGE_COMBOS)
  @ApiResponse({ status: 200, type: CinemaComboResponseDto, isArray: true })
  adminMenu(@Param('cinemaId') id: string) {
    return this.combos.menu(id, true);
  }

  @Get('admin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions(AdminPermission.MANAGE_COMBOS)
  @ApiResponse({ status: 200, type: ComboResponseDto, isArray: true })
  list() {
    return this.combos.list();
  }

  @Post('admin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions(AdminPermission.MANAGE_COMBOS)
  @ApiResponse({ status: 201, type: ComboResponseDto })
  create(@Body() dto: CreateComboDto) {
    return this.combos.create(dto);
  }

  @Patch('admin/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions(AdminPermission.MANAGE_COMBOS)
  @ApiResponse({ status: 200, type: ComboResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateComboDto) {
    return this.combos.update(id, dto);
  }

  @Put('admin/cinemas/:cinemaId/:comboId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions(AdminPermission.MANAGE_COMBOS)
  @ApiResponse({ status: 200, type: CinemaComboResponseDto })
  setMenu(
    @Param('cinemaId') cinemaId: string,
    @Param('comboId') comboId: string,
    @Body() dto: CinemaComboDto,
  ) {
    return this.combos.setMenu(cinemaId, comboId, dto);
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { AuditService } from '../audit/audit.service.js';
import { CinemaComboDto, CreateComboDto, UpdateComboDto } from './combo.dto.js';

@Injectable()
export class CombosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return toPublicResponse(
      await this.prisma.combo.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  async menu(cinemaId: string, admin = false) {
    return toPublicResponse(
      await this.prisma.cinemaCombo.findMany({
        where: {
          cinemaId,
          ...(!admin && { active: true, combo: { active: true } }),
        },
        include: { combo: true },
        orderBy: { id: 'asc' },
      }),
    );
  }

  async create(dto: CreateComboDto) {
    if (!dto.name.trim() || !dto.description.trim())
      throw new BadRequestException('Combo name and description are required');
    return this.prisma.$transaction(async (tx) => {
      const combo = await tx.combo.create({
        data: {
          ...dto,
          name: dto.name.trim(),
          description: dto.description.trim(),
        },
      });
      await this.audit.record(
        {
          action: 'COMBO_CREATED',
          resourceType: 'Combo',
          resourceId: combo.id,
          after: combo,
        },
        tx,
      );
      return toPublicResponse(combo);
    });
  }

  async update(id: string, dto: UpdateComboDto) {
    if (
      (dto.name !== undefined && !dto.name?.trim()) ||
      (dto.description !== undefined && !dto.description?.trim())
    )
      throw new BadRequestException('Combo name and description are required');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.combo.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Combo not found');
      const combo = await tx.combo.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.description !== undefined && {
            description: dto.description.trim(),
          }),
        },
      });
      await this.audit.record(
        {
          action: 'COMBO_UPDATED',
          resourceType: 'Combo',
          resourceId: id,
          before,
          after: combo,
        },
        tx,
      );
      return toPublicResponse(combo);
    });
  }

  async setMenu(cinemaId: string, comboId: string, dto: CinemaComboDto) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.cinema.findUnique({ where: { id: cinemaId } })))
        throw new NotFoundException('Cinema not found');
      if (!(await tx.combo.findUnique({ where: { id: comboId } })))
        throw new NotFoundException('Combo not found');
      const before = await tx.cinemaCombo.findUnique({
        where: { cinemaId_comboId: { cinemaId, comboId } },
      });
      const result = await tx.cinemaCombo.upsert({
        where: { cinemaId_comboId: { cinemaId, comboId } },
        create: { cinemaId, comboId, ...dto },
        update: dto,
        include: { combo: true },
      });
      await this.audit.record(
        {
          action: 'CINEMA_COMBO_UPDATED',
          resourceType: 'CinemaCombo',
          resourceId: result.id,
          before,
          after: result,
        },
        tx,
      );
      return toPublicResponse(result);
    });
  }
}

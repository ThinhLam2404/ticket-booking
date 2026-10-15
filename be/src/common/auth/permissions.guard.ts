import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminPermission } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import { PERMISSIONS_KEY } from './permissions.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<AdminPermission[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user || request.user.role !== 'ADMIN') throw new ForbiddenException('Insufficient permissions');
    const permissions = await this.prisma.userAdminPermission.findMany({ where: { userId: request.user.id, permission: { in: required } }, select: { permission: true } });
    const granted = new Set(permissions.map(({ permission }) => permission));
    if (required.some((permission) => !granted.has(permission))) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}

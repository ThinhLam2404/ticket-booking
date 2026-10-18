import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { ListAdminUsersDto, UpdateUserAccessDto } from './dto/admin-users.dto.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit: AuditService = null as unknown as AuditService) {}

  async findPublicById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return toPublicResponse(user);
  }

  async listAdmin(query: ListAdminUsersDto) {
    const search = query.search?.trim();
    const users = await this.prisma.user.findMany({
      where: {
        ...(search ? { OR: [{ email: { contains: search, mode: 'insensitive' } }, { fullName: { contains: search, mode: 'insensitive' } }] } : {}),
        ...(query.status === 'ACTIVE' ? { disabledAt: null } : query.status === 'DISABLED' ? { disabledAt: { not: null } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { adminPermissions: { select: { permission: true } }, authSessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } } },
    });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      disabledAt: user.disabledAt,
      permissions: user.adminPermissions.map(({ permission }) => permission),
      activeSessionCount: user.authSessions.length,
      createdAt: user.createdAt,
    }));
  }

  async listSessions(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userId: true, createdAt: true, expiresAt: true },
    });
  }

  async revokeSession(actor: { id: string; email: string }, userId: string, sessionId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    const revokedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.authSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt } });
      if (result.count === 0) throw new NotFoundException('Session not found');
      await transaction.refreshToken.updateMany({ where: { familyId: sessionId, userId, revokedAt: null }, data: { revokedAt } });
      if (this.audit) await this.audit.record({ actor, action: 'ADMIN_SESSION_REVOKED', resourceType: 'AuthSession', resourceId: sessionId, after: { id: sessionId, count: 1 } }, transaction);
    });
  }

  async revokeAllSessions(actor: { id: string; email: string }, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    const revokedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const sessions = await transaction.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt } });
      await transaction.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt } });
      if (this.audit) await this.audit.record({ actor, action: 'ADMIN_SESSIONS_REVOKED_ALL', resourceType: 'User', resourceId: userId, after: { id: userId, count: sessions.count } }, transaction);
    });
  }

  async updateAccess(actor: { id: string; email: string }, userId: string, dto: UpdateUserAccessDto) {
    if (actor.id === userId && dto.disabled === true) throw new ForbiddenException('You cannot disable your own account');
    const before = await this.prisma.user.findUnique({ where: { id: userId }, include: { adminPermissions: true } });
    if (!before) throw new NotFoundException('User not found');
    const nextRole = dto.role ?? before.role;
    const disabledAt = dto.disabled === undefined ? before.disabledAt : dto.disabled ? new Date() : null;
    const updated = await this.prisma.$transaction(async (transaction) => {
      if (nextRole === UserRole.ADMIN) {
        const actorUser = await transaction.user.findUnique({ where: { id: actor.id }, include: { adminPermissions: true } });
        const allowed = new Set(actorUser?.adminPermissions.map((item) => item.permission));
        const requested = dto.permissions ?? before.adminPermissions.map((item) => item.permission);
        if (!actorUser || actorUser.disabledAt || actorUser.role !== UserRole.ADMIN || !allowed.has('MANAGE_USERS') || requested.some((permission) => !allowed.has(permission))) {
          throw new ForbiddenException('You cannot grant permissions you do not have');
        }
      }
      const user = await transaction.user.update({ where: { id: userId }, data: { role: nextRole, disabledAt } });
      if (dto.permissions !== undefined || nextRole !== UserRole.ADMIN) {
        await transaction.userAdminPermission.deleteMany({ where: { userId } });
        if (nextRole === UserRole.ADMIN && dto.permissions?.length) {
          await transaction.userAdminPermission.createMany({ data: dto.permissions.map((permission) => ({ userId, permission })), skipDuplicates: true });
        }
      }
      if (disabledAt || nextRole !== UserRole.ADMIN) {
        const revokedAt = new Date();
        await transaction.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt } });
        await transaction.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt } });
      }
      await this.audit.record({ actor, action: 'USER_ACCESS_UPDATED', resourceType: 'User', resourceId: userId, before: { id: before.id, role: before.role, disabledAt: before.disabledAt }, after: { id: user.id, role: user.role, disabledAt: user.disabledAt, permission: dto.permissions?.join(',') } }, transaction);
      return user;
    });
    const refreshed = await this.listAdmin({ search: updated.email });
    return refreshed[0] ?? { id: updated.id, role: updated.role, disabledAt: updated.disabledAt, permissions: [], activeSessionCount: 0, email: updated.email, fullName: updated.fullName, createdAt: updated.createdAt };
  }

}

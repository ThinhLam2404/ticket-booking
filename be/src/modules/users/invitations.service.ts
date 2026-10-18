import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminPermission, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../../common/auth/password.js';
import type {
  CreateAdminInvitationDto,
  ListAdminInvitationsDto,
} from './dto/admin-invitation.dto.js';
import type { AcceptAdminInvitationDto } from '../auth/dto/admin-invitation.dto.js';

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

type Actor = { id: string; email: string };

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: Actor, query: ListAdminInvitationsDto) {
    const invitations = await this.prisma.adminInvitation.findMany({
      where: query.search?.trim()
        ? { email: { contains: query.search.trim(), mode: 'insensitive' } }
        : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const outbox =
      invitations.length === 0
        ? []
        : await this.prisma.mailOutbox.findMany({
            where: {
              type: 'ADMIN_INVITATION',
              recipient: { in: invitations.map((item) => item.email) },
            },
            orderBy: { createdAt: 'desc' },
            select: {
              recipient: true,
              dedupeKey: true,
              status: true,
              createdAt: true,
            },
          });
    return invitations.map((item) =>
      this.toResponse(
        item,
        outbox.find((mail) =>
          mail.dedupeKey.startsWith(`ADMIN_INVITATION:${item.id}:`),
        ),
      ),
    );
  }

  async create(actor: Actor, dto: CreateAdminInvitationDto) {
    const email = dto.email.trim().toLowerCase();
    const permissions = Array.from(new Set(dto.permissions));
    const token = randomBytes(32).toString('hex');
    const invitation = await this.prisma.$transaction(async (transaction) => {
      //NOTE - Chống tạo lời mời trùng khi request chạy đồng thời
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))::text`,
      );
      //NOTE - kiểm tra xem admin vẫn còn có thể cấp các quyền đó ko
      await this.assertCanGrant(actor.id, permissions, transaction);
      if (
        await transaction.user.findUnique({
          where: { email },
          select: { id: true },
        })
      )
        throw new ConflictException('Email is already registered');
      const active = await transaction.adminInvitation.findFirst({
        where: {
          email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (active)
        throw new ConflictException(
          'An active invitation already exists for this email',
        );
      const created = await transaction.adminInvitation.create({
        data: {
          email,
          permissions,
          tokenHash: this.mail.hashToken(token),
          invitedById: actor.id,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
      });
      await this.mail.queueAdminInvitationEmail(
        email,
        created.id,
        token,
        permissions,
        transaction,
      );
      await this.audit.record(
        {
          actor,
          action: 'ADMIN_INVITATION_CREATED',
          resourceType: 'AdminInvitation',
          resourceId: created.id,
          after: {
            id: created.id,
            email,
            permissions,
            expiresAt: created.expiresAt,
          },
        },
        transaction,
      );
      return created;
    });
    this.mail.wakeWorker();
    return this.toResponse(invitation);
  }

  async resend(actor: Actor, id: string) {
    const token = randomBytes(32).toString('hex');
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "AdminInvitation" WHERE "id" = ${id} FOR UPDATE`,
      );
      const invitation = await transaction.adminInvitation.findUnique({
        where: { id },
      });
      if (!invitation) throw new NotFoundException('Invitation not found');
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${invitation.email}, 0))::text`,
      );
      await this.assertCanGrant(actor.id, invitation.permissions, transaction);
      if (invitation.acceptedAt || invitation.revokedAt)
        throw new ConflictException('Invitation is no longer active');
      if (Date.now() - invitation.updatedAt.getTime() < RESEND_COOLDOWN_MS)
        throw new ConflictException(
          'Invitation resend is temporarily unavailable',
        );
      const active = await transaction.adminInvitation.findFirst({
        where: {
          email: invitation.email,
          id: { not: id },
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (active)
        throw new ConflictException(
          'An active invitation already exists for this email',
        );
      if (
        await transaction.user.findUnique({
          where: { email: invitation.email },
          select: { id: true },
        })
      )
        throw new ConflictException('Email is already registered');
      const updated = await transaction.adminInvitation.update({
        where: { id },
        data: {
          invitedById: actor.id,
          tokenHash: this.mail.hashToken(token),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
      });
      await this.mail.queueAdminInvitationEmail(
        invitation.email,
        id,
        token,
        invitation.permissions,
        transaction,
      );
      await this.audit.record(
        {
          actor,
          action: 'ADMIN_INVITATION_RESENT',
          resourceType: 'AdminInvitation',
          resourceId: id,
          after: {
            id,
            email: invitation.email,
            permissions: invitation.permissions,
            expiresAt: updated.expiresAt,
          },
        },
        transaction,
      );
      return updated;
    });
    this.mail.wakeWorker();
    return this.toResponse(result);
  }

  async revoke(actor: Actor, id: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "AdminInvitation" WHERE "id" = ${id} FOR UPDATE`,
      );
      const invitation = await transaction.adminInvitation.findUnique({
        where: { id },
      });
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (invitation.acceptedAt)
        throw new ConflictException('Invitation is already accepted');
      const updated = await transaction.adminInvitation.updateMany({
        where: { id, revokedAt: null, acceptedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!updated.count)
        throw new ConflictException('Invitation is no longer active');
      await this.audit.record(
        {
          actor,
          action: 'ADMIN_INVITATION_REVOKED',
          resourceType: 'AdminInvitation',
          resourceId: id,
          after: { id, email: invitation.email, status: 'REVOKED' },
        },
        transaction,
      );
      return transaction.adminInvitation.findUniqueOrThrow({ where: { id } });
    });
    return this.toResponse(result);
  }

  async preview(token: string) {
    const invitation = await this.findActiveByToken(token);
    return {
      email: invitation.email,
      permissions: invitation.permissions,
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(dto: AcceptAdminInvitationDto) {
    const tokenHash = this.mail.hashToken(dto.token);
    await this.findActiveByToken(dto.token);
    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "AdminInvitation" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`,
      );
      const invitation = await transaction.adminInvitation.findUnique({
        where: { tokenHash },
      });
      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt <= new Date()
      )
        throw new UnauthorizedException('Invitation is invalid or expired');
      if (dto.email.trim().toLowerCase() !== invitation.email)
        throw new UnauthorizedException('Invitation email does not match');
      await this.assertCanGrant(
        invitation.invitedById,
        invitation.permissions,
        transaction,
      );
      const existing = await transaction.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
      });
      if (existing) throw new ConflictException('Email is already registered');
      const consumed = await transaction.adminInvitation.updateMany({
        where: {
          id: invitation.id,
          tokenHash,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count !== 1)
        throw new UnauthorizedException('Invitation is invalid or expired');
      const created = await transaction.user.create({
        data: {
          email: invitation.email,
          fullName: dto.fullName.trim(),
          passwordHash,
          role: 'ADMIN',
          emailVerifiedAt: new Date(),
          adminPermissions: {
            create: invitation.permissions.map((permission) => ({
              permission,
            })),
          },
        },
      });
      await transaction.adminInvitation.update({
        where: { id: invitation.id },
        data: { acceptedById: created.id },
      });
      await this.audit.record(
        {
          actor: { id: created.id, email: created.email },
          action: 'ADMIN_INVITATION_ACCEPTED',
          resourceType: 'AdminInvitation',
          resourceId: invitation.id,
          after: {
            id: invitation.id,
            email: invitation.email,
            userId: created.id,
            permissions: invitation.permissions,
          },
        },
        transaction,
      );
      return created;
    });
    return { accepted: true, email: user.email };
  }

  private async assertCanGrant(
    actorId: string,
    permissions: AdminPermission[],
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (client !== this.prisma)
      await client.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR SHARE`,
      );
    const actor = await client.user.findUnique({
      where: { id: actorId },
      include: { adminPermissions: true },
    });
    const allowed = new Set(
      actor?.adminPermissions.map((item) => item.permission),
    );
    if (
      !actor ||
      actor.disabledAt ||
      actor.role !== 'ADMIN' ||
      !allowed.has('MANAGE_USERS') ||
      permissions.some((permission) => !allowed.has(permission))
    ) {
      throw new ForbiddenException('You can no longer grant these permissions');
    }
  }

  private async findActiveByToken(token: string) {
    const invitation = await this.prisma.adminInvitation.findUnique({
      where: { tokenHash: this.mail.hashToken(token) },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    )
      throw new UnauthorizedException('Invitation is invalid or expired');
    await this.assertCanGrant(invitation.invitedById, invitation.permissions);
    return invitation;
  }

  private toResponse(
    invitation: {
      id: string;
      email: string;
      permissions: AdminPermission[];
      invitedById: string;
      acceptedById: string | null;
      acceptedAt: Date | null;
      revokedAt: Date | null;
      expiresAt: Date;
      createdAt: Date;
    },
    mail?: { status: string },
  ) {
    const status = invitation.acceptedAt
      ? 'ACCEPTED'
      : invitation.revokedAt
        ? 'REVOKED'
        : invitation.expiresAt <= new Date()
          ? 'EXPIRED'
          : 'PENDING';
    return {
      id: invitation.id,
      email: invitation.email,
      permissions: invitation.permissions,
      invitedById: invitation.invitedById,
      acceptedById: invitation.acceptedById,
      status,
      emailStatus:
        mail?.status ?? (status === 'PENDING' ? 'PENDING' : 'UNKNOWN'),
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
    };
  }
}

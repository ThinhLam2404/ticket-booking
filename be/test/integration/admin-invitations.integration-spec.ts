import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitationsService } from '../../src/modules/users/invitations.service.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { adminPrisma, adminRedis, createIntegrationApp, resetIntegrationState } from './helpers.js';

describe('Admin invitations PostgreSQL transactions', () => {
  let app: INestApplication;
  let service: InvitationsService;
  let actor: { id: string; email: string };
  beforeAll(async () => { app = await createIntegrationApp(); service = app.get(InvitationsService); });
  beforeEach(async () => {
    await resetIntegrationState();
    actor = await adminPrisma.user.create({ data: { email: 'inviter@example.com', fullName: 'Inviter', passwordHash: 'fixture', role: 'ADMIN', adminPermissions: { create: [{ permission: 'MANAGE_USERS' }, { permission: 'VIEW_SYSTEM' }] } } });
  });
  afterAll(async () => { await app?.close(); await adminPrisma.$disconnect(); await adminRedis.quit(); });

  async function issue() {
    const invitation = await service.create(actor, { email: 'invited@example.com', permissions: ['VIEW_SYSTEM'] });
    const mail = await adminPrisma.mailOutbox.findFirstOrThrow({ where: { recipient: invitation.email } });
    return { invitation, token: (mail.payload as { token: string }).token };
  }

  it('concurrent creates produce one invitation, outbox and audit', async () => {
    const results = await Promise.allSettled([issue(), issue()]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(await adminPrisma.adminInvitation.count()).toBe(1);
    expect(await adminPrisma.mailOutbox.count()).toBe(1);
    expect(await adminPrisma.auditLog.count()).toBe(1);
  });

  it('concurrent accepts create exactly one admin with invited permissions', async () => {
    const { token } = await issue();
    const dto = { token, email: 'invited@example.com', fullName: 'Invited Admin', password: 'Password123!' };
    const results = await Promise.allSettled([service.accept(dto), service.accept(dto)]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const user = await adminPrisma.user.findUniqueOrThrow({ where: { email: dto.email }, include: { adminPermissions: true } });
    expect(user.role).toBe('ADMIN');
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.adminPermissions.map((item) => item.permission)).toEqual(['VIEW_SYSTEM']);
    expect(await adminPrisma.auditLog.count({ where: { action: 'ADMIN_INVITATION_ACCEPTED', actorUserId: user.id } })).toBe(1);
  });

  it('audit failure rolls back invitation consumption and account creation', async () => {
    const { token, invitation } = await issue();
    const spy = vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('audit failure'));
    try {
      await expect(service.accept({ token, email: invitation.email, fullName: 'Test Admin', password: 'Password123!' })).rejects.toThrow('audit failure');
      expect(await adminPrisma.user.count({ where: { email: invitation.email } })).toBe(0);
      expect((await adminPrisma.adminInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).acceptedAt).toBeNull();
    } finally { spy.mockRestore(); }
  });

  it('resend invalidates old token and revoke invalidates the replacement', async () => {
    const { token, invitation } = await issue();
    await adminPrisma.adminInvitation.update({ where: { id: invitation.id }, data: { updatedAt: new Date(Date.now() - 120000) } });
    await service.resend(actor, invitation.id);
    await expect(service.preview(token)).rejects.toThrow('invalid or expired');
    await service.revoke(actor, invitation.id);
    const row = await adminPrisma.adminInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(row.revokedAt).not.toBeNull();
  });
});

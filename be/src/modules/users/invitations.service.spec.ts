import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { InvitationsService } from './invitations.service.js';

function fixture() {
  const invitation = { id: 'invite', email: 'invited@example.com', permissions: ['VIEW_SYSTEM'], invitedById: 'admin', tokenHash: 'hash', expiresAt: new Date(Date.now() + 86400000), updatedAt: new Date(Date.now() - 120000), createdAt: new Date(), revokedAt: null, acceptedAt: null, acceptedById: null };
  const admin = { id: 'admin', role: 'ADMIN', disabledAt: null, adminPermissions: [{ permission: 'MANAGE_USERS' }, { permission: 'VIEW_SYSTEM' }] };
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
    user: { findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(where.id ? admin : null)), create: vi.fn().mockResolvedValue({ id: 'new-user', email: invitation.email }) },
    adminInvitation: { findUnique: vi.fn().mockResolvedValue(invitation), findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue(invitation), create: vi.fn().mockResolvedValue(invitation) },
  };
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
  const mail = { hashToken: (token: string) => createHash('sha256').update(token).digest('hex'), queueAdminInvitationEmail: vi.fn().mockResolvedValue(undefined), wakeWorker: vi.fn() };
  const audit = { record: vi.fn().mockResolvedValue({}) };
  const service = new InvitationsService(prisma as never, mail as never, audit as never);
  return { service, prisma, mail, audit, admin, invitation };
}

describe('InvitationsService security', () => {
  it('rejects preview when inviter was disabled', async () => {
    const f = fixture(); f.admin.disabledAt = new Date() as never;
    await expect(f.service.preview('token')).rejects.toThrow('You can no longer grant');
  });

  it('rejects preview when inviter lost the invited permission', async () => {
    const f = fixture(); f.admin.adminPermissions = [{ permission: 'MANAGE_USERS' }];
    await expect(f.service.preview('token')).rejects.toThrow('You can no longer grant');
  });

  it('rejects revoked invitation without creating a user', async () => {
    const f = fixture(); f.invitation.revokedAt = new Date() as never;
    await expect(f.service.accept({ token: 'token', email: f.invitation.email, fullName: 'Test Admin', password: 'Password123!' })).rejects.toThrow('invalid or expired');
    expect(f.prisma.user.create).not.toHaveBeenCalled();
  });

  it('serializes creation and stores no raw token in invitation or audit', async () => {
    const f = fixture();
    await f.service.create({ id: 'admin', email: 'admin@example.com' }, { email: f.invitation.email, permissions: ['VIEW_SYSTEM'] });
    expect(f.prisma.$queryRaw).toHaveBeenCalled();
    const rawToken = f.mail.queueAdminInvitationEmail.mock.calls[0][2];
    expect(f.prisma.adminInvitation.create.mock.calls[0][0].data.tokenHash).toBe(f.mail.hashToken(rawToken));
    expect(JSON.stringify(f.audit.record.mock.calls)).not.toContain(rawToken);
  });

  it('locks resend and refuses accepted invitations', async () => {
    const f = fixture(); f.invitation.acceptedAt = new Date() as never;
    await expect(f.service.resend({ id: 'admin', email: 'admin@example.com' }, 'invite')).rejects.toThrow('no longer active');
    expect(f.prisma.$queryRaw).toHaveBeenCalled();
    expect(f.mail.queueAdminInvitationEmail).not.toHaveBeenCalled();
  });

  it('does not wake mail worker if audit fails', async () => {
    const f = fixture(); f.audit.record.mockRejectedValue(new Error('audit unavailable'));
    await expect(f.service.create({ id: 'admin', email: 'admin@example.com' }, { email: f.invitation.email, permissions: ['VIEW_SYSTEM'] })).rejects.toThrow('audit unavailable');
    expect(f.mail.wakeWorker).not.toHaveBeenCalled();
  });
});

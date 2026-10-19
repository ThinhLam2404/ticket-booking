import { Prisma } from '@prisma/client';
import { AuditService } from './audit.service.js';

describe('AuditService summaries', () => {
  it('serializes dates and prices but removes secrets and nested payloads', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit' });
    const service = new AuditService({} as never);
    await service.record(
      {
        action: 'SHOWTIME_UPDATED',
        resourceType: 'Showtime',
        after: {
          startsAt: new Date('2026-10-20T10:00:00Z'),
          basePrice: new Prisma.Decimal('100000'),
          password: 'secret',
          passwordHash: 'hash',
          token: 'token',
          refreshToken: 'refresh',
          tokenHash: 'hash',
          seats: [{ id: 'seat' }],
          permissions: ['VIEW_SYSTEM'],
        },
      },
      { auditLog: { create } } as never,
    );
    expect(create.mock.calls[0][0].data.after).toEqual({
      startsAt: '2026-10-20T10:00:00.000Z',
      basePrice: '100000',
      permissions: ['VIEW_SYSTEM'],
    });
  });
});

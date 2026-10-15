import type { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtTokenService } from '../../modules/auth/jwt-token.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('session-bound access tokens', () => {
  const tokens = { verifyAccessToken: vi.fn() };
  const prisma = {
    user: { findUnique: vi.fn() },
    authSession: { findFirst: vi.fn() },
  };
  const guard = new JwtAuthGuard(
    tokens as unknown as JwtTokenService,
    prisma as unknown as PrismaService,
  );
  const user = {
    id: 'user',
    email: 'test@example.com',
    fullName: 'Test',
    role: 'CUSTOMER',
    disabledAt: null,
  };
  const request = { headers: { authorization: 'Bearer access' } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    tokens.verifyAccessToken.mockReturnValue({ ...user, sessionId: 'session' });
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.authSession.findFirst.mockResolvedValue({ id: 'session' });
  });

  it('authorizes an active session owned by the user', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.authSession.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'session',
        userId: 'user',
        revokedAt: null,
      }),
    });
  });

  it('rejects revoked, missing, or expired sessions', async () => {
    prisma.authSession.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Session is no longer active',
    );
  });

  it('rejects legacy JWTs without sid', async () => {
    tokens.verifyAccessToken.mockReturnValue(user);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Session is no longer active',
    );
  });

  it('rejects disabled users even with a valid JWT', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      disabledAt: new Date(),
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      'User is no longer available',
    );
  });
});

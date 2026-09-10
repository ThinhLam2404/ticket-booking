import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { JwtTokenService } from './jwt-token.service.js';

function createTokenService() {
  return new JwtTokenService(
    new ConfigService({
      JWT_ACCESS_SECRET: 'access-secret-for-tests',
      JWT_REFRESH_SECRET: 'refresh-secret-for-tests',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
    }),
  );
}

describe('JwtTokenService', () => {
  it('creates and verifies access and refresh tokens', () => {
    const service = createTokenService();
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      fullName: 'Test User',
      role: UserRole.CUSTOMER,
    };

    const accessToken = service.createAccessToken(user);
    const refreshToken = service.createRefreshToken(user.id);

    expect(service.verifyAccessToken(accessToken)).toEqual(user);
    expect(service.verifyRefreshToken(refreshToken).sub).toBe(user.id);
    expect(
      service.getRefreshTokenExpiry(refreshToken).getTime(),
    ).toBeGreaterThan(Date.now());
  });

  it('rejects a token signed with a different secret', () => {
    const service = createTokenService();
    const token = service.createAccessToken({
      id: 'user-1',
      email: 'user@example.com',
      fullName: 'Test User',
      role: UserRole.CUSTOMER,
    });
    const otherService = new JwtTokenService(
      new ConfigService({
        JWT_ACCESS_SECRET: 'other-access-secret',
        JWT_REFRESH_SECRET: 'other-refresh-secret',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
      }),
    );

    expect(() => otherService.verifyAccessToken(token)).toThrow(
      'Invalid or expired access token',
    );
  });
});

import { ConfigService } from '@nestjs/config';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user.js';

const JWT_ISSUER = 'ticket-booking-api';
const JWT_AUDIENCE = 'ticket-booking-client';

export interface RefreshTokenPayload extends JwtPayload {
  sub: string;
  jti: string;
  familyId?: string;
  type: 'refresh';
}

function isRecord(value: string | JwtPayload): value is JwtPayload {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class JwtTokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: SignOptions['expiresIn'];
  private readonly refreshExpiresIn: SignOptions['expiresIn'];

  constructor(private readonly config: ConfigService) {
    this.accessSecret = this.getRequiredConfig('JWT_ACCESS_SECRET');
    this.refreshSecret = this.getRequiredConfig('JWT_REFRESH_SECRET');
    this.accessExpiresIn = this.getRequiredConfig(
      'JWT_ACCESS_EXPIRES_IN',
    ) as SignOptions['expiresIn'];
    this.refreshExpiresIn = this.getRequiredConfig(
      'JWT_REFRESH_EXPIRES_IN',
    ) as SignOptions['expiresIn'];
  }

  createAccessToken(user: AuthUser): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        type: 'access',
      },
      this.accessSecret,
      {
        algorithm: 'HS256',
        expiresIn: this.accessExpiresIn,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );
  }

  createRefreshToken(userId: string, familyId: string = randomUUID()): string {
    return jwt.sign(
      { sub: userId, jti: randomUUID(), familyId, type: 'refresh' },
      this.refreshSecret,
      {
        algorithm: 'HS256',
        expiresIn: this.refreshExpiresIn,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );
  }

  getRefreshTokenExpiry(token: string): Date {
    const payload = this.verifyRefreshToken(token);
    if (typeof payload.exp !== 'number') {
      throw new Error('Refresh token does not contain an expiry');
    }
    return new Date(payload.exp * 1000);
  }

  verifyAccessToken(token: string): AuthUser {
    try {
      const payload = jwt.verify(token, this.accessSecret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      if (
        !isRecord(payload) ||
        payload.type !== 'access' ||
        typeof payload.sub !== 'string' ||
        typeof payload.email !== 'string' ||
        typeof payload.fullName !== 'string' ||
        !Object.values(UserRole).includes(payload.role as UserRole)
      ) {
        throw new Error('Invalid access token payload');
      }

      return {
        id: payload.sub,
        email: payload.email,
        fullName: payload.fullName,
        role: payload.role as UserRole,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const payload = jwt.verify(token, this.refreshSecret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      if (
        !isRecord(payload) ||
        payload.type !== 'refresh' ||
        typeof payload.sub !== 'string' ||
        typeof payload.jti !== 'string'
      ) {
        throw new Error('Invalid refresh token payload');
      }

      return payload as RefreshTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value?.trim()) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value.trim();
  }
}

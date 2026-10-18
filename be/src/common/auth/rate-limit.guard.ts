import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { RedisService } from '../../modules/redis/redis.service.js';
import { ROLES_KEY } from './roles.decorator.js';

type RateLimitRule = {
  prefix: string;
  limit: number;
  windowSeconds: number;
};

const rules: Array<{
  matches: (request: Request) => boolean;
  rule: RateLimitRule;
}> = [
  {
    matches: (request) => /\/auth\/admin-invitations\/(preview|accept)$/.test(request.path),
    rule: { prefix: 'admin-invitation-public', limit: 10, windowSeconds: 60 },
  },
  {
    matches: (request) => request.method !== 'GET' && /\/users\/admin\/invitations(?:\/|$)/.test(request.path),
    rule: { prefix: 'admin-invitation-mutation', limit: 10, windowSeconds: 60 },
  },
  {
    matches: (request) => /\/auth\/(browser\/)?login$/.test(request.path),
    rule: { prefix: 'login', limit: 10, windowSeconds: 60 },
  },
  {
    matches: (request) => request.path.endsWith('/auth/register'),
    rule: { prefix: 'register', limit: 5, windowSeconds: 60 },
  },
  {
    matches: (request) => request.path.endsWith('/auth/email/resend'),
    rule: { prefix: 'verification-resend', limit: 5, windowSeconds: 60 },
  },
  {
    matches: (request) => request.path.endsWith('/auth/email/verify'),
    rule: { prefix: 'verification', limit: 10, windowSeconds: 60 },
  },
  {
    matches: (request) => /\/auth\/(browser\/)?refresh$/.test(request.path),
    rule: { prefix: 'refresh', limit: 20, windowSeconds: 60 },
  },
  {
    matches: (request) => request.path.endsWith('/auth/password-reset/request'),
    rule: { prefix: 'password-reset', limit: 5, windowSeconds: 300 },
  },
  {
    matches: (request) => request.path.endsWith('/auth/password-reset/confirm'),
    rule: { prefix: 'password-reset-confirm', limit: 10, windowSeconds: 300 },
  },
  {
    matches: (request) => request.path.endsWith('/payments/sepay/webhook'),
    rule: { prefix: 'sepay-webhook', limit: 120, windowSeconds: 60 },
  },
];

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const matched = rules.find(({ matches }) => matches(request));
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isAdminMutation =
      roles?.includes(UserRole.ADMIN) && request.method !== 'GET';
    //NOTE - admin cho 120 req/phút
    const rule =
      matched?.rule ??
      (isAdminMutation
        ? { prefix: 'admin-mutation', limit: 120, windowSeconds: 60 }
        : undefined);
    if (!rule) return true;

    const identity = this.identity(request);
    //NOTE - fixed-window rate limiting;
    //NOTE -  12:00:00 :bucket A; 12:00:45 : bucket A; 12:01:00 : bucket B
    const bucket = Math.floor(Date.now() / (rule.windowSeconds * 1000));
    const key = `rate-limit:${rule.prefix}:${identity}:${bucket}`;
    const count = await this.redis.incrementWithExpiry(key, rule.windowSeconds);
    if (count > rule.limit) {
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private identity(request: Request): string {
    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}

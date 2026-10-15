import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtTokenService } from '../../modules/auth/jwt-token.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import { setCurrentActor } from '../logging/request-context.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: JwtTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string }; user?: AuthUser }>();
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Bearer token is required');
    }

    const tokenUser = this.tokenService.verifyAccessToken(token);
    const user = await this.prisma.user.findUnique({
      where: { id: tokenUser.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        disabledAt: true,
      },
    });
    if (!user || user.disabledAt) {
      throw new UnauthorizedException('User is no longer available');
    }

    const session = tokenUser.sessionId
      ? await this.prisma.authSession.findFirst({
          where: {
            id: tokenUser.sessionId,
            userId: user.id,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        })
      : null;
    if (!session)
      throw new UnauthorizedException('Session is no longer active');
    request.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      sessionId: session.id,
    };
    setCurrentActor({ id: user.id, email: user.email });
    return true;
  }
}

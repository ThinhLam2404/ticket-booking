import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtTokenService } from '../../modules/auth/jwt-token.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthUser } from './auth-user.js';

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
      select: { id: true, email: true, fullName: true, role: true },
    });
    if (!user) {
      throw new UnauthorizedException('User is no longer available');
    }

    request.user = user;
    return true;
  }
}

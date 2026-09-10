import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { User, UserRole } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { hashPassword, verifyPassword } from '../../common/auth/password.js';
import { JwtTokenService } from './jwt-token.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: JwtTokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email,
          passwordHash: await hashPassword(dto.password),
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });

    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueTokens(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponse> {
    const payload = this.tokenService.verifyRefreshToken(dto.refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
      include: { user: true },
    });

    if (
      !storedToken ||
      storedToken.userId !== payload.sub ||
      storedToken.revokedAt ||
      storedToken.expiresAt <= new Date() ||
      !(await verifyPassword(dto.refreshToken, storedToken.tokenHash))
    ) {
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }

    const user = storedToken.user;
    return this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.refreshToken.updateMany({
        where: { id: storedToken.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (revoked.count !== 1) {
        throw new UnauthorizedException('Refresh token is invalid or revoked');
      }

      const accessToken = this.tokenService.createAccessToken(user);
      const refreshToken = this.tokenService.createRefreshToken(user.id);
      const refreshPayload = this.tokenService.verifyRefreshToken(refreshToken);
      await transaction.refreshToken.create({
        data: {
          jti: refreshPayload.jti,
          tokenHash: await hashPassword(refreshToken),
          expiresAt: this.tokenService.getRefreshTokenExpiry(refreshToken),
          userId: user.id,
        },
      });

      return {
        user: this.toPublicUser(user),
        accessToken,
        refreshToken,
      };
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = this.tokenService.verifyRefreshToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt <= new Date() ||
      !(await verifyPassword(refreshToken, storedToken.tokenHash))
    ) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { id: storedToken.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: User): Promise<AuthResponse> {
    const publicUser = this.toPublicUser(user);
    const accessToken = this.tokenService.createAccessToken(publicUser);
    const refreshToken = this.tokenService.createRefreshToken(user.id);
    const refreshPayload = this.tokenService.verifyRefreshToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        jti: refreshPayload.jti,
        tokenHash: await hashPassword(refreshToken),
        expiresAt: this.tokenService.getRefreshTokenExpiry(refreshToken),
        userId: user.id,
      },
    });

    return { user: publicUser, accessToken, refreshToken };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }
}

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type User, type UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { MailService } from '../mail/mail.service.js';
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
    private readonly mailService: MailService,
  ) {}

  async register(
    dto: RegisterDto,
  ): Promise<{ verificationRequired: true; email: string }> {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const token = randomBytes(32).toString('hex');
    try {
      await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            fullName: dto.fullName.trim(),
            email,
            passwordHash: await hashPassword(dto.password),
            emailVerifiedAt: null,
          },
        });
        await transaction.emailVerificationToken.create({
          data: {
            tokenHash: this.mailService.hashToken(token),
            userId: user.id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        await this.mailService.queueVerificationEmail(user, token, transaction);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
    return { verificationRequired: true, email };
  }

  async resendVerificationEmail(emailInput: string): Promise<{ sent: true }> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    //NOTE - nếu user ko tồn tại hoặc đã verified vẫn trả về true để tránh lộ email có tồn tại ko
    if (!user || user.emailVerifiedAt) return { sent: true };

    const token = randomBytes(32).toString('hex');
    await this.prisma.$transaction(async (transaction) => {
      //NOTE - khoá row bằng for update để tránh 2 request resend chạy đồng thời
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`,
      );
      const lockedUser = await transaction.user.findUnique({
        where: { id: user.id },
      });
      if (!lockedUser || lockedUser.emailVerifiedAt) return;
      //NOTE - vô hiệu hoá token cũ
      await transaction.emailVerificationToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await transaction.emailVerificationToken.create({
        data: {
          tokenHash: this.mailService.hashToken(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      //NOTE - tạo mailbox để thực hiện đọc và send email
      await this.mailService.queueVerificationEmail(
        lockedUser,
        token,
        transaction,
      );
    });
    return { sent: true };
  }

  async verifyEmail(token: string): Promise<{ verified: true }> {
    const tokenHash = this.mailService.hashToken(token);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.consumedAt || record.expiresAt <= new Date()) {
      throw new UnauthorizedException(
        'Email verification token is invalid or expired',
      );
    }
    await this.prisma.$transaction(async (transaction) => {
      //NOTE - mục đích dùng update many để nếu ko có record nào update thì trả về 0, dễ xử lý lỗi hơn update
      const consumed = await transaction.emailVerificationToken.updateMany({
        where: {
          id: record.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException(
          'Email verification token is invalid or expired',
        );
      }
      //NOTE - đánh dấu tất cả token của user đó đã dùng
      await transaction.emailVerificationToken.updateMany({
        where: {
          userId: record.userId,
          id: { not: record.id },
          consumedAt: null,
        },
        data: { consumedAt: new Date() },
      });
      //NOTE - update user là đã xác thực
      await transaction.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      });
    });
    return { verified: true };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });

    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Email verification is required before login',
      );
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
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Email verification is required before login',
      );
    }
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

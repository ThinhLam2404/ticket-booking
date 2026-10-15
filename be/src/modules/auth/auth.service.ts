import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import { Prisma, type User, type UserRole } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { MailService } from '../mail/mail.service.js';
import { isUniqueConstraintError } from '../../common/database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { hashPassword, verifyPassword } from '../../common/auth/password.js';
import { JwtTokenService } from './jwt-token.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import {
  ChangePasswordDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './dto/password-reset.dto.js';

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

const EMAIL_RESEND_COOLDOWN_MS = 60_000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_COOLDOWN_MS = 60_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: JwtTokenService,
    private readonly mailService: MailService,
    @Optional() private readonly audit: AuditService = null as unknown as AuditService,
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
        await this.recordAudit({ action: 'USER_REGISTERED', resourceType: 'User', resourceId: user.id, after: { id: user.id, status: 'PENDING_VERIFICATION' } }, transaction);
      });
      this.mailService.wakeWorker();
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
      const latestToken = await transaction.emailVerificationToken.findFirst({
        where: { userId: lockedUser.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (
        latestToken &&
        Date.now() - latestToken.createdAt.getTime() < EMAIL_RESEND_COOLDOWN_MS
      )
        return;
      //NOTE - vô hiệu hoá token cũ
      await transaction.emailVerificationToken.updateMany({
        where: { userId: lockedUser.id, consumedAt: null },
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
    this.mailService.wakeWorker();
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
      await this.recordAudit({ action: 'EMAIL_VERIFIED', resourceType: 'User', resourceId: record.userId, after: { id: record.userId, status: 'VERIFIED' } }, transaction);
    });
    return { verified: true };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<{ sent: true }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.disabledAt) return { sent: true };

    const token = randomBytes(32).toString('hex');
    let queued = false;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`);
      const lockedUser = await transaction.user.findUnique({ where: { id: user.id } });
      if (!lockedUser || lockedUser.disabledAt) return;
      const latest = await transaction.passwordResetToken.findFirst({
        where: { userId: lockedUser.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (latest && Date.now() - latest.createdAt.getTime() < PASSWORD_RESET_COOLDOWN_MS) return;
      await transaction.passwordResetToken.updateMany({
        where: { userId: lockedUser.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await transaction.passwordResetToken.create({
        data: {
          tokenHash: this.mailService.hashToken(token),
          userId: lockedUser.id,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });
      await this.mailService.queuePasswordResetEmail(lockedUser, token, transaction);
      queued = true;
    });
    if (queued) this.mailService.wakeWorker();
    return { sent: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ reset: true }> {
    const tokenHash = this.mailService.hashToken(dto.token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.consumedAt || record.expiresAt <= new Date()) {
      throw new UnauthorizedException('Password reset token is invalid or expired');
    }
    const passwordHash = await hashPassword(dto.password);
    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new UnauthorizedException('Password reset token is invalid or expired');
      await transaction.passwordResetToken.updateMany({
        where: { userId: record.userId, id: { not: record.id }, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await transaction.user.update({ where: { id: record.userId }, data: { passwordHash } });
      const revokedAt = new Date();
      await transaction.authSession.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt } });
      await transaction.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt } });
      await this.recordAudit({
        actor: { id: record.userId },
        action: 'PASSWORD_RESET_COMPLETED',
        resourceType: 'User',
        resourceId: record.userId,
        after: { id: record.userId, count: 1 },
      }, transaction);
    });
    return { reset: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ changed: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.disabledAt || !(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is invalid');
    }
    const passwordHash = await hashPassword(dto.newPassword);
    const revokedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: userId }, data: { passwordHash } });
      await transaction.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt } });
      await transaction.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt } });
      await this.recordAudit({
        actor: { id: userId },
        action: 'PASSWORD_CHANGED',
        resourceType: 'User',
        resourceId: userId,
        after: { id: userId, count: 1 },
      }, transaction);
    });
    return { changed: true };
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, expiresAt: true },
    });
    return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const revokedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.authSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt } });
      if (result.count === 0) throw new UnauthorizedException('Session is not active');
      await transaction.refreshToken.updateMany({ where: { familyId: sessionId, userId, revokedAt: null }, data: { revokedAt } });
      await this.recordAudit({ actor: { id: userId }, action: 'SESSION_REVOKED', resourceType: 'AuthSession', resourceId: sessionId, after: { sessionId } }, transaction);
    });
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<void> {
    const revokedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.authSession.updateMany({ where: { userId, id: { not: currentSessionId }, revokedAt: null }, data: { revokedAt } });
      await transaction.refreshToken.updateMany({ where: { userId, familyId: { not: currentSessionId }, revokedAt: null }, data: { revokedAt } });
      await this.recordAudit({ actor: { id: userId }, action: 'SESSIONS_REVOKED_OTHERS', resourceType: 'User', resourceId: userId, after: { id: userId, sessionId: currentSessionId } }, transaction);
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    const revokedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt } });
      await transaction.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt } });
      await this.recordAudit({ actor: { id: userId }, action: 'SESSIONS_REVOKED_ALL', resourceType: 'User', resourceId: userId, after: { id: userId } }, transaction);
    });
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });

    if (
      !user ||
      user.disabledAt ||
      !(await verifyPassword(dto.password, user.passwordHash))
    ) {
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
      (payload.familyId && storedToken.familyId !== payload.familyId) ||
      storedToken.expiresAt <= new Date() ||
      !(await verifyPassword(dto.refreshToken, storedToken.tokenHash))
    ) {
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }
    //NOTE - bảo vệ khi refresh token bị đánh cắp: nếu token đã bị revoke và replace bởi token khác mà vẫn dùng
    if (storedToken.revokedAt) {
      if (storedToken.replacedByJti) {
        const reuseDetectedAt = new Date();
        //NOTE -update token reuse là hiện tại
        await this.prisma.refreshToken.updateMany({
          where: { id: storedToken.id },
          data: { reuseDetectedAt },
        });
        //NOTE - revoke tất cả token trong cùng family
        await this.prisma.refreshToken.updateMany({
          where: { familyId: storedToken.familyId, revokedAt: null },
          data: { revokedAt: reuseDetectedAt, reuseDetectedAt },
        });
        await this.prisma.authSession.updateMany({
          where: { id: storedToken.familyId },
          data: { revokedAt: reuseDetectedAt },
        });
      }
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }

    const user = storedToken.user;
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Email verification is required before login',
      );
    }
    const familyId = storedToken.familyId || randomUUID();
    //NOTE - lock row mục đích là 2 req đồng thời thì db chỉ cho một transaction lock trước
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "AuthSession" WHERE "id" = ${familyId} FOR UPDATE`,
      );
      const session = await transaction.authSession.findFirst({
        where: {
          id: familyId,
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { disabledAt: null },
        },
      });
      if (!session) return { kind: 'invalid' as const };
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "RefreshToken" WHERE "id" = ${storedToken.id} FOR UPDATE`,
      );
      //NOTE - đọc lại token vì có thể req khác đã thay đổi row
      const currentToken = await transaction.refreshToken.findUnique({
        where: { id: storedToken.id },
      });
      const now = new Date();

      if (!currentToken || currentToken.expiresAt <= now) {
        return { kind: 'invalid' as const };
      }

      if (currentToken.revokedAt) {
        if (currentToken.replacedByJti) {
          const reuseDetectedAt = new Date();
          await transaction.refreshToken.updateMany({
            where: { id: currentToken.id },
            data: { reuseDetectedAt },
          });
          await transaction.refreshToken.updateMany({
            where: { familyId: currentToken.familyId, revokedAt: null },
            data: { revokedAt: reuseDetectedAt, reuseDetectedAt },
          });
          await transaction.authSession.updateMany({
            where: { id: familyId },
            data: { revokedAt: reuseDetectedAt },
          });
        }
        return { kind: 'invalid' as const };
      }
      //NOTE - tạo token mới
      const accessToken = this.tokenService.createAccessToken({
        ...user,
        sessionId: familyId,
      });
      const refreshToken = this.tokenService.createRefreshToken(
        user.id,
        familyId,
      );
      const refreshPayload = this.tokenService.verifyRefreshToken(refreshToken);
      const revokedAt = new Date();
      //NOTE - revoked token cũ
      const revoked = await transaction.refreshToken.updateMany({
        where: {
          id: currentToken.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt, replacedByJti: refreshPayload.jti },
      });

      if (revoked.count !== 1) {
        return { kind: 'invalid' as const };
      }
      //NOTE - lưu token mới vào db
      await transaction.refreshToken.create({
        data: {
          jti: refreshPayload.jti,
          tokenHash: await hashPassword(refreshToken),
          familyId,
          expiresAt: this.tokenService.getRefreshTokenExpiry(refreshToken),
          userId: user.id,
        },
      });

      return {
        kind: 'success' as const,
        user: this.toPublicUser(user),
        accessToken,
        refreshToken,
      };
    });

    if (result.kind !== 'success') {
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }
    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
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

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "AuthSession" WHERE "id" = ${storedToken.familyId} FOR UPDATE`,
      );
      const revokedAt = new Date();
      await transaction.authSession.updateMany({
        where: { id: storedToken.familyId, userId: storedToken.userId },
        data: { revokedAt },
      });
      await transaction.refreshToken.updateMany({
        where: { familyId: storedToken.familyId, revokedAt: null },
        data: { revokedAt },
      });
    });
  }

  private async issueTokens(user: User): Promise<AuthResponse> {
    const publicUser = this.toPublicUser(user);
    const familyId = randomUUID();
    const accessToken = this.tokenService.createAccessToken({
      ...publicUser,
      sessionId: familyId,
    });
    const refreshToken = this.tokenService.createRefreshToken(
      user.id,
      familyId,
    );
    const refreshPayload = this.tokenService.verifyRefreshToken(refreshToken);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.authSession.create({
        data: {
          id: familyId,
          userId: user.id,
          expiresAt: this.tokenService.getRefreshTokenExpiry(refreshToken),
        },
      });
      await transaction.refreshToken.create({
        data: {
          jti: refreshPayload.jti,
          tokenHash: await hashPassword(refreshToken),
          familyId,
          expiresAt: this.tokenService.getRefreshTokenExpiry(refreshToken),
          userId: user.id,
        },
      });
      await this.recordAudit({ actor: { id: user.id, email: user.email }, action: 'LOGIN_SUCCEEDED', resourceType: 'AuthSession', resourceId: familyId, after: { sessionId: familyId } }, transaction);
    });

    return { user: publicUser, accessToken, refreshToken };
  }

  private recordAudit(input: Parameters<AuditService['record']>[0], client: Prisma.TransactionClient) {
    return this.audit?.record(input, client);
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

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { MailOutboxStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class MaintenanceScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  //NOTE - chạy lúc 3h mỗi ngày
  @Cron('0 3 * * *')
  async cleanupExpiredData(): Promise<void> {
    const now = new Date();
    const refreshCutoff = this.cutoff('REFRESH_TOKEN_RETENTION_DAYS', 30, now);
    const verificationCutoff = this.cutoff(
      'VERIFICATION_TOKEN_RETENTION_DAYS',
      2,
      now,
    );
    const outboxCutoff = this.cutoff('MAIL_OUTBOX_RETENTION_DAYS', 90, now);
    //NOTE - kiểm tra xem ngày hết hạn < hiện tại, hoặc ngày revork < cutoff (hiện tại - khoảng thời gian lưu ở db)
    await Promise.all([
      this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { lt: refreshCutoff } },
          ],
        },
      }),
      this.prisma.emailVerificationToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { consumedAt: { lt: verificationCutoff } },
          ],
        },
      }),
      this.prisma.mailOutbox.deleteMany({
        where: {
          status: MailOutboxStatus.SENT,
          sentAt: { lt: outboxCutoff },
        },
      }),
      this.prisma.adminInvitation.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: outboxCutoff } },
            { acceptedAt: { lt: outboxCutoff } },
            { revokedAt: { lt: outboxCutoff } },
          ],
        },
      }),
    ]);
  }

  private cutoff(key: string, fallbackDays: number, now: Date): Date {
    const configured = Number(this.config.get<string>(key));
    const days =
      Number.isFinite(configured) && configured > 0 ? configured : fallbackDays;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }
}

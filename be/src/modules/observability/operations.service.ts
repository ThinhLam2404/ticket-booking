import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { MailWorkerSupervisor } from '../mail/mail-worker.supervisor.js';
import { RedisService } from '../redis/redis.service.js';

export type OperationsStatus = {
  database: 'down' | 'up';
  redis: 'down' | 'up';
  mailWorker: {
    status: ReturnType<MailWorkerSupervisor['getStatus']>;
    restartsLast5Minutes: number;
  };
  mailOutbox: {
    pending: number;
    failed: number;
    oldestPendingSeconds: number;
  };
  payments: {
    reviewRequired: number;
  };
  timestamp: string;
};

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mailWorker: MailWorkerSupervisor,
    private readonly config: ConfigService,
  ) {}

  async getStatus(): Promise<OperationsStatus> {
    //NOTE - một query aggregate vừa kiểm tra DB vừa lấy toàn bộ số liệu vận hành
    const maxMailAttempts = this.numberConfig('MAIL_WORKER_MAX_ATTEMPTS', 5);
    const [databaseSummary, redis] = await Promise.all([
      this.databaseSummary(maxMailAttempts),
      this.redisStatus(),
    ]);
    const database = databaseSummary ? 'up' : 'down';
    const mailWorker = {
      status: this.mailWorker.getStatus(),
      restartsLast5Minutes: this.mailWorker.getRecentRestartCount(),
    };
    const pending = databaseSummary
      ? Number(databaseSummary.pending ?? 0)
      : 0;
    const failed = databaseSummary ? Number(databaseSummary.failed ?? 0) : 0;
    const reviewRequired = databaseSummary
      ? Number(databaseSummary.reviewRequired ?? 0)
      : 0;
    const oldestPendingSeconds = databaseSummary?.oldestPending
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - databaseSummary.oldestPending.getTime()) / 1000,
          ),
        )
      : 0;

    return {
      database,
      redis,
      mailWorker,
      mailOutbox: { pending, failed, oldestPendingSeconds },
      payments: { reviewRequired },
      timestamp: new Date().toISOString(),
    };
  }

  private async databaseSummary(maxMailAttempts: number): Promise<{
    pending: number;
    failed: number;
    reviewRequired: number;
    oldestPending: Date | null;
  } | null> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          pending: bigint | number;
          failed: bigint | number;
          reviewRequired: bigint | number;
          oldestPending: Date | null;
        }>
      >`
        SELECT
          (SELECT COUNT(*) FROM "MailOutbox" WHERE "status" = 'PENDING') AS "pending",
          (SELECT COUNT(*) FROM "MailOutbox"
            WHERE "status" = 'FAILED' AND "attemptCount" < ${maxMailAttempts}) AS "failed",
          (SELECT COUNT(*) FROM "SepayTransaction" WHERE "status" = 'REVIEW_REQUIRED') AS "reviewRequired",
          (SELECT MIN("createdAt") FROM "MailOutbox" WHERE "status" = 'PENDING') AS "oldestPending"
      `;
      const row = rows[0];
      return row
        ? {
            pending: Number(row.pending),
            failed: Number(row.failed),
            reviewRequired: Number(row.reviewRequired),
            oldestPending: row.oldestPending,
          }
        : null;
    } catch {
      return null;
    }
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private async redisStatus(): Promise<'down' | 'up'> {
    try {
      await this.redis.ping();
      return 'up';
    } catch {
      return 'down';
    }
  }
}

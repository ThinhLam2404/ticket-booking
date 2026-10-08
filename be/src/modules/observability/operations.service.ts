import { Injectable } from '@nestjs/common';
import { MailOutboxStatus, SepayTransactionStatus } from '@prisma/client';
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
  ) {}

  async getStatus(): Promise<OperationsStatus> {
    const [initialDatabaseStatus, redis] = await Promise.all([
      this.databaseStatus(),
      this.redisStatus(),
    ]);
    let database = initialDatabaseStatus;
    const mailWorker = {
      status: this.mailWorker.getStatus(),
      restartsLast5Minutes: this.mailWorker.getRecentRestartCount(),
    };
    let pending = 0;
    let failed = 0;
    let oldestPendingSeconds = 0;
    let reviewRequired = 0;

    if (database === 'up') {
      try {
        const [pendingCount, failedCount, oldestPending, reviewCount] =
          await Promise.all([
            this.prisma.mailOutbox.count({
              where: { status: MailOutboxStatus.PENDING },
            }),
            this.prisma.mailOutbox.count({
              where: { status: MailOutboxStatus.FAILED },
            }),
            this.prisma.mailOutbox.findFirst({
              where: { status: MailOutboxStatus.PENDING },
              orderBy: { createdAt: 'asc' },
              select: { createdAt: true },
            }),
            this.prisma.sepayTransaction.count({
              where: { status: SepayTransactionStatus.REVIEW_REQUIRED },
            }),
          ]);
        pending = pendingCount;
        failed = failedCount;
        reviewRequired = reviewCount;
        //NOTE - tính pending lâu nhất
        if (oldestPending) {
          oldestPendingSeconds = Math.max(
            0,
            Math.floor((Date.now() - oldestPending.createdAt.getTime()) / 1000),
          );
        }
      } catch {
        database = 'down';
      }
    }

    return {
      database,
      redis,
      mailWorker,
      mailOutbox: { pending, failed, oldestPendingSeconds },
      payments: { reviewRequired },
      timestamp: new Date().toISOString(),
    };
  }

  private async databaseStatus(): Promise<'down' | 'up'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
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

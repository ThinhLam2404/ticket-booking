import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly config: ConfigService,
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
    //NOTE - gửi retry mail tối đa 5 lần
    const maxMailAttempts = this.numberConfig('MAIL_WORKER_MAX_ATTEMPTS', 5);

    if (database === 'up') {
      try {
        const [outboxCounts, oldestPending, reviewCount] =
          await Promise.all([
            this.prisma.mailOutbox.groupBy({
              by: ['status'],
              where: {
                OR: [
                  { status: MailOutboxStatus.PENDING },
                  {
                    status: MailOutboxStatus.FAILED,
                    attemptCount: { lt: maxMailAttempts },
                  },
                ],
              },
              _count: { _all: true },
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
        pending = outboxCounts.find(
          (entry) => entry.status === MailOutboxStatus.PENDING,
        )?._count._all ?? 0;
        failed = outboxCounts.find(
          (entry) => entry.status === MailOutboxStatus.FAILED,
        )?._count._all ?? 0;
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

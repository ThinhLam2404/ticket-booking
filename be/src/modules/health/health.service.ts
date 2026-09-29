import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { MailWorkerSupervisor } from '../mail/mail-worker.supervisor.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mailWorker: MailWorkerSupervisor,
  ) {}

  liveness() {
    return {
      status: 'ok',
      service: 'ticket-booking-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  async readiness() {
    const checks: Record<string, string> = {};
    let ready = true;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      checks.database = 'down';
      ready = false;
    }

    try {
      await this.redis.ping();
      checks.redis = 'up';
    } catch {
      checks.redis = 'down';
      ready = false;
    }

    const mailWorkerStatus = this.mailWorker.getStatus();
    checks.mailWorker = mailWorkerStatus;
    if (mailWorkerStatus === 'starting' || mailWorkerStatus === 'restarting') ready = false;

    return {
      status: ready ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}

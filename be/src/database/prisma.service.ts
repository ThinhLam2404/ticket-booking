import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { recordDbQuery } from '../common/logging/request-context.js';

const DEFAULT_SLOW_QUERY_MS = 250;

function slowQueryThresholdMs(): number {
  const configured = Number(process.env.DB_SLOW_QUERY_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_SLOW_QUERY_MS;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const queryLoggingEnabled = process.env.DB_QUERY_LOGGING === 'true';
    const log: Prisma.PrismaClientOptions['log'] = queryLoggingEnabled
      ? [{ emit: 'event', level: 'query' }]
      : [];
    super({ log });

    if (queryLoggingEnabled) {
      this.$on('query' as never, (event: Prisma.QueryEvent) => {
        const slow = event.duration >= slowQueryThresholdMs();
        recordDbQuery(event.duration, slow);
        if (!slow) return;
        process.stdout.write(
          `${JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'info',
            event: 'db_query_slow',
            durationMs: event.duration,
            target: event.target,
          })}\n`,
        );
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

import { ConfigService } from '@nestjs/config';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(
      config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
      {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
    );
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<'OK' | null> {
    return this.client.set(key, value, 'EX', ttlSeconds, 'NX');
  }

  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    //NOTE - incr lên 1 mỗi lần, và chỉ set TTL ở lần đầu tiên
    //NOTE - dùng lua script để incr + expire được xử lí atomic tránh tình trạng incr, xong bị crash -> ko có ttl -> tồn tại mãi mãi
    const result = await this.client.eval(
      "local count = redis.call('incr', KEYS[1]); if count == 1 then redis.call('expire', KEYS[1], ARGV[1]); end; return count",
      1,
      key,
      ttlSeconds,
    );
    return Number(result);
  }

  async releaseIfOwned(key: string, value: string): Promise<number> {
    const result = await this.client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      value,
    );
    return Number(result);
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}

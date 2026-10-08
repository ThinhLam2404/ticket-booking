import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service.js';
import { logOperationalEvent } from '../../common/logging/operational-logger.js';

type AlertDetails = Record<string, boolean | number | string>;

@Injectable()
export class DiscordAlertService {
  private readonly localCooldowns = new Map<string, number>();
  private readonly localActive = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('OPS_ALERTS_ENABLED') === 'true';
  }

  async update(
    key: string,
    active: boolean,
    title: string,
    details: AlertDetails,
  ): Promise<void> {
    if (!this.isEnabled()) return;
    if (active) {
      const cooldownKey = `active:${key}`;
      //NOTE - Kiểm tra đã có trong cooldown chưa
      const acquired = await this.acquire(cooldownKey);
      if (!acquired) return;
      const sent = await this.send(`🚨 ${title}`, details);
      if (sent) {
        await this.markActive(key);
      } else {
        await this.release(cooldownKey);
      }
      return;
    }
    //NOTE - service chỉ gửi recovery nếu alert trước đó đã active
    if (!(await this.wasActive(key))) return;
    const cooldownKey = `recovered:${key}`;
    const acquired = await this.acquire(cooldownKey);
    if (!acquired) return;
    const sent = await this.send(`✅ Đã phục hồi: ${title}`, details);
    if (sent) {
      await this.clearActive(key);
    } else {
      await this.release(cooldownKey);
    }
  }

  private async acquire(key: string): Promise<boolean> {
    const cooldownSeconds = this.numberConfig(
      'OPS_ALERT_COOLDOWN_SECONDS',
      900,
    );
    try {
      return (
        (await this.redis.setIfAbsent(
          `ops-alert:cooldown:${key}`,
          '1',
          cooldownSeconds,
        )) === 'OK'
      );
    } catch {
      //NOTE - nếu redis lỗi thì dùng local cooldown
      const now = Date.now();
      const expiresAt = this.localCooldowns.get(key) ?? 0;
      if (expiresAt > now) return false;
      this.localCooldowns.set(key, now + cooldownSeconds * 1000);
      return true;
    }
  }

  private async markActive(key: string): Promise<void> {
    this.localActive.add(key);
    try {
      await this.redis.set(`ops-alert:state:${key}`, 'active');
    } catch {
      return;
    }
  }

  private async wasActive(key: string): Promise<boolean> {
    try {
      return (
        (await this.redis.get(`ops-alert:state:${key}`)) === 'active' ||
        this.localActive.has(key)
      );
    } catch {
      return this.localActive.has(key);
    }
  }

  private async clearActive(key: string): Promise<void> {
    this.localActive.delete(key);
    try {
      await this.redis.delete(`ops-alert:state:${key}`);
    } catch {
      return;
    }
  }

  private async release(key: string): Promise<void> {
    this.localCooldowns.delete(key);
    try {
      await this.redis.delete(`ops-alert:cooldown:${key}`);
    } catch {
      return;
    }
  }

  private async send(title: string, details: AlertDetails): Promise<boolean> {
    const webhookUrl = this.config
      .get<string>('DISCORD_ALERT_WEBHOOK_URL')
      ?.trim();
    if (!webhookUrl) return false;
    const description = Object.entries(details)
      .map(([name, value]) => `**${name}:** ${value}`)
      .join('\n');

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'CineBook Operations',
          embeds: [
            {
              title,
              description,
              color: title.startsWith('✅') ? 0x2563eb : 0xdc2626,
              timestamp: new Date().toISOString(),
            },
          ],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(`Discord returned HTTP ${response.status}`);
      }
      logOperationalEvent('info', 'ops_alert_sent', { title });
      return true;
    } catch (error) {
      logOperationalEvent('error', 'ops_alert_failed', {
        title,
        reason: error instanceof Error ? error.message : 'unknown_error',
      });
      return false;
    }
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}

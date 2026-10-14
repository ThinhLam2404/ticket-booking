import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'node:worker_threads';
import { logOperationalEvent } from '../../common/logging/operational-logger.js';
import { recordMailWorkerRestart } from '../observability/metrics.service.js';
export type MailWorkerData = {
  databaseUrl: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFrom: string;
  publicAppUrl: string;
  pollMs: number;
  staleLockMs: number;
  maxAttempts: number;
};

type WorkerMessage =
  | { type: 'ready' }
  | { type: 'idle' }
  | { type: 'processing'; outboxId: string }
  | { type: 'sent'; outboxId: string }
  | { type: 'failed'; outboxId: string; message: string }
  | { type: 'error'; message: string }
  | { type: 'stopped' };

@Injectable()
export class MailWorkerSupervisor
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(MailWorkerSupervisor.name);
  private worker?: Worker;
  private restartTimer?: NodeJS.Timeout;
  private stopping = false;
  private restartDelayMs = 1000;
  private restartTimestamps: number[] = [];
  private status: 'disabled' | 'starting' | 'up' | 'restarting' | 'stopping' =
    'disabled';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!this.isEnabled()) return;
    this.status = 'starting';
    this.startWorker();
  }

  getStatus(): 'disabled' | 'starting' | 'up' | 'restarting' | 'stopping' {
    return this.status;
  }
  //NOTE - đếm restart bao nhiêu lần trong 5 phút
  getRecentRestartCount(windowMs = 5 * 60 * 1000): number {
    const cutoff = Date.now() - windowMs;
    this.restartTimestamps = this.restartTimestamps.filter(
      (timestamp) => timestamp >= cutoff,
    );
    return this.restartTimestamps.length;
  }

  wake(): void {
    try {
      this.worker?.postMessage({ type: 'wake' });
    } catch (error) {
      this.logger.warn(
        `Could not wake mail worker: ${error instanceof Error ? error.message : String(error)}`,
      );
      const worker = this.worker;
      this.worker = undefined;
      this.status = 'restarting';
      if (worker) {
        void worker.terminate().finally(() => this.scheduleRestart());
      } else {
        this.scheduleRestart();
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.status = 'stopping';
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (!this.worker) return;
    const worker = this.worker;
    this.worker = undefined;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(
        () => {
          void worker.terminate().finally(resolve);
        },
        this.numberConfig('MAIL_WORKER_SHUTDOWN_TIMEOUT_MS', 15000),
      );
      worker.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      try {
        worker.postMessage({ type: 'shutdown' });
      } catch {
        clearTimeout(timeout);
        void worker.terminate().finally(resolve);
      }
    });
  }

  private startWorker(): void {
    if (this.stopping || this.worker) return;
    const worker = new Worker(new URL('./mail.worker.js', import.meta.url), {
      workerData: this.workerData(),
    });
    this.worker = worker;
    worker.on('message', (message: WorkerMessage) => {
      if (message.type === 'ready') {
        this.restartDelayMs = 1000;
        this.status = 'up';
        this.logger.log('Mail worker ready');
      } else if (message.type === 'processing') {
        this.logger.debug(`Mail worker processing ${message.outboxId}`);
        logOperationalEvent('info', 'mail_outbox_processing', {
          outboxId: message.outboxId,
        });
      } else if (message.type === 'error') {
        this.logger.error(`Mail worker error: ${message.message}`);
        logOperationalEvent('error', 'mail_outbox_failed', {
          reason: message.message,
        });
      } else if (message.type === 'sent') {
        logOperationalEvent('info', 'mail_outbox_sent', {
          outboxId: message.outboxId,
        });
      } else if (message.type === 'failed') {
        logOperationalEvent('error', 'mail_outbox_failed', {
          outboxId: message.outboxId,
          reason: message.message,
        });
      }
    });
    worker.on('error', (error) => {
      this.logger.error('Mail worker crashed', error.stack);
    });
    worker.on('exit', (code) => {
      if (this.worker === worker) this.worker = undefined;
      if (!this.stopping) {
        this.status = 'restarting';
        this.restartTimestamps.push(Date.now());
        this.getRecentRestartCount();
        recordMailWorkerRestart();
        logOperationalEvent('warn', 'mail_worker_restarting', {
          exitCode: code,
        });
        this.logger.warn(`Mail worker exited with code ${code}; restarting`);
        this.scheduleRestart();
      }
    });
  }

  private scheduleRestart(): void {
    if (this.restartTimer || this.stopping) return;
    const delay = this.restartDelayMs;
    this.restartDelayMs = Math.min(this.restartDelayMs * 2, 30000);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      this.startWorker();
    }, delay);
  }

  private isEnabled(): boolean {
    if (this.config.get<string>('NODE_ENV') === 'test') return false;
    const configured = this.config.get<string>('MAIL_WORKER_ENABLED');
    if (configured !== undefined) return configured === 'true';
    return true;
  }

  private workerData(): MailWorkerData {
    return {
      databaseUrl: this.requiredConfig('DATABASE_URL'),
      smtpHost: this.config.get<string>('SMTP_HOST') ?? 'smtp.example.com',
      smtpPort: this.numberConfig('SMTP_PORT', 587),
      smtpSecure: this.config.get<string>('SMTP_SECURE') === 'true',
      smtpUser: this.config.get<string>('SMTP_USER'),
      smtpPassword: this.config.get<string>('SMTP_PASSWORD'),
      smtpFrom:
        this.config.get<string>('SMTP_FROM') ??
        'CineBook <no-reply@example.com>',
      publicAppUrl: (
        this.config.get<string>('PUBLIC_APP_URL') ?? 'http://localhost:5173'
      ).replace(/\/$/, ''),
      pollMs: this.numberConfig('MAIL_WORKER_POLL_MS', 10000),
      staleLockMs: this.numberConfig('MAIL_WORKER_STALE_LOCK_MS', 300000),
      maxAttempts: this.numberConfig('MAIL_WORKER_MAX_ATTEMPTS', 5),
    };
  }

  private requiredConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value)
      throw new Error(`${key} is required when mail worker is enabled`);
    return value;
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}

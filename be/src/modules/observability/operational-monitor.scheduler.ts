import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DiscordAlertService } from './discord-alert.service.js';
import { MetricsService } from './metrics.service.js';
import { OperationsService } from './operations.service.js';

@Injectable()
export class OperationalMonitorScheduler {
  constructor(
    private readonly config: ConfigService,
    private readonly operations: OperationsService,
    private readonly metrics: MetricsService,
    private readonly alerts: DiscordAlertService,
  ) {}

  @Cron('*/1 * * * *')
  async monitor(): Promise<void> {
    const status = await this.operations.getStatus();
    this.metrics.updateOperationalMetrics({
      databaseUp: status.database === 'up',
      redisUp: status.redis === 'up',
      mailWorkerUp:
        status.mailWorker.status === 'up' ||
        status.mailWorker.status === 'disabled',
      mailOutboxPending: status.mailOutbox.pending,
      mailOutboxFailed: status.mailOutbox.failed,
      mailOutboxOldestPendingSeconds: status.mailOutbox.oldestPendingSeconds,
    });

    if (!this.alerts.isEnabled()) return;

    const pendingThreshold = this.numberConfig(
      'MAIL_OUTBOX_PENDING_ALERT_THRESHOLD',
      20,
    );
    const ageThreshold = this.numberConfig(
      'MAIL_OUTBOX_AGE_ALERT_SECONDS',
      900,
    );
    const failedThreshold = this.numberConfig(
      'MAIL_OUTBOX_FAILED_ALERT_THRESHOLD',
      1,
    );
    const paymentThreshold = this.numberConfig(
      'PAYMENT_REVIEW_ALERT_THRESHOLD',
      1,
    );
    const restartThreshold = this.numberConfig(
      'MAIL_WORKER_RESTART_ALERT_THRESHOLD',
      3,
    );

    const alertUpdates = [
      this.alerts.update(
        'database-down',
        status.database === 'down',
        'Database không khả dụng',
        {
          trạng_thái: status.database,
        },
      ),
      this.alerts.update(
        'redis-down',
        status.redis === 'down',
        'Redis không khả dụng',
        {
          trạng_thái: status.redis,
        },
      ),
      this.alerts.update(
        'mail-worker-restarting',
        status.mailWorker.restartsLast5Minutes >= restartThreshold,
        'Mail Worker khởi động lại liên tục',
        {
          số_lần_5_phút: status.mailWorker.restartsLast5Minutes,
          ngưỡng: restartThreshold,
          trạng_thái: status.mailWorker.status,
        },
      ),
    ];

    if (status.database === 'up') {
      alertUpdates.push(
        this.alerts.update(
          'mail-outbox-backlog',
          status.mailOutbox.pending >= pendingThreshold,
          'Mail outbox vượt ngưỡng pending',
          { pending: status.mailOutbox.pending, ngưỡng: pendingThreshold },
        ),
        this.alerts.update(
          'mail-outbox-failed',
          status.mailOutbox.failed >= failedThreshold,
          'Mail outbox có thư gửi thất bại',
          { thất_bại: status.mailOutbox.failed, ngưỡng: failedThreshold },
        ),
        this.alerts.update(
          'mail-outbox-age',
          status.mailOutbox.oldestPendingSeconds >= ageThreshold,
          'Mail outbox có thư chờ quá lâu',
          {
            tuổi_giây: status.mailOutbox.oldestPendingSeconds,
            ngưỡng_giây: ageThreshold,
          },
        ),
        this.alerts.update(
          'payment-review-required',
          status.payments.reviewRequired >= paymentThreshold,
          'Có giao dịch cần đối soát',
          {
            số_giao_dịch: status.payments.reviewRequired,
            ngưỡng: paymentThreshold,
          },
        ),
      );
    }

    await Promise.all(alertUpdates);
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}

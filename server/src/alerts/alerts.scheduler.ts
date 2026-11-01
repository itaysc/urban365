import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertsService } from './alerts.service.js';

/**
 * Hourly. The service itself decides whether it is a civil hour to write to somebody
 * and whether they have already had one today, so this only has to be frequent enough
 * that a listing published in the morning is told about the same morning.
 */
const EVERY_MS = 60 * 60_000;

/** Shortly after boot, so a fresh install is not silent for an hour. */
const FIRST_RUN_MS = 45_000;

/** Same shape as the other two sweeps: one idempotent job on a timer, off under test. */
@Injectable()
export class AlertsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsScheduler.name);
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;

  constructor(
    private readonly alerts: AlertsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('app.nodeEnv') === 'test') return;

    this.first = setTimeout(() => void this.tick(), FIRST_RUN_MS);
    this.first.unref();
    this.timer = setInterval(() => void this.tick(), EVERY_MS);
    this.timer.unref();
    this.logger.log('Saved-search alerts sweep every hour.');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.first) clearTimeout(this.first);
  }

  private async tick(): Promise<void> {
    try {
      await this.alerts.sendDue();
    } catch (error) {
      this.logger.error(`Alerts sweep failed: ${(error as Error).message}`);
    }
  }
}

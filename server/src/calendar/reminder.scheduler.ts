import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfirmationsService } from './confirmations.service.js';

/** Often enough that a reminder is never more than this late, rarely enough to be free. */
const EVERY_MS = 5 * 60_000;

/**
 * Runs the reminder sweep on a timer.
 *
 * A `setInterval` rather than a job queue or a cron dependency, because there is one job
 * and it is idempotent: the claim inside `sendDueReminders` is what makes correctness
 * independent of how many instances are running or how often they tick. A queue would
 * be infrastructure to operate in exchange for nothing this job needs.
 *
 * Not started in tests: a timer that fires during a test run sends mail nobody asked
 * for and keeps the process alive after the assertions have finished.
 */
@Injectable()
export class ReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly confirmations: ConfirmationsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('app.nodeEnv') === 'test') return;

    this.timer = setInterval(() => void this.tick(), EVERY_MS);
    // Lets the process exit on its own rather than being held open by a pending timer.
    this.timer.unref();
    this.logger.log(`Viewing reminders sweep every ${EVERY_MS / 60_000} minutes.`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      await this.confirmations.sendDueReminders();
    } catch (error) {
      // A sweep that throws must not take the timer with it.
      this.logger.error(`Reminder sweep failed: ${(error as Error).message}`);
    }
  }
}

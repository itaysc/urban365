import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BriefingService } from './briefing.service.js';
import { MatchingService } from './matching.service.js';

/**
 * Hourly, not nightly.
 *
 * A listing added at ten in the morning is worth matching at eleven, while the agent is
 * still thinking about it — and the sweep is idempotent, so running it twelve times a
 * day costs twelve comparisons of a few numbers and raises nothing it raised before.
 */
const EVERY_MS = 60 * 60_000;

/** The first run, shortly after boot, so a fresh install is not empty for an hour. */
const FIRST_RUN_MS = 30_000;

/**
 * Runs the matching sweep on a timer.
 *
 * Same shape as the reminder sweep and for the same reasons: one idempotent job, a
 * `setInterval` rather than a queue, and nothing started under test.
 */
@Injectable()
export class MatchScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchScheduler.name);
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;

  constructor(
    private readonly matching: MatchingService,
    private readonly briefings: BriefingService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('app.nodeEnv') === 'test') return;

    // Switched off before launch, where there is nothing due and the tick is the only
    // thing keeping the database from sleeping. See `AppConfig.schedulersEnabled`.
    if (this.config.get<boolean>('app.schedulersEnabled') === false) {
      this.logger.log('Matching sweep is off — SCHEDULERS_ENABLED=false.');
      return;
    }

    this.first = setTimeout(() => void this.tick(), FIRST_RUN_MS);
    this.first.unref();

    this.timer = setInterval(() => void this.tick(), EVERY_MS);
    this.timer.unref();
    this.logger.log(
      `Matching sweep every ${EVERY_MS / 60_000} minutes, with the morning briefing.`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.first) clearTimeout(this.first);
  }

  private async tick(): Promise<void> {
    // Matching first, so a briefing sent a moment later carries what this hour found.
    try {
      await this.matching.sweep();
    } catch (error) {
      // A sweep that throws must not take the timer with it.
      this.logger.error(`Matching sweep failed: ${(error as Error).message}`);
    }

    // Separately, so a failure in one still leaves the other to run. The briefing
    // decides for itself whether it is morning and whether anybody is due one.
    try {
      await this.briefings.sendDue();
    } catch (error) {
      this.logger.error(`Briefing sweep failed: ${(error as Error).message}`);
    }
  }
}

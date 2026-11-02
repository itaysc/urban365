/**
 * Pulls the national transaction registry into our own database.
 *
 *   npm run sync:deals -- --backfill     # once: everything from 1998
 *   npm run sync:deals                   # daily: a rolling 12-month window
 *   npm run sync:deals -- --months 3     # a narrower window
 *   npm run sync:deals -- --status       # what we hold, and how fresh it is
 *
 * The backfill is about 3.18 million rows and takes roughly half an hour of polite
 * paging. The daily run is a handful of requests: it re-reads recent deal dates and
 * upserts, because the registry publishes a transaction about three months after it
 * happens and a late report has to land somewhere.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module.js';
import { DealsSyncService, WINDOW_MONTHS } from '../deals/deals.sync.js';
import { MashkofSource } from '../deals/mashkof.source.js';

const shekels = (n: number) => new Intl.NumberFormat('en-US').format(n);

async function main() {
  const logger = new Logger('SyncDeals');
  const args = process.argv.slice(2);

  const backfill = args.includes('--backfill');
  const statusOnly = args.includes('--status');
  const monthsArg = args.indexOf('--months');
  const months = monthsArg === -1 ? WINDOW_MONTHS : Number(args[monthsArg + 1]);

  if (!Number.isFinite(months) || months <= 0) {
    logger.error('--months needs a positive number of months');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const sync = app.get(DealsSyncService);

  try {
    if (statusOnly) {
      const held = await sync.status();
      logger.log(`Holding ${shekels(held.total)} deals`);
      logger.log(`Newest deal date: ${held.newestDeal?.toISOString().slice(0, 10) ?? 'none'}`);
      logger.log(`Source data as of: ${held.dataAsOf?.toISOString().slice(0, 10) ?? 'unknown'}`);
      return;
    }

    const source = new MashkofSource();
    const since = backfill ? null : windowStart(months);

    logger.log(
      backfill
        ? `Backfilling everything from ${source.name}. This takes a while.`
        : `Syncing deals dated ${since!.toISOString().slice(0, 10)} onwards from ${source.name}.`,
    );

    const started = Date.now();
    const result = await sync.sync(source, since);
    const seconds = Math.round((Date.now() - started) / 1000);

    logger.log(
      `Done in ${seconds}s: ${result.pages} pages, ${shekels(result.received)} rows received, ` +
        `${shekels(result.written)} written.`,
    );

    const held = await sync.status();
    logger.log(`Now holding ${shekels(held.total)} deals, newest ${held.newestDeal?.toISOString().slice(0, 10)}.`);

    /*
     * The upstream's own cut-off, not ours. A mirror that has stopped being updated
     * still answers every request perfectly well, so the only way to notice is to
     * watch this number — and the only way to watch it is to print it.
     */
    if (result.dataAsOf) {
      const daysBehind = Math.round((Date.now() - result.dataAsOf.getTime()) / 86_400_000);
      logger.log(`Source data as of ${result.dataAsOf.toISOString().slice(0, 10)} (${daysBehind} days ago).`);
      if (daysBehind > 45) {
        logger.warn(
          `The source has not advanced in ${daysBehind} days. Transactions take about ` +
            '90 days to reach the registry, so some lag is normal — but a figure that ' +
            'stops moving means the upstream has frozen, and our deals will quietly age.',
        );
      }
    }
  } finally {
    await app.close();
  }
}

function windowStart(months: number): Date {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  return since;
}

void main();

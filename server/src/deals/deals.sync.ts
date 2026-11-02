import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DealsCursor, DealsSource, IncomingDeal } from './deals.source.js';

/**
 * How far back the daily sync re-reads.
 *
 * The registry publishes a transaction roughly three months after it happens, and the
 * tail is ragged: at the time of writing July was about 45% reported, August 13% and
 * September 1%. Twelve months is comfortably wider than that lag, so a deal reported
 * late still lands in a window we are re-reading, and the upsert makes re-reading it
 * free. It costs about nine requests a day.
 */
export const WINDOW_MONTHS = 12;

/** Rows per database round trip. Independent of the source's page size. */
const CHUNK = 1_000;

export interface SyncResult {
  pages: number;
  received: number;
  written: number;
  dataAsOf: Date | null;
}

@Injectable()
export class DealsSyncService {
  private readonly logger = new Logger(DealsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pull everything from `since` onwards into our own tables.
   *
   * `since: null` is the one-time back catalogue — about 3.18 million rows, a few
   * hundred megabytes, half an hour of polite paging. Worth doing once and in full:
   * comps only ever read a recent window, but a property page showing what this flat
   * sold for in 2014 needs 2014, and the back catalogue is precisely the part that
   * cannot be re-fetched if the upstream goes away.
   */
  async sync(source: DealsSource, since: Date | null): Promise<SyncResult> {
    const result: SyncResult = { pages: 0, received: 0, written: 0, dataAsOf: null };
    let after: DealsCursor | null = null;

    for (;;) {
      const page = await source.pull({ since, after, limit: CHUNK * 10 });

      result.pages += 1;
      result.received += page.deals.length;
      result.dataAsOf = page.dataAsOf ?? result.dataAsOf;

      result.written += await this.write(source, page.deals, page.dataAsOf);

      this.logger.log(
        `${source.name}: page ${result.pages}, ${result.received} rows so far` +
          (page.next ? '' : ' (last)'),
      );

      if (!page.next) break;
      after = page.next;
    }

    return result;
  }

  /** The rolling window the scheduled job runs. */
  async syncRecent(source: DealsSource, now = new Date()): Promise<SyncResult> {
    const since = new Date(now);
    since.setMonth(since.getMonth() - WINDOW_MONTHS);
    return this.sync(source, since);
  }

  /**
   * Upsert by the upstream's own id, in chunks.
   *
   * `createMany ... skipDuplicates` would be faster and wrong: a deal that was
   * corrected upstream — a price restated, a row moved out of the statistics — has to
   * land as an update, and skipping it would freeze the first version we ever saw.
   * The daily window re-reads rows we already hold precisely so corrections arrive.
   */
  private async write(
    source: DealsSource,
    deals: IncomingDeal[],
    dataAsOf: Date | null,
  ): Promise<number> {
    let written = 0;

    for (let at = 0; at < deals.length; at += CHUNK) {
      const chunk = deals.slice(at, at + CHUNK);

      await this.prisma.$transaction(
        chunk.map((deal) => {
          const row = { ...deal, source: source.name, dataAsOf, syncedAt: new Date() };
          return this.prisma.marketDeal.upsert({
            where: { id: deal.id },
            create: row,
            update: row,
          });
        }),
      );

      written += chunk.length;
    }

    return written;
  }

  /** What we hold, for the report at the end of a run and for a staleness check. */
  async status(): Promise<{ total: number; newestDeal: Date | null; dataAsOf: Date | null }> {
    const [total, newest] = await Promise.all([
      this.prisma.marketDeal.count(),
      this.prisma.marketDeal.findFirst({
        orderBy: { dealDate: 'desc' },
        select: { dealDate: true, dataAsOf: true },
      }),
    ]);

    return {
      total,
      newestDeal: newest?.dealDate ?? null,
      dataAsOf: newest?.dataAsOf ?? null,
    };
  }
}

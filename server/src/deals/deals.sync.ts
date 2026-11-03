import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { cellOf } from '../cadastre/parcel-index.js';
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

      /*
       * A cursor that has not moved means the source handed back the same last row
       * again, and following it would loop for ever against somebody else's server.
       * It has never happened; it costs two lines to make sure it cannot.
       */
      if (after && after.dealDate === page.next.dealDate && after.id === page.next.id) {
        this.logger.warn(`${source.name}: cursor stopped advancing at ${after.dealDate}/${after.id}`);
        break;
      }

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
   * Upsert by the upstream's own id, one statement per chunk.
   *
   * `createMany ... skipDuplicates` would be simpler and wrong: a deal corrected
   * upstream — a price restated, a row moved out of the statistics — has to land as
   * an update, and skipping it would freeze the first version we ever saw. The daily
   * window re-reads rows we already hold precisely so corrections arrive.
   *
   * So: one `INSERT … ON CONFLICT DO UPDATE` with a thousand value tuples, rather
   * than a thousand `upsert` calls inside an interactive transaction. The first
   * version did the latter and died at page 14 of the backfill — a chunk took
   * 5,197 ms against Prisma's 5,000 ms transaction timeout, because every upsert is
   * its own round trip and they get slower as the indexes grow. One statement is one
   * round trip, needs no interactive transaction at all, and is atomic by itself.
   */
  private async write(
    source: DealsSource,
    deals: IncomingDeal[],
    dataAsOf: Date | null,
  ): Promise<number> {
    let written = 0;
    const syncedAt = new Date();

    for (let at = 0; at < deals.length; at += CHUNK) {
      const chunk = deals.slice(at, at + CHUNK);

      const values = chunk.map((d) => {
        /*
         * The grid cell is computed here, with the same `cellOf` the lookup uses, so
         * there is exactly one definition of which cell a point is in. A second one
         * written in SQL would drift by a rounding rule and every comp query would
         * quietly miss — a bug with no error message.
         */
        const cell =
          d.latitude === null || d.longitude === null ? null : cellOf(d.latitude, d.longitude);

        return Prisma.sql`(${d.id}, ${source.name}::"MarketDealSource", ${syncedAt}, ${dataAsOf},
          ${d.settlementCode}, ${d.settlement}, ${d.gush}, ${d.chelka}, ${d.subChelka},
          ${d.dealDate}, ${d.dealAmount}, ${d.rooms}, ${d.area}, ${d.pricePerSqm},
          ${d.yearBuilt}, ${d.propertyGroup}, ${d.dealNature}, ${d.isFullDeal},
          ${d.inStats}, ${d.latitude}, ${d.longitude}, ${d.firstSeen},
          ${cell?.cellLat ?? null}, ${cell?.cellLng ?? null})`;
      });

      await this.prisma.$executeRaw`
        INSERT INTO "MarketDeal" (
          "id", "source", "syncedAt", "dataAsOf", "settlementCode", "settlement",
          "gush", "chelka", "subChelka", "dealDate", "dealAmount", "rooms", "area",
          "pricePerSqm", "yearBuilt", "propertyGroup", "dealNature", "isFullDeal",
          "inStats", "latitude", "longitude", "firstSeen", "cellLat", "cellLng"
        )
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("id") DO UPDATE SET
          "source" = EXCLUDED."source",
          "syncedAt" = EXCLUDED."syncedAt",
          "dataAsOf" = EXCLUDED."dataAsOf",
          "settlementCode" = EXCLUDED."settlementCode",
          "settlement" = EXCLUDED."settlement",
          "gush" = EXCLUDED."gush",
          "chelka" = EXCLUDED."chelka",
          "subChelka" = EXCLUDED."subChelka",
          "dealDate" = EXCLUDED."dealDate",
          "dealAmount" = EXCLUDED."dealAmount",
          "rooms" = EXCLUDED."rooms",
          "area" = EXCLUDED."area",
          "pricePerSqm" = EXCLUDED."pricePerSqm",
          "yearBuilt" = EXCLUDED."yearBuilt",
          "propertyGroup" = EXCLUDED."propertyGroup",
          "dealNature" = EXCLUDED."dealNature",
          "isFullDeal" = EXCLUDED."isFullDeal",
          "inStats" = EXCLUDED."inStats",
          "latitude" = EXCLUDED."latitude",
          "longitude" = EXCLUDED."longitude",
          "firstSeen" = EXCLUDED."firstSeen",
          "cellLat" = EXCLUDED."cellLat",
          "cellLng" = EXCLUDED."cellLng"
      `;

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

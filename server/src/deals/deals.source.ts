import type { MarketDealSource } from '@prisma/client';

/**
 * One transaction, in our shape rather than any particular upstream's.
 *
 * Deliberately the columns of `MarketDeal` and nothing else: a source that happens to
 * return thirty-seven fields converts to this, so the ingest never learns the shape of
 * whoever is supplying it.
 */
export interface IncomingDeal {
  id: string;
  settlementCode: number;
  settlement: string;
  gush: number;
  chelka: number;
  subChelka: number | null;
  dealDate: Date;
  dealAmount: bigint;
  rooms: number | null;
  area: number | null;
  pricePerSqm: number | null;
  yearBuilt: number | null;
  propertyGroup: string | null;
  dealNature: string | null;
  isFullDeal: boolean;
  inStats: boolean;
  latitude: number | null;
  longitude: number | null;
  firstSeen: Date | null;
}

/**
 * Where a page stopped, as a keyset rather than an offset.
 *
 * `(dealDate, id)` because that is what the upstream has an index on. The obvious
 * cursor would have been the upstream's own "first seen" timestamp — exactly the
 * column that records when a late report arrived — but it is not indexed there, so
 * filtering on it scans three million rows and is killed by the ten-second query
 * timeout. Checking the index list before writing the loop is the only reason this
 * is a `(date, id)` pair and not a broken job.
 *
 * An OFFSET would drift: rows are inserted between pages and the window slides.
 */
export interface DealsCursor {
  dealDate: string;
  id: string;
}

export interface DealsPull {
  deals: IncomingDeal[];
  /**
   * The upstream's own data cut-off. Stored on every row, so "how fresh is this" has
   * an answer that does not depend on when our job last happened to run — and so a
   * source that has quietly stopped updating is visible rather than inferred.
   */
  dataAsOf: Date | null;
  /** Null when that was the last page. */
  next: DealsCursor | null;
}

export interface PullOptions {
  /**
   * Only deals on or after this date. Null means the whole back catalogue.
   *
   * The daily sync does not ask for "what changed since yesterday" — it re-pulls a
   * rolling window of recent deal dates and upserts. That is not laziness: the
   * registry publishes a transaction about three months after it happens, so "new
   * since yesterday" by deal date would miss every late report, and the column that
   * would answer it properly is unindexed upstream. A window wide enough to cover the
   * lag, re-read every day, catches them all and costs a handful of requests.
   */
  since: Date | null;
  after: DealsCursor | null;
  limit: number;
}

/**
 * Where transactions come from.
 *
 * An interface because the source is the part we expect to change. Today the only
 * working one is a community mirror of the Tax Authority registry; the Authority's own
 * system is free and public by court order but sits behind a login. When we have that
 * access it becomes a second implementation of this, and nothing above it moves.
 */
export interface DealsSource {
  readonly name: MarketDealSource;
  pull(options: PullOptions): Promise<DealsPull>;
}

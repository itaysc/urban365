import { Logger } from '@nestjs/common';
import type { MarketDealSource } from '@prisma/client';
import type { DealsCursor, DealsPull, DealsSource, IncomingDeal, PullOptions } from './deals.source.js';

const ENDPOINT = 'https://mashkof.pov.sh/api/sql';

/**
 * Their published ceiling is 10,000 rows a response and 8 MB. Ten thousand narrow
 * rows is comfortably inside the size cap and turns 3.18M rows into ~320 requests.
 */
export const MAX_ROWS = 10_000;

/** 60 requests a minute is their limit; one a second stays well under it. */
const MIN_INTERVAL_MS = 1_000;

const TIMEOUT_MS = 30_000;

/** Only the columns we store, so the response stays small and the index can cover it. */
const COLUMNS = [
  'id',
  'settlement_code',
  'settlement',
  'gush',
  'chelka',
  'sub_chelka',
  'deal_date',
  'deal_amount',
  'rooms',
  'area',
  'price_per_sqm',
  'year_built',
  'property_group',
  'deal_nature',
  'is_full_deal',
  'in_stats',
  'lat',
  'lon',
  'first_seen',
].join(', ');

interface SqlResponse {
  columns?: { name: string }[];
  rows?: unknown[][];
  data_as_of?: string;
  error?: { code?: string; message?: string };
}

const int = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : Math.round(n);
};

const float = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : n;
};

const date = (v: unknown): Date | null => {
  if (typeof v !== 'string' || v === '') return null;
  const at = new Date(v.length <= 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(at.getTime()) ? null : at;
};

/**
 * The community mirror of the Israel Tax Authority's transaction registry.
 *
 * About 3.18 million deals from 1998 onwards, de-duplicated and with split shares
 * already merged, served as read-only SQL over HTTP with no key. It is the only
 * source that works today: GovMap's transaction endpoints answer `403 reCAPTCHA
 * token is required`, and the Authority's own system now asks for an identity card.
 *
 * It is also somebody's side project with no stated licence and an update pipeline
 * that depends on the access the Authority closed in September 2026. That is why
 * every row records `dataAsOf` — so the day it stops moving is a thing we are told
 * rather than a thing a user discovers — and why this is one implementation of an
 * interface rather than the shape of the whole ingest.
 */
export class MashkofSource implements DealsSource {
  readonly name: MarketDealSource = 'mashkof';

  private readonly logger = new Logger(MashkofSource.name);
  private lastCall = 0;

  async pull({ since, after, limit }: PullOptions): Promise<DealsPull> {
    const where: string[] = [];

    if (since) where.push(`deal_date >= '${iso(since)}'`);

    /*
     * Keyset, not offset: everything on a later date, plus the tail of the cursor's
     * own date that we have not read yet. Written against (deal_date, id) because
     * that is the upstream's covering index — anything else is a full scan and a
     * killed query.
     */
    if (after) {
      where.push(
        `(deal_date > '${esc(after.dealDate)}' OR (deal_date = '${esc(after.dealDate)}' AND id > '${esc(after.id)}'))`,
      );
    }

    const rows = Math.min(limit, MAX_ROWS);
    const sql =
      `SELECT ${COLUMNS} FROM deals` +
      (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
      ` ORDER BY deal_date, id LIMIT ${rows}`;

    const body = await this.query(sql);

    const names = (body.columns ?? []).map((c) => c.name);
    const at = (row: unknown[], column: string): unknown => {
      const i = names.indexOf(column);
      return i === -1 ? null : row[i];
    };

    const deals: IncomingDeal[] = [];
    for (const row of body.rows ?? []) {
      const deal = toDeal(row, at);
      // A row without the three things that make it a located, dated transaction is
      // not a deal we can join to anything. Skipped rather than stored as a hole.
      if (deal) deals.push(deal);
      else this.logger.debug(`Skipped an unusable row from ${this.name}`);
    }

    const last = (body.rows ?? []).at(-1);
    const next: DealsCursor | null =
      (body.rows ?? []).length < rows || !last
        ? null
        : { dealDate: text(at(last, 'deal_date')) ?? '', id: text(at(last, 'id')) ?? '' };

    return { deals, dataAsOf: date(body.data_as_of), next };
  }

  private async query(sql: string): Promise<SqlResponse> {
    await this.throttle();

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, limit: MAX_ROWS }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    /*
     * They publish a Retry-After on 429 and 503 and ask callers to honour it. One
     * wait and one retry: if they are still refusing after that, the job should stop
     * and say so rather than sit in a loop against somebody else's server.
     */
    if (response.status === 429 || response.status === 503) {
      const wait = Number(response.headers.get('Retry-After') ?? 5);
      this.logger.warn(`${this.name} asked us to wait ${wait}s`);
      await sleep(Math.min(60, Math.max(1, wait)) * 1000);
      return this.query(sql);
    }

    if (!response.ok) {
      throw new Error(`${this.name} returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }

    const body = (await response.json()) as SqlResponse;
    if (body.error) throw new Error(`${this.name} rejected the query: ${body.error.message}`);

    return body;
  }

  private async throttle(): Promise<void> {
    const wait = this.lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCall = Date.now();
  }
}

/** Null when the row is missing anything that makes it a deal at all. */
function toDeal(row: unknown[], at: (row: unknown[], column: string) => unknown): IncomingDeal | null {
  const id = text(at(row, 'id'));
  const dealDate = date(at(row, 'deal_date'));
  const gush = int(at(row, 'gush'));
  const chelka = int(at(row, 'chelka'));
  const amount = at(row, 'deal_amount');

  if (id === null || !dealDate || gush === null || chelka === null) return null;
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null;

  return {
    id,
    settlementCode: int(at(row, 'settlement_code')) ?? 0,
    settlement: text(at(row, 'settlement')) ?? '',
    gush,
    chelka,
    subChelka: int(at(row, 'sub_chelka')),
    dealDate,
    dealAmount: BigInt(Math.round(Number(amount))),
    rooms: float(at(row, 'rooms')),
    area: int(at(row, 'area')),
    pricePerSqm: int(at(row, 'price_per_sqm')),
    yearBuilt: int(at(row, 'year_built')),
    propertyGroup: text(at(row, 'property_group')),
    dealNature: text(at(row, 'deal_nature')),
    // SQLite has no boolean; these arrive as 0 or 1.
    isFullDeal: int(at(row, 'is_full_deal')) !== 0,
    inStats: int(at(row, 'in_stats')) !== 0,
    latitude: float(at(row, 'lat')),
    longitude: float(at(row, 'lon')),
    firstSeen: date(at(row, 'first_seen')),
  };
}

/**
 * A scalar as text, or null.
 *
 * SQLite hands back strings, numbers, booleans and nulls, never objects — but the
 * response is `unknown` and `String()` on an object yields "[object Object]", which
 * would land in the database looking like data. Narrowing first means a shape we did
 * not expect becomes null rather than nonsense.
 */
const text = (v: unknown): string | null => {
  if (typeof v === 'string') return v === '' ? null : v;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return String(v);
  return null;
};

const iso = (at: Date): string => at.toISOString().slice(0, 10);

/** Dates and ids come from the upstream's own previous page, but quoting is cheap. */
const esc = (value: string): string => value.replace(/'/g, "''");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

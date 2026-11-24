import { median } from '../seo/stats.js';
import type { AskingPrices, RecordedDeal } from '../agents/end-user/street-history.js';
import {
  STREET_HISTORY_LIMIT,
  STREET_HISTORY_RADIUS_METRES,
  STREET_HISTORY_YEARS,
} from '../agents/end-user/street-history.js';

/**
 * How many individual sales the page lists.
 *
 * The yearly medians use every sale in the window. The table does not: a busy street
 * has hundreds, and eighty is already more than anyone reads in one sitting. The
 * count beside the heading says when the list was cut.
 */
export const HISTORY_SALES_LIMIT = 80;

export interface FoundHistory {
  city: string;
  street: string;
  years: number;
  deals: RecordedDeal[];
  truncated: boolean;
  rooms?: number;
  asking: AskingPrices | null;
}

export interface HistoryYear {
  year: number;
  count: number;
  median: number;
  perSqm: number | null;
}

export interface HistorySale {
  date: string;
  amount: number;
  rooms: number | null;
  area: number | null;
  perSqm: number | null;
  nature: string | null;
}

/** What the history page draws. Yearly medians, then a page of the sales themselves. */
export interface MarketHistoryView {
  city: string;
  street: string;
  radiusMetres: number;
  years: number;
  rooms: number | null;
  truncated: boolean;
  /** How many sales the window was cut to, when `truncated` is true. */
  cappedAt: number | null;
  total: number;
  byYear: HistoryYear[];
  sales: HistorySale[];
  /** How many sales the table is drawn from, before the cap. */
  salesTotal: number;
  asking: AskingPrices | null;
}

/**
 * The chart and the table, from the sales a street lookup already gathered.
 *
 * `year` changes only the table. The bars stay the whole window, so choosing 2019
 * does not make 2024 disappear.
 */
export function presentHistory(input: FoundHistory, year?: number): MarketHistoryView {
  const byYear = new Map<number, RecordedDeal[]>();
  for (const deal of input.deals) {
    const dealYear = deal.dealDate.getUTCFullYear();
    const list = byYear.get(dealYear) ?? [];
    list.push(deal);
    byYear.set(dealYear, list);
  }

  const years = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dealYear, rows]) => ({
      year: dealYear,
      count: rows.length,
      median: median(rows.map((row) => row.amount)) ?? 0,
      perSqm: median(
        rows.map((row) => row.pricePerSqm).filter((value): value is number => value !== null && value > 0),
      ),
    }));

  const pool =
    year === undefined ? input.deals : input.deals.filter((deal) => deal.dealDate.getUTCFullYear() === year);
  const sales = [...pool]
    .sort((a, b) => b.dealDate.getTime() - a.dealDate.getTime())
    .slice(0, HISTORY_SALES_LIMIT)
    .map((deal) => ({
      date: deal.dealDate.toISOString().slice(0, 10),
      amount: deal.amount,
      rooms: deal.rooms,
      area: deal.area,
      perSqm: deal.pricePerSqm,
      nature: deal.nature ?? null,
    }));

  return {
    city: input.city,
    street: input.street,
    radiusMetres: STREET_HISTORY_RADIUS_METRES,
    years: input.years,
    rooms: input.rooms ?? null,
    truncated: input.truncated,
    cappedAt: input.truncated ? STREET_HISTORY_LIMIT : null,
    total: input.deals.length,
    byYear: years,
    sales,
    salesTotal: pool.length,
    asking: input.asking,
  };
}

export const DEFAULT_HISTORY_YEARS = STREET_HISTORY_YEARS;

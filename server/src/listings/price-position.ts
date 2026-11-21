/**
 * Where an asking price sits against a number we already computed.
 *
 * The number is never invented here. A sale range comes from the valuation, and a
 * street median comes from the ads on that street. This file only says which side of
 * that number the ad is on, and in words that name the source.
 */

const SHEKELS = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });

export type PriceBasis = 'sales' | 'asking';
export type PriceStance = 'within' | 'above' | 'below';

export interface PricePosition {
  basis: PriceBasis;
  stance: PriceStance;
  /** Asking minus the reference, as a percent of the reference. Positive means the ad asks more. */
  gapPercent: number;
  asking: number;
  reference: number;
  /** The low end of a sale range, and only when the ad sits above that range. */
  offer: number | null;
  count: number;
  headline: string;
  detail: string;
}

export interface SaleRange {
  low: number;
  high: number;
  expected: number;
  count: number;
  /** True when the valuation itself called the comparison thin. */
  thin: boolean;
}

const shekel = (value: number) => `${SHEKELS.format(Math.round(value))} ₪`;
const percent = (value: number) => Math.abs(value).toLocaleString('he-IL');

/**
 * Asking prices within this of each other are the same price for a buyer.
 * A sale range has its own edges, so this applies only to the street-ad fallback.
 */
const ASKING_BAND = 0.08;

/** Fewer ads than this is not a street. */
export const MIN_STREET_ADS = 4;

function gap(asking: number, reference: number): number | null {
  if (!Number.isFinite(asking) || asking <= 0) return null;
  if (!Number.isFinite(reference) || reference <= 0) return null;
  return Math.round(((asking - reference) / reference) * 100);
}

export function positionAgainstSales(asking: number, range: SaleRange): PricePosition | null {
  const gapPercent = gap(asking, range.expected);
  if (gapPercent === null) return null;
  if (range.low <= 0 || range.high < range.low) return null;

  const stance: PriceStance = asking > range.high ? 'above' : asking < range.low ? 'below' : 'within';
  const shown = stance === 'within' ? gapPercent : gapPercent === 0 ? (stance === 'above' ? 1 : -1) : gapPercent;
  const offer = stance === 'above' ? range.low : null;
  const count = Math.max(0, Math.round(range.count));

  const headline =
    stance === 'within'
      ? 'המחיר בתוך טווח העסקאות הדומות'
      : stance === 'above'
        ? `המחיר המבוקש גבוה ב־${percent(shown)}% מעסקאות דומות`
        : `המחיר המבוקש נמוך ב־${percent(shown)}% מעסקאות דומות`;

  const basis = count > 0 ? `לפי ${count.toLocaleString('he-IL')} עסקאות דומות, ` : '';
  const thin = range.thin ? 'מעט עסקאות, אז הטווח רחב. ' : '';
  const opening = offer !== null ? ` פתיחה סבירה סביב ${shekel(offer)}, הקצה הנמוך של הטווח.` : '';

  return {
    basis: 'sales',
    stance,
    gapPercent: shown,
    asking,
    reference: range.expected,
    offer,
    count,
    headline,
    detail: `${basis}צפוי להימכר סביב ${shekel(range.expected)}. ${thin}זו השוואה, לא שמאות.${opening}`,
  };
}

export function positionAgainstAsking(asking: number, median: number, count: number): PricePosition | null {
  if (count < MIN_STREET_ADS) return null;
  const gapPercent = gap(asking, median);
  if (gapPercent === null) return null;

  const stance: PriceStance =
    Math.abs(asking - median) / median <= ASKING_BAND ? 'within' : asking > median ? 'above' : 'below';

  const headline =
    stance === 'within'
      ? 'דומה למודעות האחרות ברחוב'
      : stance === 'above'
        ? `המחיר המבוקש גבוה ב־${percent(gapPercent)}% מהמודעות ברחוב`
        : `המחיר המבוקש נמוך ב־${percent(gapPercent)}% מהמודעות ברחוב`;

  return {
    basis: 'asking',
    stance,
    gapPercent,
    asking,
    reference: median,
    offer: null,
    count,
    headline,
    detail: `לפי ${count.toLocaleString('he-IL')} מודעות ברחוב עכשיו, החציון ${shekel(median)}. אין מספיק עסקאות דומות, אז זו השוואה למחיר המבוקש ולא למחיר עסקה.`,
  };
}

/**
 * The questions a model wrote, kept only when they add nothing numerical.
 *
 * The headline already states the percent. A question that repeats a price, or
 * invents one, is dropped. Fewer than two survivors is no brief.
 */
export function readQuestions(raw: string | null | undefined): string[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown }).questions)
      ? (parsed as { questions: unknown[] }).questions
      : [];

  const kept: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const text = item.replace(/\s+/gu, ' ').trim();
    if (text.length < 8 || text.length > 160) continue;
    if (/[₪\d]/u.test(text)) continue;
    if (kept.includes(text)) continue;
    kept.push(text);
    if (kept.length === 3) break;
  }

  return kept.length >= 2 ? kept : [];
}

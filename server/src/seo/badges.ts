import { esc, price } from './html.js';

/**
 * The two badges a listing card wears, for the server-rendered pages.
 *
 * The same rules as `client/src/lib/listingBadges.ts`, written a second time because
 * the two halves of this repository share no package. **The thresholds below and the
 * ones there have to agree** — a buyer seeing "חדש" on a city page and not on the
 * search for the same flat would be right to distrust both.
 *
 * Both are time-limited on purpose: a badge that never expires stops being news, and
 * a page where half the cards shout has told the reader nothing.
 */

/** Mirrors DROP_IS_NEWS_FOR_DAYS in the client. */
export const DROP_IS_NEWS_FOR_DAYS = 30;
/** Mirrors NEW_FOR_DAYS in the client. */
export const NEW_FOR_DAYS = 7;

const daysSince = (date: Date, now: Date) => (now.getTime() - date.getTime()) / 86_400_000;

export interface Badgeable {
  lastPriceDropAmount: number | null;
  lastPriceDropAt: Date | null;
  /** What the source says; `publishedAt` is the fallback and `firstSeenAt` is not. */
  listedAt: Date | null;
  publishedAt: Date | null;
}

/** How far it came down, if that is still worth saying. */
export function priceDrop(listing: Badgeable, now = new Date()): number | null {
  const { lastPriceDropAmount: amount, lastPriceDropAt: at } = listing;
  if (!amount || amount <= 0 || !at) return null;

  return daysSince(at, now) <= DROP_IS_NEWS_FOR_DAYS ? amount : null;
}

/**
 * Whether it went on the market this week.
 *
 * Never from `firstSeenAt`: that is when we first saw it, which on a bulk import is
 * the same afternoon for the whole catalogue.
 */
export function isNew(listing: Badgeable, now = new Date()): boolean {
  const when = listing.listedAt ?? listing.publishedAt;
  if (!when) return false;

  const age = daysSince(when, now);
  return age >= 0 && age <= NEW_FOR_DAYS;
}

/** Both badges for one listing, as markup, or an empty string when it wears neither. */
export function badgesFor(listing: Badgeable, now = new Date()): string {
  const drop = priceDrop(listing, now);
  const fresh = isNew(listing, now);
  if (drop === null && !fresh) return '';

  return `<span class="badges">${
    drop !== null ? `<span class="drop">${esc(`ירידת מחיר ${price(-drop)}`)}</span>` : ''
  }${fresh ? '<span class="fresh">חדש!</span>' : ''}</span>`;
}

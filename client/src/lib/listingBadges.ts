/**
 * The two things a card says about a listing before anybody reads it.
 *
 * Both are time-limited on purpose. A badge that never expires stops being news: a
 * drop from last spring and a flat that went up six months ago are both just prices
 * now, and a results page where half the cards shout has told the reader nothing.
 */

/** A drop older than this is history, not news. */
export const DROP_IS_NEWS_FOR_DAYS = 30;

/** "New" means the last week, which is how long a buyer's own search stays fresh. */
export const NEW_FOR_DAYS = 7;

const daysSince = (iso: string, now: Date): number =>
  (now.getTime() - new Date(iso).getTime()) / 86_400_000;

interface Badged {
  lastPriceDropAmount: number | null;
  lastPriceDropAt: string | null;
  listedAt: string | null;
}

/**
 * How much this listing just came down by, if that is still worth saying.
 *
 * Null rather than zero when there is nothing to say, so a caller cannot accidentally
 * render "ירידת מחיר 0 ₪" from a falsy check gone wrong.
 */
export function priceDrop(listing: Badged, now = new Date()): number | null {
  const { lastPriceDropAmount: amount, lastPriceDropAt: at } = listing;
  if (!amount || amount <= 0 || !at) return null;

  // A date in the future is a clock disagreeing with ours, not a drop that has not
  // happened yet; treating it as current is the harmless reading.
  return daysSince(at, now) <= DROP_IS_NEWS_FOR_DAYS ? amount : null;
}

/** Whether this went on the market within the last week. */
export function isNew(listing: Badged, now = new Date()): boolean {
  if (!listing.listedAt) return false;

  const age = daysSince(listing.listedAt, now);
  return age >= 0 && age <= NEW_FOR_DAYS;
}

/**
 * What counts as a price change, and what a change implies for the listing.
 *
 * Pure, because the three places a price can move — the scrape, the agency editor and
 * a seller's own form — must agree about it, and the only way to be sure of that is one
 * function with tests rather than three `if` statements written months apart.
 */

/** A row for `ListingPriceChange`. */
export interface PriceChange {
  listingId: string;
  previous: number | null;
  price: number;
}

/** What `Listing` carries about its most recent drop, for a card to read cheaply. */
export interface DropColumns {
  lastPriceDropAmount: number | null;
  lastPriceDropAt: Date | null;
}

/**
 * Whether this is worth recording.
 *
 * A listing with no price is not at zero — it is unpriced, and the day somebody fills
 * the field in is the start of its history, not a drop from nothing. A price that has
 * not moved is not a change however many times a scrape sees it, which matters: the
 * feed is read hourly and recording every read would turn the history into a log.
 */
export function priceChange(
  listingId: string,
  previous: number | null | undefined,
  next: number | null | undefined,
): PriceChange | null {
  if (next === null || next === undefined) return null;

  const before = previous ?? null;
  if (before === next) return null;

  return { listingId, previous: before, price: next };
}

/**
 * What the change does to the listing's own drop columns.
 *
 * A rise clears them rather than leaving the old drop in place: a flat that went up is
 * not a flat on offer, and a badge saying otherwise is the kind of wrong that costs
 * somebody a viewing. The first price recorded is neither — nothing to compare it to.
 */
export function dropColumns(change: PriceChange, at: Date): DropColumns {
  if (change.previous === null) return { lastPriceDropAmount: null, lastPriceDropAt: null };

  const fall = change.previous - change.price;

  return fall > 0
    ? { lastPriceDropAmount: fall, lastPriceDropAt: at }
    : { lastPriceDropAmount: null, lastPriceDropAt: null };
}

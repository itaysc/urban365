/**
 * Reading whether this is a buyers' or a sellers' market.
 *
 * The guide's step 5, and it gives the signals to read directly:
 *
 * |  | שוק של מוכרים | שוק של קונים |
 * |---|---|---|
 * | זמן עד מכירה | קצר | ארוך |
 * | מספר דירות מוצעות | מעט | הרבה, ועולה |
 * | הורדות מחיר במודעות | נדירות | נפוצות |
 * | איפה נסגרות עסקאות | קרוב למקסימום | באמצע הטווח ומטה |
 *
 * Three of those four are things our own inventory knows: how long listings sit
 * (`listedAt` against `delistedAt`), how many are standing, and how often a price
 * comes down (`ListingPriceChange`). The fourth — where deals actually close within
 * their range — needs the asking price *and* the sale price of the same flat, which
 * nothing links today.
 *
 * ## This never touches the estimate
 *
 * The verdict moves only where inside the range the sale is expected to land, which is
 * the guide's step 7. The estimate itself comes from recorded sales and stays there.
 *
 * That separation is the whole reason this file is small and sits at the end. Asking
 * prices are *"משאלה"*, as the guide says, and a model that let them into the estimate
 * would read the market's optimism back to the market as though it were evidence. In a
 * rising market every asking price is high, the model agrees, and the next asking price
 * is higher still.
 */

export interface InventorySnapshot {
  /** Listings standing today in the area and bracket being valued. */
  standing: number;
  /** Listings standing a quarter ago, for the "and rising" the guide asks about. */
  standingBefore: number;
  /** Days on market for those that sold, their median. */
  medianDaysToSell: number | null;
  /** Share of standing listings that have cut their price at least once. */
  shareWithPriceCut: number;
  /** How many listings the shares above rest on. */
  sampled: number;
}

export type MarketState = 'buyers' | 'balanced' | 'sellers';

/**
 * Below this there is no inventory to read, and the answer is "balanced".
 *
 * Not a hedge: with a dozen listings, one agency clearing its books looks exactly
 * like a market turning. Our inventory is a few hundred listings nationally, so this
 * gate will refuse often, and saying nothing is better than reading a trend off noise.
 */
export const MIN_LISTINGS = 30;

/**
 * The thresholds, as the guide describes them in words.
 *
 * Deliberately wide apart, with everything between them called balanced. A verdict
 * that flips between buyers' and sellers' from one week to the next would move the
 * recommended asking price around for no reason a seller could understand.
 */
export const SLOW_SALE_DAYS = 120;
export const FAST_SALE_DAYS = 60;
export const COMMON_PRICE_CUTS = 0.3;
export const RARE_PRICE_CUTS = 0.1;
export const INVENTORY_RISING = 1.15;
export const INVENTORY_FALLING = 0.87;

export interface Verdict {
  state: MarketState;
  /** The signals that pointed each way, for the sentence shown on the page. */
  signals: { label: string; points: MarketState }[];
  /** False when there was too little inventory to read; the state is then a default. */
  confident: boolean;
}

/**
 * Score the guide's signals and take the majority.
 *
 * A count rather than a weighted blend. These are three coarse readings of the same
 * underlying thing, and the precision a weighting would imply is not there — what
 * matters is whether they agree.
 */
export function marketStateFrom(snapshot: InventorySnapshot): Verdict {
  const signals: { label: string; points: MarketState }[] = [];

  if (snapshot.medianDaysToSell !== null) {
    if (snapshot.medianDaysToSell >= SLOW_SALE_DAYS) {
      signals.push({ label: 'זמן ארוך עד מכירה', points: 'buyers' });
    } else if (snapshot.medianDaysToSell <= FAST_SALE_DAYS) {
      signals.push({ label: 'זמן קצר עד מכירה', points: 'sellers' });
    }
  }

  if (snapshot.shareWithPriceCut >= COMMON_PRICE_CUTS) {
    signals.push({ label: 'הורדות מחיר נפוצות', points: 'buyers' });
  } else if (snapshot.shareWithPriceCut <= RARE_PRICE_CUTS) {
    signals.push({ label: 'הורדות מחיר נדירות', points: 'sellers' });
  }

  const direction = snapshot.standingBefore > 0 ? snapshot.standing / snapshot.standingBefore : 1;
  if (direction >= INVENTORY_RISING) {
    signals.push({ label: 'מספר הדירות המוצעות עולה', points: 'buyers' });
  } else if (direction <= INVENTORY_FALLING) {
    signals.push({ label: 'מספר הדירות המוצעות יורד', points: 'sellers' });
  }

  if (snapshot.sampled < MIN_LISTINGS) {
    return { state: 'balanced', signals, confident: false };
  }

  const buyers = signals.filter((s) => s.points === 'buyers').length;
  const sellers = signals.filter((s) => s.points === 'sellers').length;

  const state: MarketState = buyers > sellers ? 'buyers' : sellers > buyers ? 'sellers' : 'balanced';

  return { state, signals, confident: true };
}

/**
 * How long a listing has been standing, which is the guide's step 4 per competitor.
 *
 * *"שתיהן באוויר כבר כמה חודשים. זה סימן שהמחירים האלה לא עובדים."* A competing flat's
 * asking price only means something alongside how long it has failed to sell at it.
 */
export function daysOnMarket(listedAt: Date | null, until: Date): number | null {
  if (!listedAt) return null;
  const days = (until.getTime() - listedAt.getTime()) / 86_400_000;
  return days >= 0 ? Math.floor(days) : null;
}

/**
 * What a city's listings add up to.
 *
 * Pure functions over rows that have already been read, so every figure on a landing
 * page can be checked in a test rather than in a browser. The database's job here is
 * `WHERE city = …`; the arithmetic is all in this file.
 *
 * Medians rather than averages throughout. One penthouse at ₪20m moves a mean enough to
 * make it a lie about the street, and the number under the heading "a flat in חולון
 * costs" has to be a number somebody could actually pay.
 */

/** The columns a statistic is computed from. Nothing here identifies a property. */
export interface StatRow {
  price: number | null;
  squareMeter: number | null;
  pricePerSquareMeter: number | null;
  rooms: number | null;
  propertyType: string | null;
  neighborhood: string | null;
}

export interface Summary {
  /** Every listing in the city, including the ones too incomplete to price. */
  count: number;
  /** How many of them carried a price, which is what every figure below rests on. */
  priced: number;
  medianPrice: number | null;
  /**
   * The arithmetic mean, shown beside the median rather than instead of it.
   *
   * On its own it is the wrong number — one penthouse among nine flats pulls it a
   * quarter of a million above anything on the market. Beside the median it is the
   * most useful thing on the page: where the two agree the market is even, and where
   * they part company the gap is itself the fact, and it is the fact somebody
   * comparing cities actually wants.
   */
  meanPrice: number | null;
  medianPricePerSqm: number | null;
  medianSquareMeter: number | null;
  /** The middle half of the market: a quarter of listings sit below, a quarter above. */
  typicalRange: { low: number; high: number } | null;
}

/** One line of a breakdown — by rooms, by property type, by neighbourhood. */
export interface Band {
  label: string;
  count: number;
  medianPrice: number | null;
  meanPrice: number | null;
  medianPricePerSqm: number | null;
}

/**
 * The fewest listings a breakdown line is allowed to speak for.
 *
 * Below this a median is one or two properties wearing the word "typical", and a page
 * that prints "4 rooms in בית שאן: ₪2.4m" on the strength of a single ad is worse than
 * a page that leaves the row out. The overall figures have no such floor — they are
 * stated alongside the count they came from, so the reader can judge them.
 */
export const MIN_BAND_SUPPORT = 3;

/**
 * Below this many listings a place is not offered to the index.
 *
 * Six is where a median starts to describe a market rather than a coincidence. The
 * page can still be built for a reader who followed a link, but a city or a
 * neighborhood under this line carries `noindex` and stays out of the sitemap.
 */
export const MIN_INDEXABLE = 6;

/** The middle value, or the mean of the middle two. Null when there is nothing to take. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

/** The arithmetic mean, rounded — shekels are whole and nobody prices a flat to the agora. */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** The value below which `fraction` of the list sits. Nearest-rank, so always a real one. */
export function quantile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));

  return sorted[index];
}

/**
 * The price of a square metre, preferring what the source said over what we can divide.
 *
 * The two disagree more often than they should: a listing whose area is the plot and
 * whose price is the house divides into a figure that would be a bargain anywhere in the
 * country. Where the source states the rate it has usually reconciled that already.
 */
function pricePerSqm(row: StatRow): number | null {
  if (row.pricePerSquareMeter && row.pricePerSquareMeter > 0) return row.pricePerSquareMeter;
  if (row.price && row.squareMeter && row.squareMeter > 0) return Math.round(row.price / row.squareMeter);
  return null;
}

const prices = (rows: StatRow[]) => rows.map((r) => r.price).filter((p): p is number => !!p && p > 0);

/** The headline figures for a set of listings. */
export function summarise(rows: StatRow[]): Summary {
  const priced = prices(rows);
  const rates = rows.map(pricePerSqm).filter((r): r is number => r !== null && r > 0);
  const areas = rows.map((r) => r.squareMeter).filter((a): a is number => !!a && a > 0);

  const low = quantile(priced, 0.25);
  const high = quantile(priced, 0.75);

  return {
    count: rows.length,
    priced: priced.length,
    medianPrice: median(priced),
    meanPrice: mean(priced),
    medianPricePerSqm: median(rates),
    medianSquareMeter: median(areas),
    // A range needs both ends and needs them to differ — "between ₪2.1m and ₪2.1m" is
    // an arithmetic result, not a sentence.
    typicalRange: low !== null && high !== null && high > low ? { low, high } : null,
  };
}

/** Group rows by a label, drop the groups too small to mean anything, order by size. */
function bands(rows: StatRow[], labelOf: (row: StatRow) => string | null): Band[] {
  const groups = new Map<string, StatRow[]>();

  for (const row of rows) {
    const label = labelOf(row)?.trim();
    if (!label) continue;

    const existing = groups.get(label);
    if (existing) existing.push(row);
    else groups.set(label, [row]);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length >= MIN_BAND_SUPPORT)
    .map(([label, group]) => ({
      label,
      count: group.length,
      medianPrice: median(prices(group)),
      meanPrice: mean(prices(group)),
      medianPricePerSqm: median(group.map(pricePerSqm).filter((r): r is number => r !== null && r > 0)),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * By number of rooms, in the order somebody reads a price list: smallest first.
 *
 * Half rooms are kept rather than rounded. `3.5 חדרים` is a distinct thing to buy in
 * Israel and it is what people type into a search box, so folding it into either
 * neighbour would both lose the row and misprice the two it joined.
 */
export function byRooms(rows: StatRow[]): Band[] {
  return bands(rows, (row) => (row.rooms && row.rooms > 0 ? String(row.rooms) : null)).sort(
    (a, b) => Number(a.label) - Number(b.label),
  );
}

export function byPropertyType(rows: StatRow[]): Band[] {
  return bands(rows, (row) => row.propertyType);
}

export function byNeighborhood(rows: StatRow[]): Band[] {
  return bands(rows, (row) => row.neighborhood);
}

/**
 * Carrying an old sale forward to today's money.
 *
 * The guide asks for comparable sales from the last six months. Against this dataset
 * that window is empty — registration lags the deal by about three months, and the
 * mirror we copy from stopped receiving updates — so we use two years of sales and
 * restate each one at today's level instead. That restatement needs a price index,
 * and this file is the arithmetic for building and applying one.
 *
 * It is not a cosmetic correction. Measured on a fixed specification (3–4 rooms,
 * 60–110 m², to hold the mix still) the national median rate ran:
 *
 *     2022H1  18,364      2024H1  22,500      2025H2  22,467
 *     2022H2  19,268      2024H2  23,000      2026H1  22,222
 *     2023H1  19,874      2025H1  22,212
 *     2023H2  20,833
 *
 * A sale from early 2022 is twenty-one per cent below today's level. Pooling it with a
 * 2025 sale untouched does not blur the answer, it drags it down.
 *
 * ## Two things the series above settles
 *
 * **The market has been flat since late 2024** — four consecutive half-years within
 * 3.5% of each other, with no direction. So when the index runs past its last complete
 * month it is **held flat** rather than extrapolated. That is not caution standing in
 * for knowledge; it is the best available estimate of a market that has not moved in
 * two years. Should it start moving again, this is the decision to revisit first.
 *
 * **The tail of the data is a trap.** Monthly medians over 2024–2026 sit near 22,000
 * until they appear to collapse: June 21,078 · July 18,103 · August 15,382 ·
 * September 13,646, on deal counts falling 4,145 → 2,025 → 718 → 54. Prices did not
 * fall by a third in one quarter.
 *
 * Measured against each town's own level the same months come out at 1.03 and 1.05,
 * slightly *above* trend — so almost none of that collapse was cheaper flats. It was
 * cheaper **places**: registration clears faster in the periphery, and the newest
 * months are a map of where the paperwork is quick rather than a picture of the
 * market. The fix for that is the place adjustment the fitting script applies, and
 * it is the same fix that steadied the whole series.
 *
 * They stay out of the index regardless, on their counts alone. A month holding a
 * tenth of its sales is an unfinished month whatever its median says, and
 * {@link completeThrough} is what keeps it out — on volume, never on price, because
 * excluding a month for having a surprising price is how an index is talked into
 * never surprising anyone.
 */

/** One month's worth of sales, already aggregated. */
export interface MonthObservation {
  /** `YYYY-MM`. */
  month: string;
  /** Deals behind the median — how much the month is worth believing. */
  n: number;
  /** Median ₪/m², ideally already normalised to a fixed size. */
  rate: number;
}

export interface IndexPoint {
  month: string;
  /** Relative to the base month, which is 1. */
  value: number;
  n: number;
  /** How much of this month's movement came from the settlement's own sales. */
  credibility: number;
}

export interface PriceIndex {
  /** Ascending by month. The last entry is the base, and its value is 1. */
  points: IndexPoint[];
  /** `YYYY-MM` of the base — the latest month judged complete. */
  base: string;
}

/**
 * How much a month's own sales are allowed to speak for it.
 *
 * Standard credibility weighting. At 150 deals a month the local figure carries half
 * the movement; a town with fifteen carries a tenth and inherits the rest from the
 * national series, which is right — its monthly median is mostly noise, and noise
 * chained across twenty-four months compounds into a trend that was never there.
 */
export const CREDIBILITY_K = 150;

export const credibilityOf = (n: number): number => n / (n + CREDIBILITY_K);

/**
 * The most a single month is allowed to move the index.
 *
 * A guard against the impossible month, not a smoother. Over 173 months of national
 * data the absolute month-on-month change runs: median 1.7%, p95 4.6%, p99 6.5%,
 * **maximum 7.6%**. The bound sits just above that maximum, so nothing the national
 * market has actually done in fourteen years would be touched, and only a genuine
 * artefact — a near-empty month, one tower completing — is caught.
 *
 * It was 4% until the real series was plotted against it, which clipped two ordinary
 * months in eighteen and the top tenth of all movements since 2012. A clamp that
 * routinely binds is not a guard, it is a quiet opinion about the data.
 */
export const MAX_MONTHLY_STEP = 0.08;

/**
 * Below this a month cannot start or anchor a series.
 *
 * Separate from credibility, which handles a *thin* month. This handles an *absent*
 * one: with four sales there is no median to speak of, and the month should inherit
 * the national movement whole rather than contribute a number.
 */
export const MIN_MONTH_DEALS = 25;

/**
 * Where the data stops being honest.
 *
 * Takes the monthly counts and returns the last month that looks completely reported
 * — the newest month still holding most of a normal month's volume. Everything after
 * it is the partially-registered tail described in this file's header.
 */
export function completeThrough(
  observations: MonthObservation[],
  share = 0.6,
): string | null {
  if (observations.length === 0) return null;

  const sorted = [...observations].sort((a, b) => a.month.localeCompare(b.month));

  /*
   * The yardstick is the year before the tail, not the whole series: volumes drift
   * over a decade, and a 2015 month should not vouch for a 2026 one. The median of a
   * trailing window is robust to the holiday months, which legitimately run light.
   */
  const recent = sorted.slice(-18, -3);
  const pool = (recent.length > 0 ? recent : sorted).map((o) => o.n).sort((a, b) => a - b);
  const typical = pool[Math.floor(pool.length / 2)];
  const floor = typical * share;

  for (let at = sorted.length - 1; at >= 0; at -= 1) {
    if (sorted[at].n >= floor) return sorted[at].month;
  }

  return null;
}

/**
 * Chain the monthly movements into a series ending at 1.
 *
 * Each month contributes a *ratio* to the month before it, never a level. Levels
 * cannot be blended across places — Tel Aviv is not a noisy reading of the national
 * rate, it is genuinely more expensive — but growth can, and growth is the only thing
 * an index is asked for.
 */
export function buildIndex(
  local: MonthObservation[],
  national: MonthObservation[],
  base: string,
): PriceIndex {
  const months = [...local]
    .filter((o) => o.month <= base)
    .sort((a, b) => a.month.localeCompare(b.month));

  const nationalBy = new Map(national.map((o) => [o.month, o]));
  const localBy = new Map(months.map((o) => [o.month, o]));

  const points: IndexPoint[] = [];
  const nationalStep = (from: string, to: string): number => {
    let ratio = 1;
    for (let at = nextMonth(from); at <= to; at = nextMonth(at)) {
      const here = nationalBy.get(at);
      const before = nationalBy.get(previousMonth(at));
      if (here && before && here.rate > 0 && before.rate > 0) ratio *= here.rate / before.rate;
    }
    return ratio;
  };

  /*
   * The level is tracked, not the running product, and each believable month is
   * priced off the last believable month rather than off wherever the chain has
   * drifted to. The difference only shows when a month is skipped: the skipped month
   * borrows the national movement so the series has a value for it, and then the
   * next real observation *replaces* that guess instead of compounding with it.
   * Multiplying ratios instead counted the gap twice — once as the borrowed national
   * step, once inside the longer local ratio that spans it — which bent the index
   * hardest in exactly the thin towns that have skipped months to begin with.
   */
  let level = 1;
  let anchor: { month: string; rate: number; level: number } | null = null;

  for (const [at, month] of monthsBetween(months[0]?.month ?? base, base).entries()) {
    const here = localBy.get(month);
    const usable = here !== undefined && here.n >= MIN_MONTH_DEALS && here.rate > 0;
    let credibility = 0;

    if (anchor && usable) {
      const span = monthsBetween(anchor.month, month).length - 1;
      credibility = credibilityOf(here.n);
      const blended =
        (here.rate / anchor.rate) * credibility +
        nationalStep(anchor.month, month) * (1 - credibility);

      level = anchor.level * clampStep(blended, span);
    } else if (at > 0) {
      // No local reading to trust: borrow this month's national movement.
      level *= clampStep(nationalStep(previousMonth(month), month), 1);
    }

    points.push({ month, value: level, n: here?.n ?? 0, credibility });
    if (usable) anchor = { month, rate: here.rate, level };
  }

  // Normalise so the base month is exactly 1 and every earlier month is a discount.
  const last = points.at(-1)?.value ?? 1;
  return {
    base,
    points: points.map((p) => ({ ...p, value: p.value / last })),
  };
}

/**
 * Hold a movement inside what a market can do over `span` months.
 *
 * The bound compounds with the span, so a ratio that covers a three-month gap is
 * allowed three months' worth of movement and no more.
 */
const clampStep = (ratio: number, span: number): number => {
  const months = Math.max(1, span);
  return Math.min(
    (1 + MAX_MONTHLY_STEP) ** months,
    Math.max((1 - MAX_MONTHLY_STEP) ** months, ratio),
  );
};

/**
 * What a sale from `month` is worth at the index's base.
 *
 * Months past the base return 1 — see the header on holding flat. Months before the
 * series starts get its earliest value, which understates how cheap they were; they
 * are also decades old and weighted into irrelevance long before this matters.
 */
export function carryForward(index: PriceIndex, month: string): number {
  if (index.points.length === 0) return 1;
  if (month >= index.base) return 1;

  const at = index.points.find((p) => p.month === month);
  if (at) return 1 / at.value;

  const first = index.points[0];
  if (month < first.month) return 1 / first.value;

  // A hole in the middle: the nearest earlier month is the best available answer.
  const before = index.points.filter((p) => p.month < month).at(-1);
  return before ? 1 / before.value : 1;
}

/**
 * How long a sale takes to reach the registry.
 *
 * Measured on this table rather than assumed: monthly counts hold near a full month
 * until three months back and fall away sharply after that. It is the reason the
 * guide's "last six months" cannot be asked for, and the reason a valuation made
 * today is working from evidence that stops in the spring.
 */
export const REPORTING_LAG_MONTHS = 3;

/**
 * The newest month a valuation made on `at` could honestly have seen.
 *
 * Two limits, whichever bites first: the registry's reporting lag, and the last month
 * the fitted parameters judged complete. In production the second always wins — the
 * parameters are older than the lag — so this changes nothing there. It exists so the
 * back-test gets the same treatment without a second code path: valuing a flat sold
 * in November 2025 looks only at sales reported by August, exactly as a valuation
 * made that November would have.
 */
export function reportedThrough(base: string, at: Date): string {
  let month = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
  for (let i = 0; i < REPORTING_LAG_MONTHS; i += 1) month = previousMonth(month);

  return month < base ? month : base;
}

/**
 * The same index as it stood in an earlier month.
 *
 * Carrying a sale forward restates it at the base month's level, so the base decides
 * what money the answer is quoted in. Left at the parameters' own base, a back-test
 * values a flat sold in 2025 in 2026 money and then marks it against a 2025 price —
 * and reports the difference between the two as model bias. It is not: it is the
 * index doing exactly what it was asked to.
 *
 * Months after the new base are dropped rather than ignored, because they are
 * knowledge the valuation did not have. Past it the series holds flat, as it always
 * does beyond its own edge.
 */
export function rebase(index: PriceIndex, month: string): PriceIndex {
  if (month >= index.base) return index;

  const points = index.points.filter((p) => p.month <= month);
  const level = points.at(-1)?.value;

  // Earlier than the series itself: no index, so nothing is carried anywhere.
  if (level === undefined || level === 0) return { base: month, points: [] };

  return { base: month, points: points.map((p) => ({ ...p, value: p.value / level })) };
}

/** How far past the data's edge today sits — the caller widens its range by this. */
export function monthsExtrapolated(index: PriceIndex, now: Date): number {
  const [year, month] = index.base.split('-').map(Number);
  return Math.max(0, (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month));
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let at = from;
  // Guarded rather than while(true): a malformed bound should not hang the request.
  for (let i = 0; at <= to && i < 1200; i += 1) {
    out.push(at);
    at = nextMonth(at);
  }
  return out;
}

export function nextMonth(month: string): string {
  const [year, index] = month.split('-').map(Number);
  return index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
}

export function previousMonth(month: string): string {
  const [year, index] = month.split('-').map(Number);
  return index === 1 ? `${year - 1}-12` : `${year}-${String(index - 1).padStart(2, '0')}`;
}

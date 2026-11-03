/**
 * Weighted statistics, which `src/seo/stats.ts` does not have and should not grow.
 *
 * That file's `StatRow` is listing-shaped and its medians are unweighted, which is
 * right for a city page summarising everything it has. Valuation pools eight comps of
 * deliberately unequal credibility, so every statistic here carries a weight, and a
 * handful of distant sales must not be able to outvote the one in the same building.
 */

export interface Weighted {
  value: number;
  weight: number;
}

/**
 * The value at which half the *weight* lies either side.
 *
 * Median rather than mean for the reason `stats.ts` already argues on city pages, only
 * more so at n=8: one family transfer at a third of the market price moves a mean and
 * barely touches a median.
 */
export function weightedMedian(points: Weighted[]): number | null {
  const usable = points.filter((p) => Number.isFinite(p.value) && p.weight > 0);
  if (usable.length === 0) return null;

  const sorted = [...usable].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, p) => sum + p.weight, 0);

  let seen = 0;
  for (const point of sorted) {
    seen += point.weight;
    if (seen >= total / 2) return point.value;
  }

  return sorted[sorted.length - 1].value;
}

export function weightedMean(points: Weighted[]): number | null {
  const usable = points.filter((p) => Number.isFinite(p.value) && p.weight > 0);
  if (usable.length === 0) return null;

  const total = usable.reduce((sum, p) => sum + p.weight, 0);
  return usable.reduce((sum, p) => sum + p.value * p.weight, 0) / total;
}

/** The weighted value at a fraction of the distribution — for an IQR. */
export function weightedQuantile(points: Weighted[], fraction: number): number | null {
  const usable = points.filter((p) => Number.isFinite(p.value) && p.weight > 0);
  if (usable.length === 0) return null;

  const sorted = [...usable].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, p) => sum + p.weight, 0);
  const target = total * Math.min(1, Math.max(0, fraction));

  let seen = 0;
  for (const point of sorted) {
    seen += point.weight;
    if (seen >= target) return point.value;
  }

  return sorted[sorted.length - 1].value;
}

/**
 * Median absolute deviation, scaled to be comparable with a standard deviation.
 *
 * Used for outlier trimming instead of an SD because the thing being trimmed is
 * precisely what would wreck an SD: a single transfer between relatives at a nominal
 * price. MAD barely notices it; an SD computed with it in would widen until the
 * outlier looks ordinary and something real gets dropped instead.
 */
export const MAD_TO_SIGMA = 1.4826;

export function medianAbsoluteDeviation(values: number[], centre: number): number | null {
  const deviations = values.filter(Number.isFinite).map((v) => Math.abs(v - centre));
  if (deviations.length === 0) return null;

  deviations.sort((a, b) => a - b);
  const middle = Math.floor(deviations.length / 2);
  const raw =
    deviations.length % 2 === 0
      ? (deviations[middle - 1] + deviations[middle]) / 2
      : deviations[middle];

  return raw * MAD_TO_SIGMA;
}

/**
 * Kish's effective sample size: `(Σw)² / Σw²`.
 *
 * Ten comps at a tenth of a weight each are not ten comps, and the decision to widen
 * the search or to refuse outright turns on knowing the difference. With equal weights
 * this returns the plain count, which is the property that makes it safe to use
 * everywhere a count would otherwise appear.
 */
export function effectiveCount(weights: number[]): number {
  const usable = weights.filter((w) => w > 0);
  if (usable.length === 0) return 0;

  const sum = usable.reduce((a, w) => a + w, 0);
  const squares = usable.reduce((a, w) => a + w * w, 0);
  return (sum * sum) / squares;
}

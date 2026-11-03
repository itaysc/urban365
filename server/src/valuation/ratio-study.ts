/**
 * Scoring a valuation against what the flat actually sold for.
 *
 * These are the IAAO's ratio-study measures, which are what assessors use to judge an
 * automated valuation and are therefore what we should be judged by too. Each ratio is
 * estimate ÷ sale price, so 1.0 is exactly right.
 *
 * Three of them say different things, and all three are needed:
 *
 * - **Median ratio** — bias. Are we high or low across the board? A model can be
 *   wildly imprecise and still sit at 1.00, so this is necessary and nowhere near
 *   sufficient.
 * - **COD** — precision. The average deviation from the median ratio, as a
 *   percentage. The IAAO calls under 15 good for single-family homes and under 10
 *   very good; those targets assume an assessor who has inspected the property, so
 *   ours will be worse and the number is still the right one to watch.
 * - **PRD** — fairness across price. Above 1.03 means cheap properties are valued
 *   high relative to dear ones, which is the regressivity every comps model drifts
 *   into. It is the direct test of whether the size exponent is doing its job.
 *
 * And one the IAAO does not define, because it matters more here than any of them:
 * **interval coverage**. The product's output is a range, not a number, and a range
 * nobody's sale price falls inside is worthless however good its midpoint.
 */

/**
 * The median, unrounded.
 *
 * Deliberately not `stats.median`, which rounds to the nearest whole number because
 * everything it measures is in shekels. A ratio lives between about 0.5 and 1.5, so
 * that rounding turns every even-sized sample into exactly 1 — and a back-test whose
 * bias measure is pinned to 1.00 reports a perfect model however wrong it is. The
 * tests below cover the even case for exactly this reason.
 */
function middle(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[at - 1] + sorted[at]) / 2 : sorted[at];
}

export interface Ratio {
  /** estimate ÷ actual sale price. */
  ratio: number;
  actual: number;
  estimate: number;
  /** Whether the sale price landed inside the quoted range. */
  covered: boolean;
}

export interface Study {
  n: number;
  medianRatio: number;
  /** Coefficient of dispersion, as a percentage. */
  cod: number;
  /** Price-related differential. Above 1.03 is regressive. */
  prd: number;
  withinTen: number;
  withinTwenty: number;
  coverage: number;
}

export function study(ratios: Ratio[]): Study | null {
  if (ratios.length === 0) return null;

  const values = ratios.map((r) => r.ratio);
  const centre = middle(values);

  /*
   * COD is built on the *median* ratio and the *mean* absolute deviation from it —
   * not the mean ratio, and not the median deviation. Mixing those up is the usual
   * way this number comes out flattering.
   */
  const deviation =
    values.reduce((sum, value) => sum + Math.abs(value - centre), 0) / values.length;

  /*
   * PRD compares the plain mean of the ratios with the ratio of the totals. The
   * second is weighted by price, so when the two disagree the model is treating cheap
   * and dear properties differently — which is exactly what it is meant to detect.
   */
  const meanRatio = values.reduce((sum, value) => sum + value, 0) / values.length;
  const totalEstimate = ratios.reduce((sum, r) => sum + r.estimate, 0);
  const totalActual = ratios.reduce((sum, r) => sum + r.actual, 0);
  const weighted = totalEstimate / totalActual;

  const share = (test: (r: Ratio) => boolean) =>
    ratios.filter(test).length / ratios.length;

  return {
    n: ratios.length,
    medianRatio: centre,
    cod: (deviation / centre) * 100,
    prd: weighted === 0 ? Number.NaN : meanRatio / weighted,
    withinTen: share((r) => Math.abs(r.ratio - 1) <= 0.1),
    withinTwenty: share((r) => Math.abs(r.ratio - 1) <= 0.2),
    coverage: share((r) => r.covered),
  };
}

/** Group ratios and score each group, dropping groups too small to mean anything. */
export function by<K extends string | number>(
  ratios: Ratio[],
  key: (ratio: Ratio, at: number) => K,
  minimum = 30,
): Map<K, Study> {
  const groups = new Map<K, Ratio[]>();

  for (const [at, ratio] of ratios.entries()) {
    const group = key(ratio, at);
    const bucket = groups.get(group) ?? [];
    bucket.push(ratio);
    groups.set(group, bucket);
  }

  const out = new Map<K, Study>();
  for (const [group, bucket] of groups) {
    if (bucket.length < minimum) continue;
    const result = study(bucket);
    if (result) out.set(group, result);
  }

  return out;
}

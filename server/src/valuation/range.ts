/**
 * Turning an estimate into the range and the asking price the guide actually asks for.
 *
 * *"כל נכס שווה טווח, לא מספר"* — step 6. The guide puts an ordinary range at about
 * 10% and a quick sale at up to 15%, measured from the bottom of the range, and its
 * worked example runs ₪1.5m to ₪1.65m. Step 7 then places a price inside it: that flat
 * is expected to sell near 1.55 and is advertised at 1.59, *"לא ב-1.7"*.
 *
 * ## Our range is wider than the guide's, and it should be
 *
 * The guide's 10% belongs to an agent who has stood in the flat. They know the floor,
 * the light, whether the kitchen was done last year or in 2009 — so by the time they
 * quote a range, most of what separates two flats in a building is already priced.
 *
 * We have not been inside. Measured across 3,226 groups of same-block, same-room-count
 * sales over two years — 66,979 deals, developer sales excluded — the interquartile
 * spread of ₪/m² runs:
 *
 *     p25 12.5%     median 18.0%     p75 24.4%     p90 31.2%
 *
 * Flats that are neighbours, the same size and the same age still differ by about 18%
 * across the middle half. That is the floor, the condition and the view, and it is
 * precisely what the registry does not record. The data sheet recovers part of it;
 * what remains is the width of our range, and quoting the guide's 10% regardless would
 * be claiming knowledge we do not have.
 *
 * ## What the range means
 *
 * The central half of plausible outcomes — the middle two of four comparable sales,
 * not a confidence interval. That matches the guide's own ends: the top is *"מה שקונה
 * מתאים ישלם בתקופה טובה"*, the bottom *"מחיר שמביא קונה מהר, בלי להפסיד כסף מיותר"*.
 * Neither is a bound on what is possible, and the back-test's interval coverage should
 * come out near 50%. If it comes out at 80%, the range is too wide and this is the
 * number to move.
 */

import { effectiveCount } from './weighted.js';

/**
 * Half the central interval, in standard deviations: the 75th percentile of a normal.
 *
 * Deliberately not 1.96 or even 1.0. The guide's range is where the sale is *likely*
 * to land, not where it is *certain* to; a 95% band on this data would be ±26% and
 * would tell a seller nothing they could act on.
 */
export const RANGE_Z = 0.6745;

/**
 * The median's inefficiency against the mean, √(π/2).
 *
 * The pooled rate is a weighted median, which is the right choice on skewed property
 * data but pays about 25% more standard error than a mean would on clean data.
 */
export const MEDIAN_SE_FACTOR = 1.2533;

/**
 * Bounds on the half-width, from the measurement above.
 *
 * The floor is roughly what the tightest quarter of markets support — below it we
 * would be claiming a precision the comparables cannot carry, however many there are.
 * The ceiling is near the p90 group: past that the honest answer is not a very wide
 * range but no range at all, which is {@link TOO_SPREAD}.
 */
export const MIN_HALF_WIDTH = 0.05;
export const MAX_HALF_WIDTH = 0.16;

/** Beyond this the comparables disagree so much that pooling them means nothing. */
export const TOO_SPREAD = 0.45;

/**
 * What a blank data sheet costs.
 *
 * Each unanswered question on the form leaves a piece of the 18% unexplained, so the
 * range has to carry it instead. Charged as variance so it adds in quadrature with
 * everything else rather than stacking linearly.
 */
export const UNKNOWN_FIELD_SIGMA = 0.025;

/** Each month past the index's last complete month is a month of assumed-flat market. */
export const EXTRAPOLATION_SIGMA_PER_MONTH = 0.004;

export interface Uncertainty {
  /** Dispersion of the normalised comparables: IQR / median. */
  spread: number;
  /** Kish effective count of the comparables used. */
  effective: number;
  /** Fields on the data sheet left blank. */
  unknownFields: number;
  /** Months the price index was carried past its last complete month. */
  monthsExtrapolated: number;
  /** The subject fell outside what the adjustment table can express. */
  qClamped: boolean;
}

export interface Range {
  low: number;
  high: number;
  /** Where the sale is expected to land, given the state of the market. */
  expected: number;
  /** What to advertise at — the guide's step 7. */
  asking: number;
  /** Half-width as a fraction of the point estimate. */
  halfWidth: number;
  /** The guide's own way of quoting a range: (high − low) / low. */
  widthFromFloor: number;
}

export type MarketState = 'buyers' | 'balanced' | 'sellers';

/**
 * Compose the half-width from everything that is uncertain.
 *
 * Two distinct errors, and conflating them is the usual mistake. There is error in
 * locating the market's rate, which shrinks as comparables are added; and there is the
 * variation between individual flats, which does not shrink at all — a thousand sales
 * on the street still would not tell us this flat's condition. The second term is the
 * larger one, and it is why a prediction interval is not a confidence interval.
 */
export function halfWidthFor(uncertainty: Uncertainty): number {
  const { spread, effective, unknownFields, monthsExtrapolated, qClamped } = uncertainty;

  // IQR → σ for a normal distribution.
  const sigmaIndividual = Math.max(0, spread) / 1.349;
  const sigmaMean =
    effective > 0 ? (sigmaIndividual * MEDIAN_SE_FACTOR) / Math.sqrt(effective) : sigmaIndividual;

  const sigmaUnknown = UNKNOWN_FIELD_SIGMA * Math.sqrt(Math.max(0, unknownFields));
  const sigmaDrift = EXTRAPOLATION_SIGMA_PER_MONTH * Math.max(0, monthsExtrapolated);

  /*
   * A clamped adjustment means the subject is outside the range of flats this table
   * can describe — a penthouse, or a ruin. The estimate is still the best available,
   * but it is an extrapolation and the range should say so.
   */
  const sigmaClamp = qClamped ? 0.04 : 0;

  const sigma = Math.hypot(sigmaIndividual, sigmaMean, sigmaUnknown, sigmaDrift, sigmaClamp);

  return Math.min(MAX_HALF_WIDTH, Math.max(MIN_HALF_WIDTH, RANGE_Z * sigma));
}

/**
 * Where inside the range the sale is expected to land.
 *
 * The guide's step 5 in one number. In a sellers' market deals close *"קרוב למקסימום"*;
 * in a buyers' market *"באמצע הטווח ומטה"*. Expressed as a position from 0 (the floor)
 * to 1 (the ceiling) — and note the market never moves the estimate itself, only where
 * within the range the sale is expected to fall.
 */
export const POSITION: Record<MarketState, number> = {
  buyers: 0.35,
  balanced: 0.5,
  sellers: 0.72,
};

/**
 * A little above the expected sale, never at the ceiling.
 *
 * The guide is emphatic about this, and about why *"תמיד אפשר לרדת"* fails: a buyer
 * willing to pay 750 who sees 850 opens at 650, and the gap becomes too wide to close.
 * Its example advertises 1.59 against an expected 1.55 — about a quarter of the way
 * from the expected sale to the top of the range, which is what this reproduces.
 */
export const ASKING_LIFT = 0.25;

export function rangeFor(
  value: number,
  uncertainty: Uncertainty,
  market: MarketState,
): Range | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (uncertainty.spread > TOO_SPREAD) return null;

  const halfWidth = halfWidthFor(uncertainty);
  const low = value * (1 - halfWidth);
  const high = value * (1 + halfWidth);

  const expected = low + (high - low) * POSITION[market];
  const asking = expected + (high - expected) * ASKING_LIFT;

  return {
    low: roundPrice(low),
    high: roundPrice(high),
    expected: roundPrice(expected),
    asking: roundPrice(asking),
    halfWidth,
    widthFromFloor: (high - low) / low,
  };
}

/**
 * Round the way prices are actually written.
 *
 * Nobody advertises ₪1,587,432. Ten thousand is the granularity of an Israeli asking
 * price up to a few million, and coarser above — and the rounding has to be visible,
 * because a number to the shekel implies a precision nothing here supports.
 */
export function roundPrice(value: number): number {
  const step = value >= 5_000_000 ? 50_000 : value >= 1_000_000 ? 10_000 : 5_000;
  return Math.round(value / step) * step;
}

/** Kish effective count, re-exported so callers assemble {@link Uncertainty} from one place. */
export { effectiveCount };

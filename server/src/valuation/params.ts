/**
 * The fitted parameters, as measured and checked in.
 *
 * Read from a file rather than computed at boot so that a valuation can be
 * reproduced: every stored estimate stamps `version`, and a seller who screenshots a
 * number must be able to get that number back months later. Refit with
 * `npm run fit:valuation`, which rewrites the JSON and is the only thing that should.
 */
import raw from './params/valuation-params.json' with { type: 'json' };

import type { FittedParams } from './elasticity.js';
import type { PriceIndex } from './index-series.js';

export interface ValuationParams {
  version: number;
  fittedAt: string;
  fittedFrom: string;
  /** The latest month judged completely reported; every index ends here. */
  base: string;
  elasticity: FittedParams;
  index: {
    national: Record<string, number>;
    bySettlement: Record<string, Record<string, number>>;
  };
}

export const PARAMS = raw as ValuationParams;

/**
 * The index for a settlement, or the national one where it has too few sales.
 *
 * Both share a base month by construction, so a settlement that falls back is still
 * being carried forward to the same point in time as one that does not.
 */
export function indexFor(settlementCode: number | null): PriceIndex {
  const local = settlementCode === null ? undefined : PARAMS.index.bySettlement[String(settlementCode)];
  const points = local ?? PARAMS.index.national;

  return {
    base: PARAMS.base,
    points: Object.entries(points)
      .map(([month, value]) => ({ month, value, n: 0, credibility: 0 }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

import { metresBetween, type Point } from './geo.js';
import { effectiveCount, medianAbsoluteDeviation, weightedMedian } from './weighted.js';

/**
 * Choosing which recorded sales speak for a property, and how loudly.
 *
 * The guide this implements ranks comparables by proximity — same building, then same
 * street, then nearby streets in the same neighbourhood — and says plainly that five
 * to ten good ones beat twenty unrelated. The registry has no street addresses, so
 * "same street" cannot be asked for directly; a point and a cadastral block are what
 * it gives us, and distance is the honest substitute.
 *
 * **Distance is a weight, never a multiplier.** It is tempting to mark a comp's price
 * up because its street is worse, but doing that needs a street-level price surface —
 * which is precisely the thing the comps are being asked to estimate. Weighting says
 * "this sale is less relevant"; adjusting would say "this sale was wrong", and we have
 * no basis for the second.
 */

export interface CompRow {
  id: string;
  latitude: number;
  longitude: number;
  gush: number;
  chelka: number;
  dealDate: Date;
  area: number;
  rooms: number;
  pricePerSqm: number;
  dealAmount: number;
  yearBuilt: number | null;
  settlementCode: number;
}

export interface Subject extends Point {
  gush: number | null;
  chelka: number | null;
  area: number;
  rooms: number;
  settlementCode: number | null;
}

/**
 * Tiers, in the guide's own order of preference.
 *
 * Tier A is the only "same building" the registry can express. B through D are purely
 * geometric and deliberately ignore the settlement: a flat 300 m away across the
 * Holon–Bat Yam boundary is a perfectly good comparable, and a municipal line is not a
 * price boundary. Only the widest tier is settlement-bounded, because at two and a
 * half kilometres the line usually does mean something.
 */
export const TIERS = [
  { key: 'same-parcel', metres: 0, weight: 1.0 },
  { key: 'near', metres: 150, weight: 0.8 },
  { key: 'walk', metres: 400, weight: 0.55 },
  { key: 'quarter', metres: 1_000, weight: 0.3 },
  { key: 'town', metres: 2_500, weight: 0.12 },
] as const;

export type TierKey = (typeof TIERS)[number]['key'];

/** Sharing a block is the closest the cadastre comes to sharing a street. */
const SAME_GUSH_BONUS = 0.1;

/** Half weight every eighteen months: an older sale is evidence, just weaker. */
const HALF_LIFE_MONTHS = 18;

/**
 * How similar a comp has to be to be a comp at all.
 *
 * This is what removes the penthouse and the garden flat the guide warns about — they
 * are a different product, not a strange price, and filtering them here rather than
 * by trimming odd prices later is the distinction that file's statistics cannot make.
 */
export const ROOMS_TOLERANCE = 1.0;
export const AREA_MIN_RATIO = 0.65;
export const AREA_MAX_RATIO = 1.55;

/** Below this the price is a clerical error or a nominal transfer, not a market price. */
const MIN_SANE_PPSQM = 3_000;
const MAX_SANE_PPSQM = 150_000;

/**
 * A sale straight from the developer is a different product, not a cheap or dear
 * second-hand flat.
 *
 * The price carries VAT, a finishing standard chosen by the builder, and whatever
 * incentives were running that quarter, and it is rarely negotiated the way a
 * resale is. The registry does not label these, but it dates them: a flat whose
 * `yearBuilt` has not yet arrived when it sells was bought off plan.
 *
 * This is not a rare case. Of recent in-stats apartment deals, 17% are dated to a
 * build year still in the future and another 8% to the year of sale — a quarter of
 * the pool, at a median rate around 26,000 against roughly 22,000 for everything
 * else. Left in, they would quietly lift every valuation in a neighbourhood where
 * a tower happens to be completing.
 */
export const isNewBuild = (yearBuilt: number | null, dealDate: Date): boolean =>
  yearBuilt !== null && yearBuilt >= dealDate.getFullYear();

export interface ScoredComp extends CompRow {
  metres: number;
  tier: TierKey;
  weight: number;
}

export interface Rejected {
  id: string;
  reason:
    | 'too-far'
    | 'rooms'
    | 'area'
    | 'price-insane'
    | 'price-contradicts'
    | 'new-build'
    | 'trimmed';
}

const monthsBetween = (from: Date, to: Date): number =>
  Math.max(0, (to.getTime() - from.getTime()) / (365.25 / 12) / 86_400_000);

/** The tightest tier a distance falls in, or null beyond the widest. */
export function tierFor(metres: number, samePar: boolean): (typeof TIERS)[number] | null {
  if (samePar) return TIERS[0];
  return TIERS.find((tier) => tier.metres > 0 && metres <= tier.metres) ?? null;
}

/**
 * Score every candidate: how far, which tier, how much it counts.
 *
 * Rejections are returned rather than dropped silently. A seller asking why a sale two
 * doors down was ignored deserves the answer, and so does whoever is debugging a
 * valuation that came out strange.
 */
export function score(
  subject: Subject,
  candidates: CompRow[],
  now: Date,
): { comps: ScoredComp[]; rejected: Rejected[] } {
  const comps: ScoredComp[] = [];
  const rejected: Rejected[] = [];

  for (const row of candidates) {
    if (row.pricePerSqm < MIN_SANE_PPSQM || row.pricePerSqm > MAX_SANE_PPSQM) {
      rejected.push({ id: row.id, reason: 'price-insane' });
      continue;
    }

    /*
     * The registry states a rate and an amount independently, and a row where they
     * disagree is not evidence of anything — usually a partial share recorded against
     * the whole area. Twenty-five per cent is loose enough for ordinary rounding.
     */
    const implied = row.dealAmount / row.area;
    if (Math.abs(implied - row.pricePerSqm) / row.pricePerSqm > 0.25) {
      rejected.push({ id: row.id, reason: 'price-contradicts' });
      continue;
    }

    if (isNewBuild(row.yearBuilt, row.dealDate)) {
      rejected.push({ id: row.id, reason: 'new-build' });
      continue;
    }

    if (Math.abs(row.rooms - subject.rooms) > ROOMS_TOLERANCE) {
      rejected.push({ id: row.id, reason: 'rooms' });
      continue;
    }

    const ratio = row.area / subject.area;
    if (ratio < AREA_MIN_RATIO || ratio > AREA_MAX_RATIO) {
      rejected.push({ id: row.id, reason: 'area' });
      continue;
    }

    const samePar =
      subject.gush !== null && subject.chelka !== null &&
      row.gush === subject.gush && row.chelka === subject.chelka;

    const metres = metresBetween(subject, row);
    const tier = tierFor(metres, samePar);

    if (!tier) {
      rejected.push({ id: row.id, reason: 'too-far' });
      continue;
    }

    // The widest tier is the only one that cares which town it is in.
    if (tier.key === 'town' && subject.settlementCode !== null && row.settlementCode !== subject.settlementCode) {
      rejected.push({ id: row.id, reason: 'too-far' });
      continue;
    }

    const sameBlock = subject.gush !== null && row.gush === subject.gush && !samePar;
    const recency = 0.5 ** (monthsBetween(row.dealDate, now) / HALF_LIFE_MONTHS);
    const weight = (tier.weight + (sameBlock ? SAME_GUSH_BONUS : 0)) * recency;

    comps.push({ ...row, metres, tier: tier.key, weight });
  }

  return { comps, rejected };
}

/**
 * Drop the handful whose normalised rate disagrees with everything else.
 *
 * Runs *after* normalisation, never before: an unadjusted set mixes a 2019 sale with a
 * 2026 one and trimming it would throw away the oldest rather than the oddest. Capped
 * so that a genuinely split market loses a few comps rather than its minority half —
 * when the set really is that spread out, the right answer is the wider range the
 * caller computes from it, or no answer at all.
 */
export const TRIM_SIGMAS = 2.5;
const MAX_TRIM_SHARE = 0.2;
const NEVER_BELOW = 6;

export function trim<T extends { id: string; weight: number }>(
  items: T[],
  rateOf: (item: T) => number,
): { kept: T[]; rejected: Rejected[] } {
  if (items.length <= NEVER_BELOW) return { kept: items, rejected: [] };

  const centre = weightedMedian(items.map((i) => ({ value: rateOf(i), weight: i.weight })));
  if (centre === null) return { kept: items, rejected: [] };

  const spread = medianAbsoluteDeviation(items.map(rateOf), centre);
  if (spread === null || spread === 0) return { kept: items, rejected: [] };

  const scored = items
    .map((item) => ({ item, distance: Math.abs(rateOf(item) - centre) / spread }))
    .sort((a, b) => a.distance - b.distance);

  const allowed = Math.max(NEVER_BELOW, Math.ceil(items.length * (1 - MAX_TRIM_SHARE)));

  const kept: T[] = [];
  const rejected: Rejected[] = [];

  for (const [at, entry] of scored.entries()) {
    const withinSpread = entry.distance <= TRIM_SIGMAS;
    if (withinSpread || at < allowed) kept.push(entry.item);
    else rejected.push({ id: entry.item.id, reason: 'trimmed' });
  }

  return { kept, rejected };
}

/**
 * Whether a set is strong enough to price a flat on.
 *
 * Two thresholds, because one is not enough. The effective count catches a set carried
 * by a single comp; the weight sum catches a set of eight that are all two kilometres
 * away. Kish's formula is scale-free — ten comps of weight 0.12 score a full ten — so
 * on its own it would wave exactly that set through.
 */
export const MIN_EFFECTIVE = 8;
export const MIN_WEIGHT_SUM = 3;
export const BARELY_EFFECTIVE = 4;
export const BARELY_WEIGHT_SUM = 1.2;

export interface Strength {
  effective: number;
  weightSum: number;
  verdict: 'good' | 'indicative' | 'too-thin';
}

/**
 * Take the tightest ring of comparables that is strong enough, and stop there.
 *
 * The guide is blunt about this: *"עדיף חמש עד עשר עסקאות טובות מאשר עשרים שלא
 * קשורות."* Pooling every tier at once does the opposite — in a town with a thin
 * centre, five hundred sales from across the whole settlement drown the nine from
 * the next street, and the estimate becomes the town's average with extra steps.
 *
 * So the tiers are added one at a time and the first set that passes
 * {@link strengthOf} wins. Widening only happens when the tighter ring could not
 * carry the answer, which is exactly when a wider one is worth its lower relevance.
 */
export function widen<T extends { tier: TierKey; weight: number }>(
  comps: T[],
): { used: T[]; stoppedAt: TierKey } {
  const rank = new Map(TIERS.map((tier, at) => [tier.key, at]));
  let used: T[] = [];

  for (const tier of TIERS) {
    const limit = rank.get(tier.key)!;
    used = comps.filter((comp) => rank.get(comp.tier)! <= limit);

    if (strengthOf(used).verdict === 'good') return { used, stoppedAt: tier.key };
  }

  // Never strong enough: hand back everything and let the caller's verdict say so.
  return { used, stoppedAt: TIERS[TIERS.length - 1].key };
}

export function strengthOf(comps: { weight: number }[]): Strength {
  const weights = comps.map((c) => c.weight);
  const effective = effectiveCount(weights);
  const weightSum = weights.reduce((sum, w) => sum + w, 0);

  const verdict =
    effective >= MIN_EFFECTIVE && weightSum >= MIN_WEIGHT_SUM
      ? 'good'
      : effective >= BARELY_EFFECTIVE && weightSum >= BARELY_WEIGHT_SUM
        ? 'indicative'
        : 'too-thin';

  return { effective, weightSum, verdict };
}

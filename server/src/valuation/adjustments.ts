/**
 * What makes this flat worth more or less than the sales it is being compared to.
 *
 * The guide's step 3 asks, of every comparable: *"הדירה שלי טובה ממנה או פחות טובה,
 * ובמה?"* — and lists what moves a price: floor and lift, condition, parking and
 * storage, balcony, ממ״ד, light and view, the state of the building, an urban-renewal
 * plan, the neighbours. That list is reproduced below, nearly in full.
 *
 * What the guide does **not** give is a number for any of them, and it says why:
 * *"האחוזים של ההתאמות שונים מאזור לאזור"*, and the −2% / +1% / +6% in its worked
 * example are marked *"להמחשה בלבד"*. So every percentage in this file is ours, not
 * the guide's, and this is the file to argue with.
 *
 * ## Why the adjustment happens once, not per comparable
 *
 * The guide adjusts each comparable individually, which is right when you have stood
 * in all of them. We have not, and neither has the registry: it records a price, an
 * area, a date, a block and a build year, and **nothing about floor, condition,
 * parking, balcony, ממ״ד, aspect or the state of the building**. For a comparable,
 * every column in the table below is simply unknown.
 *
 * So the adjustment is made once, against the pooled comparables, and the question
 * changes shape. Not "is this flat better than that sale" but "is this flat better
 * than the sort of flat those sales are" — which is answerable, because the era of a
 * building predicts much of its specification.
 *
 * ## Only the difference is charged
 *
 * The trap here is the one that quietly over-values everything. Adding a lift premium
 * to a flat in a 2015 block presumes the comparables have no lift; they almost all do,
 * and the premium is already inside their price. Charge it again and every
 * well-equipped flat drifts upward, each small premium compounding with the next.
 *
 * So each attribute is priced against how **surprising** it is for the era:
 *
 *     factor = 1 + premium × (subject has it ? 1 : 0 − share of that era that has it)
 *
 * A lift in a 2015 block, where 95% have one, is worth +0.5%. The *absence* of one in
 * that block is worth −9.5%. The same premium, read against what the comparables are
 * presumed to be, which is the whole point.
 *
 * ## These are priors, and they are the weakest part of the valuation
 *
 * They cannot be fitted here. Fitting needs sales whose attributes are known, and the
 * registry has none; our own listings carry amenities but are 228 asking prices, which
 * are wishes rather than transactions. The shares below come from construction
 * practice and regulation, the premiums from market convention, and the one with a
 * hard anchor is renovation — ₪200–300k on a 90 m² flat is 10–15% of a ₪2M price.
 *
 * Treat this table as the first thing to replace when better evidence arrives, and the
 * first suspect when a valuation looks wrong. The back-test cannot validate it: it can
 * only measure the error left over once it has been applied.
 */

/** Bumped whenever a number below changes, and stamped onto every stored valuation. */
export const ADJUSTMENTS_VERSION = 1;

export interface Subject {
  /** Which storey, and what the building's top one is. */
  floor: number | null;
  topFloor: number | null;
  hasLift: boolean | null;
  condition: Condition | null;
  hasParking: boolean | null;
  hasStorage: boolean | null;
  hasBalcony: boolean | null;
  hasMamad: boolean | null;
  /** Open outlook and light, versus facing a wall or a busy road. */
  aspect: Aspect | null;
  buildingState: BuildingState | null;
  renewal: Renewal | null;
}

export type Condition = 'renovated' | 'good' | 'fair' | 'needs-renovation';
export type Aspect = 'open' | 'ordinary' | 'blocked';
export type BuildingState = 'well-kept' | 'ordinary' | 'neglected';
export type Renewal = 'approved' | 'none' | 'in-works';

/**
 * What a building of a given era is presumed to offer.
 *
 * Each share is the fraction of flats of that vintage expected to have the feature.
 * The curve matters more than any single point: it is what decides whether an
 * attribute is remarkable or merely present.
 */
export interface Reference {
  /** Weighted-median build year of the comparables actually used. */
  yearBuilt: number;
  lift: number;
  parking: number;
  storage: number;
  balcony: number;
  mamad: number;
}

/**
 * The ממ״ד boundary, which is the sharpest in the profile — and a ramp, not a step.
 *
 * Protected spaces became compulsory in all new construction in 1992, under תקנות
 * ההתגוננות האזרחית following the first Gulf War. But the duty attaches to the
 * **building permit**, while `yearBuilt` records **completion**, and a block finished
 * in 1994 was generally permitted before the rule. The State Comptroller works to a
 * rule of thumb that flats built after 1995 have one, which sits in the middle of that
 * transition rather than at its start.
 *
 * Hence a ramp from 1992 to 1997. Drawing a hard line at 1992 would credit a ממ״ד to
 * a great many early-nineties buildings that have none.
 */
export const MAMAD_FROM = 1992;
export const MAMAD_BY = 1997;

/**
 * Era curves for the rest.
 *
 * Each is a set of anchor years interpolated between — deliberately smooth, because
 * `yearBuilt` does not support anything sharper. In the registry it is decade-rounded
 * for older stock: among recent sales, 1970 appears 18,282 times and 1960 10,141,
 * while 1965 and 1975 are all but absent. Those are "about then", not years, and a
 * curve that resolved finer than that would be reading noise.
 */
const CURVES = {
  lift: [
    [1950, 0.05],
    [1970, 0.2],
    [1980, 0.4],
    [1990, 0.7],
    [2000, 0.9],
    [2010, 0.97],
  ],
  parking: [
    [1950, 0.1],
    [1970, 0.25],
    [1980, 0.45],
    [1990, 0.65],
    [2000, 0.85],
    [2010, 0.95],
  ],
  storage: [
    [1950, 0.25],
    [1970, 0.35],
    [1990, 0.5],
    [2010, 0.7],
  ],
  balcony: [
    [1950, 0.6],
    [1970, 0.55],
    [1990, 0.6],
    [2010, 0.85],
  ],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

/** Linear between the anchors, flat beyond the ends. */
export function shareAt(curve: readonly (readonly [number, number])[], year: number): number {
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (year <= first[0]) return first[1];
  if (year >= last[0]) return last[1];

  for (let at = 1; at < curve.length; at += 1) {
    const [toYear, toShare] = curve[at];
    if (year <= toYear) {
      const [fromYear, fromShare] = curve[at - 1];
      const through = (year - fromYear) / (toYear - fromYear);
      return fromShare + (toShare - fromShare) * through;
    }
  }

  return last[1];
}

export const mamadShare = (year: number): number =>
  year <= MAMAD_FROM ? 0 : year >= MAMAD_BY ? 1 : (year - MAMAD_FROM) / (MAMAD_BY - MAMAD_FROM);

/** What the comparables are presumed to be, from the era they come from. */
export function referenceFor(yearBuilt: number): Reference {
  return {
    yearBuilt,
    lift: shareAt(CURVES.lift, yearBuilt),
    parking: shareAt(CURVES.parking, yearBuilt),
    storage: shareAt(CURVES.storage, yearBuilt),
    balcony: shareAt(CURVES.balcony, yearBuilt),
    mamad: mamadShare(yearBuilt),
  };
}

/**
 * What each difference is worth.
 *
 * Market convention, stated as a prior — see the header. Kept deliberately modest:
 * an adjustment that is too small leaves a little of the difference in the range,
 * while one that is too large invents value that no buyer agreed to.
 */
export const PREMIUM = {
  /** Anchored on cost: ₪200–300k of work on a ₪2M flat. */
  renovated: 0.06,
  needsRenovation: -0.12,
  fair: -0.04,

  /** The walk-up penalty, which is the largest single number here and well attested. */
  parking: 0.055,
  storage: 0.015,
  balcony: 0.03,
  mamad: 0.04,

  openAspect: 0.03,
  blockedAspect: -0.04,

  wellKeptBuilding: 0.025,
  neglectedBuilding: -0.035,

  /** Approved and advanced; the upside is real but the timing is not. */
  renewalApproved: 0.08,
  /** Years of works next door, with the gain already priced in. */
  renewalInWorks: -0.03,
} as const;

/**
 * Floor, which is the one attribute that cannot be read off a single column.
 *
 * The guide puts the two cases that matter plainly: a high floor *with a lift and a
 * view* is worth more; a ground floor without a garden, or a fourth floor **without a
 * lift**, is worth less. So the storey only means something alongside the lift, and a
 * flat number on its own means nothing at all.
 */
export const FLOOR = {
  /** Per storey above the first, where there is a lift. Small, and it does not compound far. */
  perStoreyWithLift: 0.008,
  maxHighFloorBonus: 0.05,
  /** Per storey above the first with no lift — this is the one that bites. */
  perStoreyNoLift: -0.035,
  ground: -0.035,
  /** Nobody wants the flat under the roof of an old block. */
  topFloorNoLift: -0.02,
} as const;

/** The guide's own bound on how far adjustment can sensibly go. */
export const Q_MIN = 0.8;
export const Q_MAX = 1.25;

export interface Position {
  /** The multiplier applied to the pooled rate. */
  q: number;
  /** Every factor that moved it, for the explanation shown to the seller. */
  parts: { label: string; factor: number }[];
  /** True when the raw product hit a bound — the subject is outside what we can price. */
  clamped: boolean;
}

/**
 * The subject against the reference profile.
 *
 * A null attribute contributes nothing: unknown is not the same as absent, and a
 * blank field on the form must never read as "no parking". The caller is expected to
 * widen its range when much of the sheet is blank, which is a question for `range.ts`
 * rather than this file.
 */
export function positionOf(subject: Subject, reference: Reference): Position {
  const parts: { label: string; factor: number }[] = [];

  const against = (label: string, has: boolean | null, share: number, premium: number) => {
    if (has === null) return;
    const factor = 1 + premium * ((has ? 1 : 0) - share);
    if (Math.abs(factor - 1) > 1e-9) parts.push({ label, factor });
  };

  against('חניה', subject.hasParking, reference.parking, PREMIUM.parking);
  against('מחסן', subject.hasStorage, reference.storage, PREMIUM.storage);
  against('מרפסת', subject.hasBalcony, reference.balcony, PREMIUM.balcony);
  against('ממ"ד', subject.hasMamad, reference.mamad, PREMIUM.mamad);

  const condition = conditionFactor(subject.condition);
  if (condition !== 1) parts.push({ label: 'מצב הדירה', factor: condition });

  const floor = floorFactor(subject);
  if (floor !== 1) parts.push({ label: 'קומה', factor: floor });

  if (subject.aspect === 'open') parts.push({ label: 'נוף', factor: 1 + PREMIUM.openAspect });
  if (subject.aspect === 'blocked') parts.push({ label: 'נוף', factor: 1 + PREMIUM.blockedAspect });

  if (subject.buildingState === 'well-kept')
    parts.push({ label: 'הבניין', factor: 1 + PREMIUM.wellKeptBuilding });
  if (subject.buildingState === 'neglected')
    parts.push({ label: 'הבניין', factor: 1 + PREMIUM.neglectedBuilding });

  if (subject.renewal === 'approved')
    parts.push({ label: 'התחדשות עירונית', factor: 1 + PREMIUM.renewalApproved });
  if (subject.renewal === 'in-works')
    parts.push({ label: 'התחדשות עירונית', factor: 1 + PREMIUM.renewalInWorks });

  const raw = parts.reduce((product, part) => product * part.factor, 1);
  const q = Math.min(Q_MAX, Math.max(Q_MIN, raw));

  return { q, parts, clamped: q !== raw };
}

/**
 * Condition is judged against "ordinary for its age", not against new.
 *
 * `good` is the reference and scores nothing. The guide's warning belongs on the form
 * rather than in here: *"שיפוץ שעשיתם לפני עשר שנים כבר לא נחשב שיפוץ עדכני"*.
 */
function conditionFactor(condition: Condition | null): number {
  switch (condition) {
    case 'renovated':
      return 1 + PREMIUM.renovated;
    case 'fair':
      return 1 + PREMIUM.fair;
    case 'needs-renovation':
      return 1 + PREMIUM.needsRenovation;
    default:
      return 1;
  }
}

/**
 * Storey and lift together, because neither means much alone.
 *
 * With a lift, height is a mild and saturating gain. Without one it is a penalty that
 * grows with every flight, which is what the guide means by singling out the fourth
 * floor with no lift.
 */
export function floorFactor(subject: Subject): number {
  const { floor, hasLift, topFloor } = subject;
  if (floor === null) return 1;

  if (floor <= 0) return 1 + FLOOR.ground;

  // Unknown lift: assume the kinder case rather than charging a penalty on a guess.
  if (hasLift === false) {
    const climb = FLOOR.perStoreyNoLift * (floor - 1);
    const roof = topFloor !== null && floor >= topFloor ? FLOOR.topFloorNoLift : 0;
    return 1 + climb + roof;
  }

  if (hasLift === true) {
    return 1 + Math.min(FLOOR.maxHighFloorBonus, FLOOR.perStoreyWithLift * (floor - 1));
  }

  return 1;
}

/**
 * Why the neighbours are missing.
 *
 * The guide lists them, and it is right to: a dispute or an adjacent noise nuisance
 * genuinely moves a price. They are left out because a seller cannot answer the
 * question about their own flat in a way that is worth money — nobody describes their
 * building as the difficult one — and a self-reported field that only ever moves the
 * estimate upward is worse than no field. It belongs in the agent's judgement, which
 * is where this tool hands over.
 */
export const DELIBERATELY_UNPRICED = ['שכנים'] as const;

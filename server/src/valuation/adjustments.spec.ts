import { describe, expect, it } from 'vitest';

import {
  FLOOR,
  MAMAD_BY,
  MAMAD_FROM,
  PREMIUM,
  Q_MAX,
  Q_MIN,
  floorFactor,
  mamadShare,
  positionOf,
  referenceFor,
  type Subject,
} from './adjustments.js';

const BLANK: Subject = {
  floor: null,
  topFloor: null,
  hasLift: null,
  condition: null,
  hasParking: null,
  hasStorage: null,
  hasBalcony: null,
  hasMamad: null,
  aspect: null,
  buildingState: null,
  renewal: null,
};

const subject = (over: Partial<Subject> = {}): Subject => ({ ...BLANK, ...over });

describe('referenceFor', () => {
  it('expects almost nothing of a 1955 block and almost everything of a 2015 one', () => {
    const old = referenceFor(1955);
    const recent = referenceFor(2015);

    expect(old.lift).toBeLessThan(0.15);
    expect(old.parking).toBeLessThan(0.2);
    expect(recent.lift).toBeGreaterThan(0.95);
    expect(recent.parking).toBeGreaterThan(0.9);
  });

  it('rises with the build year, never falling back', () => {
    let previous = 0;
    for (let year = 1940; year <= 2025; year += 5) {
      const lift = referenceFor(year).lift;
      expect(lift).toBeGreaterThanOrEqual(previous);
      previous = lift;
    }
  });

  it('holds flat outside the anchors instead of extrapolating to nonsense', () => {
    expect(referenceFor(1900).lift).toBe(referenceFor(1950).lift);
    expect(referenceFor(2050).lift).toBe(referenceFor(2010).lift);
    expect(referenceFor(2050).lift).toBeLessThanOrEqual(1);
  });
});

describe('mamadShare', () => {
  /*
   * The duty arrived in 1992 but attaches to the permit, while the build year records
   * completion — so blocks finished in the early nineties were largely permitted
   * before the rule and have no ממ״ד. A step at 1992 would credit a great many of
   * them with one. The Comptroller's own rule of thumb, 1995, lands mid-ramp.
   */
  it('ramps across the permit-to-completion gap rather than stepping', () => {
    expect(mamadShare(1990)).toBe(0);
    expect(mamadShare(MAMAD_FROM)).toBe(0);
    expect(mamadShare(1995)).toBeCloseTo(0.6, 5);
    expect(mamadShare(MAMAD_BY)).toBe(1);
    expect(mamadShare(2015)).toBe(1);
  });
});

describe('positionOf', () => {
  it('scores a blank sheet as no adjustment at all', () => {
    const position = positionOf(BLANK, referenceFor(1985));
    expect(position.q).toBe(1);
    expect(position.parts).toEqual([]);
    expect(position.clamped).toBe(false);
  });

  /*
   * The whole argument of this file. A lift in a 2015 block is unremarkable — the
   * comparables have one, and its value is already in their price. Charging the full
   * premium again is how every well-equipped flat drifts upward.
   */
  it('barely rewards a feature that everything of its era already has', () => {
    const recent = positionOf(subject({ hasParking: true }), referenceFor(2015));
    expect(recent.q).toBeGreaterThan(1);
    expect(recent.q).toBeLessThan(1.01);
  });

  it('rewards the same feature properly where it is rare', () => {
    const old = positionOf(subject({ hasParking: true }), referenceFor(1955));
    expect(old.q).toBeGreaterThan(1.04);
  });

  it('penalises the absence of what the era takes for granted', () => {
    const missing = positionOf(subject({ hasParking: false }), referenceFor(2015));
    expect(missing.q).toBeLessThan(0.96);
  });

  /*
   * Where an era is evenly split, having the feature and lacking it are equally
   * informative, so the premium divides symmetrically about 1 — half up or half
   * down, never the full amount in either direction.
   */
  it('splits the premium symmetrically when the era is evenly divided', () => {
    const year = 1983;
    const share = referenceFor(year).parking;
    expect(share).toBeCloseTo(0.51, 2);

    const has = positionOf(subject({ hasParking: true }), referenceFor(year)).q;
    const hasNot = positionOf(subject({ hasParking: false }), referenceFor(year)).q;

    expect(has - 1).toBeCloseTo(PREMIUM.parking * (1 - share), 10);
    expect(1 - hasNot).toBeCloseTo(PREMIUM.parking * share, 10);
    // Symmetric about no adjustment, and each side about half the full premium.
    expect(has - 1 + (hasNot - 1)).toBeCloseTo(0, 2);
    expect(has - 1).toBeLessThan(PREMIUM.parking);
  });

  it('treats unknown as unknown, not as absent', () => {
    const unknown = positionOf(subject({ hasParking: null }), referenceFor(2015));
    const absent = positionOf(subject({ hasParking: false }), referenceFor(2015));

    expect(unknown.q).toBe(1);
    expect(absent.q).toBeLessThan(1);
  });

  it('marks a flat needing full renovation down by roughly the cost of the work', () => {
    const q = positionOf(subject({ condition: 'needs-renovation' }), referenceFor(1980)).q;
    expect(q).toBeCloseTo(1 + PREMIUM.needsRenovation, 10);
    expect(q).toBeLessThan(0.9);
  });

  it('holds an extreme sheet inside the bounds and says that it did', () => {
    const best = positionOf(
      subject({
        condition: 'renovated',
        hasParking: true,
        hasStorage: true,
        hasBalcony: true,
        hasMamad: true,
        aspect: 'open',
        buildingState: 'well-kept',
        renewal: 'approved',
        floor: 8,
        hasLift: true,
      }),
      referenceFor(1960),
    );

    expect(best.q).toBe(Q_MAX);
    expect(best.clamped).toBe(true);

    const worst = positionOf(
      subject({
        condition: 'needs-renovation',
        hasParking: false,
        hasStorage: false,
        hasBalcony: false,
        hasMamad: false,
        aspect: 'blocked',
        buildingState: 'neglected',
        renewal: 'in-works',
        floor: 4,
        hasLift: false,
      }),
      referenceFor(2015),
    );

    expect(worst.q).toBe(Q_MIN);
    expect(worst.clamped).toBe(true);
  });

  it('names every factor it applied', () => {
    const position = positionOf(
      subject({ hasParking: true, condition: 'renovated', aspect: 'open' }),
      referenceFor(1970),
    );

    expect(position.parts.map((p) => p.label)).toEqual(['חניה', 'מצב הדירה', 'נוף']);
  });
});

describe('floorFactor', () => {
  it('ignores a storey with no lift answer, rather than guessing against the seller', () => {
    expect(floorFactor(subject({ floor: 4, hasLift: null }))).toBe(1);
  });

  /*
   * The case the guide calls out by name: a fourth floor with no lift. Three flights
   * up, and it should be the largest floor penalty the table can produce short of
   * the roof.
   */
  it('charges the fourth-floor walk-up the guide warns about', () => {
    const factor = floorFactor(subject({ floor: 4, hasLift: false }));
    expect(factor).toBeCloseTo(1 + FLOOR.perStoreyNoLift * 3, 10);
    expect(factor).toBeLessThan(0.9);
  });

  it('adds the roof penalty on top for the top walk-up flat', () => {
    const top = floorFactor(subject({ floor: 4, topFloor: 4, hasLift: false }));
    const middle = floorFactor(subject({ floor: 4, topFloor: 8, hasLift: false }));
    expect(top).toBeLessThan(middle);
  });

  it('treats a high floor with a lift as a mild, saturating gain', () => {
    const third = floorFactor(subject({ floor: 3, hasLift: true }));
    const twentieth = floorFactor(subject({ floor: 20, hasLift: true }));

    expect(third).toBeGreaterThan(1);
    expect(twentieth).toBe(1 + FLOOR.maxHighFloorBonus);
    expect(twentieth).toBeLessThan(1.06);
  });

  it('discounts the ground floor', () => {
    expect(floorFactor(subject({ floor: 0, hasLift: true }))).toBe(1 + FLOOR.ground);
  });

  it('leaves the first floor alone, lift or not', () => {
    expect(floorFactor(subject({ floor: 1, hasLift: false }))).toBe(1);
    expect(floorFactor(subject({ floor: 1, hasLift: true }))).toBe(1);
  });
});

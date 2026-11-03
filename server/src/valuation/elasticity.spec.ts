import { describe, expect, it } from 'vitest';

import {
  B_MAX,
  B_MIN,
  NATIONAL_B,
  elasticityFor,
  normaliseToSize,
  shapeAt,
  type FittedParams,
} from './elasticity.js';

/** The figures measured over the deals table; see the file's own header. */
const MEASURED: FittedParams = {
  nationalB: NATIONAL_B,
  byArea: [
    { area: 30, b: -0.1998, n: 9_235 },
    { area: 40, b: -0.4575, n: 32_606 },
    { area: 50, b: -0.4008, n: 63_390 },
    { area: 60, b: -0.2692, n: 95_907 },
    { area: 70, b: -0.1226, n: 123_135 },
    { area: 85, b: -0.0293, n: 151_148 },
    { area: 100, b: 0.0005, n: 155_035 },
    { area: 120, b: -0.0104, n: 135_012 },
    { area: 145, b: -0.0705, n: 101_210 },
    { area: 175, b: -0.1467, n: 62_544 },
    { area: 210, b: -0.2382, n: 25_994 },
    { area: 260, b: -0.3241, n: 7_561 },
    { area: 320, b: -0.2489, n: 2_167 },
  ],
};

describe('normaliseToSize', () => {
  it('leaves a comp of the subject’s own size alone', () => {
    expect(normaliseToSize(25_000, 90, 90, -0.193)).toBe(25_000);
  });

  it('marks a smaller comp’s rate down when bigger flats are cheaper per metre', () => {
    // A 70 m² comp speaking for a 110 m² subject: the subject's rate is lower.
    const rate = normaliseToSize(30_000, 70, 110, -0.193);
    expect(rate).toBeLessThan(30_000);
    expect(rate).toBeCloseTo(30_000 * (110 / 70) ** -0.193, 6);
  });

  it('marks it up in a market where the relationship inverts', () => {
    expect(normaliseToSize(30_000, 70, 110, 0.2745)).toBeGreaterThan(30_000);
  });

  /*
   * The reason this adjustment exists at all. Without it the implied price of the
   * larger flat is area-proportional; with the national exponent it is visibly less,
   * and the gap is the systematic error a flat ₪/m² median would carry.
   */
  it('prices a 120 m² flat at 1.26× a 90 m² one, not 1.33×', () => {
    const base = 25_000;
    const implied = (normaliseToSize(base, 90, 120, NATIONAL_B) * 120) / (base * 90);
    expect(implied).toBeCloseTo(1.261, 3);
    expect(implied).toBeLessThan(120 / 90);
  });

  it('declines to divide by a missing area', () => {
    expect(normaliseToSize(25_000, 0, 90, -0.2)).toBe(25_000);
    expect(normaliseToSize(25_000, 90, 0, -0.2)).toBe(25_000);
  });
});

describe('shapeAt', () => {
  it('reads a knot off exactly', () => {
    expect(shapeAt(MEASURED.byArea, 70)).toBeCloseTo(-0.1226, 10);
  });

  it('interpolates between two knots, in log area', () => {
    const between = shapeAt(MEASURED.byArea, 110)!;

    expect(between).toBeLessThan(0.0005);
    expect(between).toBeGreaterThan(-0.0104);

    // Log spacing, so 110 sits slightly past halfway between the 100 and 120 knots.
    const along = (Math.log(110) - Math.log(100)) / (Math.log(120) - Math.log(100));
    expect(between).toBeCloseTo(0.0005 + along * (-0.0104 - 0.0005), 10);
  });

  /*
   * Measured, not modelled. Past the ends of the fitted range the curve holds at the
   * last thing it saw rather than carrying the final slope onward — the quadratic
   * that was tried first did carry on, and had very large flats costing *more* per
   * metre than middling ones, which the data flatly contradicts.
   */
  it('holds flat outside the range it was measured over', () => {
    expect(shapeAt(MEASURED.byArea, 18)).toBe(-0.1998);
    expect(shapeAt(MEASURED.byArea, 900)).toBe(-0.2489);
  });

  it('has nothing to say with no knots', () => {
    expect(shapeAt([], 90)).toBeNull();
  });

  /*
   * The whole reason the curve exists. A 50 m² flat sits on a slope two and a half
   * times steeper than the national average, and valuing it on that average is what
   * left small flats six per cent low in the back-test.
   */
  it('is far steeper for a small flat than the single national figure', () => {
    expect(shapeAt(MEASURED.byArea, 50)!).toBeLessThan(NATIONAL_B * 2);
    expect(shapeAt(MEASURED.byArea, 100)!).toBeGreaterThan(NATIONAL_B / 2);
  });
});

describe('elasticityFor', () => {
  it('reads the curve at the subject’s own size', () => {
    const at85 = elasticityFor(85, MEASURED);

    expect(at85.source).toBe('curve');
    expect(at85.b).toBeCloseTo(-0.0293, 10);
  });

  /*
   * Two flats, one town, and before the curve they were adjusted on the same slope:
   * a 50 m² flat got about a third of the correction it needed.
   */
  it('answers differently for a small flat and a large one', () => {
    const small = elasticityFor(50, MEASURED).b;
    const large = elasticityFor(100, MEASURED).b;

    expect(small).toBeLessThan(large);
    expect(large - small).toBeCloseTo(0.4013, 3);
  });

  it('contains a curve that has gone off the rails in either direction', () => {
    const wild = (b: number) => elasticityFor(90, { ...MEASURED, byArea: [{ area: 90, b, n: 900 }] }).b;

    expect(wild(-3.4)).toBe(B_MIN);
    expect(wild(2.8)).toBe(B_MAX);
  });

  it('falls back to the national figure when no curve has been fitted', () => {
    const bare: FittedParams = { nationalB: NATIONAL_B, byArea: [] };

    expect(elasticityFor(85, bare)).toEqual({ b: NATIONAL_B, source: 'national' });
    expect(elasticityFor(85, { ...bare, nationalB: -9 }).b).toBe(B_MIN);
  });
});

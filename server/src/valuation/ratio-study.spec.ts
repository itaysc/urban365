import { describe, expect, it } from 'vitest';

import { by, study, type Ratio } from './ratio-study.js';

const at = (estimate: number, actual: number, covered = true): Ratio => ({
  estimate,
  actual,
  ratio: estimate / actual,
  covered,
});

describe('study', () => {
  it('has nothing to say about nothing', () => {
    expect(study([])).toBeNull();
  });

  /*
   * An even-sized sample, which is where `stats.median` would have rounded the
   * ratio to a whole number and reported a flawless model. Four sales valued 30%
   * high must read as 1.3, not 1.
   */
  it('does not round the ratio to a whole number', () => {
    const result = study([at(130, 100), at(130, 100), at(130, 100), at(130, 100)])!;
    expect(result.medianRatio).toBeCloseTo(1.3, 10);
  });

  it('averages the two middle ratios on an even sample', () => {
    const result = study([at(90, 100), at(100, 100), at(120, 100), at(130, 100)])!;
    expect(result.medianRatio).toBeCloseTo(1.1, 10);
  });

  it('scores a perfect model as perfect', () => {
    const result = study([at(100, 100), at(200, 200), at(300, 300)])!;

    expect(result.medianRatio).toBe(1);
    expect(result.cod).toBe(0);
    expect(result.prd).toBeCloseTo(1, 10);
    expect(result.withinTen).toBe(1);
  });

  it('reports bias as the median ratio', () => {
    // Everything valued 10% high.
    const result = study([at(110, 100), at(220, 200), at(330, 300)])!;
    expect(result.medianRatio).toBeCloseTo(1.1, 10);
    expect(result.cod).toBeCloseTo(0, 10);
  });

  /*
   * A model can be unbiased and useless. These three average out to exactly 1.0
   * while no single estimate is close — which is why the median ratio alone never
   * settles anything.
   */
  it('separates bias from precision', () => {
    const result = study([at(70, 100), at(100, 100), at(130, 100)])!;

    expect(result.medianRatio).toBe(1);
    expect(result.cod).toBeCloseTo(20, 10);
    expect(result.withinTen).toBeCloseTo(1 / 3, 10);
  });

  /*
   * The regressivity test, and the direct check on the size exponent. Here the cheap
   * flat is valued 20% high and the dear one 20% low: the plain mean of the ratios
   * stays near 1, but weighting by price does not, and PRD catches the gap.
   */
  it('detects a model that over-values cheap property', () => {
    const result = study([at(120_000, 100_000), at(800_000, 1_000_000)])!;

    expect(result.prd).toBeGreaterThan(1.03);
    expect(result.medianRatio).toBeCloseTo(1, 10);
  });

  it('reports a progressive model below 1', () => {
    const result = study([at(80_000, 100_000), at(1_200_000, 1_000_000)])!;
    expect(result.prd).toBeLessThan(0.97);
  });

  it('counts how often the sale landed inside the quoted range', () => {
    const result = study([at(100, 100, true), at(100, 100, false), at(100, 100, true)])!;
    expect(result.coverage).toBeCloseTo(2 / 3, 10);
  });

  it('counts the ±10% and ±20% bands separately', () => {
    const result = study([at(105, 100), at(115, 100), at(140, 100)])!;

    expect(result.withinTen).toBeCloseTo(1 / 3, 10);
    expect(result.withinTwenty).toBeCloseTo(2 / 3, 10);
  });
});

describe('by', () => {
  it('scores each group on its own', () => {
    const ratios = [
      ...Array.from({ length: 40 }, () => at(100, 100)),
      ...Array.from({ length: 40 }, () => at(130, 100)),
    ];

    const groups = by(ratios, (_, index) => (index < 40 ? 'a' : 'b'));

    expect(groups.get('a')!.medianRatio).toBe(1);
    expect(groups.get('b')!.medianRatio).toBeCloseTo(1.3, 10);
  });

  /*
   * A slice of eight sales produces a COD that reads like a measurement and is not
   * one. Dropping them is better than printing a table where a reader cannot tell
   * which rows mean anything.
   */
  it('drops a group too small to measure', () => {
    const ratios = [
      ...Array.from({ length: 40 }, () => at(100, 100)),
      ...Array.from({ length: 5 }, () => at(130, 100)),
    ];

    const groups = by(ratios, (_, index) => (index < 40 ? 'big' : 'small'));

    expect(groups.has('big')).toBe(true);
    expect(groups.has('small')).toBe(false);
  });
});

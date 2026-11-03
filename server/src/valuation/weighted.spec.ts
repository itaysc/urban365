import { describe, expect, it } from 'vitest';
import {
  effectiveCount,
  medianAbsoluteDeviation,
  weightedMean,
  weightedMedian,
  weightedQuantile,
} from './weighted.js';

const flat = (values: number[]) => values.map((value) => ({ value, weight: 1 }));

describe('weightedMedian', () => {
  it('is the plain median when every weight is equal', () => {
    expect(weightedMedian(flat([10, 20, 30]))).toBe(20);
  });

  it('lets a heavy point outvote several light ones', () => {
    /*
     * The property the whole tier system depends on: one sale in the same building
     * must count for more than four sales a kilometre away, and must be able to carry
     * the median on its own.
     */
    const points = [
      { value: 30_000, weight: 1.0 },
      { value: 10_000, weight: 0.12 },
      { value: 10_000, weight: 0.12 },
      { value: 10_000, weight: 0.12 },
      { value: 10_000, weight: 0.12 },
    ];
    expect(weightedMedian(points)).toBe(30_000);
  });

  it('ignores zero and negative weights rather than letting them shift the total', () => {
    expect(weightedMedian([...flat([10, 20, 30]), { value: 1, weight: 0 }])).toBe(20);
  });

  it('is null with nothing usable', () => {
    expect(weightedMedian([])).toBeNull();
    expect(weightedMedian([{ value: Number.NaN, weight: 1 }])).toBeNull();
  });

  it('resists an outlier that would move a mean', () => {
    // A family transfer at a nominal price, which is the case this choice is for.
    const withTransfer = [...flat([20_000, 21_000, 19_500, 20_500]), { value: 1_000, weight: 1 }];

    expect(weightedMedian(withTransfer)).toBe(20_000);
    expect(weightedMean(withTransfer)!).toBeLessThan(17_000);
  });
});

describe('weightedQuantile', () => {
  it('brackets the distribution', () => {
    const points = flat([10, 20, 30, 40]);
    expect(weightedQuantile(points, 0.25)).toBe(10);
    expect(weightedQuantile(points, 0.75)).toBe(30);
  });
});

describe('medianAbsoluteDeviation', () => {
  it('scales to be comparable with a standard deviation', () => {
    // Deviations 10,0,10 → median 10 → ×1.4826.
    expect(medianAbsoluteDeviation([10, 20, 30], 20)).toBeCloseTo(10 * 1.4826, 6);
  });

  it('barely moves when one absurd value is added', () => {
    const tight = medianAbsoluteDeviation([100, 101, 99, 100], 100)!;
    const withJunk = medianAbsoluteDeviation([100, 101, 99, 100, 1], 100)!;

    // An SD would roughly double here; the MAD is what keeps the trim honest.
    expect(withJunk).toBeLessThan(tight * 2 + 1);
  });

  it('is null with nothing to measure', () => {
    expect(medianAbsoluteDeviation([], 0)).toBeNull();
  });
});

describe('effectiveCount', () => {
  it('is the plain count when weights are equal', () => {
    expect(effectiveCount([1, 1, 1, 1])).toBeCloseTo(4, 10);
  });

  it('measures inequality, not credibility — which is why it is not the only gate', () => {
    /*
     * Ten comps at 0.12 each score a full ten: Kish's formula is scale-free, so equal
     * weights always return the plain count however small those weights are. Written
     * out, that means "effN ≥ 8" on its own would wave through eight sales two and a
     * half kilometres away. It answers "how lopsided is this set", not "is this set
     * any good", and `comps.ts` therefore gates on the weight sum as well.
     */
    expect(effectiveCount(Array(10).fill(0.12))).toBeCloseTo(10, 10);
    expect(effectiveCount(Array(10).fill(1))).toBeCloseTo(10, 10);

    // One good comp beside three poor ones is worth barely more than one comp.
    expect(effectiveCount([1, 0.12, 0.12, 0.12])).toBeLessThan(2);
  });

  it('is zero with no weight at all', () => {
    expect(effectiveCount([])).toBe(0);
    expect(effectiveCount([0, 0])).toBe(0);
  });
});

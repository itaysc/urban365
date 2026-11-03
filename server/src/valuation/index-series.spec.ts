import { describe, expect, it } from 'vitest';

import {
  CREDIBILITY_K,
  MAX_MONTHLY_STEP,
  MIN_MONTH_DEALS,
  buildIndex,
  carryForward,
  completeThrough,
  credibilityOf,
  monthsBetween,
  monthsExtrapolated,
  nextMonth,
  previousMonth,
  rebase,
  reportedThrough,
  type MonthObservation,
} from './index-series.js';

/**
 * The real national series, read off the deals table. The last four months are the
 * partially-registered tail: counts falling away and medians apparently collapsing.
 */
const NATIONAL: MonthObservation[] = [
  { month: '2025-01', n: 5257, rate: 21918 },
  { month: '2025-02', n: 5184, rate: 22320 },
  { month: '2025-03', n: 5779, rate: 22224 },
  { month: '2025-04', n: 4333, rate: 21543 },
  { month: '2025-05', n: 4818, rate: 21286 },
  { month: '2025-06', n: 4275, rate: 21714 },
  { month: '2025-07', n: 5640, rate: 22393 },
  { month: '2025-08', n: 5084, rate: 22322 },
  { month: '2025-09', n: 4603, rate: 22281 },
  { month: '2025-10', n: 2712, rate: 21626 },
  { month: '2025-11', n: 4972, rate: 21739 },
  { month: '2025-12', n: 5823, rate: 22556 },
  { month: '2026-01', n: 4583, rate: 21515 },
  { month: '2026-02', n: 4839, rate: 21942 },
  { month: '2026-03', n: 4850, rate: 22000 },
  { month: '2026-04', n: 3008, rate: 21402 },
  { month: '2026-05', n: 4609, rate: 22065 },
  { month: '2026-06', n: 4145, rate: 21078 },
  { month: '2026-07', n: 2025, rate: 18103 },
  { month: '2026-08', n: 718, rate: 15382 },
  { month: '2026-09', n: 54, rate: 13646 },
];

describe('completeThrough', () => {
  /*
   * The single most consequential line in this file. Those last three months look
   * like a 35% crash and are nothing of the kind — they are the fast-registering,
   * cheaper end of each month arriving before the rest. Letting them in would put a
   * crash into the index and then price every flat in the country against it.
   */
  it('stops at June 2026, before the reporting tail', () => {
    expect(completeThrough(NATIONAL)).toBe('2026-06');
  });

  it('keeps the holiday months, which are light but real', () => {
    // October 2025 (2,712) and April 2026 (3,008) run well under a normal month and
    // must still count — the cutoff is for missing data, not for a quiet market.
    const base = completeThrough(NATIONAL)!;
    expect(base > '2025-10').toBe(true);
    expect(base > '2026-04').toBe(true);
  });

  it('returns the last month when nothing is missing', () => {
    expect(completeThrough(NATIONAL.slice(0, 18))).toBe('2026-06');
  });

  it('has nothing to say about an empty series', () => {
    expect(completeThrough([])).toBeNull();
  });
});

describe('credibilityOf', () => {
  it('splits the difference at the half-credibility count', () => {
    expect(credibilityOf(CREDIBILITY_K)).toBeCloseTo(0.5, 10);
  });

  it('gives a thin town almost no say', () => {
    expect(credibilityOf(15)).toBeLessThan(0.1);
  });

  it('gives Tel Aviv almost all of it', () => {
    expect(credibilityOf(4000)).toBeGreaterThan(0.95);
  });
});

describe('buildIndex', () => {
  const base = '2026-06';

  it('ends at exactly 1', () => {
    const index = buildIndex(NATIONAL, NATIONAL, base);
    expect(index.points.at(-1)!.value).toBeCloseTo(1, 12);
    expect(index.base).toBe(base);
  });

  it('never includes a month past the base', () => {
    const index = buildIndex(NATIONAL, NATIONAL, base);
    expect(index.points.every((p) => p.month <= base)).toBe(true);
    expect(index.points.map((p) => p.month)).not.toContain('2026-07');
  });

  /*
   * Eighteen real months of a market that has not moved. "Flat" is a statement about
   * the trend, not about every month: the national median genuinely swings a few per
   * cent month to month (December 2025 sits 7% above June 2026), and an index that
   * smoothed that away would be hiding data rather than reading it. What must hold is
   * that the series has no direction and stays within ordinary noise.
   */
  it('reads a flat market as flat', () => {
    const index = buildIndex(NATIONAL, NATIONAL, base);

    for (const point of index.points) {
      expect(Math.abs(point.value - 1)).toBeLessThan(0.1);
    }

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const values = index.points.map((p) => p.value);
    const half = Math.floor(values.length / 2);

    expect(Math.abs(mean(values.slice(0, half)) - mean(values.slice(half)))).toBeLessThan(0.04);
  });

  it('passes the real series through without the clamp binding', () => {
    // The bound exists for impossible months. Over 173 months of national data the
    // largest move was 7.6%, so on real input it should never actually engage.
    const index = buildIndex(NATIONAL, NATIONAL, base);
    const values = index.points.map((p) => p.value);

    for (let at = 1; at < values.length; at += 1) {
      const step = values[at] / values[at - 1];
      const raw = NATIONAL[at].rate / NATIONAL[at - 1].rate;
      expect(step).toBeCloseTo(raw, 6);
    }
  });

  it('carries a genuine rise through the chain', () => {
    const rising: MonthObservation[] = monthsBetween('2025-01', base).map((month, at) => ({
      month,
      n: 3000,
      rate: 20000 * 1.01 ** at,
    }));

    const index = buildIndex(rising, rising, base);
    // 17 links of 1% compounding: the first month should sit near 1/1.01^17.
    expect(index.points[0].value).toBeCloseTo(1 / 1.01 ** 17, 2);
  });

  /*
   * A thin town's own monthly medians are mostly noise, and noise chained across two
   * years invents a trend. Credibility is what stops that: the town below swings
   * ±12% a month at 20 deals, and the index it produces must stay close to the flat
   * national series rather than following the swings.
   */
  it('lets the national series carry a town too thin to speak for itself', () => {
    const noisy: MonthObservation[] = monthsBetween('2025-01', base).map((month, at) => ({
      month,
      n: 20,
      rate: 15000 * (at % 2 === 0 ? 1.12 : 0.88),
    }));

    const index = buildIndex(noisy, NATIONAL, base);
    for (const point of index.points) {
      expect(Math.abs(point.value - 1)).toBeLessThan(0.1);
      expect(point.credibility).toBeLessThan(0.2);
    }
  });

  it('skips a month too empty to anchor the next ratio', () => {
    const withHole: MonthObservation[] = [
      { month: '2026-01', n: 900, rate: 20000 },
      { month: '2026-02', n: 4, rate: 44000 }, // four sales, one of them a penthouse
      { month: '2026-03', n: 900, rate: 20200 },
    ];

    const index = buildIndex(withHole, NATIONAL, '2026-03');
    expect(index.points.find((p) => p.month === '2026-02')!.credibility).toBe(0);
    // The ratio that matters is January → March, not January → the outlier.
    expect(index.points[0].value).toBeCloseTo(20000 / 20200, 2);
    expect(MIN_MONTH_DEALS).toBeGreaterThan(4);
  });

  /*
   * The thin-town version of the same bug, and the one that would have mattered.
   * A small town records nothing for months at a time; those months borrow the
   * national movement so the series has a value for them. When sales resume, the
   * local ratio spans the whole gap — so an implementation that multiplies ratios
   * applies the gap's movement twice, once borrowed and once local. Over a few such
   * gaps the index drifts away from both the town and the country.
   */
  it('does not count a gap twice when sales resume after months of silence', () => {
    const sparse: MonthObservation[] = [
      { month: '2025-01', n: 400, rate: 12000 },
      { month: '2025-02', n: 3, rate: 19000 },
      { month: '2025-03', n: 0, rate: 0 },
      { month: '2025-04', n: 2, rate: 8000 },
      { month: '2025-05', n: 400, rate: 12240 }, // the town is up 2% over four months
    ];

    const index = buildIndex(sparse, NATIONAL, '2025-05');
    const start = index.points[0].value;
    const end = index.points.at(-1)!.value;

    // The town's own 2% rise, damped toward the national series by credibility —
    // emphatically not that rise applied on top of four borrowed national steps.
    expect(end / start).toBeGreaterThan(1.0);
    expect(end / start).toBeLessThan(1.03);
  });

  it('contains a single implausible month rather than chaining it', () => {
    const spike: MonthObservation[] = [
      { month: '2026-01', n: 900, rate: 20000 },
      { month: '2026-02', n: 900, rate: 40000 }, // a doubling in one month
      { month: '2026-03', n: 900, rate: 20000 },
    ];

    const index = buildIndex(spike, NATIONAL, '2026-03');
    const steps = index.points.map((p) => p.value);
    for (let at = 1; at < steps.length; at += 1) {
      expect(steps[at] / steps[at - 1]).toBeLessThanOrEqual(1 + MAX_MONTHLY_STEP + 1e-9);
    }
  });
});

describe('carryForward', () => {
  const index = buildIndex(NATIONAL, NATIONAL, '2026-06');

  it('leaves a sale at the base alone', () => {
    expect(carryForward(index, '2026-06')).toBe(1);
  });

  /*
   * Past the data's edge the market is assumed to have stayed where it was. Two
   * years of half-yearly medians within 3.5% of each other is the evidence for that;
   * it is a measured call, and the first thing to revisit if prices start moving.
   */
  it('holds flat past the edge instead of extrapolating', () => {
    expect(carryForward(index, '2026-09')).toBe(1);
    expect(carryForward(index, '2027-06')).toBe(1);
  });

  it('marks a cheaper past month up to today', () => {
    const rising: MonthObservation[] = monthsBetween('2025-01', '2026-06').map((month, at) => ({
      month,
      n: 3000,
      rate: 20000 * 1.01 ** at,
    }));

    const factor = carryForward(buildIndex(rising, rising, '2026-06'), '2025-01');
    expect(factor).toBeGreaterThan(1.1);
    expect(factor).toBeCloseTo(1.01 ** 17, 1);
  });

  it('falls back to the earliest point for a sale older than the series', () => {
    expect(carryForward(index, '1999-03')).toBeCloseTo(1 / index.points[0].value, 10);
  });

  it('has an answer for an empty index', () => {
    expect(carryForward({ points: [], base: '2026-06' }, '2024-01')).toBe(1);
  });
});

describe('monthsExtrapolated', () => {
  it('counts the gap between the base and today', () => {
    const index = buildIndex(NATIONAL, NATIONAL, '2026-06');
    expect(monthsExtrapolated(index, new Date('2026-11-03'))).toBe(5);
  });

  it('is zero inside the data', () => {
    const index = buildIndex(NATIONAL, NATIONAL, '2026-06');
    expect(monthsExtrapolated(index, new Date('2026-02-01'))).toBe(0);
  });
});

describe('month arithmetic', () => {
  it('crosses the year boundary in both directions', () => {
    expect(nextMonth('2025-12')).toBe('2026-01');
    expect(previousMonth('2026-01')).toBe('2025-12');
  });

  it('pads single digits so months sort as strings', () => {
    expect(nextMonth('2026-08')).toBe('2026-09');
    expect(monthsBetween('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('is empty when the bounds are the wrong way round', () => {
    expect(monthsBetween('2026-06', '2026-01')).toEqual([]);
  });
});

describe('reportedThrough', () => {
  const base = '2026-06';

  it('is three months behind the valuation date', () => {
    expect(reportedThrough('2030-01', new Date('2025-11-20'))).toBe('2025-08');
  });

  it('counts back across a year boundary', () => {
    expect(reportedThrough('2030-01', new Date('2026-02-04'))).toBe('2025-11');
  });

  /*
   * In production this is always the branch that fires: the parameters are refitted
   * far less often than every three months, so their own base is the older bound and
   * the lag never bites. The lag exists for the back-test, where the valuation date
   * is a year or two in the past.
   */
  it('never reaches past the parameters own base', () => {
    expect(reportedThrough(base, new Date('2026-11-03'))).toBe(base);
  });
});

describe('rebase', () => {
  /*
   * A flat market whose base month happens to come in cheap — which is what the real
   * series did: June 2026 sat three per cent under the eleven months around it, and
   * every valuation in the country was quoted at that month's level.
   */
  const index = buildIndex(
    [
      { month: '2025-01', n: 4000, rate: 21000 },
      { month: '2025-02', n: 4000, rate: 21000 },
      { month: '2025-03', n: 4000, rate: 21000 },
      { month: '2025-04', n: 4000, rate: 20000 },
    ],
    [],
    '2025-04',
  );

  it('leaves an index asked for its own base alone', () => {
    expect(rebase(index, '2025-04')).toBe(index);
    expect(rebase(index, '2025-09')).toBe(index);
  });

  it('ends at the month asked for, and ends at one', () => {
    const earlier = rebase(index, '2025-02');

    expect(earlier.base).toBe('2025-02');
    expect(earlier.points.at(-1)!.month).toBe('2025-02');
    expect(earlier.points.at(-1)!.value).toBeCloseTo(1, 10);
  });

  /*
   * The bug this function exists for. Carried to April, a January sale is marked down
   * five per cent, because April is five per cent cheaper — correct, and exactly
   * wrong for a back-test that then compares the answer with a January price.
   */
  it('quotes a sale in the money of the month asked for', () => {
    // Not exactly 20/21: the month's own ratio is blended with a national series
    // that has nothing to say here, which pulls every movement slightly toward flat.
    expect(carryForward(index, '2025-01')).toBeCloseTo(20_000 / 21_000, 2);
    expect(carryForward(rebase(index, '2025-02'), '2025-01')).toBeCloseTo(1, 3);
  });

  it('carries nothing when the month predates the series', () => {
    const before = rebase(index, '2024-06');

    expect(before.points).toEqual([]);
    expect(carryForward(before, '2024-01')).toBe(1);
  });

  it('reports how far past its new edge a date sits', () => {
    expect(monthsExtrapolated(rebase(index, '2025-02'), new Date('2025-05-15'))).toBe(3);
  });
});

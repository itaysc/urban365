import { describe, expect, it } from 'vitest';
import {
  advise,
  childNotes,
  DEFAULT_BUFFER_SHARE,
  horizons,
  NO_OUTGOINGS,
  totalOutgoings,
  type Household,
} from './household';

const household = (over: Partial<Household> = {}): Household => ({
  netIncome: 30_000,
  outgoings: { ...NO_OUTGOINGS, living: 6_000, car: 2_500, insurance: 1_000 },
  childAges: [],
  plannedChildIn: null,
  plannedChildCost: 0,
  salaryGrowth: 0,
  bufferShare: DEFAULT_BUFFER_SHARE,
  ...over,
});

describe('advise', () => {
  it('leaves what is left after the outgoings and the buffer', () => {
    const advice = advise(household());

    expect(advice.outgoings).toBe(9_500);
    expect(advice.disposable).toBe(20_500);
    expect(advice.buffer).toBe(3_000);
    expect(advice.recommended).toBe(17_500);
  });

  it('recommends less than a bank would allow, which is the point', () => {
    // The bank's rule is 40% of this income — 12,000. A household with real outgoings
    // can be well under that and still be the one telling the truth.
    const tight = household({ outgoings: { ...NO_OUTGOINGS, living: 9_000, car: 4_000, debts: 5_000 } });
    expect(advise(tight).recommended).toBeLessThan(30_000 * 0.4);
  });

  it('recommends nothing to a household already spending more than it earns', () => {
    const over = household({ outgoings: { ...NO_OUTGOINGS, living: 35_000 } });

    expect(advise(over).disposable).toBeLessThan(0);
    // Not a negative repayment, which is not advice.
    expect(advise(over).recommended).toBe(0);
  });

  it('follows a buffer the household changed', () => {
    const none = advise(household({ bufferShare: 0 }));
    expect(none.buffer).toBe(0);
    expect(none.recommended).toBe(none.disposable);
  });

  it('adds the outgoings up as given', () => {
    expect(totalOutgoings({ ...NO_OUTGOINGS, living: 1, car: 2, other: 3 })).toBe(6);
  });
});

describe('horizons', () => {
  it('is one row when nothing is expected to change', () => {
    const rows = horizons(household(), 8_000);

    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('now');
    expect(rows[0].spare).toBe(20_500 - 8_000);
  });

  it('shows the year a planned child arrives', () => {
    const rows = horizons(
      household({ plannedChildIn: 3, plannedChildCost: 2_500 }),
      8_000,
    );
    const child = rows.find((r) => r.reason === 'child');

    expect(child?.inYears).toBe(3);
    expect(child?.outgoings).toBe(12_000);
    expect(child?.spare).toBe(30_000 - 12_000 - 8_000);
  });

  it('compounds a pay rise rather than adding it up', () => {
    const rows = horizons(household({ salaryGrowth: 3 }), 8_000);
    const later = rows.find((r) => r.reason === 'growth');

    // 30,000 at 3% for five years is 34,778, not 34,500.
    expect(later?.income).toBe(Math.round(30_000 * 1.03 ** 5));
  });

  it('holds the outgoings flat, which is the optimistic half of the row', () => {
    const rows = horizons(household({ salaryGrowth: 3 }), 8_000);
    expect(rows.every((r) => r.outgoings === 9_500)).toBe(true);
  });

  it('carries the child forward into the later row', () => {
    // A child born in year two is still there in year five; a row that grew the
    // salary and quietly dropped the child would be the most optimistic of all.
    const rows = horizons(
      household({ salaryGrowth: 3, plannedChildIn: 2, plannedChildCost: 2_000 }),
      8_000,
    );
    const later = rows.find((r) => r.reason === 'growth');

    expect(later?.outgoings).toBe(11_500);
  });

  it('does not repeat a row the reader has already seen', () => {
    // A child expected in eight years lands after the five-year rise, so the rise
    // row would say less than the child row and sit above it saying it first.
    const rows = horizons(
      household({ salaryGrowth: 3, plannedChildIn: 8, plannedChildCost: 2_000 }),
      8_000,
    );

    expect(rows.map((r) => r.reason)).toEqual(['now', 'child']);
  });

  it('skips the rise when none is expected', () => {
    expect(horizons(household({ salaryGrowth: 0 }), 8_000)).toHaveLength(1);
  });
});

describe('childNotes', () => {
  it('counts the ones still in childcare', () => {
    expect(childNotes([2, 4, 9])).toContainEqual({ kind: 'daycare', count: 2 });
  });

  it('says how long until the first one turns eighteen', () => {
    expect(childNotes([2, 4, 15])).toContainEqual({ kind: 'leaving', inYears: 3 });
  });

  it('says nothing about children who have already left', () => {
    expect(childNotes([19, 22])).toEqual([]);
  });

  it('says nothing at all about a household with no children', () => {
    expect(childNotes([])).toEqual([]);
  });

  it('never puts a price on any of it', () => {
    // The whole point: ages produce dates, never shekels. If a note ever carries an
    // amount, somebody has invented what a child costs somebody else.
    for (const note of childNotes([1, 3, 16])) {
      expect(Object.keys(note).join()).not.toMatch(/cost|amount|shekel/i);
    }
  });
});

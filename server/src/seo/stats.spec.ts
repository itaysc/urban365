import { describe, expect, it } from 'vitest';
import {
  byNeighborhood,
  byPropertyType,
  byRooms,
  median,
  quantile,
  summarise,
  type StatRow,
} from './stats.js';

const row = (over: Partial<StatRow> = {}): StatRow => ({
  price: 2_000_000,
  squareMeter: 100,
  pricePerSquareMeter: null,
  rooms: 4,
  propertyType: 'דירה',
  neighborhood: 'קרית שרת',
  ...over,
});

/** `times(3, { price: 1 })` — a band needs three rows before it is shown at all. */
const times = (n: number, over: Partial<StatRow> = {}) => Array.from({ length: n }, () => row(over));

describe('median', () => {
  it('takes the middle of an odd list', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the middle two of an even list', () => {
    expect(median([1, 2, 3, 4])).toBe(3); // 2.5 rounded
  });

  it('is null for nothing, rather than zero', () => {
    // Zero is a price. "We do not know" is not, and a page must be able to say so.
    expect(median([])).toBeNull();
  });
});

describe('quantile', () => {
  it('finds the lower quarter', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
  });

  it('returns a value from the list rather than interpolating', () => {
    expect([10, 20]).toContain(quantile([10, 20], 0.5));
  });
});

describe('summarise', () => {
  it('counts every listing but prices only the ones with a price', () => {
    const summary = summarise([row(), row({ price: null }), row({ price: 3_000_000 })]);

    expect(summary.count).toBe(3);
    expect(summary.priced).toBe(2);
    expect(summary.medianPrice).toBe(2_500_000);
  });

  it('prefers the stated rate per square metre over one it can divide', () => {
    // Stated 25,000; dividing would give 20,000. A listing whose area is the plot and
    // whose price is the house divides into a figure nobody would recognise.
    const summary = summarise([row({ pricePerSquareMeter: 25_000 })]);

    expect(summary.medianPricePerSqm).toBe(25_000);
  });

  it('divides when the source stated no rate', () => {
    expect(summarise([row({ price: 2_000_000, squareMeter: 80 })]).medianPricePerSqm).toBe(25_000);
  });

  it('describes the middle half of the market', () => {
    const summary = summarise([1, 2, 3, 4, 5].map((m) => row({ price: m * 1_000_000 })));

    expect(summary.typicalRange).toEqual({ low: 2_000_000, high: 4_000_000 });
  });

  it('gives no range when every listing is the same price', () => {
    // "Between ₪2m and ₪2m" is an arithmetic result, not a sentence.
    expect(summarise(times(4)).typicalRange).toBeNull();
  });

  it('survives a city where nothing carries a price', () => {
    const summary = summarise(times(3, { price: null, squareMeter: null, pricePerSquareMeter: null }));

    expect(summary.count).toBe(3);
    expect(summary.medianPrice).toBeNull();
    expect(summary.typicalRange).toBeNull();
  });
});

describe('byRooms', () => {
  it('reads smallest first, however many there are of each', () => {
    const rows = [...times(3, { rooms: 5 }), ...times(6, { rooms: 3 })];

    expect(byRooms(rows).map((b) => b.label)).toEqual(['3', '5']);
  });

  it('keeps half rooms apart from whole ones', () => {
    // 3.5 חדרים is a distinct thing to buy and a distinct thing people search for.
    const rows = [...times(3, { rooms: 3 }), ...times(3, { rooms: 3.5 })];

    expect(byRooms(rows).map((b) => b.label)).toEqual(['3', '3.5']);
  });

  it('leaves out a band too small to have a typical price', () => {
    const rows = [...times(4, { rooms: 4 }), ...times(2, { rooms: 2 })];

    expect(byRooms(rows).map((b) => b.label)).toEqual(['4']);
  });

  it('prices each band from its own listings', () => {
    const rows = [
      ...times(3, { rooms: 3, price: 1_000_000 }),
      ...times(3, { rooms: 5, price: 4_000_000 }),
    ];

    expect(byRooms(rows).map((b) => b.medianPrice)).toEqual([1_000_000, 4_000_000]);
  });
});

describe('byPropertyType and byNeighborhood', () => {
  it('orders by how many there are, biggest first', () => {
    const rows = [...times(3, { propertyType: 'פנטהאוז' }), ...times(7, { propertyType: 'דירה' })];

    expect(byPropertyType(rows).map((b) => b.label)).toEqual(['דירה', 'פנטהאוז']);
  });

  it('ignores listings with nothing in the column', () => {
    const rows = [...times(3, { neighborhood: 'נווה רמז' }), ...times(5, { neighborhood: null })];

    expect(byNeighborhood(rows)).toHaveLength(1);
    expect(byNeighborhood(rows)[0].count).toBe(3);
  });

  it('treats a blank string as nothing', () => {
    expect(byNeighborhood(times(4, { neighborhood: '   ' }))).toEqual([]);
  });
});

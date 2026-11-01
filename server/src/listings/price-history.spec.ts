import { describe, expect, it } from 'vitest';
import { dropColumns, priceChange } from './price-history.js';

const AT = new Date('2026-11-01T12:00:00Z');

describe('priceChange', () => {
  it('records a move', () => {
    expect(priceChange('a', 2_000_000, 1_700_000)).toEqual({
      listingId: 'a',
      previous: 2_000_000,
      price: 1_700_000,
    });
  });

  it('records the first price, with nothing before it', () => {
    expect(priceChange('a', null, 2_000_000)).toEqual({
      listingId: 'a',
      previous: null,
      price: 2_000_000,
    });
  });

  it('ignores a price that has not moved', () => {
    // The feed is read every hour. Recording each read would make a log, not a history.
    expect(priceChange('a', 2_000_000, 2_000_000)).toBeNull();
  });

  it('ignores a listing that still has no price', () => {
    expect(priceChange('a', null, null)).toBeNull();
    expect(priceChange('a', 2_000_000, null)).toBeNull();
  });

  it('treats a missing previous the same as none', () => {
    expect(priceChange('a', undefined, 2_000_000)?.previous).toBeNull();
  });
});

describe('dropColumns', () => {
  it('records how far it fell and when', () => {
    const change = priceChange('a', 2_000_000, 1_700_000)!;

    expect(dropColumns(change, AT)).toEqual({
      lastPriceDropAmount: 300_000,
      lastPriceDropAt: AT,
    });
  });

  it('clears the drop when the price goes back up', () => {
    // A flat that rose is not a flat on offer, and a badge saying so costs a viewing.
    const change = priceChange('a', 1_700_000, 1_900_000)!;

    expect(dropColumns(change, AT)).toEqual({ lastPriceDropAmount: null, lastPriceDropAt: null });
  });

  it('is not a drop when this is the first price', () => {
    const change = priceChange('a', null, 2_000_000)!;

    expect(dropColumns(change, AT).lastPriceDropAmount).toBeNull();
  });
});

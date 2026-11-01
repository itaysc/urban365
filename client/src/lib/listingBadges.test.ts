import { describe, expect, it } from 'vitest';
import { DROP_IS_NEWS_FOR_DAYS, isNew, NEW_FOR_DAYS, priceDrop } from './listingBadges';

const NOW = new Date('2026-11-02T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const listing = (over: Partial<Parameters<typeof priceDrop>[0]> = {}) => ({
  lastPriceDropAmount: null,
  lastPriceDropAt: null,
  listedAt: null,
  ...over,
});

describe('priceDrop', () => {
  it('reports a recent drop', () => {
    expect(
      priceDrop(listing({ lastPriceDropAmount: 300_000, lastPriceDropAt: daysAgo(3) }), NOW),
    ).toBe(300_000);
  });

  it('stops reporting one that has gone stale', () => {
    // Half a results page shouting about last spring tells the reader nothing.
    const old = listing({
      lastPriceDropAmount: 300_000,
      lastPriceDropAt: daysAgo(DROP_IS_NEWS_FOR_DAYS + 1),
    });

    expect(priceDrop(old, NOW)).toBeNull();
  });

  it('still reports one on the last day it counts', () => {
    const edge = listing({
      lastPriceDropAmount: 50_000,
      lastPriceDropAt: daysAgo(DROP_IS_NEWS_FOR_DAYS),
    });

    expect(priceDrop(edge, NOW)).toBe(50_000);
  });

  it('is null when there was no drop', () => {
    expect(priceDrop(listing(), NOW)).toBeNull();
  });

  it('is null rather than zero, so nothing renders "ירידת מחיר 0 ₪"', () => {
    expect(priceDrop(listing({ lastPriceDropAmount: 0, lastPriceDropAt: daysAgo(1) }), NOW)).toBeNull();
  });

  it('ignores an amount with no date behind it', () => {
    expect(priceDrop(listing({ lastPriceDropAmount: 100_000 }), NOW)).toBeNull();
  });

  it('treats a future date as current rather than hiding it', () => {
    const ahead = listing({ lastPriceDropAmount: 100_000, lastPriceDropAt: daysAgo(-2) });

    expect(priceDrop(ahead, NOW)).toBe(100_000);
  });
});

describe('isNew', () => {
  it('is true for something listed this week', () => {
    expect(isNew(listing({ listedAt: daysAgo(2) }), NOW)).toBe(true);
  });

  it('is true on the last day it counts', () => {
    expect(isNew(listing({ listedAt: daysAgo(NEW_FOR_DAYS) }), NOW)).toBe(true);
  });

  it('is false the day after', () => {
    expect(isNew(listing({ listedAt: daysAgo(NEW_FOR_DAYS + 1) }), NOW)).toBe(false);
  });

  it('is false when nothing says when it was listed', () => {
    expect(isNew(listing(), NOW)).toBe(false);
  });

  it('is false for a date in the future, which is a feed with a wrong clock', () => {
    expect(isNew(listing({ listedAt: daysAgo(-3) }), NOW)).toBe(false);
  });
});

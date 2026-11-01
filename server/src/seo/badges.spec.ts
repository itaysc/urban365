import { describe, expect, it } from 'vitest';
import { badgesFor, DROP_IS_NEWS_FOR_DAYS, isNew, NEW_FOR_DAYS, priceDrop } from './badges.js';

const NOW = new Date('2026-11-02T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const listing = (over: Partial<Parameters<typeof priceDrop>[0]> = {}) => ({
  lastPriceDropAmount: null,
  lastPriceDropAt: null,
  listedAt: null,
  publishedAt: null,
  ...over,
});

describe('priceDrop', () => {
  it('reports a recent drop', () => {
    expect(priceDrop(listing({ lastPriceDropAmount: 300_000, lastPriceDropAt: daysAgo(3) }), NOW))
      .toBe(300_000);
  });

  it('stops once it is no longer news', () => {
    const stale = listing({
      lastPriceDropAmount: 300_000,
      lastPriceDropAt: daysAgo(DROP_IS_NEWS_FOR_DAYS + 1),
    });

    expect(priceDrop(stale, NOW)).toBeNull();
  });

  it('is null rather than zero', () => {
    expect(priceDrop(listing({ lastPriceDropAmount: 0, lastPriceDropAt: daysAgo(1) }), NOW))
      .toBeNull();
  });
});

describe('isNew', () => {
  it('counts from what the source says', () => {
    expect(isNew(listing({ listedAt: daysAgo(2) }), NOW)).toBe(true);
  });

  it('falls back to when we published it', () => {
    expect(isNew(listing({ publishedAt: daysAgo(1) }), NOW)).toBe(true);
  });

  it('prefers the source over our own date', () => {
    const old = listing({ listedAt: daysAgo(90), publishedAt: daysAgo(1) });

    expect(isNew(old, NOW)).toBe(false);
  });

  it('stops after a week', () => {
    expect(isNew(listing({ listedAt: daysAgo(NEW_FOR_DAYS + 1) }), NOW)).toBe(false);
  });

  it('says nothing about a listing nobody can date', () => {
    expect(isNew(listing(), NOW)).toBe(false);
  });
});

describe('badgesFor', () => {
  it('writes the drop with its figure', () => {
    const html = badgesFor(
      listing({ lastPriceDropAmount: 300_000, lastPriceDropAt: daysAgo(1) }), NOW);

    expect(html).toContain('ירידת מחיר');
    expect(html).toContain('300,000');
  });

  it('writes both when a listing is new and has come down', () => {
    const html = badgesFor(
      listing({ lastPriceDropAmount: 50_000, lastPriceDropAt: daysAgo(1), listedAt: daysAgo(1) }),
      NOW,
    );

    expect(html).toContain('ירידת מחיר');
    expect(html).toContain('חדש!');
  });

  it('writes nothing at all when there is nothing to say', () => {
    expect(badgesFor(listing({ listedAt: daysAgo(400) }), NOW)).toBe('');
  });
});

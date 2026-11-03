import { describe, expect, it } from 'vitest';

import {
  MIN_LISTINGS,
  daysOnMarket,
  marketStateFrom,
  type InventorySnapshot,
} from './market-state.js';

const BALANCED: InventorySnapshot = {
  standing: 100,
  standingBefore: 100,
  medianDaysToSell: 90,
  shareWithPriceCut: 0.2,
  sampled: 120,
};

const snapshot = (over: Partial<InventorySnapshot>): InventorySnapshot => ({
  ...BALANCED,
  ...over,
});

describe('marketStateFrom', () => {
  it('calls a market with no signal either way balanced', () => {
    const verdict = marketStateFrom(BALANCED);
    expect(verdict.state).toBe('balanced');
    expect(verdict.signals).toEqual([]);
    expect(verdict.confident).toBe(true);
  });

  /* The guide's buyers' market, all three columns at once. */
  it('reads slow sales, common price cuts and rising supply as a buyers’ market', () => {
    const verdict = marketStateFrom(
      snapshot({
        medianDaysToSell: 150,
        shareWithPriceCut: 0.42,
        standing: 140,
        standingBefore: 100,
      }),
    );

    expect(verdict.state).toBe('buyers');
    expect(verdict.signals).toHaveLength(3);
    expect(verdict.signals.every((s) => s.points === 'buyers')).toBe(true);
  });

  it('reads the mirror image as a sellers’ market', () => {
    const verdict = marketStateFrom(
      snapshot({
        medianDaysToSell: 40,
        shareWithPriceCut: 0.05,
        standing: 70,
        standingBefore: 100,
      }),
    );

    expect(verdict.state).toBe('sellers');
    expect(verdict.signals.every((s) => s.points === 'sellers')).toBe(true);
  });

  it('stays balanced when the signals disagree', () => {
    const verdict = marketStateFrom(
      snapshot({ medianDaysToSell: 150, shareWithPriceCut: 0.04 }),
    );

    expect(verdict.state).toBe('balanced');
    expect(verdict.signals).toHaveLength(2);
  });

  it('takes the majority when two of three agree', () => {
    expect(
      marketStateFrom(
        snapshot({ medianDaysToSell: 150, shareWithPriceCut: 0.4, standing: 95, standingBefore: 100 }),
      ).state,
    ).toBe('buyers');
  });

  /*
   * Our inventory is a few hundred listings nationally, so a neighbourhood slice is
   * routinely too small to read. One agency clearing its books would otherwise look
   * exactly like the market turning.
   */
  it('refuses to read a trend off too few listings', () => {
    const verdict = marketStateFrom(
      snapshot({
        sampled: MIN_LISTINGS - 1,
        medianDaysToSell: 200,
        shareWithPriceCut: 0.6,
        standing: 200,
        standingBefore: 100,
      }),
    );

    expect(verdict.state).toBe('balanced');
    expect(verdict.confident).toBe(false);
    // The signals are still reported — they just do not carry a verdict.
    expect(verdict.signals).toHaveLength(3);
  });

  it('ignores a missing days-to-sell rather than guessing it', () => {
    const verdict = marketStateFrom(snapshot({ medianDaysToSell: null }));
    expect(verdict.signals.map((s) => s.label)).not.toContain('זמן ארוך עד מכירה');
  });

  it('survives having no history to compare supply against', () => {
    expect(marketStateFrom(snapshot({ standingBefore: 0 })).state).toBe('balanced');
  });
});

describe('daysOnMarket', () => {
  it('counts the days a listing has been standing', () => {
    expect(daysOnMarket(new Date('2026-01-01'), new Date('2026-03-02'))).toBe(60);
  });

  it('has no answer for a listing with no start date', () => {
    expect(daysOnMarket(null, new Date('2026-03-02'))).toBeNull();
  });

  it('refuses a listing dated in the future rather than returning a negative age', () => {
    expect(daysOnMarket(new Date('2026-06-01'), new Date('2026-03-02'))).toBeNull();
  });
});

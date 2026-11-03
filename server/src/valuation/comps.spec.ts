import { describe, expect, it } from 'vitest';
import {
  BARELY_EFFECTIVE,
  MIN_EFFECTIVE,
  score,
  strengthOf,
  tierFor,
  trim,
  widen,
  type CompRow,
  type Subject,
} from './comps.js';

const NOW = new Date('2026-11-03T00:00:00Z');

const subject: Subject = {
  latitude: 32.0,
  longitude: 34.78,
  gush: 7166,
  chelka: 144,
  area: 100,
  rooms: 4,
  settlementCode: 6600,
};

/** A comp `metres` due north of the subject, sane by default. */
const comp = (over: Partial<CompRow> & { metres?: number } = {}): CompRow => {
  const metres = over.metres ?? 1_000_000;
  const { metres: _drop, ...rest } = over;
  const base: CompRow = {
    id: Math.random().toString(36).slice(2),
    latitude: subject.latitude + metres / 111_320,
    longitude: subject.longitude,
    gush: 9999,
    chelka: 1,
    dealDate: new Date('2026-06-01T00:00:00Z'),
    area: 100,
    rooms: 4,
    pricePerSqm: 20_000,
    dealAmount: 2_000_000,
    yearBuilt: 1990,
    settlementCode: 6600,
  };
  return { ...base, ...rest };
};

describe('tierFor', () => {
  it('puts the same parcel above everything', () => {
    expect(tierFor(5_000, true)?.key).toBe('same-parcel');
  });

  it('picks the tightest tier a distance fits', () => {
    expect(tierFor(100, false)?.key).toBe('near');
    expect(tierFor(300, false)?.key).toBe('walk');
    expect(tierFor(900, false)?.key).toBe('quarter');
    expect(tierFor(2_000, false)?.key).toBe('town');
    expect(tierFor(5_000, false)).toBeNull();
  });
});

describe('score', () => {
  it('weighs a sale in the same building above one down the road', () => {
    const { comps } = score(
      subject,
      [comp({ gush: 7166, chelka: 144, metres: 0 }), comp({ metres: 900 })],
      NOW,
    );

    expect(comps[0].tier).toBe('same-parcel');
    expect(comps[0].weight).toBeGreaterThan(comps[1].weight * 3);
  });

  it('gives a sale in the same block a nudge over a stranger at the same distance', () => {
    const { comps } = score(
      subject,
      [comp({ gush: 7166, chelka: 900, metres: 300 }), comp({ gush: 4242, metres: 300 })],
      NOW,
    );

    expect(comps[0].weight).toBeGreaterThan(comps[1].weight);
  });

  it('fades an older sale without discarding it', () => {
    const { comps } = score(
      subject,
      [
        comp({ metres: 300, dealDate: new Date('2026-09-01') }),
        comp({ metres: 300, dealDate: new Date('2025-03-01') }),
      ],
      NOW,
    );

    expect(comps[1].weight).toBeLessThan(comps[0].weight);
    expect(comps[1].weight).toBeGreaterThan(0);
  });

  it('rejects a penthouse rather than trimming it later as a strange price', () => {
    // 220 m² against a 100 m² subject is a different product, which is a filtering
    // question and not a statistical one.
    const { comps, rejected } = score(subject, [comp({ metres: 200, area: 220, dealAmount: 4_400_000 })], NOW);

    expect(comps).toHaveLength(0);
    expect(rejected[0].reason).toBe('area');
  });

  it('rejects a sale with the wrong number of rooms', () => {
    const { rejected } = score(subject, [comp({ metres: 200, rooms: 6 })], NOW);
    expect(rejected[0].reason).toBe('rooms');
  });

  it('rejects a row whose own numbers contradict each other', () => {
    /*
     * The registry states the amount and the rate separately. When they disagree the
     * row is usually a partial share recorded against the whole area, and it is not
     * evidence of a price at all.
     */
    const { rejected } = score(subject, [comp({ metres: 200, pricePerSqm: 20_000, dealAmount: 800_000 })], NOW);
    expect(rejected[0].reason).toBe('price-contradicts');
  });

  it('rejects a nominal transfer', () => {
    const { rejected } = score(subject, [comp({ metres: 200, pricePerSqm: 100, dealAmount: 10_000 })], NOW);
    expect(rejected[0].reason).toBe('price-insane');
  });

  it('crosses a municipal boundary when it is close, but not when it is far', () => {
    // A flat 300 m away in the next town is a good comp; one 2 km away is not.
    const near = score(subject, [comp({ metres: 300, settlementCode: 6200 })], NOW);
    const far = score(subject, [comp({ metres: 2_000, settlementCode: 6200 })], NOW);

    expect(near.comps).toHaveLength(1);
    expect(far.comps).toHaveLength(0);
  });
});

describe('trim', () => {
  const rated = (rates: number[]) =>
    rates.map((rate, i) => ({ id: `c${i}`, weight: 1, rate }));

  it('leaves a small set alone, however it looks', () => {
    // Below six comps there is nothing to be confident is an outlier.
    const items = rated([20_000, 21_000, 5_000]);
    expect(trim(items, (i) => i.rate).kept).toHaveLength(3);
  });

  it('drops the one that disagrees with everything', () => {
    const items = rated([20_000, 20_100, 19_900, 20_200, 19_800, 20_050, 60_000]);
    const { kept, rejected } = trim(items, (i) => i.rate);

    expect(kept).toHaveLength(6);
    expect(rejected[0].reason).toBe('trimmed');
  });

  it('refuses to cut away a split market', () => {
    /*
     * Ten comps in two clean clusters is not an outlier problem, it is two markets.
     * The cap means we lose at most a fifth, and the caller sees the spread and can
     * widen the range or refuse — which is the honest response.
     */
    const items = rated([10_000, 10_100, 10_200, 10_050, 10_150, 30_000, 30_100, 30_200, 30_050, 30_150]);
    const { kept } = trim(items, (i) => i.rate);

    expect(kept.length).toBeGreaterThanOrEqual(8);
  });
});

describe('strengthOf', () => {
  it('accepts a solid set', () => {
    expect(strengthOf(Array(10).fill({ weight: 0.8 })).verdict).toBe('good');
  });

  it('refuses eight distant comps that the effective count alone would wave through', () => {
    /*
     * The gap this second threshold exists to close. Kish's formula is scale-free, so
     * eight comps of weight 0.12 score a full eight — a perfect score for a set of
     * sales two and a half kilometres away.
     */
    const distant = Array(8).fill({ weight: 0.12 });

    expect(strengthOf(distant).effective).toBeGreaterThanOrEqual(MIN_EFFECTIVE);
    expect(strengthOf(distant).verdict).not.toBe('good');
  });

  it('calls a thin set indicative rather than good', () => {
    expect(strengthOf(Array(5).fill({ weight: 0.55 })).verdict).toBe('indicative');
  });

  it('refuses outright when there is almost nothing', () => {
    // Yavne'el: three recorded sales in two years cannot price a house.
    const strength = strengthOf(Array(3).fill({ weight: 0.12 }));

    expect(strength.effective).toBeLessThan(BARELY_EFFECTIVE);
    expect(strength.verdict).toBe('too-thin');
  });
});

describe('developer sales', () => {
  const subject: Subject = {
    latitude: 32.01,
    longitude: 34.77,
    gush: 6000,
    chelka: 10,
    area: 90,
    rooms: 4,
    settlementCode: 6600,
  };

  const resale = (over: Partial<CompRow> = {}): CompRow => ({
    id: 'c',
    latitude: 32.01,
    longitude: 34.77,
    gush: 6000,
    chelka: 10,
    dealDate: new Date('2026-03-01'),
    area: 90,
    rooms: 4,
    pricePerSqm: 22_000,
    dealAmount: 22_000 * 90,
    yearBuilt: 1985,
    settlementCode: 6600,
    ...over,
  });

  const now = new Date('2026-06-01');

  it('keeps an ordinary second-hand flat', () => {
    expect(score(subject, [resale()], now).comps).toHaveLength(1);
  });

  /*
   * A quarter of the recent pool. Off-plan prices carry VAT and a developer's
   * finishing standard, and sit around 20% above resale — enough to lift every
   * valuation near a completing tower if they are left in.
   */
  it('drops a flat sold before it was built', () => {
    const { comps, rejected } = score(subject, [resale({ yearBuilt: 2028 })], now);
    expect(comps).toHaveLength(0);
    expect(rejected[0].reason).toBe('new-build');
  });

  it('drops one sold in its own completion year', () => {
    expect(score(subject, [resale({ yearBuilt: 2026 })], now).rejected[0].reason).toBe('new-build');
  });

  it('keeps a flat resold the year after it was built', () => {
    expect(score(subject, [resale({ yearBuilt: 2025 })], now).comps).toHaveLength(1);
  });

  it('keeps one whose build year is unknown', () => {
    expect(score(subject, [resale({ yearBuilt: null })], now).comps).toHaveLength(1);
  });
});

describe('widen', () => {
  const at = (tier: TierKey, id: string, weight: number): ScoredComp =>
    ({ id, tier, weight, metres: 0 }) as ScoredComp;

  /*
   * The guide's "five to ten good ones beat twenty unrelated", as arithmetic. A
   * parcel with plenty of its own sales must never reach for the rest of the town.
   */
  it('stops at the tightest ring that can carry the answer', () => {
    const comps = [
      ...Array.from({ length: 10 }, (_, i) => at('same-parcel', `a${i}`, 1)),
      ...Array.from({ length: 300 }, (_, i) => at('town', `e${i}`, 0.12)),
    ];

    const { used, stoppedAt } = widen(comps);
    expect(stoppedAt).toBe('same-parcel');
    expect(used).toHaveLength(10);
    expect(used.every((c) => c.tier === 'same-parcel')).toBe(true);
  });

  it('widens when the tight ring is too thin', () => {
    const comps = [
      at('same-parcel', 'a0', 1),
      ...Array.from({ length: 14 }, (_, i) => at('near', `b${i}`, 0.8)),
    ];

    const { used, stoppedAt } = widen(comps);
    expect(stoppedAt).toBe('near');
    expect(used).toHaveLength(15);
  });

  /*
   * Kish's count is scale-free, so eight comps two kilometres away score a full
   * eight. The weight-sum gate is what stops `widen` settling for them, and this is
   * the case that proves the two thresholds are both load-bearing.
   */
  it('does not settle for a handful of distant sales', () => {
    const comps = Array.from({ length: 9 }, (_, i) => at('town', `e${i}`, 0.12));
    const { used } = widen(comps);

    expect(strengthOf(used).effective).toBeGreaterThan(8);
    expect(strengthOf(used).verdict).not.toBe('good');
  });

  it('hands back everything when nothing is ever strong enough', () => {
    const comps = [at('same-parcel', 'a', 1), at('near', 'b', 0.8)];
    const { used, stoppedAt } = widen(comps);

    expect(used).toHaveLength(2);
    expect(stoppedAt).toBe('town');
  });

  it('has an answer for no comparables at all', () => {
    expect(widen([]).used).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import {
  ASKING_LIFT,
  MAX_HALF_WIDTH,
  MIN_HALF_WIDTH,
  POSITION,
  TOO_SPREAD,
  halfWidthFor,
  rangeFor,
  roundPrice,
  type Uncertainty,
} from './range.js';

/** A well-supported valuation in an ordinary market: the measured median spread. */
const TYPICAL: Uncertainty = {
  spread: 0.18,
  effective: 12,
  unknownFields: 0,
  monthsExtrapolated: 0,
  qClamped: false,
};

const with_ = (over: Partial<Uncertainty>): Uncertainty => ({ ...TYPICAL, ...over });

describe('halfWidthFor', () => {
  it('turns the measured spread into a usable width', () => {
    const h = halfWidthFor(TYPICAL);
    expect(h).toBeGreaterThan(MIN_HALF_WIDTH);
    expect(h).toBeLessThan(MAX_HALF_WIDTH);
  });

  it('widens as the comparables disagree', () => {
    expect(halfWidthFor(with_({ spread: 0.3 }))).toBeGreaterThan(halfWidthFor(with_({ spread: 0.12 })));
  });

  /*
   * The distinction that matters. Adding comparables sharpens our reading of the
   * market's rate, but it tells us nothing further about *this* flat's condition —
   * so the width falls and then stops, rather than tending to zero.
   */
  it('narrows with more comparables but never collapses', () => {
    const few = halfWidthFor(with_({ effective: 5 }));
    const many = halfWidthFor(with_({ effective: 60 }));
    const enormous = halfWidthFor(with_({ effective: 5000 }));

    expect(many).toBeLessThan(few);
    expect(enormous).toBeLessThan(many);
    expect(enormous).toBeGreaterThan(0.06);
    expect(enormous / many).toBeGreaterThan(0.85);
  });

  it('widens for a half-filled data sheet', () => {
    expect(halfWidthFor(with_({ unknownFields: 6 }))).toBeGreaterThan(halfWidthFor(TYPICAL));
  });

  it('widens the further the index is carried past its data', () => {
    expect(halfWidthFor(with_({ monthsExtrapolated: 12 }))).toBeGreaterThan(
      halfWidthFor(with_({ monthsExtrapolated: 2 })),
    );
  });

  it('widens when the subject is outside what the adjustments can describe', () => {
    expect(halfWidthFor(with_({ qClamped: true }))).toBeGreaterThan(halfWidthFor(TYPICAL));
  });

  it('adds the separate uncertainties in quadrature, not end to end', () => {
    const both = halfWidthFor(with_({ unknownFields: 6, monthsExtrapolated: 12 }));
    const a = halfWidthFor(with_({ unknownFields: 6 }));
    const b = halfWidthFor(with_({ monthsExtrapolated: 12 }));

    expect(both).toBeLessThan(a + b);
    expect(both).toBeGreaterThan(Math.max(a, b));
  });

  it('holds inside its bounds at both extremes', () => {
    expect(halfWidthFor(with_({ spread: 0.001, effective: 900 }))).toBe(MIN_HALF_WIDTH);
    expect(
      halfWidthFor({
        spread: 0.44,
        effective: 4,
        unknownFields: 10,
        monthsExtrapolated: 24,
        qClamped: true,
      }),
    ).toBe(MAX_HALF_WIDTH);
  });
});

describe('rangeFor', () => {
  it('brackets the estimate', () => {
    const range = rangeFor(1_600_000, TYPICAL, 'balanced')!;
    expect(range.low).toBeLessThan(1_600_000);
    expect(range.high).toBeGreaterThan(1_600_000);
  });

  /*
   * Reproducing the guide's step 7 on its own example. Its flat ranges ₪1.5m–1.65m,
   * is expected to sell near 1.55 and is advertised at 1.59 — expected low in the
   * range because it is a buyers' market, asking a little above it, well under the
   * ceiling.
   */
  it('places the asking price between the expected sale and the ceiling', () => {
    const range = rangeFor(1_575_000, TYPICAL, 'buyers')!;

    expect(range.expected).toBeLessThan(1_575_000);
    expect(range.asking).toBeGreaterThan(range.expected);
    expect(range.asking).toBeLessThan(range.high);
    expect(ASKING_LIFT).toBeLessThan(0.5);
  });

  it('expects a sale near the top in a sellers’ market and low down in a buyers’ one', () => {
    const sellers = rangeFor(2_000_000, TYPICAL, 'sellers')!;
    const buyers = rangeFor(2_000_000, TYPICAL, 'buyers')!;

    expect(sellers.expected).toBeGreaterThan(buyers.expected);
    expect(POSITION.buyers).toBeLessThan(0.5);
    expect(POSITION.sellers).toBeGreaterThan(0.5);
  });

  /*
   * The market decides where in the range the sale lands, never what the flat is
   * worth. Mixing sentiment into the estimate is how a model starts echoing the
   * market's own optimism back at it.
   */
  it('never lets the market move the range itself', () => {
    const sellers = rangeFor(2_000_000, TYPICAL, 'sellers')!;
    const buyers = rangeFor(2_000_000, TYPICAL, 'buyers')!;

    expect(sellers.low).toBe(buyers.low);
    expect(sellers.high).toBe(buyers.high);
  });

  it('refuses when the comparables disagree too much to pool', () => {
    expect(rangeFor(1_600_000, with_({ spread: TOO_SPREAD + 0.01 }), 'balanced')).toBeNull();
  });

  it('refuses a nonsense estimate', () => {
    expect(rangeFor(0, TYPICAL, 'balanced')).toBeNull();
    expect(rangeFor(Number.NaN, TYPICAL, 'balanced')).toBeNull();
  });

  it('quotes the width the way the guide does, from the floor', () => {
    const range = rangeFor(1_600_000, TYPICAL, 'balanced')!;
    expect(range.widthFromFloor).toBeCloseTo((2 * range.halfWidth) / (1 - range.halfWidth), 6);
  });

  it('is wider than the guide’s 10%, because we have not seen the flat', () => {
    // Not a defect: at the measured 18% spread, an agent's 10% would be a claim to
    // knowledge of the floor, condition and view that the registry does not hold.
    expect(rangeFor(1_600_000, TYPICAL, 'balanced')!.widthFromFloor).toBeGreaterThan(0.1);
  });
});

describe('roundPrice', () => {
  it('writes prices the way people write them', () => {
    expect(roundPrice(1_587_432)).toBe(1_590_000);
    expect(roundPrice(842_310)).toBe(840_000);
    expect(roundPrice(7_412_000)).toBe(7_400_000);
  });

  it('never implies a precision the estimate does not have', () => {
    for (const value of [1_234_567, 999_999, 5_555_555]) {
      expect(roundPrice(value) % 5_000).toBe(0);
    }
  });
});

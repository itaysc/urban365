import { describe, expect, it } from 'vitest';

import { B_MAX, B_MIN, elasticityFor } from './elasticity.js';
import { carryForward } from './index-series.js';
import { PARAMS, indexFor } from './params.js';

/**
 * These test the checked-in numbers, not the code that reads them.
 *
 * `fit:valuation` rewrites the file wholesale against a database nobody reviewing a
 * diff will re-run, so this is the only thing standing between a bad refit and
 * production. If one of these fails after a refit, the refit is the suspect.
 */
describe('the fitted parameters', () => {
  it('is stamped with everything needed to reproduce a valuation', () => {
    expect(PARAMS.version).toBeGreaterThanOrEqual(1);
    expect(PARAMS.base).toMatch(/^\d{4}-\d{2}$/);
    expect(Date.parse(PARAMS.fittedAt)).not.toBeNaN();
  });

  it('stops at a complete month, never inside the reporting tail', () => {
    // The last months in the registry are partially reported and their medians
    // collapse; a base inside them would price the country off a phantom crash.
    expect(PARAMS.base).toBe('2026-06');
  });

  describe('elasticity', () => {
    it('is national and negative, near the measured figure', () => {
      expect(PARAMS.elasticity.nationalB).toBeLessThan(-0.1);
      expect(PARAMS.elasticity.nationalB).toBeGreaterThan(-0.3);
    });

    /*
     * The shape, as measured on place-adjusted rates: steep across the small sizes,
     * flat through the middle of the market, falling again at the top. If a refit
     * ever flattens this, small flats go back to being valued several per cent low.
     */
    it('fits a size curve that is steep small, flat in the middle and falls again', () => {
      const { byArea } = PARAMS.elasticity;
      const at = (area: number) => byArea.find((knot) => knot.area === area)!.b;

      expect(byArea.length).toBeGreaterThanOrEqual(10);
      expect(at(50)).toBeLessThan(-0.25);
      expect(at(100)).toBeGreaterThan(-0.1);
      expect(at(210)).toBeLessThan(-0.15);
    });

    it('keeps the knots ascending, inside the bounds, and well evidenced', () => {
      let previous = 0;

      for (const knot of PARAMS.elasticity.byArea) {
        expect(knot.area, String(knot.area)).toBeGreaterThan(previous);
        expect(knot.b, String(knot.area)).toBeGreaterThanOrEqual(B_MIN);
        expect(knot.b, String(knot.area)).toBeLessThanOrEqual(B_MAX);
        expect(knot.n, String(knot.area)).toBeGreaterThan(1_000);
        previous = knot.area;
      }
    });

    /*
     * One curve for the country, and no per-settlement term. Towns really do price
     * size differently — Dimona by almost half a point — but back-testing the local
     * term made the model slightly worse, and worst in the best-tested town that had
     * a large one. `elasticity.ts` has the numbers and the reason.
     */
    it('answers a different exponent for a small flat than for a large one', () => {
      const small = elasticityFor(50, PARAMS.elasticity);
      const large = elasticityFor(100, PARAMS.elasticity);

      expect(small.source).toBe('curve');
      expect(large.b - small.b).toBeGreaterThan(0.2);
    });
  });

  describe('price index', () => {
    it('ends at 1 in every series, so the settlements are comparable', () => {
      expect(PARAMS.index.national[PARAMS.base]).toBeCloseTo(1, 4);

      for (const [code, series] of Object.entries(PARAMS.index.bySettlement)) {
        expect(series[PARAMS.base], code).toBeCloseTo(1, 4);
      }
    });

    it('never produces a zero or negative factor', () => {
      const every = [
        ...Object.values(PARAMS.index.national),
        ...Object.values(PARAMS.index.bySettlement).flatMap((s) => Object.values(s)),
      ];

      expect(every.length).toBeGreaterThan(1000);
      for (const value of every) {
        expect(value).toBeGreaterThan(0.2);
        expect(value).toBeLessThan(5);
      }
    });

    /*
     * The market rose hard into 2024 and has been flat since. A 2022 sale is worth
     * materially more today than it sold for, and an index that had lost that would
     * under-value every flat priced off older comparables.
     */
    it('carries a 2022 sale forward by a double-digit percentage', () => {
      const factor = carryForward(indexFor(null), '2022-01');
      expect(factor).toBeGreaterThan(1.08);
      expect(factor).toBeLessThan(1.4);
    });

    it('holds flat past the base rather than extrapolating', () => {
      expect(carryForward(indexFor(null), '2026-09')).toBe(1);
    });

    it('falls back to the national series for a settlement it has never fitted', () => {
      expect(indexFor(999_999).points).toEqual(indexFor(null).points);
    });

    it('gives a fitted settlement its own series, on the shared base', () => {
      const [code] = Object.keys(PARAMS.index.bySettlement);
      const local = indexFor(Number(code));

      expect(local.base).toBe(PARAMS.base);
      expect(local.points.length).toBeGreaterThan(24);
      expect(local.points.at(-1)!.month).toBe(PARAMS.base);
    });
  });
});

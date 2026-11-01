import { describe, expect, it } from 'vitest';
import { tileGradient } from './tile.js';

describe('tileGradient', () => {
  it('is a CSS gradient', () => {
    expect(tileGradient('חולון')).toMatch(/^linear-gradient\(135deg,#[0-9a-f]{6},#[0-9a-f]{6}\)$/u);
  });

  it('gives a city the same colour every time, so a rebuild does not reshuffle the grid', () => {
    expect(tileGradient('בת ים')).toBe(tileGradient('בת ים'));
  });

  it('does not give every city the same colour', () => {
    const cities = ['חולון', 'בת ים', 'רמת גן', 'חריש', 'שדרות', 'דימונה', 'אשקלון', 'נתניה'];
    const distinct = new Set(cities.map(tileGradient));

    expect(distinct.size).toBeGreaterThan(1);
  });

  it('copes with a name that is empty rather than throwing', () => {
    expect(tileGradient('')).toMatch(/^linear-gradient/u);
  });
});

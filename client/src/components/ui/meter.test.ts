import { describe, expect, it } from 'vitest';
import { followCount, placeOnRange } from './meter';

describe('placeOnRange', () => {
  it('puts the low end at the start and the high end at the far side', () => {
    expect(placeOnRange(100, 200, 100)).toBe(0);
    expect(placeOnRange(100, 200, 200)).toBe(100);
    expect(placeOnRange(100, 200, 150)).toBe(50);
  });

  it('keeps a price outside the band on the band', () => {
    expect(placeOnRange(100, 200, 40)).toBe(0);
    expect(placeOnRange(100, 200, 260)).toBe(100);
  });

  it('sits in the middle when the band has no width', () => {
    expect(placeOnRange(100, 100, 100)).toBe(50);
  });
});

describe('followCount', () => {
  it('stays put when no time has passed', () => {
    expect(followCount(1_000, 2_000, 0)).toBe(1_000);
  });

  it('covers most of a gap across the duration and does not stop short', () => {
    const landed = followCount(0, 1_000_000, 450);
    expect(landed).toBeGreaterThan(900_000);
    expect(landed).toBeLessThanOrEqual(1_000_000);
  });

  it('keeps moving when rounding would hold it still', () => {
    expect(followCount(10, 11, 16)).toBe(11);
  });
});

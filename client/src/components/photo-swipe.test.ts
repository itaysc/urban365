import { describe, expect, it } from 'vitest';
import { slideOffsets, swipeDirection } from './photo-swipe';

describe('slideOffsets', () => {
  it('puts the arriving photo at the origin and leaves it there', () => {
    const gliding = slideOffsets(0, 5, 400, { kind: 'glide', dir: 1, to: 1, width: 400, phase: 'to' });
    expect(gliding).toContainEqual({ index: 1, x: 0 });
    expect(gliding).toContainEqual({ index: 0, x: -400 });

    const rested = slideOffsets(1, 5, 400, { kind: 'idle' });
    expect(rested.find((slot) => slot.index === 1)?.x).toBe(0);
  });

  it('starts the previous photo off the left before it slides in', () => {
    const parked = slideOffsets(2, 5, 400, { kind: 'glide', dir: -1, to: 1, width: 400, phase: 'from' });
    expect(parked).toContainEqual({ index: 1, x: -400 });
    expect(parked).toContainEqual({ index: 2, x: 0 });
  });

  it('brings the previous photo in from the left and parks it', () => {
    const gliding = slideOffsets(2, 5, 400, { kind: 'glide', dir: -1, to: 1, width: 400, phase: 'to' });
    expect(gliding).toContainEqual({ index: 1, x: 0 });
    expect(gliding).toContainEqual({ index: 2, x: 400 });

    const rested = slideOffsets(1, 5, 400, { kind: 'idle' });
    expect(rested.find((slot) => slot.index === 1)?.x).toBe(0);
  });
});

describe('swipeDirection', () => {
  it('steps forward on the left-arrow side and back on the right', () => {
    expect(swipeDirection(0, 1, 5)).toBe(1);
    expect(swipeDirection(0, 4, 5)).toBe(-1);
  });

  it('takes the shorter way around the ends', () => {
    expect(swipeDirection(4, 0, 5)).toBe(1);
    expect(swipeDirection(0, 3, 5)).toBe(-1);
  });

  it('does not move when there is nowhere to go', () => {
    expect(swipeDirection(0, 0, 4)).toBe(0);
    expect(swipeDirection(0, 1, 1)).toBe(0);
  });
});

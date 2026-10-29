import { describe, expect, it } from 'vitest';
import {
  isStepSelected,
  roomsLabel,
  toggleStep,
} from '@/components/search/roomsRange';

describe('toggleStep', () => {
  it('starts a selection at the step clicked', () => {
    expect(toggleStep({}, 3)).toEqual({ min: 3, max: 3 });
  });

  it('extends upward from a single step', () => {
    expect(toggleStep({ min: 3, max: 3 }, 5.5)).toEqual({ min: 3, max: 5.5 });
  });

  it('extends downward too — the second click need not be the larger one', () => {
    expect(toggleStep({ min: 4, max: 4 }, 2)).toEqual({ min: 2, max: 4 });
  });

  it('clears when the single chosen step is clicked again', () => {
    expect(toggleStep({ min: 3, max: 3 }, 3)).toEqual({});
  });

  it('starts over rather than growing once a span exists', () => {
    expect(toggleStep({ min: 3, max: 5.5 }, 2)).toEqual({ min: 2, max: 2 });
    expect(toggleStep({ min: 3, max: 5.5 }, 4)).toEqual({ min: 4, max: 4 });
  });

  it('leaves 6+ open-ended rather than capping the search at six rooms', () => {
    expect(toggleStep({}, 6)).toEqual({ min: 6, max: undefined });
    expect(toggleStep({ min: 3, max: 3 }, 6)).toEqual({ min: 3, max: undefined });
  });

  it('treats 6+ as a chosen single step, so clicking it again clears', () => {
    expect(toggleStep({ min: 6, max: undefined }, 6)).toEqual({});
  });

  it('extends down from 6+', () => {
    expect(toggleStep({ min: 6, max: undefined }, 4)).toEqual({ min: 4, max: undefined });
  });
});

describe('isStepSelected', () => {
  it('covers the steps between the ends, inclusive', () => {
    const range = { min: 3, max: 4.5 };
    expect([2.5, 3, 3.5, 4, 4.5, 5].map((s) => isStepSelected(range, s))).toEqual([
      false, true, true, true, true, false,
    ]);
  });

  it('runs to the end when there is no upper bound', () => {
    expect(isStepSelected({ min: 5, max: undefined }, 6)).toBe(true);
    expect(isStepSelected({ min: 5, max: undefined }, 4.5)).toBe(false);
  });

  it('selects nothing when nothing is chosen', () => {
    expect(isStepSelected({}, 3)).toBe(false);
  });
});

describe('roomsLabel', () => {
  it('reads as the selection does', () => {
    expect(roomsLabel({})).toBeNull();
    expect(roomsLabel({ min: 3, max: 3 })).toBe('3');
    expect(roomsLabel({ min: 3, max: 5.5 })).toBe('3–5.5');
    expect(roomsLabel({ min: 6 })).toBe('+6');
    expect(roomsLabel({ min: 3 })).toBe('3+');
    expect(roomsLabel({ max: 4 })).toBe('עד 4');
  });
});

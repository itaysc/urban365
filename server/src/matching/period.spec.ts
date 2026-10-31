import { describe, expect, it } from 'vitest';
import { isoMonth, isoWeek } from './period.js';

describe('isoWeek', () => {
  it('gives every day of one week the same key', () => {
    const monday = isoWeek(new Date('2026-10-26T00:00:00Z'));
    const sunday = isoWeek(new Date('2026-11-01T23:00:00Z'));

    expect(monday).toBe(sunday);
  });

  it('starts a new key on the next Monday', () => {
    expect(isoWeek(new Date('2026-11-01T00:00:00Z'))).not.toBe(
      isoWeek(new Date('2026-11-02T00:00:00Z')),
    );
  });

  it('pads the week number, so the keys sort', () => {
    expect(isoWeek(new Date('2026-01-08T00:00:00Z'))).toBe('2026-W02');
  });

  it('puts a new year that starts mid-week in the old year last week', () => {
    // 2027-01-01 is a Friday, so it belongs to the last ISO week of 2026.
    expect(isoWeek(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
  });

  it('puts a late December Thursday in the new year week one', () => {
    // 2025-12-29 is a Monday whose Thursday is 2026-01-01.
    expect(isoWeek(new Date('2025-12-29T00:00:00Z'))).toBe('2026-W01');
  });
});

describe('isoMonth', () => {
  it('pads the month, so the keys sort', () => {
    expect(isoMonth(new Date('2026-03-15T00:00:00Z'))).toBe('2026-03');
  });

  it('changes on the first of the month', () => {
    expect(isoMonth(new Date('2026-03-31T00:00:00Z'))).not.toBe(
      isoMonth(new Date('2026-04-01T00:00:00Z')),
    );
  });
});

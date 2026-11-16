import { describe, expect, it } from 'vitest';
import { dayKey, retainedDays } from './history-window.js';

const at = (iso: string) => new Date(iso);

describe('retainedDays', () => {
  it('keeps the most recent days the person actually wrote, and ignores the gaps', () => {
    const dates = [
      at('2026-11-01T10:00:00Z'),
      at('2026-11-02T10:00:00Z'),
      at('2026-11-03T10:00:00Z'),
      at('2026-11-10T10:00:00Z'),
    ];

    const kept = retainedDays(dates, 3);

    expect(kept).toEqual(new Set(['2026-11-02', '2026-11-03', '2026-11-10']));
  });

  it('keeps every day when they have not used it that many times', () => {
    const dates = [at('2026-01-01T10:00:00Z'), at('2026-06-01T10:00:00Z')];

    expect(retainedDays(dates, 3)).toEqual(new Set(['2026-01-01', '2026-06-01']));
  });

  it('counts several messages on one day as a single day', () => {
    const dates = [
      at('2026-11-01T08:00:00Z'),
      at('2026-11-01T18:00:00Z'),
      at('2026-11-05T10:00:00Z'),
    ];

    expect(retainedDays(dates, 1)).toEqual(new Set(['2026-11-05']));
  });

  it('puts a message just after midnight in Israel on that local day', () => {
    // 22:30 UTC in November is 00:30 the next day in Jerusalem (UTC+2).
    expect(dayKey(at('2026-11-16T22:30:00Z'))).toBe('2026-11-17');
  });
});

import { describe, expect, it } from 'vitest';
import { briefingDue, israeliDate, israeliHour } from './briefing-time.js';

/** Israel is UTC+2 in winter and UTC+3 under daylight saving. */
const WINTER_0600 = new Date('2026-11-10T04:00:00Z');
const WINTER_0800 = new Date('2026-11-10T06:00:00Z');
const WINTER_2300 = new Date('2026-11-10T21:00:00Z');
const SUMMER_0800 = new Date('2026-07-10T05:00:00Z');

describe('israeliDate', () => {
  it('is the local date, not the UTC one', () => {
    // 23:00 in Israel is already the next day in neither — but 01:00 local is the
    // previous day in UTC, which is the case that bites.
    expect(israeliDate(new Date('2026-11-10T23:30:00Z'))).toBe('2026-11-11');
  });
});

describe('israeliHour', () => {
  it('follows daylight saving rather than a fixed offset', () => {
    expect(israeliHour(WINTER_0800)).toBe(8);
    expect(israeliHour(SUMMER_0800)).toBe(8);
  });
});

describe('briefingDue', () => {
  it('waits for the morning', () => {
    expect(briefingDue(WINTER_0600, null)).toBe(false);
  });

  it('sends the first one once morning comes', () => {
    expect(briefingDue(WINTER_0800, null)).toBe(true);
  });

  it('does not send a second one the same day', () => {
    expect(briefingDue(WINTER_2300, WINTER_0800)).toBe(false);
  });

  it('sends again the next morning', () => {
    const nextDay = new Date('2026-11-11T06:00:00Z');
    expect(briefingDue(nextDay, WINTER_0800)).toBe(true);
  });

  it('still sends late when the sweep missed seven', () => {
    // The test is the date, not the hour, so a server down all morning catches up
    // rather than skipping the day.
    const lateMorning = new Date('2026-11-10T09:00:00Z');
    expect(briefingDue(lateMorning, null)).toBe(true);
  });

  it('does not send twice across midnight UTC, which is not midnight here', () => {
    const justBeforeLocalMidnight = new Date('2026-11-10T21:30:00Z');
    expect(briefingDue(justBeforeLocalMidnight, WINTER_0800)).toBe(false);
  });
});

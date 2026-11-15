import { describe, expect, it } from 'vitest';
import { allDayCovers, draggedStart, eventDate, minutesOnDay, moveBy, placeEvents, shiftDays } from './dayGrid';

const day = new Date(2026, 10, 15);

describe('minutesOnDay', () => {
  it('measures a meeting from midnight of that day', () => {
    expect(
      minutesOnDay(new Date(2026, 10, 15, 10, 0), new Date(2026, 10, 15, 11, 30), day),
    ).toEqual({ start: 600, end: 690 });
  });

  it('splits a meeting that crosses midnight onto both days', () => {
    const start = new Date(2026, 10, 15, 23, 0);
    const end = new Date(2026, 10, 16, 1, 0);
    expect(minutesOnDay(start, end, day)).toEqual({ start: 23 * 60, end: 24 * 60 });
    expect(minutesOnDay(start, end, new Date(2026, 10, 16))).toEqual({ start: 0, end: 60 });
  });

  it('is nothing on a day the meeting does not touch', () => {
    expect(
      minutesOnDay(new Date(2026, 10, 15, 10, 0), new Date(2026, 10, 15, 11, 0), new Date(2026, 10, 14)),
    ).toBeNull();
  });
});

describe('moveBy', () => {
  it('keeps the length and lands on the quarter hour of the day it was dropped on', () => {
    const moved = moveBy(
      new Date(2026, 10, 15, 10, 0),
      new Date(2026, 10, 15, 11, 0),
      new Date(2026, 10, 16),
      14 * 60 + 15,
    );
    expect(moved.startsAt).toEqual(new Date(2026, 10, 16, 14, 15));
    expect(moved.endsAt).toEqual(new Date(2026, 10, 16, 15, 15));
  });
});

describe('allDayCovers', () => {
  it('includes the start day and stops before the exclusive end', () => {
    const start = new Date(2026, 10, 15);
    const end = new Date(2026, 10, 17);
    expect(allDayCovers(start, end, new Date(2026, 10, 15))).toBe(true);
    expect(allDayCovers(start, end, new Date(2026, 10, 16))).toBe(true);
    expect(allDayCovers(start, end, new Date(2026, 10, 17))).toBe(false);
  });

  it('reads a Google date as that calendar day', () => {
    expect(eventDate('2026-11-15')).toEqual(new Date(2026, 10, 15));
  });
});

describe('shiftDays', () => {
  it('moves both ends and keeps the length', () => {
    const moved = shiftDays(new Date(2026, 10, 15), new Date(2026, 10, 17), 2);
    expect(moved.startsAt).toEqual(new Date(2026, 10, 17));
    expect(moved.endsAt).toEqual(new Date(2026, 10, 19));
  });
});

describe('draggedStart', () => {
  it('keeps hold of the point that was grabbed', () => {
    expect(draggedStart(10 * 60 + 30, 30, 60)).toBe(10 * 60);
  });

  it('moves with the hour that a scroll has brought under the pointer', () => {
    expect(draggedStart(11 * 60, 0, 60)).toBe(11 * 60);
  });

  it('snaps to the quarter hour and stays inside the day', () => {
    expect(draggedStart(10 * 60 + 7, 0, 60)).toBe(10 * 60);
    expect(draggedStart(23 * 60 + 30, 0, 60)).toBe(23 * 60);
  });
});

describe('placeEvents', () => {
  it('puts meetings that do not overlap in one column', () => {
    expect(
      placeEvents([
        { id: 'a', start: 0, end: 60 },
        { id: 'b', start: 60, end: 120 },
      ]),
    ).toEqual([
      { id: 'a', column: 0, columns: 1 },
      { id: 'b', column: 0, columns: 1 },
    ]);
  });

  it('puts meetings that share an hour side by side', () => {
    expect(
      placeEvents([
        { id: 'a', start: 0, end: 60 },
        { id: 'b', start: 30, end: 90 },
      ]),
    ).toEqual([
      { id: 'a', column: 0, columns: 2 },
      { id: 'b', column: 1, columns: 2 },
    ]);
  });
});

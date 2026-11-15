/** A day, in minutes, and the step a dragged meeting snaps to. */
export const DAY_MINUTES = 24 * 60;
export const SNAP_MINUTES = 15;

/**
 * A timestamp, or a Google all-day `YYYY-MM-DD`.
 *
 * A date with no time is a calendar day, not midnight UTC — parsing it as UTC would
 * land it on the previous evening in Israel.
 */
export function eventDate(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

/** Whether an all-day meeting, whose end is the next midnight, falls on this day. */
export function allDayCovers(startsAt: Date, endsAt: Date, day: Date): boolean {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const next = new Date(dayStart);
  next.setDate(next.getDate() + 1);
  return startsAt < next && endsAt > dayStart;
}

/** Move both ends by whole days. The length of an all-day meeting stays. */
export function shiftDays(startsAt: Date, endsAt: Date, days: number): { startsAt: Date; endsAt: Date } {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  start.setDate(start.getDate() + days);
  end.setDate(end.getDate() + days);
  return { startsAt: start, endsAt: end };
}

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** The part of an event that falls on one calendar day, in minutes from midnight. */
export function minutesOnDay(
  startsAt: Date,
  endsAt: Date,
  day: Date,
): { start: number; end: number } | null {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  if (endsAt <= dayStart || startsAt >= dayEnd) return null;

  const start = Math.max(0, (startsAt.getTime() - dayStart.getTime()) / 60_000);
  const end = Math.min(DAY_MINUTES, (endsAt.getTime() - dayStart.getTime()) / 60_000);
  if (end - start < 1) return { start, end: Math.min(DAY_MINUTES, start + SNAP_MINUTES) };
  return { start, end };
}

export const snapMinutes = (minutes: number) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;

/**
 * Where a dragged meeting starts, in minutes from midnight.
 *
 * The pointer is measured on the column as the column stands now. A scroll that
 * brings a later hour under a pointer held still at the edge therefore carries
 * the meeting with it. The grab is how far into the meeting the pointer was
 * when the drag began, so the meeting stays under the finger that picked it up.
 */
export function draggedStart(pointerMinutes: number, grabMinutes: number, duration: number): number {
  const room = Math.min(duration, DAY_MINUTES - SNAP_MINUTES);
  const maxStart = Math.max(0, DAY_MINUTES - room);
  return Math.max(0, Math.min(maxStart, snapMinutes(pointerMinutes - grabMinutes)));
}

/**
 * The same meeting, starting at a new minute of a (possibly different) day.
 * The length stays: dragging moves it, it does not stretch it.
 */
export function moveBy(
  startsAt: Date,
  endsAt: Date,
  day: Date,
  startMinutes: number,
): { startsAt: Date; endsAt: Date } {
  const duration = Math.max(endsAt.getTime() - startsAt.getTime(), SNAP_MINUTES * 60_000);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const minutes = Math.max(0, Math.min(DAY_MINUTES - SNAP_MINUTES, snapMinutes(startMinutes)));
  start.setMinutes(minutes);
  return { startsAt: start, endsAt: new Date(start.getTime() + duration) };
}

export interface PlacedEvent {
  id: string;
  column: number;
  columns: number;
}

/**
 * Side by side, the way a day view has to when two meetings share an hour.
 *
 * Touching at an edge does not count as sharing: a meeting that ends at 11 and one
 * that starts at 11 are sequential, and drawing them in two columns would say they clash.
 */
export function placeEvents(items: { id: string; start: number; end: number }[]): PlacedEvent[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const placed: PlacedEvent[] = [];
  let cluster: { id: string; column: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const columns = columnEnds.length;
    for (const item of cluster) placed.push({ id: item.id, column: item.column, columns });
    cluster = [];
    columnEnds = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.end);
    } else {
      columnEnds[column] = item.end;
    }
    cluster.push({ id: item.id, column });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length > 0) flush();
  return placed;
}

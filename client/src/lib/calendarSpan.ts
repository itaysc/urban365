/**
 * The three spans a calendar is read in, and the days each one covers.
 *
 * Apart from the page so that file exports a component and nothing else, and because
 * the shape is worth stating on its own: all three are the same grid of whole days — a
 * week is a month's first row, a day is a week's first cell. Only the length and where
 * it starts differ, which is why one query and one drawing serve all three.
 */
export const VIEWS = ['day', 'week', 'month'] as const;
export type View = (typeof VIEWS)[number];

export const VIEW_LABEL: Record<View, string> = { day: 'יום', week: 'שבוע', month: 'חודש' };

export const startOfMonth = (at: Date) => new Date(at.getFullYear(), at.getMonth(), 1);

/** Sunday of the week a date falls in, which is where a week starts in Israel. */
export const startOfWeek = (at: Date) => {
  const start = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
};

/**
 * A month grid runs whole weeks and shows the days either side greyed rather than
 * blank, so it sits in a rectangle — and a viewing on the 1st stays next to one on
 * the 31st.
 */
export function gridFor(view: View, anchor: Date): Date[] {
  if (view === 'day') return [new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())];

  const start = view === 'week' ? startOfWeek(anchor) : startOfMonth(anchor);
  const length = view === 'week' ? 7 : 42;
  const from = view === 'week' ? start : startOfWeek(start);

  return Array.from({ length }, (_, i) => {
    const day = new Date(from);
    day.setDate(from.getDate() + i);
    return day;
  });
}

/** `YYYY-MM-DD` in local time, which is what a day in a url means. */
export const isoDay = (at: Date) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

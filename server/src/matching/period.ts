/**
 * The week a date falls in, as `2026-W44`.
 *
 * Used in the dedupe key of a rule about a *state* rather than an event. "This lead has
 * gone quiet" is true again next month, and a key naming only the lead would raise it
 * once in the lifetime of the row — so an agent who dealt with it in March would never
 * hear about the same lead going cold in September. The week in the key turns "never
 * again" into "not again this week", which is what a nudge should be.
 *
 * ISO weeks, so a week belongs to the year its Thursday is in. Without that, the last
 * days of December and the first of January land in a week numbered from the wrong
 * year and a key repeats twelve months later.
 */
export function isoWeek(date: Date): string {
  // Copied, because the arithmetic below moves it.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  // To the Thursday of this week: Sunday (0) counts as the 7th day, not the first.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);

  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The month a date falls in, as `2026-10`. The same idea, for a slower nudge. */
export function isoMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

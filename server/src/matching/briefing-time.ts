/** The hour, in Israel, an agent would like to read it. Before the first viewing. */
export const BRIEFING_HOUR = 7;

const JERUSALEM = 'Asia/Jerusalem';

/**
 * The date in Israel, as `2026-11-01`.
 *
 * Everything about this feature is "once a day", and a day is a local thing: an agent
 * in Tel Aviv gets one briefing between one morning and the next, whatever UTC thinks.
 * Comparing these strings is comparing dates, because ISO dates sort lexically.
 */
export function israeliDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JERUSALEM,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** The hour in Israel, 0–23. */
export function israeliHour(at: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: JERUSALEM,
      hour: '2-digit',
      hour12: false,
    }).format(at),
  );
}

/**
 * Is this person due a briefing?
 *
 * Two conditions, and the second is what makes a missed sweep harmless: morning has
 * come, and they have not had one today. A server that was down at seven sends at
 * eight rather than skipping the day — but one that is up all morning still sends
 * exactly once, because the test is the date and not the hour.
 *
 * Israel keeps daylight saving, so "07:00" moves against UTC twice a year. Asking the
 * calendar for the local hour is the only way to stay at seven through that; arithmetic
 * on a stored offset drifts by an hour for half the year.
 */
export function briefingDue(now: Date, lastSentAt: Date | null): boolean {
  if (israeliHour(now) < BRIEFING_HOUR) return false;
  if (!lastSentAt) return true;

  return israeliDate(lastSentAt) < israeliDate(now);
}

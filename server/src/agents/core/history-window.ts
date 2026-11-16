/** Israel, so a message sent just after midnight local time lands on that day. */
export const HISTORY_TIME_ZONE = 'Asia/Jerusalem';

/** `YYYY-MM-DD` in `timeZone`. */
export function dayKey(date: Date, timeZone = HISTORY_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * The days to keep: the `limit` most recent ones that have a message.
 *
 * A day with nothing in it is not one of the `limit`. Four chats a week apart,
 * with a limit of 3, keep the three newest of those chats.
 */
export function retainedDays(dates: Date[], limit: number, timeZone = HISTORY_TIME_ZONE): Set<string> {
  const unique = [...new Set(dates.map((date) => dayKey(date, timeZone)))].sort();
  return new Set(unique.slice(Math.max(0, unique.length - limit)));
}

/** A place someone searched, in the shape the dropdown needs to offer it again. */
export interface RecentPlace {
  kind: 'city' | 'neighborhood' | 'district';
  value: string;
  /** The city it belongs to — the same as `value` for a city or a region. */
  city: string;
  label: string;
}

const KEY = 'nadlan:recent-places';
const LIMIT = 6;

const sameAs = (a: RecentPlace, b: RecentPlace) =>
  a.kind === b.kind && a.value === b.value && a.city === b.city;

/**
 * Kept in localStorage rather than on the account: this is worth offering to someone
 * who has never signed in, which is most people arriving at a search page, and it is
 * not worth a round trip to read.
 *
 * Every access is guarded. Storage throws outright in a private window and in an iframe
 * with site data blocked, and a search box that explodes because it could not remember
 * a previous search would be a poor trade.
 */
export function readRecentPlaces(): RecentPlace[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Validated field by field rather than trusted: this is text from the user's own
    // machine, which another tab, an older build of this app or a person with the
    // console open may have written.
    return parsed
      .filter(
        (item): item is RecentPlace =>
          Boolean(item) &&
          typeof item === 'object' &&
          (item as RecentPlace).kind !== undefined &&
          ['city', 'neighborhood', 'district'].includes((item as RecentPlace).kind) &&
          typeof (item as RecentPlace).value === 'string' &&
          typeof (item as RecentPlace).city === 'string' &&
          typeof (item as RecentPlace).label === 'string',
      )
      .slice(0, LIMIT);
  } catch {
    return [];
  }
}

/** Most recent first, deduplicated, capped. Returns the new list so callers can render it. */
export function rememberPlace(place: RecentPlace): RecentPlace[] {
  const next = [place, ...readRecentPlaces().filter((item) => !sameAs(item, place))].slice(0, LIMIT);

  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Full, or storage is blocked. The list still works for this page view.
  }

  return next;
}

export function clearRecentPlaces(): RecentPlace[] {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — see above.
  }
  return [];
}

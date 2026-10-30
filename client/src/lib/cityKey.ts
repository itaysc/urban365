/**
 * The key a city name is matched on.
 *
 * A copy of `server/src/listings/city-name.ts`, deliberately: the two sides have to
 * agree on what counts as the same place, and the alternative to a copy here is an
 * extra request before the form can offer a single neighbourhood.
 *
 * Deliberately lossy: separators become spaces and Hebrew geresh/gershayim are dropped,
 * because `פרדס חנה-כרכור` and `פרדס חנה כרכור` are one town to everyone except a
 * string comparison.
 */
export function cityKey(name: string | null | undefined): string {
  if (!name) return '';

  return name
    .normalize('NFKC')
    .replace(/[־‐-―-]/g, ' ')
    .replace(/[׳״'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

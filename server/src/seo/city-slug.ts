import { cityKey } from '../listings/city-name.js';

/**
 * A city's name as it appears in a URL, and the way back.
 *
 * Hebrew in the path rather than a transliteration: `/nadlan/forsale/חולון` is what a
 * Hebrew search engine indexes and what somebody pasting the link sees, while
 * `/nadlan/forsale/holon` is a word nobody searched for. Browsers percent-encode it on
 * the wire and show it decoded, so the ugliness is only ever in the network tab.
 *
 * The slug is not an identifier. Nothing is stored under it and nothing is looked up by
 * it directly — a request carries a slug, `matches` compares it to the city names we
 * actually hold, and the stored spelling wins from there. That is deliberate: listings
 * arrive with whatever spelling their source used, and a slug that had to be exact
 * would 404 on `תל-אביב-יפו` the week a feed started writing `תל אביב - יפו`.
 */

/** `תל אביב יפו` → `תל-אביב-יפו`. */
export function toSlug(city: string): string {
  return city.trim().replace(/\s+/gu, '-');
}

/** Whether this slug names this city, allowing for how differently the two are written. */
export function matches(slug: string, city: string | null | undefined): boolean {
  return cityKey(slug.replace(/-/gu, ' ')) === cityKey(city);
}

/**
 * The slug reduced to its comparable form, for use as a map key.
 *
 * Two slugs that name the same city collapse to one entry, which is what stops
 * `תל-אביב-יפו` and `תל אביב יפו` being counted as two places in the sitemap.
 */
export function slugKey(slug: string): string {
  return cityKey(slug.replace(/-/gu, ' '));
}

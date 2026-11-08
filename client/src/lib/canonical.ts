/**
 * The URL a search engine should treat as this page.
 *
 * The app is one HTML file for every route, so without this a crawl of `/search` and
 * a crawl of `/mortgage` are two copies of the same document. The tag has to name the
 * address the person is actually on, on the public site, and it has to ignore the
 * parts of a URL that do not change the page: a tracking parameter, the listing a
 * card opened on top of the results, a trailing slash.
 */

/** Query keys that never describe a different page. */
const DROPPED = new Set([
  'listing',
  'facets',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'gbraid',
  'wbraid',
  'mc_cid',
  'mc_eid',
  'ref',
  'verified',
]);

/** The public site when the build knows it, otherwise wherever this page was opened. */
export function publicOrigin(configured: string | undefined, locationOrigin: string): string {
  const value = (configured ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(value) ? value : locationOrigin.replace(/\/+$/, '');
}

/** `https://urban365.co.il/search?city=…`, never a tracking parameter and never a slash on the end. */
export function canonicalHref(pathname: string, search: string, origin: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname || '/';
  const base = `${origin}${path}`;
  if (path !== '/search') return base;

  const params = new URLSearchParams(search);
  const kept: [string, string][] = [];
  for (const [key, value] of params) {
    if (!value || DROPPED.has(key) || key.startsWith('utm_')) continue;
    if (key === 'page' && value === '1') continue;
    kept.push([key, value]);
  }
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const query = new URLSearchParams(kept).toString();
  return query ? `${base}?${query}` : base;
}

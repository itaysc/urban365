/**
 * Turning values into the HTML a crawler reads.
 *
 * These pages are assembled as strings rather than rendered by the client's React,
 * because the client is a static bundle hosted somewhere else and a search engine will
 * not wait for it. That means every value interpolated here has to be escaped by hand,
 * which is what `esc` is for — a city name and a neighbourhood come from a scraped feed,
 * and a feed is not a friend.
 */

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Every value that reaches the page goes through this, attribute or text alike.
 *
 * Narrow on purpose: an object stringifies to `[object Object]`, which is not an
 * escaping bug but is certainly a page bug, and the type is where that is cheapest to
 * notice.
 */
export function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/gu, (c) => ENTITIES[c]);
}

/**
 * JSON for a `<script type="application/ld+json">` block.
 *
 * HTML escaping would break the JSON, so the one sequence that matters is neutralised
 * instead: a `</script>` inside a string value ends the block early and whatever follows
 * is parsed as markup.
 */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</gu, '\\u003c');
}

const SHEKELS = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });

/** `2150000` → `2,150,000 ₪`. Null prices are a dash, never a zero. */
export function price(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${SHEKELS.format(value)} ₪`;
}

/** The same figure said in a sentence, where "₪" after the number reads as an afterthought. */
export function priceWords(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return `${SHEKELS.format(value)} ₪`;
}

export function number(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return SHEKELS.format(value);
}

/** `1` → `נכס אחד`, `2` → `2 נכסים`. Hebrew has no bare "1 properties". */
export function properties(count: number): string {
  return count === 1 ? 'נכס אחד' : `${SHEKELS.format(count)} נכסים`;
}

const DATE = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

export function hebrewDate(date: Date): string {
  return DATE.format(date);
}

/** The address as a line of text, from whichever parts a listing actually carries. */
export function addressLine(parts: {
  street: string | null;
  houseNumber: number | null;
  neighborhood: string | null;
  city: string | null;
}): string {
  const street = parts.street
    ? [parts.street, parts.houseNumber].filter((p) => p !== null && p !== '').join(' ')
    : null;

  return [street, parts.neighborhood, parts.city].filter(Boolean).join(', ');
}

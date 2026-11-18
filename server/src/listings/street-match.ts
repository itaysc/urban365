import { cityKey } from './city-name.js';

/** A building number at the end: "9", "9א", "12/4", also after a comma. */
const HOUSE_NUMBER = /(?:,\s*|\s+)\d{1,4}[א-ת]?(?:\/\d{1,4})?$/u;

/** The same number standing as its own word, wherever it was typed. "סמ1" stays: the digit is part of that name. */
const HOUSE_WORD = /^\d{1,4}[א-ת]?(?:\/\d{1,4})?$/u;

/**
 * Words that say what kind of road it is, not which road.
 *
 * The register writes `שד הוז דב` for the boulevard people call `דב הוז` or
 * `שד' דב הוז`. Dropping these leaves the name. ככר stays: ככר ויצמן is not ויצמן.
 */
const ROAD_WORDS = new Set(['רחוב', 'רח', 'שדרות', 'שד', 'שדרה', 'דרך', 'סמטת', 'סמטה', 'מעלה', 'משעול', 'מבוי', 'שביל']);

/** A geresh, a gershayim, or the quotes people type instead. `cityKey` drops the same marks. */
const FLEXIBLE_MARK = /['׳״"’‘]/;

/** "רחוב ויצמן 15" and "ישראל נג'ארה 9" are the street. The register has no house numbers. */
export function streetQueryName(text: string): string {
  return text.trim().replace(HOUSE_NUMBER, '').replace(/[,.\s]+$/u, '').trim();
}

/**
 * The register's own spelling of the street someone named.
 *
 * Exact spelling wins. Otherwise the same words, in any order, without the word
 * that only says "boulevard" or "street": `דב הוז` and `שד' דב הוז` are `שד הוז דב`
 * in the register, and `ישראל נג'ארה` is `נג'ארה ישראל`. A quote and a geresh are
 * the same mark. Several remaining candidates go back to the model.
 */
export function pickStreet(query: string, names: string[]): { name: string } | { choices: string[] } {
  // A street whose own name ends in a number ("סמ 1") is that row, before the
  // number is read as a building.
  const rawKey = cityKey(query.trim());
  const exactRaw = names.filter((name) => rawKey !== '' && cityKey(name) === rawKey);
  if (exactRaw.length === 1) return { name: exactRaw[0] };
  if (exactRaw.length > 1) return { choices: exactRaw };

  const asked = streetQueryName(query);
  const key = cityKey(asked);
  const exact = names.filter((name) => cityKey(name) === key);
  if (exact.length === 1) return { name: exact[0] };
  if (exact.length > 1) return { choices: exact };

  const wanted = queryWords(asked);
  if (wanted.length === 0) return { choices: [] };

  const same = names.filter((name) => sameWords(streetWords(name), wanted));
  if (same.length === 1) return { name: same[0] };
  if (same.length > 1) return { choices: same };

  const covers = names.filter((name) => wanted.every((word) => streetWords(name).includes(word)));
  if (covers.length === 1) return { name: covers[0] };
  if (covers.length > 1) return { choices: covers.slice(0, 8) };

  const prefix = wanted.filter((word) => word.length >= 3);
  const starts = names.filter((name) =>
    prefix.some((word) => streetWords(name).some((streetWord) => streetWord.startsWith(word))),
  );
  return { choices: starts.slice(0, 8) };
}

/**
 * Whether a listing's street line is the register's street.
 *
 * Same test as a person's question, but only the exact name or the same words:
 * a listing on ויצמן is not a listing on ככר ויצמן.
 */
export function listingOnStreet(written: string, registered: string): boolean {
  const asked = streetQueryName(written);
  if (!asked) return false;
  if (cityKey(written.trim()) === cityKey(registered) || cityKey(asked) === cityKey(registered)) return true;
  const left = queryWords(asked);
  const right = streetWords(registered);
  return left.length > 0 && sameWords(left, right);
}

/** The words a person used for the street, quotes folded and road-type words dropped. */
export function streetLookupWords(text: string): string[] {
  return queryWords(streetQueryName(text));
}

/**
 * Whether a prefix search can miss this query.
 *
 * Two words may be stored surname-first. A geresh may be stored as an apostrophe.
 * Either one needs the folded comparison, not `startsWith` on the raw text.
 */
export function streetQueryIsFlexible(text: string): boolean {
  return streetLookupWords(text).length >= 2 || FLEXIBLE_MARK.test(text);
}

/**
 * Streets to offer while an address is being typed, best first.
 *
 * The whole name starting with what was typed, then the name containing it, then
 * the same words in any order, then a street that contains every word, then a word
 * that merely starts with one of them. `ישראל נג'ארה` therefore offers `נג'ארה ישראל`
 * ahead of the other streets that only share ישראל.
 */
export function rankStreets<T extends { name: string; city?: string }>(query: string, rows: T[], limit = 8): T[] {
  const asked = streetQueryName(query);
  const wanted = queryWords(asked);
  const key = wanted.join(' ');
  if (!key) return [];
  const prefixWords = wanted.filter((word) => word.length >= 3);
  const buckets: T[][] = [[], [], [], [], []];

  for (const row of rows) {
    const nameKey = cityKey(row.name);
    const words = streetWords(row.name);
    let tier = -1;
    if (nameKey.startsWith(key)) tier = 0;
    else if (nameKey.includes(key)) tier = 1;
    else if (wanted.length > 0 && sameWords(words, wanted)) tier = 2;
    else if (wanted.length > 0 && wanted.every((word) => words.includes(word))) tier = 3;
    else if (prefixWords.some((word) => words.some((streetWord) => streetWord.startsWith(word)))) tier = 4;
    if (tier >= 0) buckets[tier].push(row);
  }

  buckets[0].sort((a, b) => {
    const exactA = cityKey(a.name) === key ? 0 : 1;
    const exactB = cityKey(b.name) === key ? 0 : 1;
    if (exactA !== exactB) return exactA - exactB;
    return byLabel(a, b);
  });
  for (let tier = 1; tier < buckets.length; tier++) buckets[tier].sort(byLabel);

  const seen = new Set<string>();
  const out: T[] = [];
  for (const bucket of buckets) {
    for (const row of bucket) {
      const id = `${row.name}\0${row.city ?? ''}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(row);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** The name, without quotes and without the word that only names the kind of road. */
function streetWords(name: string): string[] {
  return cityKey(name)
    .split(' ')
    .map((word) => word.replace(/[,.]+$/g, ''))
    .filter((word) => word !== '' && !ROAD_WORDS.has(word));
}

/** What was asked, with a building number left out. "9" is not part of which street it is. */
function queryWords(name: string): string[] {
  return streetWords(name).filter((word) => !HOUSE_WORD.test(word));
}

function sameWords(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((word, index) => word === right[index]);
}

function byLabel(a: { name: string; city?: string }, b: { name: string; city?: string }): number {
  const byName = a.name.localeCompare(b.name, 'he');
  if (byName !== 0) return byName;
  return (a.city ?? '').localeCompare(b.city ?? '', 'he');
}

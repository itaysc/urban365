/** The facts a draft is allowed to state. Anything else is invented. */
export interface DraftFacts {
  address: string | null;
  rooms: number | null;
  price: number | null;
  squareMeter: number | null;
}

/**
 * Every number the draft may legitimately contain.
 *
 * A price is written `3,100,000` or `3100000` or, as agents do, `3.1 מיליון`, so the
 * comparison is on digits alone with separators stripped from both sides. The house
 * number comes along with the address.
 */
function allowedNumbers(facts: DraftFacts): Set<string> {
  const allowed = new Set<string>();

  const add = (value: number | null) => {
    if (value === null) return;
    allowed.add(String(value));
    // `4.5` rooms is also written `4.5`, and a whole number may lose its `.0`.
    if (Number.isInteger(value)) allowed.add(String(Math.trunc(value)));
  };

  add(facts.rooms);
  add(facts.price);
  add(facts.squareMeter);

  // Whatever is in the address — a house number, and occasionally a street with a
  // number in its name.
  for (const match of (facts.address ?? '').matchAll(/\d+/gu)) allowed.add(match[0]);

  return allowed;
}

/**
 * What a draft says that it was not told.
 *
 * The prompt asks the model not to invent facts and mostly it does not — but "mostly"
 * is not a property worth shipping when the output goes to somebody's client about
 * somebody's home. Numbers are the part of a property message that can be checked
 * mechanically: a floor, a price or a size that appears in the text and not in the
 * record is an invention, whatever it looks like.
 *
 * Deliberately narrow. A year, a time of day and a phone number are not property facts
 * and are not checked here; this looks for the shape of a claim about the property.
 * Returns the offending strings, empty when the draft is clean.
 */
export function unsupportedNumbers(text: string, facts: DraftFacts): string[] {
  const allowed = allowedNumbers(facts);
  const bad: string[] = [];

  for (const match of text.matchAll(/\d[\d.,]*/gu)) {
    const raw = match[0].replace(/[.,]+$/u, '');
    const digits = raw.replace(/,/gu, '');
    if (digits === '') continue;

    if (!allowed.has(digits) && !allowed.has(raw)) bad.push(raw);
  }

  return bad;
}

/** Ordinary edit distance, capped — only small numbers are interesting here. */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[b.length];
}

/**
 * Whether the address, if the draft names one, is the address it was given.
 *
 * A Hebrew street name that is almost right is wrong — `חת העם` is not `אחד העם` and
 * `סוקלוב` is not `סוקולוב`. Both read as fluent Hebrew and both send somebody to the
 * wrong road, which is why this looks for the near miss rather than for absence.
 *
 * A draft that names only the city has stated nothing false and passes: not mentioning
 * the street is a choice the instruction explicitly offers when the model is unsure.
 */
export function addressIsIntact(text: string, address: string | null): boolean {
  if (!address) return true;

  const street = address.split(',')[0]?.trim() ?? '';
  const name = street.replace(/\s*\d+\s*$/u, '').trim();
  if (name.replace(/[\d\s]/gu, '').length < 3) return true;

  if (text.includes(name)) return true;

  // Multi-word: part of it present and the whole of it absent is a mangling.
  const words = name.split(/\s+/u).filter((w) => w.length >= 2);
  if (words.length > 1 && words.some((word) => text.includes(word))) return false;

  /*
   * Single word: look for something close but not equal. A tighter threshold on short
   * names, because at four characters half the lexicon is two edits away and rejecting
   * a draft for saying `הרצפה` about a property on `הרצל` would cost a retry for
   * nothing.
   */
  const limit = name.length >= 6 ? 2 : 1;
  for (const candidate of text.split(/[\s,.:;!?()"'״׳-]+/u)) {
    if (candidate.length < 3 || candidate === name) continue;
    if (distance(candidate, name) <= limit) return false;
  }

  return true;
}

/**
 * A house number typed after a street. The register only knows the street, so "הרצל 15"
 * has to be looked up as "הרצל" and the 15 carried along — it is still that address.
 *
 * One optional Hebrew letter covers 15א. A slash covers 12/4.
 */
const HOUSE_AT_END = /^(.*\S)\s+(\d{1,4}[א-ת]?(?:\/\d{1,4})?)$/;

export function splitHouseNumber(value: string): { name: string; house: string } {
  const trimmed = value.trim();
  const match = trimmed.match(HOUSE_AT_END);
  if (!match) return { name: trimmed, house: '' };
  return { name: match[1] ?? trimmed, house: match[2] ?? '' };
}

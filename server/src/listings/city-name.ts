/**
 * The key a city name is matched on.
 *
 * OpenStreetMap writes Tel Aviv as `תל־אביב–יפו` — a maqaf (U+05BE) and an en dash
 * (U+2013) — while a scraped listing says `תל אביב יפו` with plain spaces. Neither is
 * wrong, and a direct comparison finds nothing, so both sides are reduced to the same
 * shape before they meet.
 *
 * Deliberately lossy: separators become spaces and Hebrew geresh/gershayim are dropped,
 * because `נדל״ן` and `נדלן` are the same word to everyone except a string comparison.
 */
export function cityKey(name: string | null | undefined): string {
  if (!name) return '';

  return name
    .normalize('NFKC')
    // Maqaf, en dash, em dash, hyphen — all of them join words in a place name.
    .replace(/[־‐-―-]/g, ' ')
    // Geresh and gershayim, and the ASCII quotes people type instead.
    .replace(/[׳״'"׳״]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

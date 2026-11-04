/**
 * The regions people search by, in the order somebody from the centre reads them.
 *
 * The names are the filter values themselves, so they must match `REGIONS` in
 * `server/scripts/sync-boundaries.mjs` exactly — a region spelled differently here is a
 * region whose search returns nothing.
 */
export const REGIONS: readonly string[] = [
  'מרכז והשרון',
  'תל אביב והסביבה',
  'ירושלים והסביבה',
  'שפלה',
  'חיפה והקריות',
  'חדרה והעמקים',
  'צפון והגליל',
  'דרום',
  'יהודה ושומרון',
];

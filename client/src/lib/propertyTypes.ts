/**
 * The kinds of property somebody can publish or ask for.
 *
 * One list, because the publish form writes these strings into `Listing.propertyType`
 * and the customer brief stores what to match against them — two copies would drift and
 * a brief would stop matching the listings it describes.
 */
export const PROPERTY_TYPES = [
  'דירה',
  'דירת גן',
  'פנטהאוז',
  'בית פרטי/ קוטג׳',
  'דופלקס',
  'סטודיו',
  'מגרש',
];

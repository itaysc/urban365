const shekel = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});

export const formatPrice = (value: number | null): string =>
  value === null ? 'לא צוין מחיר' : shekel.format(value);

/** "26,597 ₪" — the same shape yad2 prints for מחיר למ"ר. */
export const formatShekel = (value: number | null): string =>
  value === null ? '' : `${new Intl.NumberFormat('he-IL').format(value)} ₪`;

export const formatDate = (iso: string): string =>
  iso ? new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const HEBREW_DAYS: Record<string, string> = {
  sunday: 'ראשון',
  sun: 'ראשון',
  monday: 'שני',
  mon: 'שני',
  tuesday: 'שלישי',
  tue: 'שלישי',
  wednesday: 'רביעי',
  wed: 'רביעי',
  thursday: 'חמישי',
  thu: 'חמישי',
  friday: 'שישי',
  fri: 'שישי',
  saturday: 'שבת',
  sat: 'שבת',
};

/**
 * Translates days (e.g. from Yad2 raw English keys like 'sunday') to Hebrew ('ראשון'),
 * or keeps already Hebrew text intact.
 */
export function formatDay(rawDay: string): string {
  const clean = rawDay.trim();
  const lower = clean.toLowerCase();
  if (HEBREW_DAYS[lower]) {
    return `יום ${HEBREW_DAYS[lower]}`;
  }
  if (!clean.startsWith('יום ') && Object.values(HEBREW_DAYS).includes(clean)) {
    return `יום ${clean}`;
  }
  return clean;
}

/** "שדרות גלוסקין 12, ב' / צפון מערב העיר, רחובות" — skipping whatever yad2 left out. */
export function formatAddress(parts: {
  street: string;
  houseNumber: number | null;
  neighborhood: string;
  city: string;
}): string {
  const street = [parts.street, parts.houseNumber].filter(Boolean).join(' ');
  return [street, parts.neighborhood, parts.city].filter(Boolean).join(', ');
}

/**
 * The digits out of whatever was typed into a money field.
 *
 * Every amount these forms take is a whole number of shekels, so a separator, a ₪ or
 * a stray letter is not part of the value — and an empty field is zero, not NaN.
 */
export const digits = (text: string): number => Number(text.replace(/\D/g, '')) || 0;

/** The same grouping `formatShekel` uses, for the places that print a bare number. */
export const grouped = new Intl.NumberFormat('he-IL');

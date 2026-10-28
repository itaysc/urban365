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

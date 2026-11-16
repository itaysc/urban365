import { cityKey } from '../../listings/city-name.js';
import { median } from '../../seo/stats.js';

/**
 * How far from a point on the street a sale still counts.
 *
 * The registry locates a deal by block and parcel, not by street, so "what sold on
 * ויצמן" is "what sold near the point we have for ויצמן". 300 metres is a street and
 * its immediate neighbours. Wider, and the number becomes the neighbourhood's.
 */
export const STREET_HISTORY_RADIUS_METRES = 300;

/** Newest sales kept when a street has more than this. The yearly median uses them. */
export const STREET_HISTORY_LIMIT = 4_000;

export const STREET_HISTORY_YEARS = 10;

/** Homes. Land, shops and parking would make a street's apartment history unreadably mixed. */
export const RESIDENTIAL_GROUPS = ['apartment', 'garden_apartment', 'penthouse', 'house'] as const;

const STREET_PREFIX = /^(?:רחוב|רח'|שדרות|שד'|שדרה|דרך|סמטת|סמטה)\s+/u;
const HOUSE_NUMBER = /\s+\d{1,4}[א-ת]?(?:\/\d{1,4})?$/u;

export interface RecordedDeal {
  dealDate: Date;
  amount: number;
  rooms: number | null;
  area: number | null;
  pricePerSqm: number | null;
}

/** "רחוב ויצמן 15" is the street ויצמן. The register has no house numbers. */
export function streetQueryName(text: string): string {
  return text.trim().replace(STREET_PREFIX, '').replace(HOUSE_NUMBER, '').trim();
}

/**
 * The register's own spelling, when the question names one street.
 *
 * "ויצמן" also matches "ככר ויצמן". Taking the first hit would answer about the
 * square. An exact spelling wins; a single remaining candidate is safe; several
 * candidates go back to the model to ask which one.
 */
export function pickStreet(query: string, matches: string[]): { name: string } | { choices: string[] } {
  const key = cityKey(query);
  const exact = matches.filter((name) => cityKey(name) === key);
  if (exact.length === 1) return { name: exact[0] };
  if (matches.length === 1) return { name: matches[0] };
  return { choices: matches };
}

/** What the model is shown. Yearly medians, then a few of the latest sales. */
export function streetHistorySummary(input: {
  city: string;
  street: string;
  years: number;
  deals: RecordedDeal[];
  truncated: boolean;
}): string {
  const { city, street, years, deals, truncated } = input;
  const where = `רחוב ${street}, ${city}`;
  const window = `ב־${years} השנים האחרונות`;

  if (deals.length === 0) {
    return `לא נמצאו עסקאות מגורים שנרשמו בטווח ${STREET_HISTORY_RADIUS_METRES} מטר מ${where} ${window}.`;
  }

  const byYear = new Map<number, RecordedDeal[]>();
  for (const deal of deals) {
    const year = deal.dealDate.getUTCFullYear();
    const list = byYear.get(year) ?? [];
    list.push(deal);
    byYear.set(year, list);
  }

  const lines = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, rows]) => {
      const price = median(rows.map((row) => row.amount));
      const perSqm = median(rows.map((row) => row.pricePerSqm).filter((value): value is number => value !== null && value > 0));
      const rate = perSqm !== null ? `, ${shekel(perSqm)} למ"ר` : '';
      return `${year}: ${dealCount(rows.length)}, חציון ${shekel(price)}${rate}`;
    });

  const recent = [...deals]
    .sort((a, b) => b.dealDate.getTime() - a.dealDate.getTime())
    .slice(0, 5)
    .map((deal) =>
      [
        deal.dealDate.toISOString().slice(0, 10),
        deal.rooms !== null ? `${deal.rooms} חד'` : '',
        deal.area !== null ? `${deal.area} מ"ר` : '',
        shekel(deal.amount),
        deal.pricePerSqm ? `${shekel(deal.pricePerSqm)} למ"ר` : '',
      ]
        .filter(Boolean)
        .join(' | '),
    );

  return [
    `עסקאות מגורים שנרשמו בטווח ${STREET_HISTORY_RADIUS_METRES} מטר מ${where}, ${window}.`,
    'למרשם אין שם רחוב, אז אלה עסקאות בסביבת הרחוב ולא רק בבניינים שעליו. עסקה מופיעה כשלושה חודשים אחרי החתימה, וזה אינו שמאות.',
    truncated ? `המדגם חתוך ל-${STREET_HISTORY_LIMIT.toLocaleString('he-IL')} העסקאות האחרונות.` : '',
    lines.join('\n'),
    recent.length ? `אחרונות:\n${recent.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function dealCount(count: number): string {
  return count === 1 ? 'עסקה אחת' : `${count} עסקאות`;
}

function shekel(value: number | null): string {
  if (value === null) return 'בלי מחיר';
  return `${Math.round(value).toLocaleString('he-IL')} ₪`;
}

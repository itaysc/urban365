import type { AgentCard } from '../core/agent.types.js';
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

const HOUSE_NUMBER = /\s+\d{1,4}[א-ת]?(?:\/\d{1,4})?$/u;

/**
 * Words that say what kind of road it is, not which road.
 *
 * The register writes `שד הוז דב` for the boulevard people call `דב הוז` or
 * `שד' דב הוז`. Dropping these leaves the name. ככר stays: ככר ויצמן is not ויצמן.
 */
const ROAD_WORDS = new Set(['רחוב', 'רח', 'שדרות', 'שד', 'שדרה', 'דרך', 'סמטת', 'סמטה', 'מעלה', 'משעול', 'מבוי', 'שביל']);

export interface RecordedDeal {
  dealDate: Date;
  amount: number;
  rooms: number | null;
  area: number | null;
  pricePerSqm: number | null;
}

/** "רחוב ויצמן 15" is the street ויצמן. The register has no house numbers. */
export function streetQueryName(text: string): string {
  return text.trim().replace(HOUSE_NUMBER, '').trim();
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
  const asked = streetQueryName(query);
  const key = cityKey(asked);
  const exact = names.filter((name) => cityKey(name) === key);
  if (exact.length === 1) return { name: exact[0] };
  if (exact.length > 1) return { choices: exact };

  const wanted = streetWords(asked);
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

/** The name, without quotes and without the word that only names the kind of road. */
function streetWords(name: string): string[] {
  return cityKey(name)
    .split(' ')
    .filter((word) => word !== '' && !ROAD_WORDS.has(word));
}

function sameWords(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((word, index) => word === right[index]);
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
        dayMonthYear(deal.dealDate),
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

/**
 * The chart the chat draws. The model still reads `streetHistorySummary`; this is
 * only for the screen, so a year of sales is a bar rather than a line of text.
 */
export function streetHistoryCard(input: {
  city: string;
  street: string;
  deals: RecordedDeal[];
}): Extract<AgentCard, { type: 'price-history' }> | null {
  if (input.deals.length === 0) return null;

  const byYear = new Map<number, RecordedDeal[]>();
  for (const deal of input.deals) {
    const year = deal.dealDate.getUTCFullYear();
    const list = byYear.get(year) ?? [];
    list.push(deal);
    byYear.set(year, list);
  }

  const years = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, rows]) => ({
      year,
      count: rows.length,
      median: median(rows.map((row) => row.amount)) ?? 0,
      perSqm: median(rows.map((row) => row.pricePerSqm).filter((value): value is number => value !== null && value > 0)),
    }));

  const recent = [...input.deals]
    .sort((a, b) => b.dealDate.getTime() - a.dealDate.getTime())
    .slice(0, 5)
    .map((deal) => ({
      date: deal.dealDate.toISOString().slice(0, 10),
      amount: deal.amount,
      rooms: deal.rooms,
      area: deal.area,
      perSqm: deal.pricePerSqm,
    }));

  return {
    type: 'price-history',
    city: input.city,
    street: input.street,
    radiusMetres: STREET_HISTORY_RADIUS_METRES,
    years,
    recent,
  };
}

/** `01/06/2024`. The calendar day of the sale, not the hour it was stored. */
function dayMonthYear(date: Date): string {
  const [year, month, day] = date.toISOString().slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function dealCount(count: number): string {
  return count === 1 ? 'עסקה אחת' : `${count} עסקאות`;
}

function shekel(value: number | null): string {
  if (value === null) return 'בלי מחיר';
  return `${Math.round(value).toLocaleString('he-IL')} ₪`;
}

import type { AgentCard } from '../core/agent.types.js';
import { median } from '../../seo/stats.js';

export {
  listingOnStreet,
  pickStreet,
  rankStreets,
  streetLookupWords,
  streetQueryIsFlexible,
  streetQueryName,
} from '../../listings/street-match.js';

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

export interface RecordedDeal {
  dealDate: Date;
  amount: number;
  rooms: number | null;
  area: number | null;
  pricePerSqm: number | null;
}

/** Asking prices of listings on the street that are on the site right now. */
export interface AskingPrices {
  count: number;
  median: number;
  perSqm: number | null;
}

/** What the model is shown. Yearly medians, then a few of the latest sales. */
export function streetHistorySummary(input: {
  city: string;
  street: string;
  years: number;
  deals: RecordedDeal[];
  truncated: boolean;
  rooms?: number;
  asking?: AskingPrices | null;
}): string {
  const { city, street, years, deals, truncated } = input;
  const where = `רחוב ${street}, ${city}`;
  const window = `ב־${years} השנים האחרונות`;
  const subject = input.rooms ? `המספרים הם לדירות ${input.rooms} חדרים.` : '';
  const ads = askingLine(input.rooms, input.asking);

  if (deals.length === 0) {
    return [
      subject,
      `לא נמצאו עסקאות מגורים שנרשמו בטווח ${STREET_HISTORY_RADIUS_METRES} מטר מ${where} ${window}.`,
      ads,
    ]
      .filter(Boolean)
      .join('\n');
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
    subject,
    `עסקאות מגורים שנרשמו בטווח ${STREET_HISTORY_RADIUS_METRES} מטר מ${where}, ${window}.`,
    'למרשם אין שם רחוב, אז אלה עסקאות בסביבת הרחוב ולא רק בבניינים שעליו. עסקה מופיעה כשלושה חודשים אחרי החתימה, וזה אינו שמאות.',
    ads,
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
  rooms?: number;
  asking?: AskingPrices | null;
}): Extract<AgentCard, { type: 'price-history' }> | null {
  if (input.deals.length === 0 && !input.asking) return null;

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
    rooms: input.rooms ?? null,
    years,
    recent,
    asking: input.asking ?? null,
  };
}

function askingLine(rooms: number | undefined, asking: AskingPrices | null | undefined): string {
  if (asking && asking.count > 0) {
    const per = asking.perSqm !== null ? `, ${shekel(asking.perSqm)} למ"ר` : '';
    const what = rooms ? `לדירת ${rooms} חדרים ` : '';
    const count = asking.count === 1 ? 'מודעה אחת' : `${asking.count} מודעות`;
    return `מודעות שמוצגות עכשיו ${what}ברחוב: ${count}, חציון ${shekel(asking.median)}${per}. זה מחיר ביקוש, לא מחיר עסקה.`;
  }
  if (rooms) return `אין כרגע מודעה עם מחיר לדירת ${rooms} חדרים ברחוב.`;
  return 'אין כרגע מודעה עם מחיר ברחוב.';
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

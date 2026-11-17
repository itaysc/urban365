import type { AgentCard } from '../core/agent.types.js';

const KIND: Record<string, string> = {
  buyer: 'קונה',
  seller: 'מוכר',
  both: 'קונה ומוכר',
};

const LEAD_STATUS: Record<string, string> = {
  new: 'חדשה',
  contacted: 'נוצר קשר',
  viewing: 'סיור',
  offer: 'הצעה',
  won: 'נסגרה',
  lost: 'אבודה',
};

const DEAL_STAGE: Record<string, string> = {
  qualified: 'מתאים',
  negotiation: 'משא ומתן',
  under_contract: 'בחוזה',
  closed_won: 'נסגרה בהצלחה',
  closed_lost: 'נסגרה באובדן',
};

const OUTCOME: Record<string, string> = {
  interested: 'מעוניין',
  thinking: 'שוקל',
  not_interested: 'לא מעוניין',
  no_show: 'לא הגיע',
};

export function kindLabel(kind: string | null | undefined): string {
  return (kind && KIND[kind]) || kind || 'לא צוין';
}

export function leadStatusLabel(status: string): string {
  return LEAD_STATUS[status] ?? status;
}

export function dealStageLabel(stage: string): string {
  return DEAL_STAGE[stage] ?? stage;
}

export function outcomeLabel(outcome: string): string {
  return OUTCOME[outcome] ?? outcome;
}

export function shekel(amount: number | null | undefined): string {
  if (amount == null) return 'ללא מחיר';
  return `${amount.toLocaleString('he-IL')} ₪`;
}

/** Day and time as the CRM already stores ISO. Never a phone. */
export function when(iso: Date | string): string {
  const value = typeof iso === 'string' ? iso : iso.toISOString();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`;
}

type CustomerRow = {
  id: string;
  name: string;
  kind: string | null;
  phone: string | null;
  email: string | null;
  notes?: string | null;
  lookingCities?: string[];
  minRooms?: number | null;
  maxRooms?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
};

export function customerSummary(row: CustomerRow): string {
  const bits = [
    `${row.name} (${kindLabel(row.kind)}, מזהה ${row.id})`,
    row.lookingCities?.length ? `מחפש ב${row.lookingCities.join(', ')}` : '',
    row.minRooms != null || row.maxRooms != null
      ? `חדרים ${row.minRooms ?? '?'}–${row.maxRooms ?? '?'}`
      : '',
    row.minPrice != null || row.maxPrice != null
      ? `תקציב ${shekel(row.minPrice)}–${shekel(row.maxPrice)}`
      : '',
    row.notes?.trim() ? `הערה: ${row.notes.trim().slice(0, 120)}` : '',
  ];
  return bits.filter(Boolean).join('. ');
}

export function customerCard(row: CustomerRow): AgentCard {
  return {
    type: 'customer',
    id: row.id,
    href: `/app/customers?id=${row.id}`,
    name: row.name,
    kind: row.kind,
    phone: row.phone,
    email: row.email,
  };
}

type LeadRow = {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  email: string | null;
  message?: string | null;
  listing?: { id: string; city: string | null; street: string | null } | null;
};

export function leadSummary(row: LeadRow): string {
  const listing =
    row.listing && (row.listing.street || row.listing.city)
      ? `נכס: ${[row.listing.street, row.listing.city].filter(Boolean).join(', ')}`
      : '';
  return [
    `${row.name} (${leadStatusLabel(row.status)}, מזהה ${row.id})`,
    listing,
    row.message?.trim() ? `הודעה: ${row.message.trim().slice(0, 120)}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

export function leadCard(row: LeadRow): AgentCard {
  const listingLabel = row.listing
    ? [row.listing.street, row.listing.city].filter(Boolean).join(', ') || null
    : null;
  return {
    type: 'lead',
    id: row.id,
    href: `/app/leads?id=${row.id}`,
    name: row.name,
    status: row.status,
    phone: row.phone,
    email: row.email,
    listingLabel,
  };
}

type DealRow = {
  id: string;
  title: string;
  stage: string;
  price: number | null;
  customer?: { id: string; name: string } | null;
};

export function dealSummary(row: DealRow): string {
  return [
    `${row.title} (${dealStageLabel(row.stage)}, מזהה ${row.id})`,
    row.price != null ? `מחיר ${shekel(row.price)}` : '',
    row.customer ? `לקוח ${row.customer.name}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

export function dealCard(row: DealRow): AgentCard {
  return {
    type: 'deal',
    id: row.id,
    href: `/app/deals`,
    title: row.title,
    stage: row.stage,
    price: row.price,
    customerName: row.customer?.name ?? null,
  };
}

type MeetingRow = {
  id: string;
  title: string;
  startsAt: Date | string;
  location: string | null;
  customer?: { id: string; name: string } | null;
  outcome?: string | null;
  followUpAt?: Date | string | null;
};

export function meetingSummary(row: MeetingRow): string {
  return [
    `${row.title} ב${when(row.startsAt)} (מזהה ${row.id})`,
    row.customer ? `עם ${row.customer.name}` : '',
    row.location ? `ב${row.location}` : '',
    row.outcome ? `סיכום: ${outcomeLabel(row.outcome)}` : '',
    row.followUpAt ? `מעקב ל-${when(row.followUpAt)}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

export function meetingCard(row: MeetingRow): AgentCard {
  return {
    type: 'meeting',
    id: row.id,
    href: `/app/calendar`,
    title: row.title,
    startsAt: typeof row.startsAt === 'string' ? row.startsAt : row.startsAt.toISOString(),
    customerName: row.customer?.name ?? null,
    location: row.location,
  };
}

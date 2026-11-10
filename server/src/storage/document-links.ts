/** The CRM records a file can be attached to. */
export const DOCUMENT_SUBJECTS = ['customer', 'listing', 'deal', 'mortgage_case', 'lead'] as const;

export type DocumentSubject = (typeof DOCUMENT_SUBJECTS)[number];

export const SUBJECT_FIELD: Record<DocumentSubject, 'customerId' | 'listingId' | 'dealId' | 'mortgageCaseId' | 'leadId'> = {
  customer: 'customerId',
  listing: 'listingId',
  deal: 'dealId',
  mortgage_case: 'mortgageCaseId',
  lead: 'leadId',
};

const SUBJECT_LABEL: Record<DocumentSubject, string> = {
  customer: 'לקוח',
  listing: 'נכס',
  deal: 'עסקה',
  mortgage_case: 'תיק משכנתא',
  lead: 'פנייה',
};

export function isDocumentSubject(value: string): value is DocumentSubject {
  return (DOCUMENT_SUBJECTS as readonly string[]).includes(value);
}

export interface DocumentLinkView {
  id: string;
  subject: DocumentSubject;
  subjectId: string;
  label: string;
}

/** The shape `links` comes back in. Exactly one relation is set. */
export interface LinkRow {
  id: string;
  customer: { id: string; name: string } | null;
  listing: { id: string; city: string | null; street: string | null } | null;
  deal: { id: string; title: string } | null;
  mortgageCase: { id: string; propertyCity: string | null; customer: { name: string } | null } | null;
  lead: { id: string; name: string } | null;
}

function named(subject: DocumentSubject, name: string): string {
  return `${SUBJECT_LABEL[subject]} · ${name}`;
}

/** A label the list can print. A link whose record has gone is left out. */
export function presentLink(row: LinkRow): DocumentLinkView | null {
  if (row.customer) {
    return { id: row.id, subject: 'customer', subjectId: row.customer.id, label: named('customer', row.customer.name) };
  }
  if (row.listing) {
    const place = [row.listing.street, row.listing.city].filter(Boolean).join(', ');
    return { id: row.id, subject: 'listing', subjectId: row.listing.id, label: named('listing', place || 'ללא כתובת') };
  }
  if (row.deal) return { id: row.id, subject: 'deal', subjectId: row.deal.id, label: named('deal', row.deal.title) };
  if (row.mortgageCase) {
    const who = row.mortgageCase.customer?.name ?? row.mortgageCase.propertyCity ?? 'ללא שיוך';
    return { id: row.id, subject: 'mortgage_case', subjectId: row.mortgageCase.id, label: named('mortgage_case', who) };
  }
  if (row.lead) return { id: row.id, subject: 'lead', subjectId: row.lead.id, label: named('lead', row.lead.name) };
  return null;
}

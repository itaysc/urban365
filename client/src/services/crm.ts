import { api } from '@/services/api';

export type LeadStatus = 'new' | 'contacted' | 'viewing' | 'offer' | 'won' | 'lost';
export type LeadSource = 'web' | 'manual' | 'import';

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  notes: string | null;
  source: LeadSource;
  status: LeadStatus;
  listingId: string | null;
  assignedToId: string | null;
  contactedAt: string | null;
  createdAt: string;
  listing: { id: string; city: string | null; street: string | null; price: number | null } | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
}

export interface LeadsPage {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function fetchLeads(params: {
  status?: LeadStatus;
  q?: string;
  page?: number;
} = {}): Promise<LeadsPage> {
  const { data } = await api.get<LeadsPage>('/my/leads', { params });
  return data;
}

export async function fetchLeadCounts(): Promise<Partial<Record<LeadStatus, number>>> {
  const { data } = await api.get<Partial<Record<LeadStatus, number>>>('/my/leads/counts');
  return data;
}

export interface LeadInput {
  name: string;
  phone?: string;
  email?: string;
  message?: string;
  notes?: string;
  listingId?: string;
  status?: LeadStatus;
}

export const createLead = (input: LeadInput) => api.post<Lead>('/my/leads', input);
export const updateLead = (id: string, input: Partial<LeadInput>) =>
  api.patch<Lead>(`/my/leads/${id}`, input);
export const deleteLead = (id: string) => api.delete(`/my/leads/${id}`);

export interface ImportResult {
  imported: number;
  skipped: { row: number; reason: string }[];
}

export async function importLeadsCsv(csv: string): Promise<ImportResult> {
  const { data } = await api.post<ImportResult>('/my/leads/import', { csv });
  return data;
}

/** Posted by a visitor from the listing modal; needs no session. */
export const submitEnquiry = (
  listingId: string,
  input: { name: string; phone?: string; email?: string; message?: string },
) => api.post(`/listings/${listingId}/enquiries`, input);

// ── deals ─────────────────────────────────────────────────────────────────────

export type DealStage = 'qualified' | 'negotiation' | 'under_contract' | 'closed_won' | 'closed_lost';

export const DEAL_STAGES: { value: DealStage; label: string }[] = [
  { value: 'qualified', label: 'מתאים' },
  { value: 'negotiation', label: 'משא ומתן' },
  { value: 'under_contract', label: 'בחוזה' },
  { value: 'closed_won', label: 'נסגר בהצלחה' },
  { value: 'closed_lost', label: 'לא נסגר' },
];

export interface Deal {
  id: string;
  title: string;
  stage: DealStage;
  price: number | null;
  commission: number | null;
  expectedCloseAt: string | null;
  closedAt: string | null;
  lostReason: string | null;
  notes: string | null;
  leadId: string | null;
  listingId: string | null;
  lead: { id: string; name: string; phone: string | null; email: string | null } | null;
  listing: { id: string; city: string | null; street: string | null } | null;
  owner: { id: string; firstName: string; lastName: string } | null;
}

export interface DealBoard {
  columns: Record<DealStage, Deal[]>;
  totals: Record<DealStage, { count: number; value: number; commission: number }>;
}

export async function fetchDealBoard(): Promise<DealBoard> {
  const { data } = await api.get<DealBoard>('/my/deals');
  return data;
}

export interface DealInput {
  title: string;
  stage?: DealStage;
  price?: number;
  commission?: number;
  expectedCloseAt?: string;
  leadId?: string;
  listingId?: string;
  notes?: string;
  lostReason?: string;
}

export const createDeal = (input: DealInput) => api.post<Deal>('/my/deals', input);
export const updateDeal = (id: string, input: Partial<DealInput>) =>
  api.patch<Deal>(`/my/deals/${id}`, input);
export const deleteDeal = (id: string) => api.delete(`/my/deals/${id}`);

/**
 * The contact number for a listing, fetched only when the visitor asks. It is not part
 * of the listing payload, so there is nothing to scrape without making this call.
 */
export async function revealPhone(listingId: string): Promise<string> {
  const { data } = await api.get<{ phone: string }>(`/listings/${listingId}/phone`);
  return data.phone;
}

// ── customers ────────────────────────────────────────────────────────────────

export const CUSTOMER_KINDS = ['buyer', 'seller', 'both'] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

/** What a customer is looking for, in the same shape the public search takes filters. */
export interface CustomerBrief {
  lookingSection: string | null;
  lookingCities: string[];
  lookingTypes: string[];
  minRooms: number | null;
  maxRooms: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  minSquareMeter: number | null;
}

export interface Customer extends CustomerBrief {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  kind: CustomerKind;
  notes: string | null;
  assignedToId: string | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
  updatedAt: string;
  /** How many meetings they have been part of, for the row to say so without asking. */
  _count: { meetings: number };
}

export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  kind?: CustomerKind;
  notes?: string;
  assignedToId?: string;
  lookingSection?: string;
  lookingCities?: string[];
  lookingTypes?: string[];
  minRooms?: number;
  maxRooms?: number;
  minPrice?: number;
  maxPrice?: number;
  minSquareMeter?: number;
}

export interface CustomerPage {
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function fetchCustomers(params: {
  q?: string;
  kind?: CustomerKind;
  page?: number;
  /** The server caps this at 100. Only the pickers ask for more than a page. */
  pageSize?: number;
}): Promise<CustomerPage> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.kind) search.set('kind', params.kind);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));

  const { data } = await api.get<CustomerPage>(`/my/customers?${search}`);
  return data;
}

export const createCustomer = (input: CustomerInput) => api.post<Customer>('/my/customers', input);
export const updateCustomer = (id: string, input: Partial<CustomerInput>) =>
  api.patch<Customer>(`/my/customers/${id}`, input);
export const deleteCustomer = (id: string) => api.delete(`/my/customers/${id}`);

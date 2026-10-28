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

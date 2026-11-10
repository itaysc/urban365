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
  pageSize?: number;
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
/** Archives the lead — see `fetchLeadArchive`/`restoreLead`, not a permanent delete. */
export const deleteLead = (id: string) => api.delete(`/my/leads/${id}`);

export async function fetchLeadArchive(): Promise<(Lead & { deletedAt: string })[]> {
  const { data } = await api.get<(Lead & { deletedAt: string })[]>('/my/leads/archive');
  return data;
}

export const restoreLead = (id: string) => api.post<Lead>(`/my/leads/${id}/restore`);

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

/**
 * The pipeline, in order, as the board's column headings name it.
 *
 * Two other places label the same stages differently and deliberately —
 * `CustomerDeals` says what one deal *is* and the dashboard counts several — so these
 * three are not a duplication to be merged. A stage is a place on a board; "נסגרה" is
 * something that happened to a deal.
 */
export const DEAL_STAGES: { value: DealStage; label: string }[] = [
  { value: 'qualified', label: 'הזדמנות' },
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
  commissionPercent: number | null;
  expectedCloseAt: string | null;
  closedAt: string | null;
  lostReason: string | null;
  notes: string | null;
  leadId: string | null;
  listingId: string | null;
  customerId: string | null;
  lead: { id: string; name: string; phone: string | null; email: string | null } | null;
  customer: { id: string; name: string; phone: string | null } | null;
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
  commissionPercent?: number;
  expectedCloseAt?: string;
  leadId?: string;
  listingId?: string;
  customerId?: string;
  notes?: string;
  lostReason?: string;
}

/** Every deal with one person, for their own card. */
export async function fetchCustomerDeals(customerId: string): Promise<Deal[]> {
  const { data } = await api.get<Deal[]>(`/my/deals/for-customer/${customerId}`);
  return data;
}

export const createDeal = (input: DealInput) => api.post<Deal>('/my/deals', input);
export const updateDeal = (id: string, input: Partial<DealInput>) =>
  api.patch<Deal>(`/my/deals/${id}`, input);
/** Archives the deal — see `fetchDealArchive`/`restoreDeal`, not a permanent delete. */
export const deleteDeal = (id: string) => api.delete(`/my/deals/${id}`);

export async function fetchDealArchive(): Promise<(Deal & { deletedAt: string })[]> {
  const { data } = await api.get<(Deal & { deletedAt: string })[]>('/my/deals/archive');
  return data;
}

export const restoreDeal = (id: string) => api.post<Deal>(`/my/deals/${id}/restore`);

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

/**
 * What the brokerage agreement with this person says.
 *
 * Separate from the rest of a customer because it answers a different question: not
 * who they are, but whether the agency can bill for working with them. Under the Real
 * Estate Agents Law a fee can only be claimed where the client signed a written order.
 */
export interface CustomerAgreement {
  /** ISO, or null — and null means unsigned, which is the state that matters. */
  agreementSignedAt: string | null;
  /** Per cent of the price, before VAT. */
  agreementCommissionPercent: number | null;
  /** Or a fixed fee in shekels, before VAT, for an agreement written that way. */
  agreementCommissionAmount: number | null;
  agreementNote: string | null;
}

export type AgreementFilter = 'signed' | 'unsigned';

export interface Customer extends CustomerBrief, CustomerAgreement {
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

  // `null` clears one of these and leaving it out keeps it, so the agreement dialog
  // can save its four fields without restating the brief.
  agreementSignedAt?: string | null;
  agreementCommissionPercent?: number | null;
  agreementCommissionAmount?: number | null;
  agreementNote?: string;
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
  /** Narrow to the people who have signed, or the ones who have not. */
  agreement?: AgreementFilter;
  page?: number;
  /** The server caps this at 100. Only the pickers ask for more than a page. */
  pageSize?: number;
}): Promise<CustomerPage> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.kind) search.set('kind', params.kind);
  if (params.agreement) search.set('agreement', params.agreement);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));

  const { data } = await api.get<CustomerPage>(`/my/customers?${search}`);
  return data;
}

export const createCustomer = (input: CustomerInput) => api.post<Customer>('/my/customers', input);
export const updateCustomer = (id: string, input: Partial<CustomerInput>) =>
  api.patch<Customer>(`/my/customers/${id}`, input);
/** Archives the customer — see `fetchCustomerArchive`/`restoreCustomer`, not a
 *  permanent delete. */
export const deleteCustomer = (id: string) => api.delete(`/my/customers/${id}`);

export async function fetchCustomerArchive(): Promise<(Customer & { deletedAt: string })[]> {
  const { data } = await api.get<(Customer & { deletedAt: string })[]>('/my/customers/archive');
  return data;
}

export const restoreCustomer = (id: string) => api.post<Customer>(`/my/customers/${id}/restore`);

// ── mortgage-broker vertical ──────────────────────────────────────────────────────
// A mortgage case is this vertical's deal — see `MortgageCase` in schema.prisma for
// why it is its own model rather than a widened `Deal` — so the shapes below mirror
// the deal ones above on purpose, down to the board/totals structure.

export type MortgageCaseStage =
  | 'new_request'
  | 'consultation'
  | 'documents'
  | 'sent_to_banks'
  | 'approved_in_principle'
  | 'signed'
  | 'lost';

export const MORTGAGE_CASE_STAGES: { value: MortgageCaseStage; label: string }[] = [
  { value: 'new_request', label: 'בקשה חדשה' },
  { value: 'consultation', label: 'בשיחת ייעוץ' },
  { value: 'documents', label: 'השלמת מסמכים' },
  { value: 'sent_to_banks', label: 'במכרז בין בנקים' },
  { value: 'approved_in_principle', label: 'אושרה עקרונית' },
  { value: 'signed', label: 'נחתמה' },
  { value: 'lost', label: 'לא יצא לפועל' },
];

export interface BankOffer {
  id: string;
  caseId: string;
  bankName: string;
  track: string | null;
  interestRate: number | null;
  monthlyPayment: number | null;
  totalRepayment: number | null;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface BankOfferInput {
  bankName: string;
  track?: string;
  interestRate?: number;
  monthlyPayment?: number;
  totalRepayment?: number;
  receivedAt?: string;
  notes?: string;
}

export interface MortgageCase {
  id: string;
  stage: MortgageCaseStage;
  leadId: string | null;
  customerId: string | null;
  dealId: string | null;
  assignedToId: string | null;
  requestedAmount: number | null;
  propertyValue: number | null;
  equityAvailable: number | null;
  monthlyIncomePrimary: number | null;
  monthlyIncomeSecondary: number | null;
  employmentType: string | null;
  propertyCity: string | null;
  loanTermYears: number | null;
  riskPreference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lead: { id: string; name: string; phone: string | null; email: string | null } | null;
  customer: { id: string; name: string; phone: string | null } | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  bankOffers: BankOffer[];
}

export interface MortgageCaseBoard {
  columns: Record<MortgageCaseStage, MortgageCase[]>;
  totals: Record<MortgageCaseStage, { count: number; requested: number }>;
}

export async function fetchMortgageCaseBoard(): Promise<MortgageCaseBoard> {
  const { data } = await api.get<MortgageCaseBoard>('/my/mortgage-cases');
  return data;
}

export async function fetchMortgageCase(id: string): Promise<MortgageCase> {
  const { data } = await api.get<MortgageCase>(`/my/mortgage-cases/${id}`);
  return data;
}

export interface MortgageCaseInput {
  stage?: MortgageCaseStage;
  leadId?: string;
  customerId?: string;
  assignedToId?: string;
  requestedAmount?: number;
  propertyValue?: number;
  equityAvailable?: number;
  monthlyIncomePrimary?: number;
  monthlyIncomeSecondary?: number;
  employmentType?: string;
  propertyCity?: string;
  loanTermYears?: number;
  riskPreference?: string;
  notes?: string;
}

export const createMortgageCase = (input: MortgageCaseInput) =>
  api.post<MortgageCase>('/my/mortgage-cases', input);
export const updateMortgageCase = (id: string, input: Partial<MortgageCaseInput>) =>
  api.patch<MortgageCase>(`/my/mortgage-cases/${id}`, input);
/** Archives the case — see `fetchMortgageCaseArchive`/`restoreMortgageCase`, not a
 *  permanent delete. */
export const deleteMortgageCase = (id: string) => api.delete(`/my/mortgage-cases/${id}`);

export async function fetchMortgageCaseArchive(): Promise<(MortgageCase & { deletedAt: string })[]> {
  const { data } = await api.get<(MortgageCase & { deletedAt: string })[]>('/my/mortgage-cases/archive');
  return data;
}

export const restoreMortgageCase = (id: string) =>
  api.post<MortgageCase>(`/my/mortgage-cases/${id}/restore`);

export const createBankOffer = (caseId: string, input: BankOfferInput) =>
  api.post<BankOffer>(`/my/mortgage-cases/${caseId}/offers`, input);
export const deleteBankOffer = (caseId: string, id: string) =>
  api.delete(`/my/mortgage-cases/${caseId}/offers/${id}`);

export interface BankerContact {
  id: string;
  bankName: string;
  branch: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankerContactInput {
  bankName: string;
  branch?: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export async function fetchBankerContacts(): Promise<BankerContact[]> {
  const { data } = await api.get<BankerContact[]>('/my/banker-contacts');
  return data;
}

export const createBankerContact = (input: BankerContactInput) =>
  api.post<BankerContact>('/my/banker-contacts', input);
export const updateBankerContact = (id: string, input: Partial<BankerContactInput>) =>
  api.patch<BankerContact>(`/my/banker-contacts/${id}`, input);
/** Archives the contact — see `fetchBankerContactArchive`/`restoreBankerContact`, not
 *  a permanent delete. */
export const deleteBankerContact = (id: string) => api.delete(`/my/banker-contacts/${id}`);

export async function fetchBankerContactArchive(): Promise<(BankerContact & { deletedAt: string })[]> {
  const { data } = await api.get<(BankerContact & { deletedAt: string })[]>('/my/banker-contacts/archive');
  return data;
}

export const restoreBankerContact = (id: string) =>
  api.post<BankerContact>(`/my/banker-contacts/${id}/restore`);

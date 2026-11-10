import { api } from '@/services/api';

export type ListingStatus = 'draft' | 'published' | 'archived';

export interface MyListing {
  id: string;
  token: string | null;
  status: ListingStatus;
  section: string;
  price: number | null;
  rooms: number | null;
  squareMeter: number | null;
  city: string | null;
  street: string | null;
  coverImageUrl: string | null;
  /** How many people saved this listing. */
  savedCount: number;
  updatedAt: string;
}

export interface MyListingsPage {
  items: MyListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function fetchMyListings(params: {
  status?: ListingStatus;
  page?: number;
  pageSize?: number;
} = {}): Promise<MyListingsPage> {
  const { data } = await api.get<MyListingsPage>('/my/listings', { params });
  return data;
}

// ── listing write ─────────────────────────────────────────────────────────────

export interface ListingImage {
  id: string;
  url: string;
  storageKey: string;
  width: number | null;
  height: number | null;
  position: number;
}

export interface ListingDetail extends MyListing {
  section: string;
  propertyType: string | null;
  propertyCondition: string | null;
  neighborhood: string | null;
  houseNumber: number | null;
  floor: number | null;
  buildingTopFloor: number | null;
  balconiesCount: number | null;
  parkingSpacesCount: number | null;
  amenities: string[];
  tags: string[];
  isExclusive: boolean;
  isNewFromDeveloper: boolean;
  description: string | null;
  contactName: string | null;
  brokerName: string | null;
  /** The CRM record for whoever owns the property, when somebody has said who. */
  sellerCustomerId: string | null;
  publishedAt: string | null;
  /** Where the row came from. A new listing typed here is `manual`. */
  source?: 'manual' | 'yad2' | 'import';
  images: ListingImage[];
}

export interface ListingInput {
  section: string;
  status?: ListingStatus;
  price?: number;
  rooms?: number;
  squareMeter?: number;
  floor?: number;
  buildingTopFloor?: number;
  balconiesCount?: number;
  parkingSpacesCount?: number;
  propertyType?: string;
  propertyCondition?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
  houseNumber?: number;
  amenities?: string[];
  isExclusive?: boolean;
  isNewFromDeveloper?: boolean;
  description?: string;
  contactName?: string;
  brokerName?: string;
  /** `''` unlinks, which is why the editor sends it even when it is empty. */
  sellerCustomerId?: string;
}

export async function fetchListing(id: string): Promise<ListingDetail> {
  const { data } = await api.get<ListingDetail>(`/my/listings/${id}`);
  return data;
}

export async function createListing(input: ListingInput): Promise<ListingDetail> {
  const { data } = await api.post<ListingDetail>('/my/listings', input);
  return data;
}

export async function updateListing(id: string, input: Partial<ListingInput>): Promise<ListingDetail> {
  const { data } = await api.patch<ListingDetail>(`/my/listings/${id}`, input);
  return data;
}

export const archiveListing = (id: string) => api.delete(`/my/listings/${id}`);

// ── listing credits ───────────────────────────────────────────────────────────

export interface ListingPackage {
  size: number;
  unitAgorot: number;
  totalAgorot: number;
}

export interface ListingPackageOrder {
  id: string;
  size: number;
  unitAgorot: number;
  totalAgorot: number;
  createdAt: string;
}

export interface ListingPackages {
  enabled: boolean;
  balance: number;
  canPurchase: boolean;
  packages: ListingPackage[];
  orders: ListingPackageOrder[];
}

export async function fetchListingPackages(): Promise<ListingPackages> {
  const { data } = await api.get<ListingPackages>('/my/listing-packages');
  return data;
}

export async function buyListingPackage(size: number): Promise<{ balance: number }> {
  const { data } = await api.post<{ balance: number }>('/my/listing-packages', { size });
  return data;
}

// ── images ────────────────────────────────────────────────────────────────────

/**
 * Posts the file to our API, which stores it in a private bucket and serves it back
 * from a stable path. No presigned URL and no direct call to Backblaze: an expiring
 * link cannot be cached or indexed, which is wrong for a photo on a public listing.
 *
 * `Content-Type` is deliberately not set — the browser must add the multipart boundary
 * itself, and setting the header by hand strips it.
 */
export async function uploadListingImage(listingId: string, file: File): Promise<ListingDetail> {
  const body = new FormData();
  body.append('image', file);

  await api.post(`/my/listings/${listingId}/images`, body);
  return fetchListing(listingId);
}

export async function removeListingImage(listingId: string, imageId: string): Promise<ListingDetail> {
  const { data } = await api.delete<ListingDetail>(`/my/listings/${listingId}/images/${imageId}`);
  return data;
}

export async function reorderListingImages(listingId: string, imageIds: string[]): Promise<ListingDetail> {
  const { data } = await api.patch<ListingDetail>(`/my/listings/${listingId}/images/order`, { imageIds });
  return data;
}

// ── agency profile ────────────────────────────────────────────────────────────

export interface AgencyProfile {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  description: string | null;
  phone: string | null;
  contactEmail: string | null;
  licenseNumber: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  /** Whether this agency takes part in co-brokerage with others. */
  coBrokerage: boolean;
  _count: { listings: number; leads: number; deals: number };
}

export async function fetchAgencyProfile(): Promise<AgencyProfile> {
  const { data } = await api.get<AgencyProfile>('/my/agency');
  return data;
}

export async function updateAgencyProfile(
  input: Partial<
    Pick<AgencyProfile, 'name' | 'description' | 'phone' | 'contactEmail' | 'coBrokerage'>
  >,
) {
  const { data } = await api.patch<AgencyProfile>('/my/agency', input);
  return data;
}

export const removeAgencyCover = () => api.delete<{ id: string; coverImageUrl: string | null }>('/my/agency/cover');

/** Same single-request upload as listing photos, into the agency's own prefix. */
export async function uploadAgencyCover(file: File): Promise<Partial<AgencyProfile>> {
  const body = new FormData();
  body.append('image', file);

  const { data } = await api.post<{ id: string; coverImageUrl: string | null }>('/my/agency/cover', body);
  return data;
}

// ── team ──────────────────────────────────────────────────────────────────────

export type AgencyRole = 'owner' | 'agent';

export interface TeamMember {
  id: string;
  role: AgencyRole;
  status: 'pending' | 'active' | 'suspended';
  joinedAt: string | null;
  createdAt: string;
  user: { id: string; email: string; firstName: string; lastName: string; phone: string | null };
}

export interface TeamInvite {
  id: string;
  email: string;
  role: AgencyRole;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
}

export async function fetchTeam(): Promise<{ members: TeamMember[]; invites: TeamInvite[] }> {
  const { data } = await api.get<{ members: TeamMember[]; invites: TeamInvite[] }>('/my/team');
  return data;
}

export const inviteMember = (email: string, role: AgencyRole) =>
  api.post<TeamInvite>('/my/team/invites', { email, role });
export const revokeInvite = (id: string) => api.delete(`/my/team/invites/${id}`);
export const changeMemberRole = (id: string, role: AgencyRole) =>
  api.patch(`/my/team/members/${id}`, { role });
export const removeMember = (id: string) => api.delete(`/my/team/members/${id}`);

// ── accepting an invite (no session needed) ───────────────────────────────────

export interface InvitePreview {
  email: string;
  role: AgencyRole;
  agencyName: string;
  /** True when the address already has an account, so the page asks them to sign in. */
  hasAccount: boolean;
}

export async function fetchInvite(token: string): Promise<InvitePreview> {
  const { data } = await api.get<InvitePreview>(`/invites/${encodeURIComponent(token)}`);
  return data;
}

export const acceptInvite = (
  token: string,
  body: { firstName?: string; lastName?: string; password?: string; phone?: string },
) => api.post(`/invites/${encodeURIComponent(token)}/accept`, body);

// ── importing this agency's own yad2 page ─────────────────────────────────────

export interface ImportJob {
  status: 'running' | 'done' | 'error';
  progress: { phase: string; done: number; total: number } | null;
  error: string | null;
  errorCode: string | null;
}

export async function startYad2Import(input: string, section?: string) {
  const { data } = await api.post<{ jobId: string; yad2Id: string }>('/my/agency/import/yad2', {
    input,
    ...(section ? { section } : {}),
  });
  return data;
}

export async function fetchImportJob(jobId: string): Promise<ImportJob> {
  const { data } = await api.get<ImportJob>(`/my/agency/import/jobs/${jobId}`);
  return data;
}

/** Your own details — any member may change these, unlike the team routes. */
export const updateMyProfile = (input: {
  firstName?: string;
  lastName?: string;
  phone?: string;
  bio?: string;
  dailyBriefing?: boolean;
}) =>
  api.patch<{ id: string; firstName: string; lastName: string; phone: string | null }>('/my/team/me', input);

export async function uploadMyAvatar(file: File): Promise<{ id: string; avatarUrl: string | null }> {
  const body = new FormData();
  body.append('image', file);
  const { data } = await api.post<{ id: string; avatarUrl: string | null }>('/my/team/me/avatar', body);
  return data;
}

export const removeMyAvatar = () =>
  api.delete<{ id: string; avatarUrl: string | null }>('/my/team/me/avatar');

// ── offices ───────────────────────────────────────────────────────────────────

export interface AgencyOffice {
  id: string;
  label: string | null;
  city: string;
  street: string | null;
  houseNumber: number | null;
  /** Null when the address could not be placed — the office is then not on the map. */
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
}

export interface OfficeInput {
  label?: string;
  city: string;
  street?: string;
  houseNumber?: number;
  phone?: string;
}

export async function fetchOffices(): Promise<AgencyOffice[]> {
  const { data } = await api.get<AgencyOffice[]>('/my/offices');
  return data;
}

export async function createOffice(input: OfficeInput): Promise<AgencyOffice> {
  const { data } = await api.post<AgencyOffice>('/my/offices', input);
  return data;
}

export async function updateOffice(id: string, input: OfficeInput): Promise<AgencyOffice> {
  const { data } = await api.patch<AgencyOffice>(`/my/offices/${id}`, input);
  return data;
}

export async function deleteOffice(id: string): Promise<void> {
  await api.delete(`/my/offices/${id}`);
}

// ── documents ─────────────────────────────────────────────────────────────────

/** The same cap the server enforces. A scan of a contract fits; a drive dump does not. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type DocumentSubject = 'customer' | 'listing' | 'deal' | 'mortgage_case' | 'lead';

export interface DocumentLink {
  id: string;
  subject: DocumentSubject;
  subjectId: string;
  label: string;
}

export interface AgencyDocument {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
  links: DocumentLink[];
}

export async function fetchDocuments(filter?: {
  subject: DocumentSubject;
  subjectId: string;
}): Promise<AgencyDocument[]> {
  const { data } = await api.get<AgencyDocument[]>('/my/documents', { params: filter });
  return data;
}

/**
 * `Content-Type` is deliberately not set — the browser must add the multipart boundary
 * itself, and setting the header by hand strips it.
 */
export async function uploadDocument(
  file: File,
  link?: { subject: DocumentSubject; subjectId: string },
): Promise<AgencyDocument> {
  const body = new FormData();
  body.append('file', file);
  if (link) {
    body.append('subject', link.subject);
    body.append('subjectId', link.subjectId);
  }
  const { data } = await api.post<AgencyDocument>('/my/documents', body);
  return data;
}

export async function linkDocument(
  id: string,
  link: { subject: DocumentSubject; subjectId: string },
): Promise<DocumentLink> {
  const { data } = await api.post<DocumentLink>(`/my/documents/${id}/links`, link);
  return data;
}

export async function unlinkDocument(id: string, linkId: string): Promise<void> {
  await api.delete(`/my/documents/${id}/links/${linkId}`);
}

export async function downloadDocument(id: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/my/documents/${id}/file`, { responseType: 'blob' });
  return data;
}

export async function deleteDocument(id: string): Promise<void> {
  await api.delete(`/my/documents/${id}`);
}

import { api } from '@/services/api';
import type { AuthUser } from '@/types/auth';

export interface PendingClaim {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  evidence: unknown;
  createdAt: string;
}

export interface PendingAgency {
  id: string;
  name: string;
  status: string;
  yad2Id: string | null;
  listingCount: number;
  createdAt: string;
  /** Someone claiming an agency scraped from yad2. Several people may claim the same one. */
  claims: PendingClaim[];
  /** A self-signup agency instead: a pending owner, and no claim row to review. */
  pendingOwner: { userId: string; email: string; name: string } | null;
}

export async function fetchPendingAgencies(): Promise<PendingAgency[]> {
  const { data } = await api.get<PendingAgency[]>('/admin/moderation/agencies');
  return data;
}

export const approveAgency = (agencyId: string, userId: string) =>
  api.post(`/admin/moderation/agencies/${agencyId}/approve`, { userId });

export const rejectAgency = (agencyId: string, reason?: string) =>
  api.post(`/admin/moderation/agencies/${agencyId}/reject`, { reason });

export interface ManagedAgency {
  id: string;
  name: string;
  status: 'active' | 'unclaimed' | 'suspended' | 'deleted';
  yad2Id: string | null;
  publishedCount: number;
}

export async function fetchAgencyDirectory(q: string): Promise<ManagedAgency[]> {
  const { data } = await api.get<ManagedAgency[]>('/admin/moderation/agencies/directory', {
    params: q.trim() ? { q: q.trim() } : {},
  });
  return data;
}

export const suspendAgency = (agencyId: string) =>
  api.post(`/admin/moderation/agencies/${agencyId}/suspend`);

export const restoreAgency = (agencyId: string) =>
  api.post(`/admin/moderation/agencies/${agencyId}/restore`);

export const deleteAgency = (agencyId: string) =>
  api.post(`/admin/moderation/agencies/${agencyId}/delete`);

export type ManagedUserRole = 'buyer' | 'agency' | 'admin';

export interface ManagedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  emailVerified: boolean;
  disabled: boolean;
  publishedCount: number;
  role: ManagedUserRole;
  agencyName: string | null;
}

export async function fetchUsers(q: string): Promise<ManagedUser[]> {
  const { data } = await api.get<ManagedUser[]>('/admin/moderation/users', {
    params: q.trim() ? { q: q.trim() } : {},
  });
  return data;
}

export const setUserRole = (userId: string, role: ManagedUserRole) =>
  api.post(`/admin/moderation/users/${userId}/role`, { role });

export const disableUser = (userId: string) => api.post(`/admin/moderation/users/${userId}/disable`);

export const enableUser = (userId: string) => api.post(`/admin/moderation/users/${userId}/enable`);

export interface PendingListing {
  id: string;
  city: string | null;
  street: string | null;
  houseNumber: number | null;
  price: number | null;
  rooms: number | null;
  squareMeter: number | null;
  propertyType: string | null;
  section: string;
  description: string | null;
  coverImageUrl: string | null;
  createdAt: string;
  reviewStatus: 'unchecked' | 'clean' | 'flagged';
  reviewReason: string | null;
  owner: { email: string; firstName: string; lastName: string };
}

/** Suggested reasons. The admin can send one as-is or edit it first. */
export const LISTING_REJECTION_PRESETS = [
  'הפרטים חסרים או לא ברורים',
  'התמונות לא מתאימות לנכס',
  'הפרסום נראה כפול',
  'המחיר או הכתובת לא תקינים',
  'התוכן לא עומד בתנאי השימוש',
] as const;

export async function fetchPendingListings(): Promise<PendingListing[]> {
  const { data } = await api.get<PendingListing[]>('/admin/moderation/listings');
  return data;
}

export const approveListing = (id: string) => api.post(`/admin/moderation/listings/${id}/approve`);

export const rejectListing = (id: string, note: string) =>
  api.post(`/admin/moderation/listings/${id}/reject`, { note });

export interface PlatformInvite {
  id: string;
  email: string;
  accountType: 'buyer' | 'agency';
  expiresAt: string;
  createdAt: string;
  expired: boolean;
}

export async function fetchPlatformInvites(): Promise<PlatformInvite[]> {
  const { data } = await api.get<PlatformInvite[]>('/admin/invites');
  return data;
}

export async function createPlatformInvite(
  email: string,
  accountType: 'buyer' | 'agency',
): Promise<PlatformInvite> {
  const { data } = await api.post<PlatformInvite>('/admin/invites', { email, accountType });
  return data;
}

export const revokePlatformInvite = (id: string) => api.delete(`/admin/invites/${id}`);

export async function createPlatformUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  accountType: 'buyer' | 'agency';
  phone?: string;
}): Promise<{ id: string; email: string }> {
  const { data } = await api.post<{ id: string; email: string }>('/admin/users', input);
  return data;
}

export interface JoinPreview {
  email: string;
  hasAccount: boolean;
}

export async function fetchJoinInvite(token: string): Promise<JoinPreview> {
  const { data } = await api.get<JoinPreview>(`/join/${encodeURIComponent(token)}`);
  return data;
}

export async function acceptJoinInvite(
  token: string,
  input: { firstName: string; lastName: string; password: string; phone?: string },
): Promise<AuthUser> {
  const { data } = await api.post<{ user: AuthUser }>(`/join/${encodeURIComponent(token)}/accept`, input);
  return data.user;
}

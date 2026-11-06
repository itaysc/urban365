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

export interface PlatformInvite {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
}

export async function fetchPlatformInvites(): Promise<PlatformInvite[]> {
  const { data } = await api.get<PlatformInvite[]>('/admin/invites');
  return data;
}

export async function createPlatformInvite(email: string): Promise<PlatformInvite> {
  const { data } = await api.post<PlatformInvite>('/admin/invites', { email });
  return data;
}

export const revokePlatformInvite = (id: string) => api.delete(`/admin/invites/${id}`);

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

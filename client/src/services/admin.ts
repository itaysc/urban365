import { api } from '@/services/api';

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

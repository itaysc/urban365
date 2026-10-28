export type AgencyRole = 'owner' | 'agent';
export type PlatformRole = 'admin' | 'support';
export type MembershipStatus = 'pending' | 'active' | 'suspended';
export type AgencyStatus = 'unclaimed' | 'pending' | 'active' | 'rejected' | 'suspended';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  platformRole: PlatformRole | null;
  agency: {
    id: string;
    name: string;
    status: AgencyStatus;
    role: AgencyRole;
    membershipStatus: MembershipStatus;
  } | null;
}

export interface SignupInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  agencyName?: string;
  claimAgencyId?: string;
}

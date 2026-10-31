export type AgencyRole = 'owner' | 'agent';
export type PlatformRole = 'admin' | 'support';
export type MembershipStatus = 'pending' | 'active' | 'suspended';
export type AgencyStatus = 'unclaimed' | 'pending' | 'active' | 'rejected' | 'suspended';

export type AccountType = 'buyer' | 'agency';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  /** Whether they want the morning email of what is worth doing today. */
  dailyBriefing: boolean;
  emailVerified: boolean;
  accountType: AccountType;
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
  /** The server rejects anything but true — see the note on the DTO. */
  acceptedTerms: boolean;
  agencyName?: string;
  claimAgencyId?: string;
}

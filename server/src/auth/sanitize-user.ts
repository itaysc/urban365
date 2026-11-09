import type { Agency, AgencyMembership, User } from '@prisma/client';
import { resubmitKind, type ResubmitKind } from './resubmit-agency.js';

export interface PublicAgency {
  id: string;
  name: string;
  status: string;
  role: string;
  membershipStatus: string;
  /** What this account may do about an agency that is not active yet. */
  resubmit: ResubmitKind;
  /** The note an admin wrote when they turned the request down. Empty while it is still in the queue. */
  rejectionReason: string | null;
  /** Present when the agency is one they created, so the form can show what was sent. */
  phone: string | null;
  contactEmail: string | null;
  description: string | null;
  /** Real-estate brokerage or mortgage brokerage — which CRM shell this account sees. */
  vertical: string;
}

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  /** Whether they want the morning email. Theirs to change on their own profile. */
  dailyBriefing: boolean;
  emailVerified: boolean;
  accountType: string;
  platformRole: string | null;
  agency: PublicAgency | null;
}

type WithMembership = User & {
  memberships: (AgencyMembership & { agency: Agency })[];
  claims?: { agencyId: string; status: string; rejectionReason: string | null }[];
};

/**
 * The single serialisation boundary for a user. With `passwordHash` on the row, every
 * response that includes a user must go through here — nothing else may spread a `User`.
 */
/** The office this account is acting as: the active one, or the latest request if none is. */
export function shownMembership(user: WithMembership) {
  return user.memberships.find((row) => row.status === 'active') ?? user.memberships[0];
}

export function sanitizeUser(user: WithMembership): PublicUser {
  const membership = shownMembership(user);
  const kind = membership
    ? resubmitKind({
        agencyStatus: membership.agency.status,
        membershipStatus: membership.status,
        yad2Id: membership.agency.yad2Id,
      })
    : null;
  const claim = membership?.agency
    ? user.claims?.find((row) => row.agencyId === membership.agency.id)
    : undefined;
  // A scraped office that was given to someone else keeps the reason on the claim.
  // The agency row itself was cleared when the winner was approved.
  const rejectionReason =
    kind && kind !== 'waiting' && kind !== 'closed'
      ? (claim?.rejectionReason ?? membership?.agency.rejectionReason ?? null)
      : null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    dailyBriefing: user.dailyBriefing,
    emailVerified: user.emailVerifiedAt !== null,
    accountType: user.accountType,
    platformRole: user.platformRole,
    agency: membership
      ? {
          id: membership.agency.id,
          name: membership.agency.name,
          status: membership.agency.status,
          role: membership.role,
          membershipStatus: membership.status,
          resubmit: kind ?? 'closed',
          rejectionReason,
          phone: kind === 'revise' ? membership.agency.phone : null,
          contactEmail: kind === 'revise' ? membership.agency.contactEmail : null,
          description: kind === 'revise' ? membership.agency.description : null,
          vertical: membership.agency.vertical,
        }
      : null,
  };
}

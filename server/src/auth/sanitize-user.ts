import type { Agency, AgencyMembership, User } from '@prisma/client';

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  emailVerified: boolean;
  accountType: string;
  platformRole: string | null;
  agency: { id: string; name: string; status: string; role: string; membershipStatus: string } | null;
}

type WithMembership = User & {
  memberships: (AgencyMembership & { agency: Agency })[];
};

/**
 * The single serialisation boundary for a user. With `passwordHash` on the row, every
 * response that includes a user must go through here — nothing else may spread a `User`.
 */
export function sanitizeUser(user: WithMembership): PublicUser {
  const membership = user.memberships[0];

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
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
        }
      : null,
  };
}

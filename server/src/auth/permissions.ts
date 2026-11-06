import type { AgencyRole } from '@prisma/client';
import type { Principal } from './types/principal.js';

export type Action =
  | 'listing:write'
  | 'listing:write-all'
  | 'lead:read-all'
  | 'lead:write'
  | 'deal:write'
  | 'team:manage'
  | 'agency:manage';

/**
 * Every role check lives here rather than scattered across controllers. Two roles will
 * become three before long — an office manager who runs the team but not billing — and
 * that is a one-line change only if the decisions are in one file.
 */
const BY_ROLE: Record<AgencyRole, Action[]> = {
  owner: [
    'listing:write',
    'listing:write-all',
    'lead:read-all',
    'lead:write',
    'deal:write',
    'team:manage',
    'agency:manage',
  ],
  agent: ['listing:write', 'lead:write', 'deal:write'],
};

export function can(principal: Principal | undefined, action: Action): boolean {
  if (!principal) return false;
  if (principal.platformRole === 'admin') return true;
  if (!principal.role) return false;
  return BY_ROLE[principal.role].includes(action);
}

/**
 * The CRM rows — leads, customers, deals — an agent sees and may change: assigned to
 * them, or to nobody yet. The unassigned pool is where a web enquiry lands, so hiding
 * it would leave new enquiries to the owner alone. `lead:read-all` sees every row.
 */
export function assigneeScope<F extends string>(
  principal: Principal | undefined,
  field: F,
): { OR?: Record<F, string | null>[] } {
  if (can(principal, 'lead:read-all')) return {};
  return {
    OR: [
      { [field]: principal?.userId ?? '' } as Record<F, string | null>,
      { [field]: null } as Record<F, string | null>,
    ],
  };
}

/** An agent can take a record themselves; handing it to a colleague is the owner's call. */
export function mayAssign(principal: Principal | undefined, userId: string | null | undefined): boolean {
  if (!userId) return true;
  if (can(principal, 'lead:read-all')) return true;
  return userId === principal?.userId;
}

/**
 * An agent edits the listings they created. One with no creator — imported from yad2 —
 * is the owner's to change.
 */
export function mayEditListing(
  principal: Principal | undefined,
  listing: { createdByUserId: string | null },
): boolean {
  if (!can(principal, 'listing:write')) return false;
  if (can(principal, 'listing:write-all')) return true;
  return listing.createdByUserId !== null && listing.createdByUserId === principal?.userId;
}

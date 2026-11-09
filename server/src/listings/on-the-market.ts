import type { Prisma } from '@prisma/client';

/**
 * A published listing whose seller may still be shown.
 *
 * A private seller has no agency. Disabling that account hides their listings without
 * touching the rows, so turning the account back on shows them again. An agency that
 * was suspended keeps its listings published — hiding them is this filter too. One
 * that was deleted has its listings marked removed, which `status: 'published'`
 * already excludes; the status is named here so the two paths cannot drift.
 */
const VISIBLE_AGENCY: Prisma.ListingWhereInput = {
  agency: { status: { notIn: ['suspended', 'rejected', 'deleted'] } },
};

/**
 * For a client that can read `User`.
 *
 * The tenant role cannot: `User` has row-level security and no policy, so a join comes
 * back empty and every private listing disappears. Callers on that role use
 * `onTheMarket` and pass the disabled accounts they read elsewhere.
 */
export const FROM_A_VISIBLE_AGENCY: Prisma.ListingWhereInput = {
  OR: [
    {
      agencyId: null,
      OR: [{ createdByUserId: null }, { createdBy: { disabledAt: null } }],
    },
    VISIBLE_AGENCY,
  ],
};

/**
 * The same rule, without joining `User`.
 *
 * `disabledUserIds` is the accounts an admin has switched off, read through a client
 * that is allowed to see them. An empty list means nobody is hidden.
 */
export function onTheMarket(disabledUserIds: string[]): Prisma.ListingWhereInput {
  const privateSeller: Prisma.ListingWhereInput = disabledUserIds.length
    ? {
        agencyId: null,
        OR: [{ createdByUserId: null }, { createdByUserId: { notIn: disabledUserIds } }],
      }
    : { agencyId: null };

  return { OR: [privateSeller, VISIBLE_AGENCY] };
}

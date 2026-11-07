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
export const FROM_A_VISIBLE_AGENCY: Prisma.ListingWhereInput = {
  OR: [
    {
      agencyId: null,
      OR: [{ createdByUserId: null }, { createdBy: { disabledAt: null } }],
    },
    { agency: { status: { notIn: ['suspended', 'rejected', 'deleted'] } } },
  ],
};

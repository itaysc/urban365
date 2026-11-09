import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Review mode holds a private listing for an admin. An agency account publishes
 * immediately: the flag is for people selling their own home, not for an office.
 */
export function holdsListingForApproval(
  reviewEnabled: boolean,
  accountType: string | null | undefined,
): boolean {
  return reviewEnabled && accountType !== 'agency';
}

/**
 * Listings an agency account already had held, put back where a publish would
 * have left them. A flagged one stays a draft; the rest go on the market.
 */
export async function releaseAgencyHolds(prisma: PrismaService, ownerUserId?: string): Promise<void> {
  const held = await prisma.listing.findMany({
    where: {
      approval: 'pending',
      status: { not: 'removed' },
      owner: { accountType: 'agency' },
      ...(ownerUserId ? { ownerUserId } : {}),
    },
    select: { id: true, publishedAt: true, reviewStatus: true },
  });
  if (held.length === 0) return;

  const now = new Date();
  await prisma.$transaction(
    held.map((listing) =>
      prisma.listing.update({
        where: { id: listing.id },
        data:
          listing.reviewStatus === 'flagged'
            ? { approval: 'none', rejectionNote: null, decidedAt: null }
            : {
                status: 'published',
                delistedAt: null,
                publishedAt: listing.publishedAt ?? now,
                approval: 'none',
                rejectionNote: null,
                decidedAt: null,
              },
      }),
    ),
  );
}

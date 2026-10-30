import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type EngagementKind = 'view' | 'phone';

/** Who did it: an account when there is one, otherwise the browser's visitor id. */
export interface Viewer {
  userId?: string | null;
  visitorId?: string | null;
}

/**
 * Counting people rather than page loads.
 *
 * A seller asking "how many people looked at my flat" does not mean "how many times was
 * the page rendered" — a refresh, a back button and a second look tomorrow are one
 * person. So an engagement is recorded once per person per listing per kind, and the
 * counter on the listing moves only when that row is new.
 *
 * The honesty limit, stated rather than hidden: a person who clears their cookies and
 * is not signed in counts again. There is no identifier that survives that, and
 * pursuing one would mean fingerprinting.
 */
@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  async record(listingId: string, kind: EngagementKind, viewer: Viewer): Promise<void> {
    // Nobody to attribute it to. Counting it would make the number a page-load count
    // again for exactly the callers we cannot tell apart.
    if (!viewer.userId && !viewer.visitorId) return;

    const where = viewer.userId
      ? { listingId, kind, userId: viewer.userId }
      : { listingId, kind, visitorId: viewer.visitorId as string };

    const existing = await this.prisma.listingEngagement.findFirst({
      where,
      select: { id: true },
    });
    if (existing) return;

    try {
      await this.prisma.$transaction([
        this.prisma.listingEngagement.create({ data: where }),
        this.prisma.listing.update({
          where: { id: listingId },
          data:
            kind === 'view'
              ? { viewCount: { increment: 1 } }
              : { phoneRevealCount: { increment: 1 } },
        }),
      ]);
    } catch {
      // Two tabs at once lose the race against the partial unique index. The row that
      // won is the one we wanted, so there is nothing to report and nothing to retry —
      // and a failure to count must never fail the request that was being served.
    }
  }
}

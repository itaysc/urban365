import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ListingStats {
  listingId: string;
  /** Different people who opened it. */
  views: number;
  /** Different people who asked for the number. */
  phoneReveals: number;
  /** Different people who saved it. */
  saves: number;
  /** Enquiries sent through the form. */
  enquiries: number;
}

/**
 * The figures a seller is shown for their own listings.
 *
 * Views, phone reveals and saves are read from the denormalised columns — they are
 * maintained on write and read on every page. Enquiries are counted live because there
 * is no column for them and a seller has few enough listings for the count to be cheap.
 */
@Injectable()
export class SellerStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async forSeller(userId: string): Promise<ListingStats[]> {
    const listings = await this.prisma.listing.findMany({
      where: { ownerUserId: userId },
      select: { id: true, viewCount: true, phoneRevealCount: true, savedCount: true },
    });

    if (listings.length === 0) return [];

    const enquiries = await this.prisma.lead.groupBy({
      by: ['listingId'],
      where: { ownerUserId: userId, listingId: { in: listings.map((l) => l.id) } },
      _count: { _all: true },
    });
    const byListing = new Map(enquiries.map((row) => [row.listingId, row._count._all]));

    return listings.map((listing) => ({
      listingId: listing.id,
      views: listing.viewCount,
      phoneReveals: listing.phoneRevealCount,
      saves: listing.savedCount,
      enquiries: byListing.get(listing.id) ?? 0,
    }));
  }
}

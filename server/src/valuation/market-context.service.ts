import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { metresBetween } from './geo.js';
import { daysOnMarket, marketStateFrom, type Verdict } from './market-state.js';

/**
 * The guide's steps 4 and 5: who you are competing with, and which way the market
 * is leaning.
 *
 * *"העסקאות מספרות מה שהיה. הנכסים המתחרים מספרים מה הקונה רואה עכשיו."* The sales
 * decide the estimate; this decides where inside the range the sale is expected to
 * land, and gives the seller the list of flats a buyer will be comparing theirs to.
 *
 * **Nothing here touches the estimate.** Asking prices are, in the guide's word,
 * *"משאלה"* — and a model that let them into the number would read the market's own
 * optimism back to it as evidence.
 */

/** Near enough that a buyer would see both. Wider than the comp tiers on purpose. */
const COMPETING_METRES = 1_500;
const ROOMS_TOLERANCE = 1;

/** The quarter the "and rising" in the guide's table is measured against. */
const TREND_DAYS = 90;

export interface Competitor {
  id: string;
  price: number | null;
  rooms: number | null;
  area: number | null;
  pricePerSqm: number | null;
  /** How long it has been standing — the number that makes an asking price mean something. */
  daysListed: number | null;
  metres: number;
  hasCutPrice: boolean;
}

export interface MarketContext {
  verdict: Verdict;
  competing: Competitor[];
}

@Injectable()
export class MarketContextService {
  constructor(private readonly prisma: PrismaService) {}

  async stateFor(
    city: string,
    latitude: number,
    longitude: number,
    rooms: number,
  ): Promise<MarketContext> {
    const now = new Date();
    const since = new Date(now.getTime() - TREND_DAYS * 86_400_000);

    /*
     * Scoped by city rather than by radius in the query, then narrowed by distance in
     * memory. Our inventory is small enough that a city is a few hundred rows at most,
     * and `Listing` has no spatial index — adding one for a few hundred rows would be
     * ceremony.
     */
    const listings = await this.prisma.listing.findMany({
      where: {
        city,
        rooms: { gte: rooms - ROOMS_TOLERANCE, lte: rooms + ROOMS_TOLERANCE },
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        price: true,
        rooms: true,
        squareMeter: true,
        pricePerSquareMeter: true,
        latitude: true,
        longitude: true,
        listedAt: true,
        delistedAt: true,
        status: true,
        priceChanges: { select: { id: true }, take: 1 },
      },
      take: 500,
    });

    const near = listings.filter(
      (listing) =>
        metresBetween(
          { latitude, longitude },
          { latitude: listing.latitude!, longitude: listing.longitude! },
        ) <= COMPETING_METRES,
    );

    const standing = near.filter((l) => !l.delistedAt);
    const sold = near.filter((l) => l.delistedAt && l.listedAt);

    const daysToSell = sold
      .map((l) => daysOnMarket(l.listedAt, l.delistedAt!))
      .filter((days): days is number => days !== null)
      .sort((a, b) => a - b);

    const standingBefore = near.filter(
      (l) => l.listedAt && l.listedAt <= since && (!l.delistedAt || l.delistedAt > since),
    ).length;

    const withCut = standing.filter((l) => l.priceChanges.length > 0).length;

    const verdict = marketStateFrom({
      standing: standing.length,
      standingBefore,
      medianDaysToSell: daysToSell.length > 0 ? daysToSell[Math.floor(daysToSell.length / 2)] : null,
      shareWithPriceCut: standing.length > 0 ? withCut / standing.length : 0,
      sampled: near.length,
    });

    const competing = standing
      .map((listing) => ({
        id: listing.id,
        price: listing.price,
        rooms: listing.rooms,
        // `Listing.area` is a region name ("אזור רמלה - לוד"), not a floor area.
        // The size is `squareMeter`.
        area: listing.squareMeter,
        pricePerSqm: listing.pricePerSquareMeter,
        daysListed: daysOnMarket(listing.listedAt, now),
        metres: Math.round(
          metresBetween(
            { latitude, longitude },
            { latitude: listing.latitude!, longitude: listing.longitude! },
          ),
        ),
        hasCutPrice: listing.priceChanges.length > 0,
      }))
      // Nearest first: the ones a buyer will actually weigh this flat against.
      .sort((a, b) => a.metres - b.metres)
      .slice(0, 8);

    return { verdict, competing };
  }
}

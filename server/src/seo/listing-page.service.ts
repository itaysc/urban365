import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Section } from '../yad2/yad2.types.js';

/**
 * Listings a stranger arriving from a search engine may see.
 *
 * `status: 'published'` already excludes a flagged one — the spam check withholds
 * publication rather than hiding a published row — but `reviewStatus` is named here as
 * well. An agency's listings are not spam-checked at all today, so if that ever changes
 * the page a search engine indexes should be the last place to find out.
 */
const PUBLIC: Prisma.ListingWhereInput = {
  status: 'published',
  delistedAt: null,
  reviewStatus: { not: 'flagged' },
};

/** What the page shows. Deliberately no phone number — see the note on `agency`. */
const DETAIL = {
  id: true,
  section: true,
  price: true,
  priceBeforeDrop: true,
  lastPriceDropAmount: true,
  lastPriceDropAt: true,
  publishedAt: true,
  pricePerSquareMeter: true,
  rooms: true,
  squareMeter: true,
  squareMeterBuilt: true,
  squareMeterGarden: true,
  floor: true,
  buildingTopFloor: true,
  balconiesCount: true,
  parkingSpacesCount: true,
  propertyType: true,
  propertyCondition: true,
  isNewFromDeveloper: true,
  isExclusive: true,
  city: true,
  neighborhood: true,
  street: true,
  houseNumber: true,
  latitude: true,
  longitude: true,
  amenities: true,
  description: true,
  coverImageUrl: true,
  imageUrls: true,
  listedAt: true,
  lastSeenAt: true,
  updatedAt: true,
  /*
   * The name on the advertisement and nothing else. No `phone`, and no agency phone:
   * the app hands a number out one at a time from a rate-limited route, and a page
   * built for crawlers is precisely where that restraint would otherwise be undone.
   */
  agency: { select: { id: true, name: true, licenseNumber: true } },
  images: { select: { url: true, width: true, height: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.ListingSelect;

export type ListingDetail = Prisma.ListingGetPayload<{ select: typeof DETAIL }>;

/** One of the handful of properties offered alongside this one. */
export interface SimilarListing {
  id: string;
  price: number | null;
  lastPriceDropAmount: number | null;
  lastPriceDropAt: Date | null;
  listedAt: Date | null;
  publishedAt: Date | null;
  rooms: number | null;
  squareMeter: number | null;
  street: string | null;
  houseNumber: number | null;
  neighborhood: string | null;
  city: string | null;
  propertyType: string | null;
  coverImageUrl: string | null;
}

export type ListingPage =
  /** On the market: here it is. */
  | { state: 'live'; listing: ListingDetail; similar: SimilarListing[] }
  /**
   * It was ours and is not any more — sold, withdrawn, or dropped from the feed.
   *
   * Distinguished from "never existed" so the page can answer 410 rather than 404. A
   * 410 tells a search engine the URL is deliberately finished and gets it dropped in
   * one pass instead of being re-crawled for weeks, and it lets the page say "this one
   * has gone, here are others nearby" rather than "you typed something wrong".
   */
  | { state: 'gone'; city: string | null; section: Section; similar: SimilarListing[] }
  | { state: 'missing' };

/** How many other properties a listing page offers. */
const SIMILAR = 6;

@Injectable()
export class ListingPageService {
  constructor(private readonly prisma: PrismaService) {}

  async page(id: string): Promise<ListingPage> {
    const listing = await this.prisma.listing.findFirst({
      where: { ...PUBLIC, id },
      select: DETAIL,
    });

    if (listing) {
      return { state: 'live', listing, similar: await this.similarTo(listing) };
    }

    /*
     * Not on the market. Whether it ever was decides between 410 and 404, and the two
     * say different things to both a reader and a crawler — so the second query is
     * worth it on what is, by definition, a rare path.
     */
    const past = await this.prisma.listing.findUnique({
      where: { id },
      select: { city: true, section: true, rooms: true, price: true },
    });
    if (!past) return { state: 'missing' };

    return {
      state: 'gone',
      city: past.city,
      section: past.section,
      similar: await this.similarTo({ ...past, id }),
    };
  }

  /**
   * A few others in the same city, closest in size first.
   *
   * These are the links that make a listing page worth crawling rather than a leaf: a
   * property is the most specific thing on the site and, without them, every path into
   * it is also a dead end. Matched on rooms rather than on price, because somebody
   * looking at a four-room flat is looking for a four-room flat, and the budget is the
   * thing they are prepared to argue with.
   */
  private async similarTo(listing: {
    id: string;
    city: string | null;
    section: Section;
    rooms: number | null;
  }): Promise<SimilarListing[]> {
    if (!listing.city) return [];

    return this.prisma.listing.findMany({
      where: {
        ...PUBLIC,
        city: listing.city,
        section: listing.section,
        id: { not: listing.id },
        ...(listing.rooms !== null
          ? { rooms: { gte: listing.rooms - 1, lte: listing.rooms + 1 } }
          : {}),
      },
      orderBy: [{ listedAt: { sort: 'desc', nulls: 'last' } }, { firstSeenAt: 'desc' }],
      take: SIMILAR,
      select: {
        id: true,
        price: true,
        lastPriceDropAmount: true,
        lastPriceDropAt: true,
        listedAt: true,
        publishedAt: true,
        rooms: true,
        squareMeter: true,
        street: true,
        houseNumber: true,
        neighborhood: true,
        city: true,
        propertyType: true,
        coverImageUrl: true,
      },
    });
  }

  /**
   * Every listing worth offering in the sitemap, oldest id first so the order is stable.
   *
   * Streamed in pages rather than read whole: this is the one query in the SEO code
   * whose size follows the size of the business, and a production feed is tens of
   * thousands of rows.
   */
  async forSitemap(skip: number, take: number) {
    return this.prisma.listing.findMany({
      where: PUBLIC,
      orderBy: { id: 'asc' },
      skip,
      take,
      select: {
        id: true,
        street: true,
        houseNumber: true,
        neighborhood: true,
        city: true,
        lastSeenAt: true,
      },
    });
  }

  countForSitemap(): Promise<number> {
    return this.prisma.listing.count({ where: PUBLIC });
  }
}

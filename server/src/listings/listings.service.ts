import { Injectable } from '@nestjs/common';
import { Prisma, type Listing, type Section as DbSection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { listingRowToAsset } from '../yad2/listing-row.js';
import { type Section } from '../yad2/yad2.types.js';
import { cityKey } from './city-name.js';
import type { SearchListingsDto, Sort } from './dto/search-listings.dto.js';

/** Card-shaped result, read straight from the typed columns — `raw` is never touched. */
export interface SearchListing {
  /** Our own id, and the public identifier. Stable for every listing. */
  id: string;
  /** yad2's ad token — null for listings created here rather than scraped. */
  token: string | null;
  listingUrl: string | null;
  section: string;
  price: number | null;
  priceBeforeDrop: number | null;
  pricePerSquareMeter: number | null;
  propertyType: string | null;
  rooms: number | null;
  floor: number | null;
  buildingTopFloor: number | null;
  squareMeter: number | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  houseNumber: number | null;
  latitude: number | null;
  longitude: number | null;
  amenities: string[];
  tags: string[];
  coverImageUrl: string | null;
  imagesCount: number;
  brokerName: string | null;
  agency: { id: string; name: string };
  updatedAt: string | null;
  delistedAt: string | null;
}

export interface Facet {
  value: string;
  count: number;
}

export interface SearchResponse {
  items: SearchListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets?: { cities: Facet[]; propertyTypes: Facet[]; amenities: Facet[] };
}

const DEFAULT_PAGE_SIZE = 24;

/**
 * The most pins one response will carry. Well above what a city view holds, and far
 * below what would make the payload or the browser struggle.
 */
const MAP_POINT_LIMIT = 2000;

/** Exported for the sort-order test; not part of the service's API. */
export const ORDER_BY_FOR_TEST = () => ORDER_BY;

/**
 * Every sort ends on `id`, which is unique and never null. Without that tiebreaker two
 * listings at the same price have no defined order, and Postgres is free to return them
 * differently per query — which makes rows repeat or disappear as you page.
 *
 * This used to be `token`, which stopped being safe the moment agency-created listings
 * arrived: `token` is null for everything not scraped from yad2, so every one of them
 * would tie and the paging bug would come back silently.
 *
 * Nulls sort last so listings missing the sorted field do not take over page one.
 */
const TIEBREAK: Prisma.ListingOrderByWithRelationInput = { id: 'asc' };

const ORDER_BY: Record<Sort, Prisma.ListingOrderByWithRelationInput[]> = {
  newest: [{ listedAt: { sort: 'desc', nulls: 'last' } }, { lastSeenAt: 'desc' }, TIEBREAK],
  oldest: [{ listedAt: { sort: 'asc', nulls: 'last' } }, TIEBREAK],
  'price-asc': [{ price: { sort: 'asc', nulls: 'last' } }, TIEBREAK],
  'price-desc': [{ price: { sort: 'desc', nulls: 'last' } }, TIEBREAK],
  'price-per-sqm-asc': [{ pricePerSquareMeter: { sort: 'asc', nulls: 'last' } }, TIEBREAK],
  'price-per-sqm-desc': [{ pricePerSquareMeter: { sort: 'desc', nulls: 'last' } }, TIEBREAK],
  'rooms-asc': [{ rooms: { sort: 'asc', nulls: 'last' } }, TIEBREAK],
  'rooms-desc': [{ rooms: { sort: 'desc', nulls: 'last' } }, TIEBREAK],
  'size-asc': [{ squareMeter: { sort: 'asc', nulls: 'last' } }, TIEBREAK],
  'size-desc': [{ squareMeter: { sort: 'desc', nulls: 'last' } }, TIEBREAK],
};

@Injectable()
export class ListingsService {
  /**
   * The tenant client, not the owner one. The owner bypasses row-level security, so the
   * public search ran with no policy at all and happily returned draft listings. On this
   * client an anonymous caller matches only `listing_public_read`.
   */
  constructor(
    private readonly prisma: TenantPrismaService,
    /** Only for `phoneFor`, which has to read a `User` row — see the note there. */
    private readonly owner: PrismaService,
  ) {}

  private where(dto: SearchListingsDto): Prisma.ListingWhereInput {
    // Published only, and stated explicitly rather than left to RLS alone: results must
    // not change depending on whether the visitor happens to be logged in to an agency
    // whose drafts the tenant policy would also match.
    const where: Prisma.ListingWhereInput = { status: 'published' };

    if (!dto.includeDelisted) where.delistedAt = null;
    if (dto.section) where.section = dto.section as DbSection;
    // `agencyId` is Agency.id, not yad2's customerId: scraped and self-signup agencies
    // both need to be addressable, and only `id` exists for every agency.
    if (dto.agencyId) where.agencyId = dto.agencyId;

    if (dto.city?.length) where.city = { in: dto.city };
    if (dto.neighborhood?.length) where.neighborhood = { in: dto.neighborhood };
    if (dto.propertyType?.length) where.propertyType = { in: dto.propertyType };

    // hasEvery, not hasSome: ticking two amenities means both, as a filter UI implies.
    if (dto.amenities?.length) where.amenities = { hasEvery: dto.amenities };

    const range = <T>(min?: T, max?: T) =>
      min === undefined && max === undefined ? undefined : { ...(min !== undefined && { gte: min }), ...(max !== undefined && { lte: max }) };

    const price = range(dto.minPrice, dto.maxPrice);
    if (price) where.price = price;

    const rooms = range(dto.minRooms, dto.maxRooms);
    if (rooms) where.rooms = rooms;

    const size = range(dto.minSquareMeter, dto.maxSquareMeter);
    if (size) where.squareMeter = size;

    // A viewport. Both corners are required together — half a box is not a box, and
    // silently ignoring the other half would quietly return the whole country.
    if (
      dto.minLat !== undefined && dto.maxLat !== undefined &&
      dto.minLng !== undefined && dto.maxLng !== undefined
    ) {
      where.latitude = { gte: dto.minLat, lte: dto.maxLat };
      where.longitude = { gte: dto.minLng, lte: dto.maxLng };
    }

    if (dto.q?.trim()) {
      const contains = dto.q.trim();
      const mode = Prisma.QueryMode.insensitive;
      where.OR = [
        { description: { contains, mode } },
        { street: { contains, mode } },
        { city: { contains, mode } },
        { neighborhood: { contains, mode } },
      ];
    }

    return where;
  }

  async search(dto: SearchListingsDto): Promise<SearchResponse> {
    const where = this.where(dto);
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? DEFAULT_PAGE_SIZE;

    // Promise.all, not $transaction: an authenticated request is already inside the
    // tenant transaction the interceptor opened, and Prisma will not nest one.
    const [total, rows] = await Promise.all([
      this.prisma.client.listing.count({ where }),
      this.prisma.client.listing.findMany({
        where,
        orderBy: ORDER_BY[dto.sort ?? 'newest'],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { agency: { select: { id: true, name: true } } },
      }),
    ]);

    const response: SearchResponse = {
      items: rows.map((r) => this.toSearchListing(r)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };

    if (dto.facets) response.facets = await this.facets(where);
    return response;
  }

  /** Counts for the current filters, so a filter UI can show what each option would return. */
  private async facets(where: Prisma.ListingWhereInput) {
    const [cities, propertyTypes, amenityRows] = await Promise.all([
      this.prisma.client.listing.groupBy({
        by: ['city'],
        where,
        _count: { _all: true },
        orderBy: { _count: { city: 'desc' } },
        take: 30,
      }),
      this.prisma.client.listing.groupBy({
        by: ['propertyType'],
        where,
        _count: { _all: true },
        orderBy: { _count: { propertyType: 'desc' } },
        take: 30,
      }),
      // Amenities are an array column, so they are counted in application code rather
      // than grouped — the result set is already narrowed by `where`.
      this.prisma.client.listing.findMany({ where, select: { amenities: true } }),
    ]);

    const amenityCounts = new Map<string, number>();
    for (const row of amenityRows as { amenities: string[] }[]) {
      for (const label of row.amenities) amenityCounts.set(label, (amenityCounts.get(label) ?? 0) + 1);
    }

    return {
      cities: cities.filter((c) => c.city).map((c) => ({ value: c.city as string, count: c._count._all })),
      propertyTypes: propertyTypes
        .filter((p) => p.propertyType)
        .map((p) => ({ value: p.propertyType as string, count: p._count._all })),
      amenities: [...amenityCounts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /**
   * Place suggestions for the search box: cities and neighbourhoods matching what has
   * been typed so far.
   *
   * Two sources, deliberately. Listings give the places we actually hold inventory in,
   * with a count worth showing. `CityBoundary` gives the other 280-odd municipalities,
   * which carry a count of zero — still worth offering, because searching one now draws
   * its outline on the map rather than answering with nothing at all.
   *
   * Counts are for the section being searched, so the number beside a suggestion is
   * the number of results picking it will give.
   *
   * A city's `value` is whatever the *listings* call it when we hold any, not what
   * OpenStreetMap calls it: the filter compares `Listing.city` exactly, so suggesting
   * `תל־אביב–יפו` for rows that say `תל אביב יפו` would return an empty search.
   */
  async suggest(term: string, section?: Section, limit = 6) {
    const q = term.trim();
    if (q.length < 2) return { cities: [], neighborhoods: [] };

    const mode = Prisma.QueryMode.insensitive;
    // Scoped to the section being searched, or the count beside a suggestion promises
    // more than the search then delivers — `רחובות 18` followed by fourteen results.
    const published: Prisma.ListingWhereInput = {
      status: 'published',
      delistedAt: null,
      ...(section && { section: section as DbSection }),
    };

    const [cityRows, hoodRows, boundaries] = await Promise.all([
      this.prisma.client.listing.groupBy({
        by: ['city'],
        where: { ...published, city: { contains: q, mode } },
        _count: { _all: true },
        orderBy: { _count: { city: 'desc' } },
        take: limit,
      }),
      // Grouped by both, because a neighbourhood name is only unique within its city —
      // several towns have a מרכז העיר. The city travels with the suggestion so picking
      // one can scope to that city too.
      this.prisma.client.listing.groupBy({
        by: ['neighborhood', 'city'],
        where: {
          ...published,
          neighborhood: { not: null },
          // Matching the city as well is what makes typing a city name list its
          // neighbourhoods, which is the behaviour the search box is modelled on.
          OR: [{ neighborhood: { contains: q, mode } }, { city: { contains: q, mode } }],
        },
        _count: { _all: true },
        orderBy: { _count: { neighborhood: 'desc' } },
        take: limit,
      }),
      this.prisma.client.cityBoundary.findMany({
        where: { name: { contains: q, mode } },
        select: { name: true },
        take: limit * 2,
      }),
    ]);

    const cities = cityRows
      .filter((row) => row.city)
      .map((row) => ({ value: row.city as string, count: row._count._all }));

    // Merged on the normalised key so a boundary does not appear a second time beside
    // the listings' spelling of the same place.
    const seen = new Set(cities.map((c) => cityKey(c.value)));
    for (const boundary of boundaries) {
      if (cities.length >= limit) break;
      if (seen.has(cityKey(boundary.name))) continue;
      seen.add(cityKey(boundary.name));
      cities.push({ value: boundary.name, count: 0 });
    }

    return {
      cities,
      neighborhoods: hoodRows
        .filter((row) => row.neighborhood && row.city)
        .map((row) => ({
          value: row.neighborhood as string,
          city: row.city as string,
          count: row._count._all,
        })),
    };
  }

  /**
   * Full detail for one listing, in the same Asset shape the agency view uses, so both
   * open the identical modal.
   */
  async findById(id: string) {
    // Links minted before listings had their own public id used the yad2 token, so a
    // miss falls back to a token lookup for one release.
    const row = await this.prisma.client.listing.findFirst({
      where: { status: 'published', delistedAt: null, OR: [{ id }, { token: id }] },
      include: { agency: { select: { id: true, name: true, licenseNumber: true, phone: true } } },
    });
    if (!row) return null;

    return {
      ...listingRowToAsset(row),
      section: row.section,
      agency: {
        id: row.agency.id,
        name: row.agency.name,
        licenseNumber: row.agency.licenseNumber,
        // Deliberately NOT the number. It is fetched on demand from `phoneFor` below,
        // so a scraper reading this payload gets nothing to dial — which is the whole
        // point of a reveal button, and is how yad2 behaves too.
        hasPhone: await this.hasContactPhone(row.id),
      },
      delistedAt: row.delistedAt?.toISOString() ?? null,
    };
  }

  private toSearchListing(row: Listing & { agency: { id: string; name: string } }): SearchListing {
    return {
      id: row.id,
      token: row.token,
      listingUrl: row.listingUrl,
      section: row.section,
      price: row.price,
      priceBeforeDrop: row.priceBeforeDrop,
      pricePerSquareMeter: row.pricePerSquareMeter,
      propertyType: row.propertyType,
      rooms: row.rooms,
      floor: row.floor,
      buildingTopFloor: row.buildingTopFloor,
      squareMeter: row.squareMeter,
      city: row.city,
      neighborhood: row.neighborhood,
      street: row.street,
      houseNumber: row.houseNumber,
      latitude: row.latitude,
      longitude: row.longitude,
      amenities: row.amenities,
      tags: row.tags,
      coverImageUrl: row.coverImageUrl,
      imagesCount: row.imagesCount,
      brokerName: row.brokerName,
      agency: { id: row.agency.id, name: row.agency.name },
      updatedAt: row.updatedAtSource?.toISOString() ?? null,
      delistedAt: row.delistedAt?.toISOString() ?? null,
    };
  }

  /**
   * Whether there is a number to reveal. Shares `contactPhone` with the reveal route, so
   * the button cannot appear when the call would 404, or be hidden when a number exists.
   */
  private async hasContactPhone(id: string): Promise<boolean> {
    return (await this.contactPhone(id)) !== null;
  }

  private async contactPhone(id: string): Promise<string | null> {
    // The OWNER client. `createdBy` joins `User`, which is enabled-with-no-policy and
    // therefore invisible to the tenant role — and a nested read neither errors nor
    // returns a partial row, it just comes back null. On the tenant client the agent's
    // own number silently vanished and every listing fell back to the switchboard.
    //
    // The published filter is what keeps this safe without RLS: stated explicitly, and
    // the same condition `listing_public_read` enforces.
    const row = await this.owner.listing.findFirst({
      where: { status: 'published', delistedAt: null, OR: [{ id }, { token: id }] },
      select: {
        agency: { select: { phone: true } },
        createdBy: { select: { phone: true } },
      },
    });

    // The agent handling the property before the agency switchboard.
    return row?.createdBy?.phone ?? row?.agency.phone ?? null;
  }

  /**
   * The contact number for a published listing, fetched only when a visitor asks for it.
   *
   * The agent who created the listing takes precedence over the agency switchboard: a
   * buyer calling about one property should reach the person handling it. Scraped
   * listings have no creator, so they fall back to the agency.
   */
  async phoneFor(id: string): Promise<{ phone: string } | null> {
    const phone = await this.contactPhone(id);
    return phone ? { phone } : null;
  }

  /**
   * Every matching listing as a point, for the map.
   *
   * Not the paginated card payload: a map needs all the pins in view at once, and a
   * card carries twenty fields a pin does not. Six fields and a cap keep it small
   * enough to send in one response — clustering happens in the browser, so the server
   * does not need to know the zoom level.
   */
  async mapPoints(dto: SearchListingsDto) {
    const base = this.where(dto);

    // A listing with no coordinates cannot be drawn, so it is excluded here rather
    // than filtered client-side. When a viewport is set, `base` already carries
    // gte/lte on both axes — which excludes nulls on its own — so the explicit check
    // is only needed for an unbounded query.
    const where: Prisma.ListingWhereInput = base.latitude
      ? base
      : { ...base, latitude: { not: null }, longitude: { not: null } };

    const rows = await this.prisma.client.listing.findMany({
      where,
      take: MAP_POINT_LIMIT,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        price: true,
        rooms: true,
        propertyType: true,
        city: true,
        street: true,
        coverImageUrl: true,
      },
    });

    return {
      // Sent with the points rather than from its own route: the map wants both at the
      // same moment, and a second round trip would draw the pins before the area they
      // sit in.
      boundary: await this.boundaryFor(dto.city),
      points: rows.map((r) => ({
        id: r.id,
        lat: r.latitude as number,
        lng: r.longitude as number,
        price: r.price,
        rooms: r.rooms,
        propertyType: r.propertyType,
        city: r.city,
        street: r.street,
        coverImageUrl: r.coverImageUrl,
      })),
      // Tells the client the view is incomplete, so it can say so rather than
      // silently showing a subset as though it were everything.
      truncated: rows.length === MAP_POINT_LIMIT,
    };
  }

  /**
   * The outline of the area being searched, when exactly one city is filtered on.
   *
   * Only one: two cities have no single outline, and drawing both would say less than
   * drawing neither. Matched on a normalised key because OpenStreetMap writes
   * `תל־אביב–יפו` while a listing says `תל אביב יפו`.
   */
  private async boundaryFor(cities: string[] | undefined) {
    if (!cities || cities.length !== 1) return null;

    const row = await this.prisma.client.cityBoundary.findUnique({
      where: { matchKey: cityKey(cities[0]) },
      select: {
        name: true,
        geometry: true,
        minLat: true,
        maxLat: true,
        minLng: true,
        maxLng: true,
      },
    });

    if (!row) return null;

    return {
      name: row.name,
      geometry: row.geometry,
      bounds: { minLat: row.minLat, maxLat: row.maxLat, minLng: row.minLng, maxLng: row.maxLng },
    };
  }
}

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { cityKey } from '../listings/city-name.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Section } from '../yad2/yad2.types.js';
import { Cached } from './cached.js';
import { slugKey } from './city-slug.js';
import { byNeighborhood, byPropertyType, byRooms, summarise, type Band, type StatRow, type Summary } from './stats.js';

/** Listings anybody can see: published, and still on the market. */
const PUBLIC: Prisma.ListingWhereInput = { status: 'published', delistedAt: null };

/**
 * How long the city list and the district outlines are allowed to be stale.
 *
 * Ten minutes, because the thing they change in response to is a scrape run, and a
 * landing page that learns about a new city ten minutes late has lost nothing. The
 * listings on a page are not cached at all — those are a single indexed read.
 */
const DIRECTORY_TTL_MS = 10 * 60 * 1000;

/**
 * How a city's size is judged: recorded sales over the last few years.
 *
 * We hold no population figures, and our own listing counts measure our coverage
 * rather than the city. The transaction registry measures the market itself — it ranks
 * Tel Aviv, Jerusalem, Haifa and Beer Sheva first, which is the answer — and a regional
 * council, which has no sales of its own under its name, sinks to the bottom where it
 * belongs. Six hours, because the registry is synced daily.
 */
const SALES_WINDOW_YEARS = 3;
const SALES_TTL_MS = 6 * 60 * 60 * 1000;

/** How many cities each district shows on the index; the rest are on the full list. */
export const FEATURED_PER_DISTRICT = 7;


/** The most listings one page shows before sending the reader into the app for the rest. */
export const LISTINGS_SHOWN = 36;

/** One city, as the directory knows it. */
export interface CityEntry {
  /** The spelling the listings themselves use, which is what the search filters on. */
  city: string;
  counts: Record<Section, number>;
  /**
   * When anything in this city was last seen on the market.
   *
   * Carried on the directory rather than worked out per page, because the sitemap needs
   * one for every city at once and asking separately would be 280 queries to build one
   * file.
   */
  updatedAt: Date;
}

export interface CityListing {
  id: string;
  price: number | null;
  /** For the badges; see `seo/badges.ts`. */
  lastPriceDropAmount: number | null;
  lastPriceDropAt: Date | null;
  listedAt: Date | null;
  publishedAt: Date | null;
  rooms: number | null;
  squareMeter: number | null;
  floor: number | null;
  street: string | null;
  houseNumber: number | null;
  neighborhood: string | null;
  city: string | null;
  propertyType: string | null;
  coverImageUrl: string | null;
}

export interface CityPage {
  city: string;
  section: Section;
  summary: Summary;
  rooms: Band[];
  types: Band[];
  neighborhoods: Band[];
  listings: CityListing[];
  /** What else the same city has, so sale and rent link to each other. */
  otherSections: { section: Section; count: number }[];
  /** The district this city sits in, and the other cities in it that we hold listings for. */
  district: { name: string; cities: string[] } | null;
  /** The freshest thing we know about this city, for `lastmod` and for the page footer. */
  updatedAt: Date;
}

/**
 * Everything the public city pages read.
 *
 * On the owner Prisma client rather than the tenant one, deliberately: these pages are
 * the storefront and show every agency's inventory at once, which is the one thing
 * tenant scoping exists to prevent. Nothing here reads a column an agency owns — no
 * lead, no customer, no name beyond what is already printed on a public ad.
 */
@Injectable()
export class CityPageService {
  /**
   * Every city we hold a published listing in, keyed by its comparable form.
   *
   * This is what turns a slug in a URL into the exact string the listings carry, and it
   * is also the sitemap. One `groupBy` serves all of it.
   */
  private readonly directory = new Cached<Map<string, CityEntry>>(DIRECTORY_TTL_MS, () =>
    this.loadDirectory(),
  );

  /** The nine districts, each with the cities it covers. Changes about never. */
  private readonly districts = new Cached<{ name: string; members: string[] }[]>(
    DIRECTORY_TTL_MS,
    () => this.loadDistricts(),
  );

  /** Recorded sales by city name. See `SALES_WINDOW_YEARS` and `loadSales`. */
  private readonly sales = new Cached<(city: string) => number>(SALES_TTL_MS, () => this.loadSales());

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The index page's shape: every district, busiest first, with only its biggest few
   * cities — biggest by recorded sales, then by what we have on offer.
   */
  async featuredByDistrict(
    limit = FEATURED_PER_DISTRICT,
  ): Promise<{ name: string | null; cities: CityEntry[] }[]> {
    const { groups, weight } = await this.rankedDistricts();

    return groups.map((group) => ({
      name: group.name,
      cities: [...group.cities]
        .sort((a, b) => weight(b) - weight(a) || total(b) - total(a))
        .slice(0, limit),
    }));
  }

  /** The full list's shape: every city, in the same district order, alphabetical within. */
  async allByDistrict(): Promise<{ name: string | null; cities: CityEntry[] }[]> {
    const { groups } = await this.rankedDistricts();

    return groups.map((group) => ({
      name: group.name,
      cities: [...group.cities].sort((a, b) => a.city.localeCompare(b.city, 'he')),
    }));
  }

  /** Every city by district, the districts ordered by their total sales. */
  private async rankedDistricts() {
    const [groups, sales] = await Promise.all([
      this.byDistrict({ includeEmpty: true }),
      this.sales.get(),
    ]);
    const weight = (entry: CityEntry) => sales(entry.city);
    const sum = (cities: CityEntry[]) => cities.reduce((n, entry) => n + weight(entry), 0);

    // The cities we could not place stay last, whatever their size, as in `byDistrict`.
    const ordered = [...groups].sort((a, b) => {
      if (a.name === null) return 1;
      if (b.name === null) return -1;
      return sum(b.cities) - sum(a.cities);
    });

    return { groups: ordered, weight };
  }

  /** Every city with something to show, biggest first. */
  async cities(): Promise<CityEntry[]> {
    const directory = await this.directory.get();

    return [...directory.values()].sort((a, b) => total(b) - total(a));
  }

  /**
   * Every city we hold, grouped by district — the shape the index page is read in.
   *
   * Grouped rather than listed flat because 280 names in one column is a list nobody
   * reads and a crawler treats as a link farm. By district it is a map of the country,
   * and each heading is itself a reason to follow the links under it.
   *
   * A city whose district we cannot work out still appears, under a final group, rather
   * than being dropped: an unmatched name is our spelling problem, not the city's.
   *
   * `includeEmpty` adds every district member we hold nothing for, with zero counts and
   * after the cities that do have listings. Only the index page asks for it: every other
   * caller links to a city page, and a city page with nothing in it is a 404.
   */
  async byDistrict(
    { includeEmpty = false }: { includeEmpty?: boolean } = {},
  ): Promise<{ name: string | null; cities: CityEntry[] }[]> {
    const [districts, entries] = await Promise.all([this.districts.get(), this.cities()]);

    const of = new Map<string, string>();
    const spelled = new Map<string, string>();
    for (const district of districts) {
      for (const member of district.members) {
        of.set(cityKey(member), district.name);
        if (!spelled.has(cityKey(member))) spelled.set(cityKey(member), member);
      }
    }

    const groups = new Map<string | null, CityEntry[]>();
    const add = (name: string | null, entry: CityEntry) => {
      const group = groups.get(name);
      if (group) group.push(entry);
      else groups.set(name, [entry]);
    };

    for (const entry of entries) add(of.get(cityKey(entry.city)) ?? null, entry);

    if (includeEmpty) {
      const held = new Set(entries.map((entry) => cityKey(entry.city)));
      const empty = [...spelled.entries()]
        .filter(([key]) => !held.has(key))
        .sort(([, a], [, b]) => a.localeCompare(b, 'he'));

      for (const [key, city] of empty) {
        add(of.get(key)!, {
          city,
          counts: { forsale: 0, rent: 0, commercial: 0 },
          updatedAt: new Date(0),
        });
      }
    }

    return [...groups.entries()]
      .map(([name, cities]) => ({ name, cities }))
      // Biggest district first, and the cities we could not place last whatever their size.
      .sort((a, b) => {
        if (a.name === null) return 1;
        if (b.name === null) return -1;
        return b.cities.length - a.cities.length;
      });
  }

  /** The city a slug names, or null if we hold nothing for it. */
  async resolve(slug: string): Promise<CityEntry | null> {
    const directory = await this.directory.get();
    return directory.get(slugKey(slug)) ?? null;
  }

  /**
   * One city's page, or null when there is nothing in that section to build it from.
   *
   * An empty page is not a thin page, it is a wrong page: a city with flats to rent and
   * none for sale should 404 on the sale URL rather than publish a heading over nothing.
   */
  async page(slug: string, section: Section): Promise<CityPage | null> {
    const entry = await this.resolve(slug);
    if (!entry || entry.counts[section] === 0) return null;

    const where = { ...PUBLIC, section, city: entry.city };

    const [rows, listings] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        select: {
          price: true,
          squareMeter: true,
          pricePerSquareMeter: true,
          rooms: true,
          propertyType: true,
          neighborhood: true,
          lastSeenAt: true,
        },
      }),
      this.prisma.listing.findMany({
        where,
        orderBy: [{ listedAt: { sort: 'desc', nulls: 'last' } }, { firstSeenAt: 'desc' }],
        take: LISTINGS_SHOWN,
        select: {
          id: true,
          price: true,
          lastPriceDropAmount: true,
          lastPriceDropAt: true,
          listedAt: true,
          publishedAt: true,
          rooms: true,
          squareMeter: true,
          floor: true,
          street: true,
          houseNumber: true,
          neighborhood: true,
          city: true,
          propertyType: true,
          coverImageUrl: true,
        },
      }),
    ]);

    const stats: StatRow[] = rows;

    return {
      city: entry.city,
      section,
      summary: summarise(stats),
      rooms: byRooms(stats),
      types: byPropertyType(stats),
      neighborhoods: byNeighborhood(stats),
      listings,
      otherSections: (Object.entries(entry.counts) as [Section, number][])
        .filter(([other, count]) => other !== section && count > 0)
        .map(([other, count]) => ({ section: other, count })),
      district: await this.districtFor(entry.city),
      updatedAt: newest(rows.map((r) => r.lastSeenAt)),
    };
  }

  /**
   * The district a city belongs to, with the other cities in it we can actually link to.
   *
   * Matched on the normalised name rather than the stored one: the district list comes
   * from OpenStreetMap and the city names come from property ads, and the two spell
   * roughly a tenth of the country differently. A district with nothing else to offer
   * is returned as null rather than as an empty list, so the page can leave the section
   * out instead of printing a heading over nothing.
   */
  private async districtFor(city: string): Promise<{ name: string; cities: string[] } | null> {
    const [districts, directory] = await Promise.all([this.districts.get(), this.directory.get()]);

    const key = cityKey(city);
    const district = districts.find((d) => d.members.some((m) => cityKey(m) === key));
    if (!district) return null;

    const cities = district.members
      .map((member) => directory.get(cityKey(member))?.city)
      .filter((name): name is string => !!name && name !== city);

    return cities.length > 0 ? { name: district.name, cities } : null;
  }


  private async loadDirectory(): Promise<Map<string, CityEntry>> {
    const groups = await this.prisma.listing.groupBy({
      by: ['city', 'section'],
      where: { ...PUBLIC, city: { not: null } },
      _count: { _all: true },
      _max: { lastSeenAt: true },
    });

    /*
     * Two spellings of one city collapse onto one entry, and the one carried by more
     * listings is the one the page uses — it is the spelling more people have seen, and
     * it is the one the search filter will match most of. `spelling` keeps the tally
     * that decides it, separately from the counts the page prints.
     */
    const directory = new Map<string, CityEntry>();
    const spelling = new Map<string, Map<string, number>>();

    for (const group of groups) {
      // Narrowed by the `city: { not: null }` above, which Prisma's grouping types do
      // not carry through.
      const city = group.city as string;
      const key = cityKey(city);
      const count = group._count._all;

      const entry = directory.get(key) ?? {
        city,
        counts: { forsale: 0, rent: 0, commercial: 0 },
        updatedAt: new Date(0),
      };
      entry.counts[group.section] += count;

      const seen = group._max.lastSeenAt;
      if (seen && seen > entry.updatedAt) entry.updatedAt = seen;

      directory.set(key, entry);

      const tally = spelling.get(key) ?? new Map<string, number>();
      tally.set(city, (tally.get(city) ?? 0) + count);
      spelling.set(key, tally);
    }

    for (const [key, tally] of spelling) {
      const entry = directory.get(key);
      if (!entry) continue;

      const [best] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      entry.city = best[0];
    }

    return directory;
  }

  /**
   * A lookup from a district's spelling of a city to its recorded sales.
   *
   * The registry and OSM disagree on a fifth of the names, nearly always over a yod or
   * a vav — `קריית ביאליק` and `קרית ביאליק`, `הרצלייה` and `הרצליה`, `שוהם` and `שהם` —
   * and `cityKey` alone missed Herzliya, Nahariya and every Kiryat. So it is matched in
   * tiers, strictest first: the comparable name, then with doubled letters folded, then
   * with yod and vav ignored altogether — that last only where it names exactly one
   * settlement, because without them `כרמיאל` and `כרמל` would become one place.
   */
  private async loadSales(): Promise<(city: string) => number> {
    const since = new Date();
    since.setFullYear(since.getFullYear() - SALES_WINDOW_YEARS);

    const groups = await this.prisma.marketDeal.groupBy({
      by: ['settlement'],
      where: { dealDate: { gte: since } },
      _count: { _all: true },
    });

    const folded = (name: string) => cityKey(name).replace(/יי/gu, 'י').replace(/וו/gu, 'ו');
    const loose = (name: string) => folded(name).replace(/[יו]/gu, '');

    const tier = (key: (name: string) => string) => {
      const map = new Map<string, { count: number; names: Set<string> }>();
      for (const group of groups) {
        const k = key(group.settlement);
        const found = map.get(k) ?? { count: 0, names: new Set<string>() };
        found.count += group._count._all;
        found.names.add(group.settlement);
        map.set(k, found);
      }
      return map;
    };
    const [exact, fold, free] = [tier(cityKey), tier(folded), tier(loose)];

    return (city) => {
      const unique = free.get(loose(city));
      return (
        exact.get(cityKey(city))?.count ??
        fold.get(folded(city))?.count ??
        (unique?.names.size === 1 ? unique.count : 0)
      );
    };
  }

  private async loadDistricts(): Promise<{ name: string; members: string[] }[]> {
    const rows = await this.prisma.cityBoundary.findMany({
      where: { kind: 'district' },
      select: { name: true, memberCities: true },
    });

    return rows.map((row) => ({ name: row.name, members: row.memberCities }));
  }
}

const total = (entry: CityEntry) =>
  entry.counts.forsale + entry.counts.rent + entry.counts.commercial;

/** The most recent of a set of timestamps; now, if there are none to choose between. */
const newest = (dates: Date[]): Date =>
  dates.length === 0 ? new Date() : dates.reduce((latest, d) => (d > latest ? d : latest));

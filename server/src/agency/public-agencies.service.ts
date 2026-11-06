import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AgencyEnquiryDto } from './dto/agency-enquiry.dto.js';
import { cityKey } from '../listings/city-name.js';
import { primaryRegion, regionIndex, regionSort } from './public-region.js';

/**
 * An agency a stranger may open.
 *
 * Active agencies always: a new one has a page before it has a listing. Everyone
 * else only while they still have something published — a suspended or rejected
 * agency is gone, and an unclaimed scrape with nothing left on the market is not
 * a shop front.
 */
const VISIBLE: Prisma.AgencyWhereInput = {
  status: { notIn: ['suspended', 'rejected'] },
  OR: [
    { status: 'active' },
    { listings: { some: { status: 'published', delistedAt: null } } },
  ],
};

const PUBLISHED: Prisma.ListingWhereInput = { status: 'published', delistedAt: null };

export interface OpeningHour {
  day: string;
  open: string;
  close: string;
}

const HEBREW_DAYS: Record<string, string> = {
  sunday: 'ראשון',
  sun: 'ראשון',
  monday: 'שני',
  mon: 'שני',
  tuesday: 'שלישי',
  tue: 'שלישי',
  wednesday: 'רביעי',
  wed: 'רביעי',
  thursday: 'חמישי',
  thu: 'חמישי',
  friday: 'שישי',
  fri: 'שישי',
  saturday: 'שבת',
  sat: 'שבת',
};

function hebrewDay(day: string): string {
  const clean = day.trim();
  const lower = clean.toLowerCase();
  if (HEBREW_DAYS[lower]) return `יום ${HEBREW_DAYS[lower]}`;
  if (!clean.startsWith('יום ') && Object.values(HEBREW_DAYS).includes(clean)) {
    return `יום ${clean}`;
  }
  return clean;
}

function openingHoursOf(value: Prisma.JsonValue | null): OpeningHour[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
    const rawDay = 'day' in row && typeof row.day === 'string' ? row.day : '';
    const open = 'open' in row && typeof row.open === 'string' ? row.open : '';
    const close = 'close' in row && typeof row.close === 'string' ? row.close : '';
    if (!rawDay) return [];
    return [{ day: hebrewDay(rawDay), open, close }];
  });
}

/** The city with the most published listings, else the first office. */
function headlineCity(listings: { city: string; count: number }[], offices: string[]): string | null {
  const top = [...listings].sort((a, b) => b.count - a.count)[0];
  return top?.city ?? offices[0] ?? null;
}

/**
 * A scraped number sometimes arrives masked (`*-5972`). That is not a number
 * anyone can call, so it is left off the public page.
 */
function callablePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 ? phone : null;
}

@Injectable()
export class PublicAgenciesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every public agency, filed under one region.
   *
   * One region rather than every region they sell in: a directory that repeats
   * an agency under each city it has a flat in is a list of listings, which
   * already exists. The region is where most of their stock is.
   */
  async directory() {
    const [agencies, cityCounts, totals, districts] = await Promise.all([
      this.prisma.agency.findMany({
        where: VISIBLE,
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          coverImageUrl: true,
          offices: { select: { city: true }, orderBy: { createdAt: 'asc' }, take: 5 },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.listing.groupBy({
        by: ['agencyId', 'city'],
        where: { ...PUBLISHED, agencyId: { not: null }, city: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.listing.groupBy({
        by: ['agencyId'],
        where: { ...PUBLISHED, agencyId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.cityBoundary.findMany({
        where: { kind: 'district' },
        select: { name: true, memberCities: true },
      }),
    ]);

    const regions = regionIndex(districts);
    const totalByAgency = new Map(
      totals.flatMap((row) => (row.agencyId ? [[row.agencyId, row._count._all] as const] : [])),
    );
    const byAgency = new Map<string, { city: string; count: number }[]>();
    for (const row of cityCounts) {
      if (!row.agencyId || !row.city) continue;
      const list = byAgency.get(row.agencyId) ?? [];
      list.push({ city: row.city, count: row._count._all });
      byAgency.set(row.agencyId, list);
    }

    const groups = new Map<string, DirectoryCard[]>();
    for (const agency of agencies) {
      const listings = byAgency.get(agency.id) ?? [];
      const officeCities = agency.offices.map((office) => office.city);
      const region = primaryRegion(listings, officeCities, regions);
      // The city on the card should be one that actually sits in this region.
      // Otherwise an unmapped city with a lot of stock (and no district of its
      // own) shows up under a different area's heading.
      const inRegion = listings.filter((row) => regions.get(cityKey(row.city)) === region);
      const card: DirectoryCard = {
        id: agency.id,
        slug: agency.slug,
        name: agency.name,
        logoUrl: agency.logoUrl,
        coverImageUrl: agency.coverImageUrl,
        city: headlineCity(inRegion.length > 0 ? inRegion : listings, officeCities),
        listingCount: totalByAgency.get(agency.id) ?? 0,
      };
      groups.set(region, [...(groups.get(region) ?? []), card]);
    }

    return {
      regions: [...groups.entries()]
        .sort(([a], [b]) => regionSort(a, b))
        .map(([name, items]) => ({
          name,
          agencies: items.sort((a, b) => b.listingCount - a.listingCount || a.name.localeCompare(b.name, 'he')),
        })),
    };
  }

  async page(key: string) {
    const agency = await this.findVisible(key);
    if (!agency) throw new NotFoundException('הסוכנות לא נמצאה.');

    const counts = await this.prisma.listing.groupBy({
      by: ['section'],
      where: { agencyId: agency.id, ...PUBLISHED },
      _count: { _all: true },
    });

    const bySection = Object.fromEntries(counts.map((row) => [row.section, row._count._all]));

    return {
      id: agency.id,
      slug: agency.slug,
      name: agency.name,
      licenseNumber: agency.licenseNumber,
      phone: callablePhone(agency.phone),
      logoUrl: agency.logoUrl,
      coverImageUrl: agency.coverImageUrl,
      description: agency.description,
      openingHours: openingHoursOf(agency.openingHours),
      offices: agency.offices.map((office) => ({
        id: office.id,
        label: office.label,
        city: office.city,
        street: office.street,
        houseNumber: office.houseNumber,
        phone: callablePhone(office.phone),
      })),
      brokers: agency.brokers.map((broker) => ({
        id: broker.id,
        name: broker.name,
        licenseNumber: broker.licenseNumber,
        specialization: broker.specialization,
        avatarUrl: broker.avatarUrl,
        activeAssetsCount: broker.activeAssetsCount,
      })),
      counts: {
        forsale: bySection.forsale ?? 0,
        rent: bySection.rent ?? 0,
        commercial: bySection.commercial ?? 0,
      },
    };
  }

  /**
   * A visitor writing to the agency, with no listing attached.
   *
   * Filed as an ordinary lead, so it shows up in פניות beside the ones that
   * came from a property. The reason is the first line of the message: the
   * inbox already shows that field, and a column for it would say the same thing.
   */
  async enquire(key: string, dto: AgencyEnquiryDto) {
    const agency = await this.findVisible(key);
    if (!agency) throw new NotFoundException('הסוכנות לא נמצאה.');

    const name = dto.name.trim();
    const phone = dto.phone?.trim() || undefined;
    const email = dto.email?.trim() || undefined;
    if (!name) throw new BadRequestException('צריך שם.');
    if (!phone && !email) throw new BadRequestException('צריך טלפון או אימייל.');

    const body = dto.message?.trim();
    const message = dto.reason
      ? body
        ? `סיבת הפנייה: ${dto.reason}\n${body}`
        : `סיבת הפנייה: ${dto.reason}`
      : body;

    await this.prisma.lead.create({
      data: {
        agencyId: agency.id,
        name,
        phone,
        email,
        message,
        source: 'web',
        status: 'new',
      },
    });

    return { received: true };
  }

  private findVisible(key: string) {
    const select = {
      id: true,
      slug: true,
      name: true,
      licenseNumber: true,
      phone: true,
      logoUrl: true,
      coverImageUrl: true,
      description: true,
      openingHours: true,
      offices: {
        select: { id: true, label: true, city: true, street: true, houseNumber: true, phone: true },
        orderBy: { createdAt: 'asc' as const },
      },
      brokers: {
        select: {
          id: true,
          name: true,
          licenseNumber: true,
          specialization: true,
          avatarUrl: true,
          activeAssetsCount: true,
        },
        orderBy: { name: 'asc' as const },
      },
    } satisfies Prisma.AgencySelect;

    // Slug first: a slug is the public address, and it must not lose to an id
    // that happens to spell the same way.
    return this.prisma.agency
      .findFirst({ where: { slug: key, ...VISIBLE }, select })
      .then((bySlug) => bySlug ?? this.prisma.agency.findFirst({ where: { id: key, ...VISIBLE }, select }));
  }
}

export interface DirectoryCard {
  id: string;
  slug: string | null;
  name: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  city: string | null;
  listingCount: number;
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AgencyLookupResult {
  id: string;
  name: string;
  licenseNumber: string | null;
  city: string | null;
  listingCount: number;
}

export interface PreviewListing {
  id: string;
  section: string;
  price: number | null;
  rooms: number | null;
  squareMeter: number | null;
  floor: number | null;
  buildingTopFloor: number | null;
  propertyType: string | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
}

export interface AgencyPreview {
  agency: { id: string; name: string; phone: string | null; licenseNumber: string | null };
  /** Approved: the listings are on the site, at `publicPath`. */
  live: boolean;
  /** Someone asked for this office and is waiting for approval. */
  pending: boolean;
  publicPath: string | null;
  listings: PreviewListing[];
}

const PREVIEW_LIMIT = 300;

@Injectable()
export class AgencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The page behind an office's private link.
   *
   * Facts only. The photos and the office's own wording were written for Yad2 and are
   * not copied until the office agrees, so neither is read here.
   */
  async preview(token: string): Promise<AgencyPreview> {
    const agency = await this.prisma.agency.findUnique({
      where: { previewToken: token },
      select: { id: true, name: true, phone: true, licenseNumber: true, slug: true, status: true },
    });
    if (!agency || !['unclaimed', 'pending', 'active'].includes(agency.status)) {
      throw new NotFoundException('הקישור אינו תקף.');
    }

    const live = agency.status === 'active';
    const listings = await this.prisma.listing.findMany({
      where: { agencyId: agency.id, delistedAt: null, status: live ? 'published' : 'draft' },
      orderBy: [{ section: 'asc' }, { price: 'desc' }],
      take: PREVIEW_LIMIT,
      select: {
        id: true,
        section: true,
        price: true,
        rooms: true,
        squareMeter: true,
        floor: true,
        buildingTopFloor: true,
        propertyType: true,
        city: true,
        neighborhood: true,
        street: true,
      },
    });

    return {
      agency: { id: agency.id, name: agency.name, phone: agency.phone, licenseNumber: agency.licenseNumber },
      live,
      pending: agency.status === 'pending',
      publicPath: live ? `/agencies/${agency.slug ?? agency.id}` : null,
      listings,
    };
  }

  /** Needs a real query: an empty search must not dump the whole table. */
  async lookupUnclaimed(q: string): Promise<AgencyLookupResult[]> {
    const query = q.trim();
    if (query.length < 2) return [];

    const agencies = await this.prisma.agency.findMany({
      where: {
        status: 'unclaimed',
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { licenseNumber: { contains: query } },
          { yad2Id: query },
        ],
      },
      take: 10,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        licenseNumber: true,
        _count: { select: { listings: true } },
        listings: { take: 1, select: { city: true }, where: { city: { not: null } } },
      },
    });

    return agencies.map((a) => ({
      id: a.id,
      name: a.name,
      licenseNumber: a.licenseNumber,
      city: a.listings[0]?.city ?? null,
      listingCount: a._count.listings,
    }));
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AgencyLookupResult {
  id: string;
  name: string;
  licenseNumber: string | null;
  city: string | null;
  listingCount: number;
}

@Injectable()
export class AgencyService {
  constructor(private readonly prisma: PrismaService) {}

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

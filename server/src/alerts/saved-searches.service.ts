import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import type { SaveSearchDto, UpdateSavedSearchDto } from './dto/saved-search.dto.js';

const SELECT = {
  id: true,
  name: true,
  section: true,
  cities: true,
  propertyTypes: true,
  minRooms: true,
  maxRooms: true,
  minPrice: true,
  maxPrice: true,
  minSquareMeter: true,
  alert: true,
  lastAlertAt: true,
  createdAt: true,
} satisfies Prisma.SavedSearchSelect;

/** A buyer's own saved searches. */
@Injectable()
export class SavedSearchesService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
  ) {}

  private userId(): string {
    return this.context.getPrincipal()?.userId ?? '';
  }

  list() {
    return this.prisma.client.savedSearch.findMany({
      where: { userId: this.userId() },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: SELECT,
    });
  }

  create(dto: SaveSearchDto) {
    return this.prisma.client.savedSearch.create({
      data: {
        userId: this.userId(),
        name: dto.name.trim(),
        section: dto.section,
        cities: dto.cities ?? [],
        propertyTypes: dto.propertyTypes ?? [],
        minRooms: dto.minRooms,
        maxRooms: dto.maxRooms,
        minPrice: dto.minPrice,
        maxPrice: dto.maxPrice,
        minSquareMeter: dto.minSquareMeter,
        alert: dto.alert ?? true,
        // From now: somebody saving a search has just read the results, so none of
        // what is already there is news.
        notifiedUpTo: new Date(),
      },
      select: SELECT,
    });
  }

  /** Only the name and the switch. Changing the criteria is a different search. */
  async update(id: string, dto: UpdateSavedSearchDto) {
    await this.require(id);

    return this.prisma.client.savedSearch.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.alert !== undefined ? { alert: dto.alert } : {}),
      },
      select: SELECT,
    });
  }

  async remove(id: string) {
    await this.require(id);
    await this.prisma.client.savedSearch.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Scoped by the policy, so somebody else's search is invisible rather than
   * forbidden — which is the right answer, and gives nothing away.
   */
  private async require(id: string) {
    const found = await this.prisma.client.savedSearch.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('החיפוש לא נמצא.');
    return found;
  }
}

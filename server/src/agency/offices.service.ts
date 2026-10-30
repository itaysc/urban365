import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { GeocodeService } from '../geocode/geocode.service.js';
import { can } from '../auth/permissions.js';
import type { UpsertOfficeDto } from './dto/office.dto.js';

const SELECT = {
  id: true,
  label: true,
  city: true,
  street: true,
  houseNumber: true,
  latitude: true,
  longitude: true,
  phone: true,
} as const;

/**
 * An agency's own offices.
 *
 * On the tenant client, so the agency id comes from the request's context rather than
 * from anything the caller sends — and so a policy, not a `where` clause, is what stops
 * one agency editing another's branches.
 */
@Injectable()
export class OfficesService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
    private readonly geocode: GeocodeService,
  ) {}

  /**
   * A branch address is the agency's own detail, not an agent's working data: it is on
   * the public page and on the map, and changing one moves where the public is told to
   * turn up. Same bar as the rest of the agency page.
   */
  private assertCanManage(): void {
    if (!can(this.context.getPrincipal(), 'agency:manage')) {
      throw new ForbiddenException('רק בעלים של הסוכנות יכול לערוך את הסניפים.');
    }
  }

  list() {
    return this.prisma.client.agencyOffice.findMany({
      select: SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: UpsertOfficeDto) {
    this.assertCanManage();
    return this.prisma.client.agencyOffice.create({
      // The extension fills `agencyId` in anyway; it is stated because Prisma's
      // generated create type requires it. Taken from the request context, never from
      // the body — the caller does not get to choose whose office this is.
      data: {
        agencyId: this.context.requireAgencyId(),
        ...dto,
        ...(await this.geocode.locate(dto)),
      },
      select: SELECT,
    });
  }

  async update(id: string, dto: UpsertOfficeDto) {
    this.assertCanManage();
    // Re-geocoded on every save rather than only when the address looks changed: the
    // comparison would have to know which fields matter, and getting that wrong leaves
    // an office pinned to where it used to be.
    const { count } = await this.prisma.client.agencyOffice.updateMany({
      where: { id },
      data: {
        city: dto.city,
        // Spread as null rather than undefined. An optional field left out of a PATCH
        // is Prisma's "leave it alone", which is indistinguishable from the form's
        // "I cleared this box" — so emptying a street or a house number silently kept
        // the old value, and the office kept an address nobody had typed.
        label: dto.label ?? null,
        street: dto.street ?? null,
        houseNumber: dto.houseNumber ?? null,
        phone: dto.phone ?? null,
        latitude: null,
        longitude: null,
        ...(await this.geocode.locate(dto)),
      },
    });

    // updateMany rather than update: the policy turns someone else's id into zero rows
    // rather than an error, and a 404 is the right answer to an id that is not yours.
    if (count === 0) throw new NotFoundException('לא נמצא סניף כזה.');

    return this.prisma.client.agencyOffice.findFirst({ where: { id }, select: SELECT });
  }

  async remove(id: string) {
    this.assertCanManage();
    const { count } = await this.prisma.client.agencyOffice.deleteMany({ where: { id } });
    if (count === 0) throw new NotFoundException('לא נמצא סניף כזה.');
    return { ok: true };
  }
}

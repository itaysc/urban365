import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { assertActiveMember } from '../tenancy/assert-ours.js';
import { assigneeScope, can, mayAssign } from '../auth/permissions.js';
import { mapLeadRows, parseCsv } from './csv.js';
import type { CreateLeadDto, ListLeadsQuery, UpdateLeadDto } from './dto/lead.dto.js';

const DEFAULT_PAGE_SIZE = 25;

const LIST_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  message: true,
  notes: true,
  source: true,
  status: true,
  listingId: true,
  assignedToId: true,
  contactedAt: true,
  createdAt: true,
  updatedAt: true,
  listing: { select: { id: true, city: true, street: true, price: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.LeadSelect;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    /** The public enquiry form has no session, so it cannot use the tenant client. */
    private readonly owner: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  private assertCanWrite(): void {
    if (!can(this.context.getPrincipal(), 'lead:write')) {
      throw new ForbiddenException('אין לך הרשאה לערוך פניות.');
    }
  }

  private scope(): Prisma.LeadWhereInput {
    return assigneeScope(this.context.getPrincipal(), 'assignedToId');
  }

  /** An agent's new lead is theirs unless they said otherwise; nobody else may be named. */
  private assignee(requested: string | undefined, fallbackToMe: boolean): string | undefined {
    const principal = this.context.getPrincipal();
    if (!mayAssign(principal, requested)) {
      throw new ForbiddenException('אפשר לשייך פנייה רק לעצמך.');
    }
    if (requested !== undefined || !fallbackToMe || can(principal, 'lead:read-all')) return requested;
    return principal?.userId;
  }

  async list(query: ListLeadsQuery) {
    const agencyId = this.context.requireAgencyId();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.LeadWhereInput = { agencyId, AND: [this.scope()] };
    if (query.status) where.status = query.status;
    if (query.listingId) where.listingId = query.listingId;
    if (query.q?.trim()) {
      const contains = query.q.trim();
      const mode = 'insensitive' as const;
      where.OR = [
        { name: { contains, mode } },
        { phone: { contains, mode } },
        { email: { contains, mode } },
        { message: { contains, mode } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.client.lead.count({ where }),
      this.prisma.client.lead.findMany({
        where,
        // `id` last: without a unique tiebreaker two leads created in the same
        // millisecond can swap places between pages.
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: LIST_SELECT,
      }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Counts per status, for the inbox tabs. */
  async counts() {
    const agencyId = this.context.requireAgencyId();
    const rows = await this.prisma.client.lead.groupBy({
      by: ['status'],
      where: { agencyId, ...this.scope() },
      _count: { _all: true },
    });

    return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  }

  async create(dto: CreateLeadDto) {
    this.assertCanWrite();
    await this.assertListingIsOurs(dto.listingId);
    const assignedToId = this.assignee(dto.assignedToId, true);
    await assertActiveMember(this.prisma.client, this.context.requireAgencyId(), assignedToId);

    return this.prisma.client.lead.create({
      data: {
        agencyId: this.context.requireAgencyId(),
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        message: dto.message,
        notes: dto.notes,
        listingId: dto.listingId,
        assignedToId,
        status: dto.status ?? 'new',
        source: 'manual',
      },
      select: LIST_SELECT,
    });
  }

  async update(id: string, dto: UpdateLeadDto) {
    this.assertCanWrite();
    const existing = await this.requireOwn(id);
    await this.assertListingIsOurs(dto.listingId);
    this.assignee(dto.assignedToId, false);
    await assertActiveMember(this.prisma.client, this.context.requireAgencyId(), dto.assignedToId);

    return this.prisma.client.lead.update({
      where: { id: existing.id },
      data: {
        ...dto,
        // Stamped the first time it leaves `new`, so "how long did we take to reply"
        // is answerable later.
        ...(dto.status && dto.status !== 'new' && !existing.contactedAt
          ? { contactedAt: new Date() }
          : {}),
      },
      select: LIST_SELECT,
    });
  }

  async remove(id: string) {
    this.assertCanWrite();
    const existing = await this.requireOwn(id);
    await this.prisma.client.lead.delete({ where: { id: existing.id } });
    return { deleted: true };
  }

  /**
   * Bulk insert from a spreadsheet. Bad rows are reported rather than aborting the
   * import: a 400-row file with two malformed lines should land 398 leads, not nothing.
   */
  async importCsv(csv: string) {
    this.assertCanWrite();
    const agencyId = this.context.requireAgencyId();
    const { rows, skipped } = mapLeadRows(parseCsv(csv));

    if (rows.length === 0) return { imported: 0, skipped };

    const assignedToId = this.assignee(undefined, true) ?? null;
    const created = await this.prisma.client.lead.createMany({
      data: rows.map((row) => ({
        ...row,
        agencyId,
        assignedToId,
        source: 'import' as const,
        status: 'new' as const,
      })),
    });

    return { imported: created.count, skipped };
  }

  /**
   * The public enquiry form. It runs on the owner client because a visitor has no
   * session and therefore no agency context — but the agency is never taken from the
   * request: it is read off the listing, which must be published.
   */
  async createFromEnquiry(listingId: string, dto: { name: string; phone?: string; email?: string; message?: string }) {
    const listing = await this.owner.listing.findFirst({
      where: { id: listingId, status: 'published', delistedAt: null },
      select: { id: true, agencyId: true, ownerUserId: true },
    });

    if (!listing) throw new NotFoundException('הנכס לא נמצא.');

    await this.owner.lead.create({
      data: {
        // Whichever of the two the listing has. The check constraint refuses both and
        // refuses neither, so this cannot quietly file an enquiry to nobody.
        agencyId: listing.agencyId,
        ownerUserId: listing.ownerUserId,
        listingId: listing.id,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        message: dto.message,
        source: 'web',
        status: 'new',
      },
    });

    // Nothing about the lead comes back: the response is read by whoever submitted the
    // form, who should not learn anything they did not already provide.
    return { received: true };
  }

  private async requireOwn(id: string) {
    const agencyId = this.context.requireAgencyId();
    const lead = await this.prisma.client.lead.findFirst({ where: { id, agencyId, ...this.scope() } });
    if (!lead) throw new NotFoundException('הפנייה לא נמצאה.');
    return lead;
  }

  /** A lead may only point at one of our own listings, including a draft. */
  private async assertListingIsOurs(listingId: string | undefined): Promise<void> {
    if (!listingId) return;

    const agencyId = this.context.requireAgencyId();
    const listing = await this.prisma.client.listing.findFirst({
      where: { id: listingId, agencyId },
      select: { id: true },
    });

    if (!listing) throw new NotFoundException('הנכס לא נמצא.');
  }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { assigneeScope, can, mayAssign } from '../auth/permissions.js';
import { DEAL_STAGES, type CreateDealDto, type DealStageValue, type UpdateDealDto } from './dto/deal.dto.js';

const SELECT = {
  id: true,
  title: true,
  stage: true,
  price: true,
  commission: true,
  commissionPercent: true,
  expectedCloseAt: true,
  closedAt: true,
  lostReason: true,
  notes: true,
  leadId: true,
  listingId: true,
  customerId: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  lead: { select: { id: true, name: true, phone: true, email: true } },
  customer: { select: { id: true, name: true, phone: true } },
  listing: { select: { id: true, city: true, street: true } },
  owner: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.DealSelect;

/** A stage that ends the deal; entering one stamps `closedAt`. */
const TERMINAL: DealStageValue[] = ['closed_won', 'closed_lost'];

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
  ) {}

  private assertCanWrite(): void {
    if (!can(this.context.getPrincipal(), 'deal:write')) {
      throw new ForbiddenException('אין לך הרשאה לערוך עסקאות.');
    }
  }

  private scope(): Prisma.DealWhereInput {
    return assigneeScope(this.context.getPrincipal(), 'ownerId');
  }

  private assertMayAssign(userId: string | undefined): void {
    if (!mayAssign(this.context.getPrincipal(), userId)) {
      throw new ForbiddenException('אפשר לשייך עסקה רק לעצמך.');
    }
  }

  /**
   * The whole board in one call, grouped by stage. A pipeline is read as columns, and an
   * agency's open deals are a small set — paging it would cost a round trip per column
   * and still not be what the screen wants.
   */
  /** Every deal with one person, newest first. What their own page shows. */
  async forCustomer(customerId: string) {
    const agencyId = this.context.requireAgencyId();

    return this.prisma.client.deal.findMany({
      where: { agencyId, customerId, ...this.scope() },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: SELECT,
    });
  }

  async board() {
    const agencyId = this.context.requireAgencyId();
    const deals = await this.prisma.client.deal.findMany({
      where: { agencyId, ...this.scope() },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: SELECT,
    });

    const columns = Object.fromEntries(DEAL_STAGES.map((stage) => [stage, [] as typeof deals])) as
      Record<DealStageValue, typeof deals>;

    for (const deal of deals) columns[deal.stage].push(deal);

    return {
      columns,
      totals: Object.fromEntries(
        DEAL_STAGES.map((stage) => [
          stage,
          {
            count: columns[stage].length,
            value: columns[stage].reduce((sum, d) => sum + (d.price ?? 0), 0),
            commission: columns[stage].reduce((sum, d) => sum + (d.commission ?? 0), 0),
          },
        ]),
      ),
    };
  }

  async create(dto: CreateDealDto) {
    this.assertCanWrite();
    this.assertMayAssign(dto.ownerId);
    await this.assertRelationsAreOurs(dto);

    // An agent's new deal is theirs unless they said otherwise.
    const principal = this.context.getPrincipal();
    const ownerId = dto.ownerId ?? (can(principal, 'lead:read-all') ? undefined : principal?.userId);

    const stage = dto.stage ?? 'qualified';
    const commission =
      dto.commission ??
      (dto.commissionPercent !== undefined && dto.price !== undefined
        ? Math.round((dto.price * dto.commissionPercent) / 100)
        : null);

    return this.prisma.client.deal.create({
      data: {
        agencyId: this.context.requireAgencyId(),
        title: dto.title,
        stage,
        price: dto.price,
        commission,
        commissionPercent: dto.commissionPercent,
        expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null,
        leadId: dto.leadId,
        listingId: dto.listingId,
        customerId: dto.customerId,
        ownerId,
        notes: dto.notes,
        closedAt: TERMINAL.includes(stage) ? new Date() : null,
      },
      select: SELECT,
    });
  }

  async update(id: string, dto: UpdateDealDto) {
    this.assertCanWrite();
    const existing = await this.requireOwn(id);
    this.assertMayAssign(dto.ownerId);
    await this.assertRelationsAreOurs(dto);

    const movingToTerminal = dto.stage ? TERMINAL.includes(dto.stage) : false;

    const nextPrice = dto.price !== undefined ? dto.price : existing.price;
    const nextPercent =
      dto.commissionPercent !== undefined ? dto.commissionPercent : existing.commissionPercent;
    let nextCommission = dto.commission;
    if (nextCommission === undefined && (dto.commissionPercent !== undefined || dto.price !== undefined)) {
      if (nextPercent !== null && nextPercent !== undefined && nextPrice !== null && nextPrice !== undefined) {
        nextCommission = Math.round((nextPrice * nextPercent) / 100);
      }
    }

    return this.prisma.client.deal.update({
      where: { id: existing.id },
      data: {
        ...dto,
        ...(nextCommission !== undefined ? { commission: nextCommission } : {}),
        ...(dto.expectedCloseAt !== undefined
          ? { expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null }
          : {}),
        // Moving in stamps the close; moving back out clears it, so a deal reopened by
        // mistake does not keep a close date that contradicts its stage.
        ...(dto.stage ? { closedAt: movingToTerminal ? (existing.closedAt ?? new Date()) : null } : {}),
      },
      select: SELECT,
    });
  }

  async remove(id: string) {
    this.assertCanWrite();
    const existing = await this.requireOwn(id);
    await this.prisma.client.deal.delete({ where: { id: existing.id } });
    return { deleted: true };
  }

  private async requireOwn(id: string) {
    const agencyId = this.context.requireAgencyId();
    const deal = await this.prisma.client.deal.findFirst({ where: { id, agencyId, ...this.scope() } });
    if (!deal) throw new NotFoundException('העסקה לא נמצאה.');
    return deal;
  }

  /**
   * A deal may only point at our own lead, listing and member. RLS already refuses a
   * foreign row, but it surfaces as a constraint error rather than something a user can
   * act on, so each is checked here.
   */
  private async assertRelationsAreOurs(dto: CreateDealDto | UpdateDealDto): Promise<void> {
    const agencyId = this.context.requireAgencyId();

    if (dto.leadId) {
      const lead = await this.prisma.client.lead.findFirst({
        where: { id: dto.leadId, agencyId },
        select: { id: true },
      });
      if (!lead) throw new NotFoundException('הפנייה לא נמצאה.');
    }

    if (dto.customerId) {
      const customer = await this.prisma.client.customer.findFirst({
        where: { id: dto.customerId, agencyId },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('הלקוח לא נמצא.');
    }

    if (dto.listingId) {
      const listing = await this.prisma.client.listing.findFirst({
        where: { id: dto.listingId, agencyId },
        select: { id: true },
      });
      if (!listing) throw new NotFoundException('הנכס לא נמצא.');
    }

    if (dto.ownerId) {
      const member = await this.prisma.client.agencyMembership.findFirst({
        where: { agencyId, userId: dto.ownerId, status: 'active' },
        select: { id: true },
      });
      if (!member) throw new NotFoundException('המשתמש אינו חבר בסוכנות.');
    }
  }
}

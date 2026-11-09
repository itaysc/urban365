import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { assigneeScope, can, mayAssign } from '../auth/permissions.js';
import { dealFieldsFromCase } from './case-to-deal.js';
import {
  MORTGAGE_CASE_STAGES,
  type CreateMortgageCaseDto,
  type MortgageCaseStageValue,
  type UpdateMortgageCaseDto,
} from './dto/mortgage-case.dto.js';

const SELECT = {
  id: true,
  stage: true,
  leadId: true,
  customerId: true,
  dealId: true,
  assignedToId: true,
  requestedAmount: true,
  propertyValue: true,
  equityAvailable: true,
  monthlyIncomePrimary: true,
  monthlyIncomeSecondary: true,
  employmentType: true,
  propertyCity: true,
  loanTermYears: true,
  riskPreference: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  lead: { select: { id: true, name: true, phone: true, email: true } },
  customer: { select: { id: true, name: true, phone: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  bankOffers: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.MortgageCaseSelect;

type CaseRow = Prisma.MortgageCaseGetPayload<{ select: typeof SELECT }>;

/**
 * The mortgage-vertical's pipeline, the same shape `DealsService.board()` returns for
 * a brokerage — a kanban reads as columns, and an agency's open cases are a small set.
 */
@Injectable()
export class MortgageCasesService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
  ) {}

  // Reuses `deal:write` — a mortgage case is this vertical's deal, and it should need
  // exactly the role a real-estate deal needs, not a third permission nobody decided.
  private assertCanWrite(): void {
    if (!can(this.context.getPrincipal(), 'deal:write')) {
      throw new ForbiddenException('אין לך הרשאה לערוך תיקים.');
    }
  }

  private scope(): Prisma.MortgageCaseWhereInput {
    return assigneeScope(this.context.getPrincipal(), 'assignedToId');
  }

  private assertMayAssign(userId: string | undefined): void {
    if (!mayAssign(this.context.getPrincipal(), userId)) {
      throw new ForbiddenException('אפשר לשייך תיק רק לעצמך.');
    }
  }

  async board() {
    const agencyId = this.context.requireAgencyId();
    const cases = await this.prisma.client.mortgageCase.findMany({
      where: { agencyId, ...this.scope() },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: SELECT,
    });

    const columns = Object.fromEntries(
      MORTGAGE_CASE_STAGES.map((stage) => [stage, [] as typeof cases]),
    ) as Record<MortgageCaseStageValue, typeof cases>;

    for (const item of cases) columns[item.stage].push(item);

    return {
      columns,
      totals: Object.fromEntries(
        MORTGAGE_CASE_STAGES.map((stage) => [
          stage,
          {
            count: columns[stage].length,
            requested: columns[stage].reduce((sum, c) => sum + (c.requestedAmount ?? 0), 0),
          },
        ]),
      ),
    };
  }

  async create(dto: CreateMortgageCaseDto) {
    this.assertCanWrite();
    this.assertMayAssign(dto.assignedToId);
    await this.assertRelationsAreOurs(dto);

    const principal = this.context.getPrincipal();
    const assignedToId =
      dto.assignedToId ?? (can(principal, 'lead:read-all') ? undefined : principal?.userId);

    const created = await this.prisma.client.mortgageCase.create({
      data: {
        agencyId: this.context.requireAgencyId(),
        stage: dto.stage ?? 'new_request',
        leadId: dto.leadId,
        customerId: dto.customerId,
        assignedToId,
        requestedAmount: dto.requestedAmount,
        propertyValue: dto.propertyValue,
        equityAvailable: dto.equityAvailable,
        monthlyIncomePrimary: dto.monthlyIncomePrimary,
        monthlyIncomeSecondary: dto.monthlyIncomeSecondary,
        employmentType: dto.employmentType,
        propertyCity: dto.propertyCity,
        loanTermYears: dto.loanTermYears,
        riskPreference: dto.riskPreference,
        notes: dto.notes,
      },
      select: SELECT,
    });

    return this.syncDeal(created);
  }

  async findOne(id: string) {
    const existing = await this.requireOwn(id);
    return this.prisma.client.mortgageCase.findUniqueOrThrow({ where: { id: existing.id }, select: SELECT });
  }

  async update(id: string, dto: UpdateMortgageCaseDto) {
    this.assertCanWrite();
    const existing = await this.requireOwn(id);
    this.assertMayAssign(dto.assignedToId);
    await this.assertRelationsAreOurs(dto);

    const updated = await this.prisma.client.mortgageCase.update({
      where: { id: existing.id },
      data: {
        stage: dto.stage,
        leadId: dto.leadId,
        customerId: dto.customerId,
        assignedToId: dto.assignedToId,
        requestedAmount: dto.requestedAmount,
        propertyValue: dto.propertyValue,
        equityAvailable: dto.equityAvailable,
        monthlyIncomePrimary: dto.monthlyIncomePrimary,
        monthlyIncomeSecondary: dto.monthlyIncomeSecondary,
        employmentType: dto.employmentType,
        propertyCity: dto.propertyCity,
        loanTermYears: dto.loanTermYears,
        riskPreference: dto.riskPreference,
        notes: dto.notes,
      },
      select: SELECT,
    });

    return this.syncDeal(updated);
  }

  async remove(id: string) {
    this.assertCanWrite();
    const existing = await this.requireOwn(id);
    await this.prisma.client.mortgageCase.delete({ where: { id: existing.id } });
    return { deleted: true };
  }

  private async requireOwn(id: string) {
    const agencyId = this.context.requireAgencyId();
    const found = await this.prisma.client.mortgageCase.findFirst({
      where: { id, agencyId, ...this.scope() },
    });
    if (!found) throw new NotFoundException('התיק לא נמצא.');
    return found;
  }

  /**
   * A case may only point at our own lead, customer and member — the same reason
   * `DealsService.assertRelationsAreOurs` checks each rather than trusting RLS to
   * surface a readable error.
   */
  private async assertRelationsAreOurs(dto: CreateMortgageCaseDto | UpdateMortgageCaseDto): Promise<void> {
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

    if (dto.assignedToId) {
      const member = await this.prisma.client.agencyMembership.findFirst({
        where: { agencyId, userId: dto.assignedToId, status: 'active' },
        select: { id: true },
      });
      if (!member) throw new NotFoundException('המשתמש אינו חבר בסוכנות.');
    }
  }

  /**
   * Links a signed case to the deal its commission dashboard reads. `dealFieldsFromCase`
   * decides whether there is anything to do; moving a case back out of `signed` leaves an
   * already-created deal exactly as it is rather than reopening or deleting a commission
   * record on what might be a stage picked by mistake and corrected the next moment.
   */
  private async syncDeal(mortgageCase: CaseRow): Promise<CaseRow> {
    const displayName = mortgageCase.customer?.name ?? mortgageCase.lead?.name ?? 'תיק משכנתא';
    const fields = dealFieldsFromCase({
      stage: mortgageCase.stage,
      requestedAmount: mortgageCase.requestedAmount,
      displayName,
    });
    if (!fields) return mortgageCase;

    const agencyId = this.context.requireAgencyId();

    if (mortgageCase.dealId) {
      await this.prisma.client.deal.update({ where: { id: mortgageCase.dealId }, data: fields });
      return mortgageCase;
    }

    const deal = await this.prisma.client.deal.create({
      data: { agencyId, title: fields.title, stage: fields.stage, price: fields.price, closedAt: fields.closedAt },
      select: { id: true },
    });

    return this.prisma.client.mortgageCase.update({
      where: { id: mortgageCase.id },
      data: { dealId: deal.id },
      select: SELECT,
    });
  }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { assertActiveMember } from '../tenancy/assert-ours.js';
import { assigneeScope, can, mayAssign } from '../auth/permissions.js';
import { agreementFields } from './agreement-fields.js';
import type {
  CreateCustomerDto,
  ListCustomersQuery,
  UpdateCustomerDto,
} from './dto/customer.dto.js';

const DEFAULT_PAGE_SIZE = 25;

const LIST_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  kind: true,
  notes: true,
  lookingSection: true,
  lookingCities: true,
  lookingTypes: true,
  minRooms: true,
  maxRooms: true,
  minPrice: true,
  maxPrice: true,
  minSquareMeter: true,
  assignedToId: true,
  agreementSignedAt: true,
  agreementCommissionPercent: true,
  agreementCommissionAmount: true,
  agreementNote: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  // How many times they have been taken somewhere. One number on a query that is
  // already running, so the list can say "3 ביקורים" without a second request per row.
  _count: { select: { meetings: true } },
} satisfies Prisma.CustomerSelect;

/**
 * The people an agency works with.
 *
 * On the tenant client throughout, so the agency scoping is the database's and not a
 * `where` clause somebody can forget. `requireAgencyId` is still passed explicitly,
 * because a query with no filter would otherwise be a full scan that RLS then empties —
 * correct, but needlessly expensive.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
  ) {}

  private assertCanWrite(): void {
    // The same permission leads use: anybody who can work the inbox can keep the people
    // in it. A separate `customer:write` would be a distinction without a difference.
    if (!can(this.context.getPrincipal(), 'lead:write')) {
      throw new ForbiddenException('אין לך הרשאה לערוך לקוחות.');
    }
  }

  private scope(): Prisma.CustomerWhereInput {
    return assigneeScope(this.context.getPrincipal(), 'assignedToId');
  }

  private assertMayAssign(userId: string | undefined): void {
    if (!mayAssign(this.context.getPrincipal(), userId)) {
      throw new ForbiddenException('אפשר לשייך לקוח רק לעצמך.');
    }
  }

  async list(query: ListCustomersQuery) {
    const agencyId = this.context.requireAgencyId();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.CustomerWhereInput = { agencyId, AND: [this.scope()] };
    if (query.kind) where.kind = query.kind;
    // Unsigned is the useful half of this filter and the reason it exists: the list of
    // people the agency is working for without anything in writing.
    if (query.agreement === 'signed') where.agreementSignedAt = { not: null };
    if (query.agreement === 'unsigned') where.agreementSignedAt = null;
    if (query.q?.trim()) {
      const contains = query.q.trim();
      const mode = 'insensitive' as const;
      where.OR = [
        { name: { contains, mode } },
        { phone: { contains, mode } },
        { email: { contains, mode } },
        { notes: { contains, mode } },
        // Searching the brief too: "who was looking in Holon" is a question an agent
        // asks far more often than they remember a surname.
        { lookingCities: { has: contains } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.client.customer.count({ where }),
      this.prisma.client.customer.findMany({
        where,
        // `id` last: without a unique tiebreaker two customers created in the same
        // millisecond can swap places between pages.
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: LIST_SELECT,
      }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async create(dto: CreateCustomerDto) {
    this.assertCanWrite();
    const agencyId = this.context.requireAgencyId();
    this.assertMayAssign(dto.assignedToId);
    await assertActiveMember(this.prisma.client, agencyId, dto.assignedToId);

    // An agent's new customer is theirs unless they said otherwise.
    const principal = this.context.getPrincipal();
    const mine =
      dto.assignedToId === undefined && !can(principal, 'lead:read-all') ? { assignedToId: principal?.userId } : {};

    return this.prisma.client.customer.create({
      data: { ...this.fields(dto), ...mine, name: dto.name.trim(), agencyId },
      select: LIST_SELECT,
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    this.assertCanWrite();
    await this.require(id);
    this.assertMayAssign(dto.assignedToId);
    await assertActiveMember(this.prisma.client, this.context.requireAgencyId(), dto.assignedToId);

    return this.prisma.client.customer.update({
      where: { id },
      data: { ...this.fields(dto), ...(dto.name ? { name: dto.name.trim() } : {}) },
      select: LIST_SELECT,
    });
  }

  async remove(id: string) {
    this.assertCanWrite();
    await this.require(id);

    await this.prisma.client.customer.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Scoped by the tenant client, so a row from another agency is invisible rather than
   * forbidden — which is the right answer: it does not exist as far as this caller is
   * concerned, and saying "forbidden" would confirm that it does.
   */
  private async require(id: string) {
    const customer = await this.prisma.client.customer.findFirst({
      where: { id, ...this.scope() },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('הלקוח לא נמצא.');
    return customer;
  }

  /**
   * `''` is cleared, not "leave it alone": somebody emptying the phone field means they
   * want it empty. `undefined` — the field absent from the body — is what leaves it.
   */
  private fields(dto: CreateCustomerDto | UpdateCustomerDto) {
    const text = (value: string | undefined) =>
      value === undefined ? undefined : value.trim() === '' ? null : value.trim();

    return {
      phone: text(dto.phone),
      email: text(dto.email),
      notes: text(dto.notes),
      kind: dto.kind,
      assignedToId: dto.assignedToId === '' ? null : dto.assignedToId,
      lookingSection: dto.lookingSection,
      lookingCities: dto.lookingCities,
      lookingTypes: dto.lookingTypes,
      minRooms: dto.minRooms,
      maxRooms: dto.maxRooms,
      minPrice: dto.minPrice,
      maxPrice: dto.maxPrice,
      minSquareMeter: dto.minSquareMeter,
      ...agreementFields(dto),
    };
  }
}

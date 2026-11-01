import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { can } from '../auth/permissions.js';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { briefSummary } from './brief-summary.js';
import { HOLDER_SELECT, SEEKER_SELECT } from './projections.js';

/** Anything outside this is somebody being creative with a number, not negotiating. */
const MIN_SPLIT = 10;
const MAX_SPLIT = 90;

/**
 * Two agencies working one deal.
 *
 * On the tenant client, where the policy admits both parties to the row — the one place
 * in the system where that is true. Everything else here exists to make sure that
 * shared row does not become a shared customer list.
 */
@Injectable()
export class CoBrokerageService {
  private readonly logger = new Logger(CoBrokerageService.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
  ) {}

  /** What we have asked others for. */
  async sent() {
    const agencyId = this.context.requireAgencyId();

    return this.prisma.client.coBrokerageRequest.findMany({
      where: { seekingAgencyId: agencyId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: SEEKER_SELECT,
    });
  }

  /** What others have asked us. The inbox. */
  async received() {
    const agencyId = this.context.requireAgencyId();

    return this.prisma.client.coBrokerageRequest.findMany({
      where: { holdingAgencyId: agencyId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: HOLDER_SELECT,
    });
  }

  /**
   * Asking another agency to work a listing together.
   *
   * The brief is summarised and stored on the request rather than read through the
   * customer later: the other agency may read this row and may not read that customer,
   * and a brief edited next week should not quietly rewrite what somebody was asked.
   */
  async request(dto: {
    listingId: string;
    customerId: string;
    message?: string;
    commissionSplit?: number;
  }) {
    this.assertCanWrite();
    const agencyId = this.context.requireAgencyId();

    const split = dto.commissionSplit ?? 50;
    if (split < MIN_SPLIT || split > MAX_SPLIT) {
      throw new BadRequestException(`חלוקת העמלה צריכה להיות בין ${MIN_SPLIT} ל-${MAX_SPLIT}.`);
    }

    // Ours, and ours to describe. The tenant client refuses anybody else's.
    const customer = await this.prisma.client.customer.findUnique({
      where: { id: dto.customerId },
      select: {
        id: true,
        agencyId: true,
        lookingSection: true,
        lookingCities: true,
        lookingTypes: true,
        minRooms: true,
        maxRooms: true,
        minSquareMeter: true,
      },
    });
    if (!customer || customer.agencyId !== agencyId) {
      throw new NotFoundException('הלקוח לא נמצא.');
    }

    // Published, somebody else's, and in the network. Read through the tenant client,
    // which admits it only because published listings are public.
    const listing = await this.prisma.client.listing.findUnique({
      where: { id: dto.listingId },
      select: {
        id: true,
        agencyId: true,
        status: true,
        delistedAt: true,
        agency: { select: { coBrokerage: true } },
      },
    });

    if (!listing || listing.status !== 'published' || listing.delistedAt) {
      throw new NotFoundException('הנכס לא נמצא.');
    }
    if (!listing.agencyId || listing.agencyId === agencyId) {
      throw new BadRequestException('הנכס הזה אינו של סוכנות אחרת.');
    }
    if (!listing.agency?.coBrokerage) {
      throw new BadRequestException('הסוכנות הזו אינה משתפת פעולה דרך הפלטפורמה.');
    }

    try {
      return await this.prisma.client.coBrokerageRequest.create({
        data: {
          listingId: listing.id,
          holdingAgencyId: listing.agencyId,
          seekingAgencyId: agencyId,
          customerId: customer.id,
          requestedById: this.context.getPrincipal()?.userId ?? null,
          message: dto.message?.trim() || null,
          commissionSplit: split,
          briefSummary: briefSummary(customer),
        },
        select: SEEKER_SELECT,
      });
    } catch {
      // The unique index on (listing, agency, customer). Said plainly, because asking
      // twice is not a second opportunity.
      throw new BadRequestException('כבר שלחתם בקשה על הנכס הזה עבור הלקוח הזה.');
    }
  }

  /** The holding agency's answer. */
  async respond(id: string, accept: boolean) {
    this.assertCanWrite();
    const agencyId = this.context.requireAgencyId();

    const existing = await this.prisma.client.coBrokerageRequest.findUnique({
      where: { id },
      select: { id: true, holdingAgencyId: true, status: true },
    });
    if (!existing) throw new NotFoundException('הבקשה לא נמצאה.');

    // Only the side being asked may answer. The policy lets both sides *write* the row,
    // because it cannot tell accepting from withdrawing — this is where that is told.
    if (existing.holdingAgencyId !== agencyId) {
      throw new ForbiddenException('רק הסוכנות שהנכס שלה יכולה להשיב.');
    }
    if (existing.status !== 'pending') {
      throw new BadRequestException('כבר ניתנה תשובה לבקשה הזו.');
    }

    return this.prisma.client.coBrokerageRequest.update({
      where: { id },
      data: {
        status: accept ? 'accepted' : 'declined',
        respondedAt: new Date(),
        respondedById: this.context.getPrincipal()?.userId ?? null,
      },
      select: HOLDER_SELECT,
    });
  }

  /** The asking agency changing its mind, which it may do until it is answered. */
  async withdraw(id: string) {
    this.assertCanWrite();
    const agencyId = this.context.requireAgencyId();

    const existing = await this.prisma.client.coBrokerageRequest.findUnique({
      where: { id },
      select: { id: true, seekingAgencyId: true, status: true },
    });
    if (!existing) throw new NotFoundException('הבקשה לא נמצאה.');

    if (existing.seekingAgencyId !== agencyId) {
      throw new ForbiddenException('רק הסוכנות ששלחה את הבקשה יכולה לבטל אותה.');
    }
    if (existing.status !== 'pending') {
      throw new BadRequestException('כבר ניתנה תשובה לבקשה הזו.');
    }

    return this.prisma.client.coBrokerageRequest.update({
      where: { id },
      data: { status: 'withdrawn' },
      select: SEEKER_SELECT,
    });
  }

  private assertCanWrite(): void {
    if (!can(this.context.getPrincipal(), 'lead:write')) {
      throw new ForbiddenException('אין לך הרשאה לנהל שיתופי פעולה.');
    }
  }
}

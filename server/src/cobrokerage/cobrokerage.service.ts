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
import { MailService } from '../mail/mail.service.js';
import { ConfigService } from '@nestjs/config';
import type { MailConfig } from '../config/configuration.js';
import { coBrokerageUpdateTemplate } from '../mail/templates.js';
import { briefSummary } from './brief-summary.js';
import { HOLDER_SELECT, SEEKER_SELECT } from './projections.js';
import type { CoBrokerageStageValue } from './dto/cobrokerage.dto.js';

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

  private readonly appUrl: string;

  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = config.getOrThrow<MailConfig>('mail').appUrl.replace(/\/$/, '');
  }

  /**
   * Telling the other agency something happened.
   *
   * Never awaited into the response: the thing the caller asked for has already been
   * recorded, and an agency whose contact address bounces must not see their own reply
   * fail. Read through the tenant client, which admits this row to both parties.
   */
  private async notifyOther(
    id: string,
    actingAgencyId: string,
    what: 'accepted' | 'declined' | 'message',
  ): Promise<void> {
    try {
      const request = await this.prisma.client.coBrokerageRequest.findUnique({
        where: { id },
        select: {
          seekingAgencyId: true,
          listing: { select: { city: true, street: true, houseNumber: true } },
          seekingAgency: { select: { name: true, contactEmail: true } },
          holdingAgency: { select: { name: true, contactEmail: true } },
        },
      });
      if (!request) return;

      const weAreSeeker = request.seekingAgencyId === actingAgencyId;
      const them = weAreSeeker ? request.holdingAgency : request.seekingAgency;
      const us = weAreSeeker ? request.seekingAgency : request.holdingAgency;
      if (!them.contactEmail) return;

      const street = [request.listing.street, request.listing.houseNumber]
        .filter(Boolean)
        .join(' ');

      await this.mail.send({
        to: them.contactEmail,
        ...coBrokerageUpdateTemplate({
          fromAgency: us.name,
          property: [street, request.listing.city].filter(Boolean).join(', ') || 'נכס',
          what,
          appUrl: this.appUrl,
        }),
      });
    } catch (error) {
      this.logger.warn(`Could not notify the other agency: ${(error as Error).message}`);
    }
  }

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

  /**
   * How far the deal has got.
   *
   * Either side may move it, because it is the deal's stage and not one agency's view
   * of it — the agent who books the viewing is as likely to be either of them. Only
   * once they have agreed: before that there is nothing to be at a stage of.
   */
  async setStage(id: string, stage: CoBrokerageStageValue) {
    this.assertCanWrite();
    const request = await this.party(id);

    if (request.status !== 'accepted') {
      throw new BadRequestException('אפשר לעדכן שלב רק אחרי שהבקשה אושרה.');
    }

    const select = request.seekingAgencyId === this.context.requireAgencyId()
      ? SEEKER_SELECT
      : HOLDER_SELECT;

    return this.prisma.client.coBrokerageRequest.update({
      where: { id },
      data: { stage },
      select,
    });
  }

  /**
   * Something one side wants to say to the other.
   *
   * Kept beside the deal rather than left to WhatsApp, so that "what did we agree about
   * the commission" has an answer six weeks later that neither agency can edit.
   */
  async postMessage(id: string, body: string) {
    this.assertCanWrite();
    const agencyId = this.context.requireAgencyId();
    const request = await this.party(id);

    const text = body.trim();
    if (text === '') throw new BadRequestException('אי אפשר לשלוח הודעה ריקה.');

    if (request.status === 'declined' || request.status === 'withdrawn') {
      // Not a thread to carry on: one side said no, and a message after that is a
      // notification nobody asked for.
      throw new BadRequestException('הבקשה נסגרה, אי אפשר להוסיף הודעות.');
    }

    await this.prisma.client.coBrokerageMessage.create({
      data: {
        requestId: id,
        agencyId,
        authorId: this.context.getPrincipal()?.userId ?? null,
        body: text,
      },
      select: { id: true },
    });

    // Writing counts as reading: nobody comes back to a thread they just posted in and
    // expects to be told there is something new.
    const mine = request.seekingAgencyId === agencyId;
    await this.prisma.client.coBrokerageRequest.update({
      where: { id },
      data: mine ? { seekerReadAt: new Date() } : { holderReadAt: new Date() },
    });

    void this.notifyOther(id, agencyId, 'message');

    return this.oneFor(id, agencyId);
  }

  /** Opening the thread. */
  async markRead(id: string) {
    const agencyId = this.context.requireAgencyId();
    const request = await this.party(id);

    await this.prisma.client.coBrokerageRequest.update({
      where: { id },
      data:
        request.seekingAgencyId === agencyId
          ? { seekerReadAt: new Date() }
          : { holderReadAt: new Date() },
    });

    return this.oneFor(id, agencyId);
  }

  /** One request, through whichever projection the caller is entitled to. */
  private async oneFor(id: string, agencyId: string) {
    const request = await this.prisma.client.coBrokerageRequest.findUnique({
      where: { id },
      select: { seekingAgencyId: true },
    });

    return this.prisma.client.coBrokerageRequest.findUniqueOrThrow({
      where: { id },
      select: request?.seekingAgencyId === agencyId ? SEEKER_SELECT : HOLDER_SELECT,
    });
  }

  /**
   * The row, and the caller's standing in it.
   *
   * The tenant policy already refuses a request neither of whose agencies is ours, so
   * "not found" here means exactly that rather than hiding a permission error.
   */
  private async party(id: string) {
    const request = await this.prisma.client.coBrokerageRequest.findUnique({
      where: { id },
      select: { id: true, status: true, seekingAgencyId: true, holdingAgencyId: true },
    });
    if (!request) throw new NotFoundException('הבקשה לא נמצאה.');
    return request;
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

    const updated = await this.prisma.client.coBrokerageRequest.update({
      where: { id },
      data: {
        status: accept ? 'accepted' : 'declined',
        // A deal starts where it starts. Null on a refusal: there is no stage to be at.
        stage: accept ? 'agreed' : null,
        respondedAt: new Date(),
        respondedById: this.context.getPrincipal()?.userId ?? null,
      },
      select: HOLDER_SELECT,
    });

    void this.notifyOther(id, agencyId, accept ? 'accepted' : 'declined');

    return updated;
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

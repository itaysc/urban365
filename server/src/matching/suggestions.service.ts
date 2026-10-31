import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { can } from '../auth/permissions.js';
import { addressOf } from '../calendar/address.js';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { DraftService } from './draft.service.js';

const SELECT = {
  id: true,
  kind: true,
  status: true,
  score: true,
  reason: true,
  createdAt: true,
  ownerId: true,
  draft: true,
  draftAt: true,
  customer: { select: { id: true, name: true, phone: true } },
  listing: {
    select: {
      id: true,
      city: true,
      street: true,
      houseNumber: true,
      rooms: true,
      price: true,
      squareMeter: true,
      coverImageUrl: true,
    },
  },
  owner: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.SuggestionSelect;

/**
 * What the radar shows, and what happens when somebody answers it.
 *
 * On the tenant client throughout, so the agency scoping is the database's. The sweep
 * that *writes* these runs on the owner client because it has no session — the two
 * halves are deliberately different, and this is the half a person touches.
 */
@Injectable()
export class SuggestionsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
    private readonly drafts: DraftService,
  ) {}

  /** The open ones, strongest first. */
  async list(ownerId?: string) {
    const agencyId = this.context.requireAgencyId();

    return this.prisma.client.suggestion.findMany({
      where: { agencyId, status: 'open', ...this.whose(ownerId) },
      // `id` last so two with the same score cannot swap places between requests.
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: 50,
      select: SELECT,
    });
  }

  /**
   * Writes the message an agent would send about this match, and keeps it.
   *
   * Overwrites on purpose when called again: the button says "write another one", and
   * somebody pressing it has decided they do not want the one they have. What it never
   * does is write one on its own — a draft appears because a person asked for it, and
   * goes nowhere until that person sends it.
   */
  async draft(id: string) {
    if (!can(this.context.getPrincipal(), 'lead:write')) {
      throw new ForbiddenException('אין לך הרשאה לכתוב הודעות.');
    }

    const suggestion = await this.prisma.client.suggestion.findUnique({
      where: { id },
      select: {
        id: true,
        reason: true,
        customer: { select: { name: true } },
        listing: {
          select: {
            city: true,
            street: true,
            houseNumber: true,
            rooms: true,
            price: true,
            squareMeter: true,
            propertyType: true,
          },
        },
        agency: { select: { name: true } },
      },
    });
    if (!suggestion) throw new NotFoundException('ההצעה לא נמצאה.');

    // A message needs somebody to write to and something to write about. Neither is
    // guaranteed: both subjects cascade, and a kind added later may use only one.
    if (!suggestion.customer || !suggestion.listing) {
      throw new BadRequestException('אין מספיק פרטים כדי לכתוב הודעה.');
    }

    const me = await this.prisma.client.user.findUnique({
      where: { id: this.context.getPrincipal()?.userId ?? '' },
      select: { firstName: true },
    });

    const text = await this.drafts.write({
      agentName: me?.firstName ?? '',
      agencyName: suggestion.agency.name,
      customerFirstName: suggestion.customer.name.split(' ')[0],
      address: addressOf(suggestion.listing),
      rooms: suggestion.listing.rooms,
      price: suggestion.listing.price,
      squareMeter: suggestion.listing.squareMeter,
      propertyType: suggestion.listing.propertyType,
      reason: suggestion.reason,
    });

    return this.prisma.client.suggestion.update({
      where: { id },
      data: { draft: text, draftAt: new Date() },
      select: SELECT,
    });
  }

  /**
   * What the agent made of it after editing.
   *
   * Saved separately from writing one, because the two are different acts: the model
   * proposes and the person decides, and a person's wording must survive the next time
   * somebody presses the button by accident.
   */
  async saveDraft(id: string, text: string) {
    if (!can(this.context.getPrincipal(), 'lead:write')) {
      throw new ForbiddenException('אין לך הרשאה לערוך הודעות.');
    }

    const existing = await this.prisma.client.suggestion.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('ההצעה לא נמצאה.');

    return this.prisma.client.suggestion.update({
      where: { id },
      data: { draft: text.trim() === '' ? null : text.trim(), draftAt: new Date() },
      select: SELECT,
    });
  }

  /** Acted on. Kept rather than deleted, so "what did we do about it" has an answer. */
  async markDone(id: string) {
    return this.close(id, 'done');
  }

  /**
   * Not interested.
   *
   * The row stays, and the sweep's `skipDuplicates` is what makes that stick: the same
   * observation tomorrow finds this row and writes nothing. Deleting it would raise the
   * suggestion again every night, which is how people learn to ignore a feature.
   */
  async dismiss(id: string) {
    return this.close(id, 'dismissed');
  }

  private async close(id: string, status: 'done' | 'dismissed') {
    if (!can(this.context.getPrincipal(), 'lead:write')) {
      throw new ForbiddenException('אין לך הרשאה לעדכן הצעות.');
    }

    const existing = await this.prisma.client.suggestion.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('ההצעה לא נמצאה.');

    return this.prisma.client.suggestion.update({
      where: { id },
      data: { status, actedAt: new Date() },
      select: SELECT,
    });
  }

  /**
   * Whose opportunities the caller is allowed to be looking at.
   *
   * Same rule as the diary: your own and the agency's unclaimed ones by default, the
   * whole team's only for an owner. A suggestion names a customer and what they can
   * afford, which is not something one agent is owed about another's client.
   */
  private whose(ownerId: string | undefined): Prisma.SuggestionWhereInput {
    const me = this.context.getPrincipal()?.userId ?? '';

    if (!ownerId) return { OR: [{ ownerId: me }, { ownerId: null }] };

    if (!can(this.context.getPrincipal(), 'lead:read-all')) {
      throw new ForbiddenException('רק בעלים של הסוכנות יכול לראות את ההצעות של הצוות.');
    }

    return ownerId === 'all' ? {} : { ownerId };
  }
}

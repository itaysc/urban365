import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { can } from '../auth/permissions.js';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';

const SELECT = {
  id: true,
  kind: true,
  status: true,
  score: true,
  reason: true,
  createdAt: true,
  ownerId: true,
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

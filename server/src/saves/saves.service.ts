import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The cookie naming a browser that has saved something without an account.
 *
 * Lives here rather than with the auth cookies: it is not a session, it grants nothing,
 * and it is issued by the save route rather than by signing in.
 */
export const VISITOR_COOKIE = 'nadlan_visitor';

/** Who a save belongs to: an account, or a browser that has not made one. */
export type SaveOwner =
  | { kind: 'profile'; profileId: string }
  | { kind: 'visitor'; visitorId: string };

const where = (owner: SaveOwner, listingId?: string) => ({
  ...(owner.kind === 'profile' ? { profileId: owner.profileId } : { visitorId: owner.visitorId }),
  ...(listingId ? { listingId } : {}),
});

/**
 * Saving a listing, whether or not there is an account behind it.
 *
 * On the owner client. A signed-out visitor has no tenant context, so the `savedlisting_own`
 * policy — which compares against the signed-in user's profile — would refuse every
 * anonymous row. The scoping is therefore the application's job here, and the only thing
 * standing between one visitor and another's list is that the id is an unguessable
 * random value held in an httpOnly cookie.
 */
@Injectable()
export class SavesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The profile for a signed-in user, created on first use. */
  async profileFor(userId: string): Promise<SaveOwner> {
    const profile = await this.prisma.buyerProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
    return { kind: 'profile', profileId: profile.id };
  }

  /** The browser behind this cookie, if it is one we issued and have not already merged. */
  async existingVisitor(
    id: string | undefined,
  ): Promise<Extract<SaveOwner, { kind: 'visitor' }> | null> {
    if (!id) return null;
    const visitor = await this.prisma.visitor.findUnique({
      where: { id },
      select: { id: true, mergedIntoProfileId: true },
    });
    // A merged visitor is spent: its saves now belong to an account, and letting the
    // same cookie start a second collection would hide them from the person who made them.
    if (!visitor || visitor.mergedIntoProfileId) return null;
    return { kind: 'visitor', visitorId: visitor.id };
  }

  async newVisitor(): Promise<Extract<SaveOwner, { kind: 'visitor' }>> {
    const visitor = await this.prisma.visitor.create({ data: {}, select: { id: true } });
    return { kind: 'visitor', visitorId: visitor.id };
  }

  async save(owner: SaveOwner, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      // Only a published listing can be saved; an id guessed from elsewhere is not a
      // shortcut to confirming that a draft exists.
      where: { id: listingId, status: 'published', delistedAt: null },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException('הנכס לא נמצא.');

    // Saving something already saved is not an error and must not double the count, so
    // the count only moves when a row was actually created.
    const existing = await this.prisma.savedListing.findFirst({
      where: where(owner, listing.id),
      select: { id: true },
    });
    if (existing) return { saved: true, savedCount: await this.countFor(listing.id) };

    const [, updated] = await this.prisma.$transaction([
      this.prisma.savedListing.create({ data: { ...where(owner), listingId: listing.id } }),
      this.prisma.listing.update({
        where: { id: listing.id },
        data: { savedCount: { increment: 1 } },
        select: { savedCount: true },
      }),
    ]);

    return { saved: true, savedCount: updated.savedCount };
  }

  async unsave(owner: SaveOwner, listingId: string) {
    const { count } = await this.prisma.savedListing.deleteMany({ where: where(owner, listingId) });
    if (count === 0) return { saved: false, savedCount: await this.countFor(listingId) };

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      // Floored, so a count that has drifted cannot go negative and sit there as a
      // permanent `-1` on a card.
      data: { savedCount: { decrement: 1 } },
      select: { savedCount: true },
    });

    if (updated.savedCount < 0) {
      await this.prisma.listing.update({ where: { id: listingId }, data: { savedCount: 0 } });
      return { saved: false, savedCount: 0 };
    }

    return { saved: false, savedCount: updated.savedCount };
  }

  /** How many, for the badge in the header — no listing payload needed for a number. */
  totalFor(owner: SaveOwner): Promise<number> {
    return this.prisma.savedListing.count({ where: where(owner) });
  }

  /** Everything this owner has saved, newest first. */
  async listIds(owner: SaveOwner): Promise<string[]> {
    const rows = await this.prisma.savedListing.findMany({
      where: where(owner),
      select: { listingId: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((row) => row.listingId);
  }

  /** Which of these the owner has saved — one query for a whole page of results. */
  async savedAmong(owner: SaveOwner | null, listingIds: string[]): Promise<string[]> {
    if (!owner || listingIds.length === 0) return [];

    const rows = await this.prisma.savedListing.findMany({
      where: { ...where(owner), listingId: { in: listingIds } },
      select: { listingId: true },
    });
    return rows.map((row) => row.listingId);
  }

  /**
   * Moves a browser's saves onto an account, on sign-in or signup.
   *
   * Someone who saved four listings and then made an account expects to find four
   * listings. Anything already saved on the account is skipped rather than duplicated,
   * and the counts are left alone for those — the same person saving the same listing
   * twice is one save, not two.
   */
  async mergeVisitorInto(visitorId: string, profileId: string): Promise<number> {
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: visitorId },
      select: { id: true, mergedIntoProfileId: true },
    });
    if (!visitor || visitor.mergedIntoProfileId) return 0;

    const [anonymous, already] = await Promise.all([
      this.prisma.savedListing.findMany({ where: { visitorId }, select: { listingId: true, note: true } }),
      this.prisma.savedListing.findMany({ where: { profileId }, select: { listingId: true } }),
    ]);

    const have = new Set(already.map((row) => row.listingId));
    const toMove = anonymous.filter((row) => !have.has(row.listingId));

    await this.prisma.$transaction([
      ...toMove.map((row) =>
        this.prisma.savedListing.create({
          data: { profileId, listingId: row.listingId, note: row.note },
        }),
      ),
      // The visitor's own rows go, so the listing counts do not double-count one person.
      this.prisma.savedListing.deleteMany({ where: { visitorId } }),
      this.prisma.visitor.update({
        where: { id: visitorId },
        data: { mergedIntoProfileId: profileId },
      }),
    ]);

    // Only the ones that did not move change a count: the rest were already counted
    // against this listing by this same person.
    const duplicated = anonymous.length - toMove.length;
    if (duplicated > 0) {
      const ids = anonymous.filter((row) => have.has(row.listingId)).map((row) => row.listingId);
      await this.prisma.listing.updateMany({
        where: { id: { in: ids } },
        data: { savedCount: { decrement: 1 } },
      });
    }

    return toMove.length;
  }

  private async countFor(listingId: string): Promise<number> {
    const row = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { savedCount: true },
    });
    return row?.savedCount ?? 0;
  }
}

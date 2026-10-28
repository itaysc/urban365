import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import type { SaveListingDto, UpdateBuyerProfileDto } from './dto/buyer.dto.js';

/** What a saved listing shows on the shortlist — enough for a card, nothing more. */
const SAVED_SELECT = {
  id: true,
  note: true,
  createdAt: true,
  listing: {
    select: {
      id: true,
      price: true,
      rooms: true,
      squareMeter: true,
      city: true,
      street: true,
      propertyType: true,
      coverImageUrl: true,
      status: true,
      delistedAt: true,
      agency: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.SavedListingSelect;

@Injectable()
export class BuyerService {
  private readonly logger = new Logger(BuyerService.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    /** Creating the profile row happens before any buyer context exists to scope it. */
    private readonly owner: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  private requireUserId(): string {
    const principal = this.context.getPrincipal();
    if (!principal) throw new ForbiddenException('נדרשת התחברות.');
    return principal.userId;
  }

  /**
   * The profile, created on first use rather than at signup.
   *
   * An agency member who starts saving listings gets one too — the account types are a
   * statement of intent, not a wall, and an agent looking for their own home is an
   * ordinary thing.
   */
  async profile() {
    const userId = this.requireUserId();

    const existing = await this.prisma.client.buyerProfile.findUnique({ where: { userId } });
    if (existing) return existing;

    // Owner client: the row does not exist yet, so the policy that scopes reads to its
    // owner has nothing to match on.
    return this.owner.buyerProfile.create({ data: { userId } });
  }

  async updateProfile(dto: UpdateBuyerProfileDto) {
    const profile = await this.profile();

    return this.prisma.client.buyerProfile.update({
      where: { id: profile.id },
      data: {
        ...(dto.searchNotes !== undefined ? { searchNotes: dto.searchNotes.trim() || null } : {}),
        ...(dto.notifyOnPriceDrop !== undefined ? { notifyOnPriceDrop: dto.notifyOnPriceDrop } : {}),
        ...(dto.notifyOnNewMatches !== undefined ? { notifyOnNewMatches: dto.notifyOnNewMatches } : {}),
        ...(dto.weeklyDigest !== undefined ? { weeklyDigest: dto.weeklyDigest } : {}),
      },
    });
  }

  // ── saved listings ──────────────────────────────────────────────────────────

  async savedListings() {
    const profile = await this.profile();

    const items = await this.prisma.client.savedListing.findMany({
      where: { profileId: profile.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: SAVED_SELECT,
    });

    // A listing can be unpublished or delisted after it was saved. It stays on the
    // shortlist — "the one that got away" is information — but it is marked, rather
    // than silently disappearing or appearing to be still available.
    return items.map((item) => ({
      ...item,
      unavailable: item.listing.status !== 'published' || item.listing.delistedAt !== null,
    }));
  }

  async save(dto: SaveListingDto) {
    const profile = await this.profile();

    // Only a published listing can be saved; an id guessed from elsewhere is not a
    // shortcut to confirming that a draft exists.
    const listing = await this.prisma.client.listing.findFirst({
      where: { id: dto.listingId, status: 'published', delistedAt: null },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException('הנכס לא נמצא.');

    // `upsert`, not create-and-catch. Every authenticated request runs inside the one
    // transaction the tenant interceptor opened, so a unique violation aborts it —
    // Postgres then refuses every later statement with 25P02, including the recovery
    // read. One statement that cannot fail is the only shape that works here.
    //
    // Saving an already-saved listing updates the note when one is given and otherwise
    // leaves it alone, which is what "save again" should do.
    return this.prisma.client.savedListing.upsert({
      where: { profileId_listingId: { profileId: profile.id, listingId: listing.id } },
      create: { profileId: profile.id, listingId: listing.id, note: dto.note?.trim() || null },
      update: dto.note === undefined ? {} : { note: dto.note.trim() || null },
      select: SAVED_SELECT,
    });
  }

  async unsave(listingId: string) {
    const profile = await this.profile();

    const { count } = await this.prisma.client.savedListing.deleteMany({
      where: { profileId: profile.id, listingId },
    });

    if (count === 0) throw new NotFoundException('הנכס אינו ברשימה שלך.');
    return { removed: true };
  }

  async setNote(listingId: string, note: string | undefined) {
    const profile = await this.profile();

    const { count } = await this.prisma.client.savedListing.updateMany({
      where: { profileId: profile.id, listingId },
      data: { note: note?.trim() || null },
    });

    if (count === 0) throw new NotFoundException('הנכס אינו ברשימה שלך.');
    return this.prisma.client.savedListing.findFirst({
      where: { profileId: profile.id, listingId },
      select: SAVED_SELECT,
    });
  }

  /**
   * Which of these listings the caller has saved, for the heart on a search result.
   * One query for the whole page rather than one per card.
   */
  async savedIdsAmong(listingIds: string[]): Promise<string[]> {
    if (listingIds.length === 0) return [];
    if (!this.context.getPrincipal()) return [];

    const profile = await this.prisma.client.buyerProfile.findUnique({
      where: { userId: this.requireUserId() },
      select: { id: true },
    });
    if (!profile) return [];

    const rows = await this.prisma.client.savedListing.findMany({
      where: { profileId: profile.id, listingId: { in: listingIds } },
      select: { listingId: true },
    });

    return rows.map((r) => r.listingId);
  }

  /** Guards the endpoints that only make sense once a buyer exists. */
  assertNotEmpty(ids: string[]): void {
    if (ids.length > 200) throw new BadRequestException('יותר מדי נכסים בבקשה אחת.');
  }
}

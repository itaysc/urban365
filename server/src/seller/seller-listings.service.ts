import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { GeocodeService } from '../geocode/geocode.service.js';
import { StorageService } from '../storage/storage.service.js';
import { listingImageUrl } from '../agency/image-url.js';
import { ListingReviewService } from '../moderation/listing-review.service.js';
import type { CreateSellerListingDto, SellerListingDto } from './dto/seller-listing.dto.js';

/** Ten, as asked. A private sale is one property, not a portfolio. */
const MAX_IMAGES = 10;

/**
 * How sure the model has to be before a listing is held back.
 *
 * A hesitant "this might be spam" is not enough to hide somebody's flat. Set where a
 * confident objection still lands but an unsure one does not.
 */
const FLAG_CONFIDENCE = 60;

const DETAIL = {
  include: { images: { orderBy: { position: 'asc' } } },
} as const;

/**
 * A person selling their own property.
 *
 * On the owner client, scoped by `ownerUserId` in every query. A private seller has no
 * agency, so there is no tenant context for row-level security to work from — the
 * scoping is the application's here, and every method that touches a listing goes
 * through `requireOwn` so there is one place to get it right.
 */
@Injectable()
export class SellerListingsService {
  private readonly logger = new Logger(SellerListingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocode: GeocodeService,
    private readonly storage: StorageService,
    private readonly review: ListingReviewService,
  ) {}

  list(userId: string) {
    return this.prisma.listing.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'desc' },
      ...DETAIL,
    });
  }

  async byId(userId: string, id: string) {
    return this.requireOwn(userId, id);
  }

  async create(userId: string, dto: CreateSellerListingDto) {
    // `acceptedTerms` is a claim made on the way in, not a column — it has done its job
    // by the time validation passed. `images` is not a column either, and a stray key
    // reaching Prisma is an error rather than something it ignores.
    const { images: _images, acceptedTerms: _accepted, ...fields } = dto as CreateSellerListingDto & {
      images?: unknown;
    };

    return this.prisma.listing.create({
      data: {
        ...fields,
        ownerUserId: userId,
        // `createdBy` is what `phoneFor` reads, and for a private sale the seller's own
        // number is the only one there is.
        createdByUserId: userId,
        source: 'manual',
        // A draft. The form uploads the photos next and publishes once they have
        // landed, so a flat is never on the market for the minutes it takes to send ten
        // pictures — which is the worst moment for it to be seen, since a listing with
        // no photo is the one nobody opens.
        //
        // `listingimage_owner_read` is what makes this work: the seller can see their
        // own photos while the listing is still a draft.
        status: 'draft',
        hasFullDetails: true,
        ...(await this.locate(dto)),
        ...this.pricePerSquareMeter(dto),
      },
      ...DETAIL,
    });
  }

  async update(userId: string, id: string, dto: SellerListingDto) {
    await this.requireOwn(userId, id);

    return this.prisma.listing.update({
      where: { id },
      data: {
        ...dto,
        ...(await this.locate(dto)),
        ...this.pricePerSquareMeter(dto),
      },
      ...DETAIL,
    });
  }

  /**
   * Taken off the market rather than deleted: the engagement figures and any enquiries
   * it produced still refer to it, and a seller who relists next month should not have
   * started from nothing.
   */
  async archive(userId: string, id: string) {
    await this.requireOwn(userId, id);
    await this.prisma.listing.update({
      where: { id },
      data: { status: 'archived', delistedAt: new Date() },
    });
    return { archived: true };
  }

  /**
   * Put it on the market: the last step of publishing a new listing, and the way back
   * for one that was taken down.
   *
   * This is also the gate. A private seller's listing is read for spam here rather than
   * at creation, because here it is finished — the description is written, the photos
   * are up, and this is the last moment before strangers see it. One flagged listing
   * stays a draft: saved, with the reason, and shown to nobody.
   *
   * `publishedAt` is only set the first time. It is when the flat first went on sale,
   * which is what the age of a listing means to a buyer — relisting next month does not
   * make it new.
   */
  async publish(userId: string, id: string): Promise<{ published: boolean }> {
    const listing = await this.requireOwn(userId, id);

    const verdict = await this.review.review(listing);

    // A verdict is needed to flag. No verdict — no key, a timeout, an unreadable reply
    // — publishes, because refusing a real seller is the worse mistake and a person can
    // still take a listing down afterwards.
    const flagged = verdict !== null && !verdict.legit && verdict.confidence >= FLAG_CONFIDENCE;

    await this.prisma.listing.update({
      where: { id },
      data: {
        ...(flagged
          ? {}
          : { status: 'published', delistedAt: null, publishedAt: listing.publishedAt ?? new Date() }),
        ...(verdict
          ? {
              reviewStatus: flagged ? ('flagged' as const) : ('clean' as const),
              reviewReason: verdict.reason || null,
              reviewConfidence: verdict.confidence,
              reviewedAt: new Date(),
            }
          : {}),
      },
    });

    if (flagged) {
      this.logger.warn(`Listing ${id} flagged (${verdict.confidence}): ${verdict.reason}`);
    }

    return { published: !flagged };
  }

  // ── images ──────────────────────────────────────────────────────────────────

  /**
   * `position` is the slot the uploader intends this photo to take.
   *
   * Sent by the form because a new listing's photos are uploaded together, and a
   * position derived here from how many rows exist would be the same number for all of
   * them — every one claiming to be first, and the cover decided by whichever insert
   * happened to win. The seller chose an order; this is how it survives the journey.
   */
  async addImage(
    userId: string,
    listingId: string,
    file: { buffer: Buffer },
    position?: number,
  ) {
    const listing = await this.requireOwn(userId, listingId);

    const slot = Number.isInteger(position) && position! >= 0 ? position! : listing.images.length;

    if (listing.images.length >= MAX_IMAGES || slot >= MAX_IMAGES) {
      throw new BadRequestException(`אפשר להעלות עד ${MAX_IMAGES} תמונות לנכס.`);
    }

    // The declared Content-Type comes from the uploader, so the bytes decide.
    const contentType = this.storage.detectImageType(file.buffer);
    if (!contentType || !this.storage.extensionFor(contentType)) {
      throw new BadRequestException('הקובץ אינו תמונה נתמכת.');
    }

    const storageKey = await this.storage.putObject(`listings/${listing.id}`, file.buffer, contentType);

    const image = await this.prisma.listingImage.create({
      data: {
        listingId: listing.id,
        storageKey,
        url: listingImageUrl(''),
        position: slot,
      },
    });

    // The public path contains the row id, which only exists after the insert.
    const withUrl = await this.prisma.listingImage.update({
      where: { id: image.id },
      data: { url: listingImageUrl(image.id) },
    });

    await this.syncImageColumns(listing.id);
    return withUrl;
  }

  async removeImage(userId: string, listingId: string, imageId: string) {
    await this.requireOwn(userId, listingId);

    const image = await this.prisma.listingImage.findFirst({
      where: { id: imageId, listingId },
      select: { id: true, storageKey: true },
    });
    if (!image) throw new NotFoundException('התמונה לא נמצאה.');

    await this.prisma.listingImage.delete({ where: { id: image.id } });
    // The row is what the listing shows, so it goes first; a stray object costs
    // storage, a stray row shows a broken picture.
    await this.storage.deleteObject(image.storageKey).catch(() => undefined);

    await this.syncImageColumns(listingId);
    return { removed: true };
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private async requireOwn(userId: string, id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, ownerUserId: userId },
      ...DETAIL,
    });
    // A listing belonging to somebody else is not found, rather than forbidden: the
    // difference would confirm that the id exists.
    if (!listing) throw new NotFoundException('הנכס לא נמצא.');
    return listing;
  }

  /** The cover and the count are columns the search reads; they follow the rows. */
  private async syncImageColumns(listingId: string) {
    const images = await this.prisma.listingImage.findMany({
      where: { listingId },
      orderBy: { position: 'asc' },
      select: { url: true },
    });

    await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        imagesCount: images.length,
        coverImageUrl: images[0]?.url ?? null,
      },
    });
  }

  private pricePerSquareMeter(dto: SellerListingDto) {
    // Kept in step so the "price per m²" sort works for these listings too.
    return dto.price !== undefined && dto.squareMeter
      ? { pricePerSquareMeter: Math.round(dto.price / dto.squareMeter) }
      : {};
  }

  private async locate(dto: SellerListingDto) {
    if (!dto.city) return {};
    const at = await this.geocode.locate({
      city: dto.city,
      street: dto.street,
      houseNumber: dto.houseNumber,
    });
    return at ?? {};
  }
}

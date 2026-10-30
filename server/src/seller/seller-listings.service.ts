import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { GeocodeService } from '../geocode/geocode.service.js';
import { StorageService } from '../storage/storage.service.js';
import { listingImageUrl } from '../agency/image-url.js';
import type { SellerListingDto } from './dto/seller-listing.dto.js';

/** Ten, as asked. A private sale is one property, not a portfolio. */
const MAX_IMAGES = 10;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocode: GeocodeService,
    private readonly storage: StorageService,
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

  async create(userId: string, dto: SellerListingDto) {
    const { images: _images, ...fields } = dto as SellerListingDto & { images?: unknown };

    return this.prisma.listing.create({
      data: {
        ...fields,
        ownerUserId: userId,
        // `createdBy` is what `phoneFor` reads, and for a private sale the seller's own
        // number is the only one there is.
        createdByUserId: userId,
        source: 'manual',
        // Published on creation rather than drafted. A draft's photos are not servable
        // — the image policy only covers published listings — so a draft would show the
        // seller an editor full of broken pictures.
        status: 'published',
        publishedAt: new Date(),
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

  async republish(userId: string, id: string) {
    await this.requireOwn(userId, id);
    await this.prisma.listing.update({
      where: { id },
      data: { status: 'published', delistedAt: null },
    });
    return { archived: false };
  }

  // ── images ──────────────────────────────────────────────────────────────────

  async addImage(userId: string, listingId: string, file: { buffer: Buffer }) {
    const listing = await this.requireOwn(userId, listingId);

    if (listing.images.length >= MAX_IMAGES) {
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
        position: listing.images.length,
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

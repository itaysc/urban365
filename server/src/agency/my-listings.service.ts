import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { GeocodeService } from '../geocode/geocode.service.js';
import { StorageService } from '../storage/storage.service.js';
import { can, mayEditListing } from '../auth/permissions.js';
import { dropColumns, priceChange } from '../listings/price-history.js';
import { EXCLUSIVE_AMENITY } from '../yad2/yad2.transform.js';
import { duplicateWhere, hasEnoughSignal, type DuplicateCandidate } from './duplicate.js';
import { listingImageUrl } from './image-url.js';
import { ListingBillingService } from './listing-billing.service.js';
import type { UpdateListingDto, UpsertListingDto } from './dto/listing.dto.js';

/** Returned to the editor; includes drafts and every image. */
const DETAIL_INCLUDE = {
  images: { orderBy: { position: 'asc' } },
} satisfies Prisma.ListingInclude;

const MAX_IMAGES = 30;

/** What the exclusivity sync needs off the stored row when a PATCH omits either half. */
type ExclusivityState = { amenities: string[]; isExclusive: boolean };

@Injectable()
export class MyListingsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
    private readonly storage: StorageService,
    private readonly geocode: GeocodeService,
    private readonly billing: ListingBillingService,
  ) {}

  private assertCanWrite(): void {
    if (!can(this.context.getPrincipal(), 'listing:write')) {
      throw new ForbiddenException('אין לך הרשאה לערוך נכסים.');
    }
  }

  /**
   * Every read here goes through the tenant client, so RLS has already narrowed the row
   * set to this agency. The explicit `agencyId` is defence in depth, and the reason a
   * miss is a 404 rather than a 403: a listing belonging to someone else should not be
   * distinguishable from one that does not exist.
   */
  private async requireOwn(id: string) {
    const agencyId = this.context.requireAgencyId();
    const listing = await this.prisma.client.listing.findFirst({
      where: { id, agencyId },
      include: DETAIL_INCLUDE,
    });

    if (!listing) throw new NotFoundException('הנכס לא נמצא.');
    return listing;
  }

  /** The whole agency reads every listing; changing one is for whoever created it, or the owner. */
  private async requireEditable(id: string) {
    const listing = await this.requireOwn(id);
    if (!mayEditListing(this.context.getPrincipal(), listing)) {
      throw new ForbiddenException('אפשר לערוך רק נכסים שיצרת.');
    }
    return listing;
  }

  findOne(id: string) {
    return this.requireOwn(id);
  }

  async create(dto: UpsertListingDto) {
    this.assertCanWrite();
    await this.assertNotDuplicate(dto);
    await this.assertSellerIsOurs(dto.sellerCustomerId);
    const principal = this.context.getPrincipal();
    const publishing = dto.status === 'published';
    const charged = await this.billing.chargeForPublication({
      source: 'manual',
      alreadyPublished: false,
      publishing,
    });

    // The extension fills `agencyId` in anyway; it is stated here because Prisma's
    // generated create type requires it. `source: 'manual'` and a null token are what
    // distinguish this from a scraped row for the rest of the system.
    return this.prisma.client.listing.create({
      data: {
        agencyId: this.context.requireAgencyId(),
        ...this.toData(dto),
        // Without this a listing typed in by an agency has no coordinates at all, and
        // never appears on the map — the editor asks for an address, not a point.
        ...(await this.locate(dto)),
        section: dto.section,
        source: 'manual',
        status: dto.status ?? 'draft',
        publishedAt: publishing ? new Date() : null,
        ...(charged ? { creditChargedAt: new Date() } : {}),
        createdByUserId: principal?.userId ?? null,
        hasFullDetails: true,
      },
      include: DETAIL_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateListingDto) {
    this.assertCanWrite();
    const existing = await this.requireEditable(id);
    // Checked against the merged result, not the patch: moving one listing onto
    // another's address is the same collision as creating it there.
    await this.assertNotDuplicate({ ...existing, ...dto }, existing.id);
    await this.assertSellerIsOurs(dto.sellerCustomerId);

    /*
     * The price's own record, kept whichever of the three doors a listing came
     * through — this one, the seller's form, or the scrape. One of them forgetting is
     * how a history quietly stops being one.
     */
    const change = priceChange(existing.id, existing.price, dto.price);
    const at = new Date();
    if (change) {
      await this.prisma.client.listingPriceChange.create({ data: { ...change, changedAt: at } });
    }

    const charged = await this.billing.chargeForPublication({
      source: existing.source,
      alreadyPublished: existing.publishedAt !== null,
      publishing: dto.status === 'published',
    });

    return this.prisma.client.listing.update({
      where: { id: existing.id },
      data: {
        ...this.toData(dto, existing),
        ...(change ? dropColumns(change, at) : {}),
        ...(await this.locate({ ...existing, ...dto })),
        ...(dto.section ? { section: dto.section } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        // Stamped the first time it goes public, and never moved afterwards — it is the
        // listing's age, which unpublishing and republishing should not reset.
        ...(dto.status === 'published' && !existing.publishedAt ? { publishedAt: new Date() } : {}),
        ...(charged ? { creditChargedAt: new Date() } : {}),
      },
      include: DETAIL_INCLUDE,
    });
  }

  /**
   * Coordinates for an address, when there are any to be had.
   *
   * Street-level is a perfectly good answer: a listing with a street and no house
   * number resolves to the street, which is where it is. Returning nothing at all
   * because the number is missing would leave the listing off the map entirely.
   *
   * An address the geocoder cannot place leaves the columns untouched rather than
   * nulling them — a scraped listing may already carry coordinates better than
   * anything an address lookup would produce.
   */
  private async locate(address: {
    city?: string | null;
    street?: string | null;
    houseNumber?: number | null;
  }): Promise<{ latitude: number; longitude: number } | Record<string, never>> {
    if (!address.city) return {};

    const at = await this.geocode.locate({
      city: address.city,
      street: address.street,
      houseNumber: address.houseNumber,
    });

    // `kind` says what was matched. It is not a column, and a write that includes it
    // is rejected outright.
    if (!at) return {};
    return { latitude: at.latitude, longitude: at.longitude };
  }

  /**
   * Archive rather than delete. A listing may be referenced by leads and deals, and the
   * agency's own history is worth more than the row it frees.
   */
  async archive(id: string) {
    this.assertCanWrite();
    const existing = await this.requireEditable(id);

    return this.prisma.client.listing.update({
      where: { id: existing.id },
      data: { status: 'archived' },
      include: DETAIL_INCLUDE,
    });
  }

  // ── images ──────────────────────────────────────────────────────────────────

  /**
   * Takes the bytes, stores them privately, and records the row. The URL handed back is
   * one of ours — a stable path this API serves — so it caches and can be linked,
   * unlike a presigned B2 url that would expire within the week.
   */
  async addImage(listingId: string, file: { buffer: Buffer; mimetype: string }) {
    this.assertCanWrite();
    const listing = await this.requireEditable(listingId);

    if (listing.images.length >= MAX_IMAGES) {
      throw new BadRequestException(`אפשר להעלות עד ${MAX_IMAGES} תמונות לנכס.`);
    }

    // The declared Content-Type comes from the uploader, so the bytes decide.
    const contentType = this.storage.detectImageType(file.buffer);
    if (!contentType || !this.storage.extensionFor(contentType)) {
      throw new BadRequestException('הקובץ אינו תמונה נתמכת.');
    }

    // Prefixed by listing so every object for a listing can be found and removed
    // together, and so one agency's key can never collide with another's.
    const storageKey = await this.storage.putObject(`listings/${listing.id}`, file.buffer, contentType);

    const image = await this.prisma.client.listingImage.create({
      data: {
        listingId: listing.id,
        storageKey,
        url: listingImageUrl(''),
        position: listing.images.length,
      },
    });

    // The public path contains the row id, which only exists after the insert.
    const withUrl = await this.prisma.client.listingImage.update({
      where: { id: image.id },
      data: { url: listingImageUrl(image.id) },
    });

    await this.syncImageColumns(listing.id);
    return withUrl;
  }

  /**
   * The bytes behind a listing image, for the public serve route. Reads through the
   * tenant client so row-level security decides what is visible: images of published
   * listings are public, everything else is the owning agency's alone.
   */
  async readImage(imageId: string) {
    const image = await this.prisma.client.listingImage.findUnique({
      where: { id: imageId },
      select: { storageKey: true },
    });

    if (!image) throw new NotFoundException('התמונה לא נמצאה.');
    return this.storage.getObject(image.storageKey);
  }

  async removeImage(listingId: string, imageId: string) {
    this.assertCanWrite();
    const listing = await this.requireEditable(listingId);

    const image = listing.images.find((i) => i.id === imageId);
    if (!image) throw new NotFoundException('התמונה לא נמצאה.');

    await this.prisma.client.listingImage.delete({ where: { id: image.id } });
    await this.syncImageColumns(listing.id);
    // After the row is gone: an orphaned object costs almost nothing, a failed delete
    // that rolls back the request costs the user their action.
    await this.storage.deleteObject(image.storageKey);

    return this.requireOwn(listing.id);
  }

  async reorderImages(listingId: string, imageIds: string[]) {
    this.assertCanWrite();
    const listing = await this.requireEditable(listingId);

    const known = new Set(listing.images.map((i) => i.id));
    if (imageIds.length !== known.size || imageIds.some((id) => !known.has(id))) {
      throw new BadRequestException('רשימת התמונות אינה תואמת לנכס.');
    }

    // Sequential, not $transaction: an authenticated request is already inside the
    // transaction the tenant interceptor opened, and Prisma will not nest one. These
    // updates are therefore still atomic with the rest of the request.
    for (const [position, id] of imageIds.entries()) {
      await this.prisma.client.listingImage.update({ where: { id }, data: { position } });
    }

    await this.syncImageColumns(listing.id);
    return this.requireOwn(listing.id);
  }

  /**
   * `coverImageUrl` and `imagesCount` are denormalised onto Listing because search reads
   * them on every card and will not join. They are derived, so they are recomputed here
   * rather than patched at each call site.
   */
  private async syncImageColumns(listingId: string): Promise<void> {
    const images = await this.prisma.client.listingImage.findMany({
      where: { listingId },
      orderBy: { position: 'asc' },
      select: { url: true },
    });

    await this.prisma.client.listing.update({
      where: { id: listingId },
      data: {
        coverImageUrl: images[0]?.url ?? null,
        imagesCount: images.length,
        imageUrls: images.map((image) => image.url),
      },
    });
  }

  /**
   * A listing may only point at a customer of the agency that owns the listing.
   *
   * The tenant client is the check: another agency's customer simply is not there to
   * be found, so this reads as "no such customer" rather than as "not yours", which is
   * both true from where the caller is standing and the answer that gives nothing away.
   */
  private async assertSellerIsOurs(sellerCustomerId: string | undefined): Promise<void> {
    if (!sellerCustomerId) return;

    const customer = await this.prisma.client.customer.findUnique({
      where: { id: sellerCustomerId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('הלקוח לא נמצא.');
  }

  /**
   * Shared field mapping. `section` and `status` are handled by the callers; `current`
   * is the stored row on a PATCH, which a create does not have.
   */
  private toData(dto: UpsertListingDto | UpdateListingDto, current?: ExclusivityState) {
    const {
      section: _section,
      status: _status,
      // Not a column — it is the caller's answer to the duplicate prompt, and spreading
      // it into `data` below made Prisma reject the whole create as an unknown argument.
      allowDuplicate: _allowDuplicate,
      // Both are written by `exclusivity` below, which has to see them together.
      isExclusive: _isExclusive,
      amenities,
      tags,
      // `''` from a cleared select is "nobody owns this any more", which is a null
      // column — spread as-is it would be an empty string failing the foreign key.
      sellerCustomerId,
      ...rest
    } = dto;

    return {
      ...rest,
      ...(sellerCustomerId === undefined ? {} : { sellerCustomerId: sellerCustomerId || null }),
      ...this.exclusivity(dto, amenities, current),
      ...(tags ? { tags } : {}),
      // Kept in step so the "price per m²" sort works for manual listings too.
      ...(dto.price !== undefined && dto.squareMeter
        ? { pricePerSquareMeter: Math.round(dto.price / dto.squareMeter) }
        : {}),
    };
  }

  /**
   * Keeps the `isExclusive` column and the בלעדיות label saying the same thing.
   *
   * The column is what the editor sets; the label is what search, the facets and the
   * cards read, and what a yad2 scrape writes for the same property. Deriving both from
   * whichever half the request carried is what lets an exclusive listing created here
   * look identical to a scraped one everywhere downstream.
   *
   * Returns nothing when the request mentioned neither, so a PATCH about the price
   * leaves both alone.
   */
  private exclusivity(
    dto: UpsertListingDto | UpdateListingDto,
    amenities: string[] | undefined,
    current?: ExclusivityState,
  ): { amenities?: string[]; isExclusive?: boolean } {
    if (dto.isExclusive === undefined && amenities === undefined) return {};

    // The toggle wins when it is there; a caller sending the label alone still means it.
    const exclusive = dto.isExclusive ?? amenities!.includes(EXCLUSIVE_AMENITY.label);
    const labels = (amenities ?? current?.amenities ?? []).filter(
      (label) => label !== EXCLUSIVE_AMENITY.label,
    );

    return {
      isExclusive: exclusive,
      amenities: exclusive ? [...labels, EXCLUSIVE_AMENITY.label] : labels,
    };
  }

  /**
   * Refuses a listing that looks like one the agency already has. The response names
   * the existing one so the client can offer to open it, and carries a code the client
   * keys on to offer "add anyway" — which comes back as `allowDuplicate`.
   */
  private async assertNotDuplicate(
    // Not the DTO type: `update` passes the stored row merged with the patch, and a
    // Prisma row carries nulls where a DTO carries undefined.
    candidate: DuplicateCandidate & { allowDuplicate?: boolean },
    excludeId?: string,
  ): Promise<void> {
    if (candidate.allowDuplicate) return;
    if (!hasEnoughSignal(candidate)) return;

    const agencyId = this.context.requireAgencyId();
    const existing = await this.prisma.client.listing.findFirst({
      where: duplicateWhere(candidate, agencyId, excludeId),
      select: { id: true, city: true, street: true, houseNumber: true, rooms: true, squareMeter: true, status: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!existing) return;

    const address = [existing.street, existing.houseNumber].filter(Boolean).join(' ');
    throw new ConflictException({
      code: 'duplicate_listing',
      message: `נראה שכבר קיים נכס כזה ברשימה שלכם${address ? ` (${address}, ${existing.city})` : ''}.`,
      existing,
    });
  }
}

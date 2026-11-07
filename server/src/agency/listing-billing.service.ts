import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ListingSource } from '@prisma/client';
import { can } from '../auth/permissions.js';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { listingPackage, listingPackageCatalog } from './listing-packages.js';

const OUT_OF_CREDITS = {
  code: 'listing_credits',
  message:
    'אין יתרת פרסומים. פרסום בודד עולה 25 ₪, וחבילה מוזילה את המחיר לנכס. הקנייה נמצאת בעמוד הנכסים.',
};

/**
 * The agency's balance of listing credits.
 *
 * Buying a pack records the price and adds the credits in the same request. There
 * is no card charge behind it yet — the order is the receipt, and `LISTING_BILLING`
 * stays off until collecting that price is wired up. With the flag off every
 * method here is a no-op, so publishing stays free.
 */
@Injectable()
export class ListingBillingService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<boolean>('app.listingBilling') === true;
  }

  async summary() {
    if (!this.enabled) {
      return { enabled: false, balance: 0, canPurchase: false, packages: [] };
    }

    const agencyId = this.context.requireAgencyId();
    const agency = await this.prisma.client.agency.findUnique({
      where: { id: agencyId },
      select: { listingCredits: true },
    });

    return {
      enabled: true,
      balance: agency?.listingCredits ?? 0,
      canPurchase: can(this.context.getPrincipal(), 'agency:manage'),
      packages: listingPackageCatalog(),
    };
  }

  /**
   * Spends one credit the first time a listing typed into the app goes public.
   *
   * Returns false when nothing is owed: billing is off, the listing is still a
   * draft, it was already public once, or it arrived from a scrape or an import.
   * The caller stamps `creditChargedAt` only when this returns true, so a later
   * unpublish and republish stays free.
   */
  async chargeForPublication(input: {
    source: ListingSource;
    alreadyPublished: boolean;
    publishing: boolean;
  }): Promise<boolean> {
    if (!this.enabled) return false;
    if (!input.publishing || input.alreadyPublished || input.source !== 'manual') return false;

    const agencyId = this.context.requireAgencyId();
    // One statement, so two publishes at once cannot both spend the last credit.
    const spent = await this.prisma.client.agency.updateMany({
      where: { id: agencyId, listingCredits: { gte: 1 } },
      data: { listingCredits: { decrement: 1 } },
    });

    if (spent.count !== 1) {
      throw new HttpException(OUT_OF_CREDITS, HttpStatus.PAYMENT_REQUIRED);
    }
    return true;
  }

  async purchase(size: number) {
    if (!this.enabled) {
      throw new BadRequestException('הפרסום כרגע ללא תשלום.');
    }
    if (!can(this.context.getPrincipal(), 'agency:manage')) {
      throw new ForbiddenException('רק בעל הסוכנות יכול לקנות חבילת פרסום.');
    }

    const pack = listingPackage(size);
    if (!pack) throw new BadRequestException('אין חבילה בגודל הזה.');

    const agencyId = this.context.requireAgencyId();
    const buyerId = this.context.getPrincipal()?.userId ?? null;

    // The request already runs in one transaction, so a failed receipt puts the
    // credits back. The balance moves first: the receipt is the record of a sale
    // that has already been granted.
    await this.prisma.client.agency.update({
      where: { id: agencyId },
      data: { listingCredits: { increment: pack.size } },
    });
    const order = await this.prisma.client.listingPackageOrder.create({
      data: {
        agencyId,
        size: pack.size,
        unitAgorot: pack.unitAgorot,
        totalAgorot: pack.totalAgorot,
        purchasedById: buyerId,
      },
    });

    const agency = await this.prisma.client.agency.findUnique({
      where: { id: agencyId },
      select: { listingCredits: true },
    });

    return {
      orderId: order.id,
      size: pack.size,
      unitAgorot: pack.unitAgorot,
      totalAgorot: pack.totalAgorot,
      balance: agency?.listingCredits ?? pack.size,
    };
  }
}

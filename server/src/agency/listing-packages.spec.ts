import { HttpException, HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Principal } from '../auth/types/principal.js';
import { listingPackage, listingPackageCatalog } from './listing-packages.js';
import { ListingBillingService } from './listing-billing.service.js';

describe('listing packages', () => {
  it('prices a single listing at 25 shekels', () => {
    expect(listingPackage(1)).toEqual({ size: 1, unitAgorot: 2_500, totalAgorot: 2_500 });
  });

  it('brings the price down as the pack gets larger', () => {
    expect(listingPackage(10)).toMatchObject({ unitAgorot: 2_000, totalAgorot: 20_000 });
    expect(listingPackage(50)).toMatchObject({ unitAgorot: 1_700, totalAgorot: 85_000 });
    expect(listingPackage(100)).toMatchObject({ unitAgorot: 1_500, totalAgorot: 150_000 });
  });

  it('refuses a size that is not for sale', () => {
    expect(listingPackage(0)).toBeNull();
    expect(listingPackage(25)).toBeNull();
  });

  it('offers the four packs, cheapest per listing last', () => {
    expect(listingPackageCatalog().map((pack) => pack.size)).toEqual([1, 10, 50, 100]);
  });
});

describe('listing billing', () => {
  const principal = (role: Principal['role']): Principal => ({
    userId: 'user-1',
    email: 'owner@example.com',
    agencyId: 'agency-1',
    role,
    platformRole: null,
    sessionEpoch: 1,
  });

  function setup(enabled: boolean) {
    const agency = {
      updateMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    };
    const orders = { create: vi.fn() };
    const config = { get: (key: string) => (key === 'app.listingBilling' ? enabled : undefined) };
    const context = {
      requireAgencyId: () => 'agency-1',
      getPrincipal: () => principal('owner'),
    };
    const service = new ListingBillingService(
      config as unknown as ConfigService,
      { client: { agency, listingPackageOrder: orders } } as never,
      context as never,
    );
    return { service, agency, orders, context };
  }

  it('publishes for free while billing is off, and does not touch the balance', async () => {
    const { service, agency } = setup(false);

    await expect(
      service.chargeForPublication({ source: 'manual', alreadyPublished: false, publishing: true }),
    ).resolves.toBe(false);
    expect(agency.updateMany).not.toHaveBeenCalled();
  });

  it('spends one credit the first time a typed-in listing is published', async () => {
    const { service, agency } = setup(true);
    agency.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.chargeForPublication({ source: 'manual', alreadyPublished: false, publishing: true }),
    ).resolves.toBe(true);
    expect(agency.updateMany).toHaveBeenCalledWith({
      where: { id: 'agency-1', listingCredits: { gte: 1 } },
      data: { listingCredits: { decrement: 1 } },
    });
  });

  it('does not charge a draft, a republish, or a listing that was not typed in', async () => {
    const { service, agency } = setup(true);

    await expect(
      service.chargeForPublication({ source: 'manual', alreadyPublished: false, publishing: false }),
    ).resolves.toBe(false);
    await expect(
      service.chargeForPublication({ source: 'manual', alreadyPublished: true, publishing: true }),
    ).resolves.toBe(false);
    await expect(
      service.chargeForPublication({ source: 'yad2', alreadyPublished: false, publishing: true }),
    ).resolves.toBe(false);
    await expect(
      service.chargeForPublication({ source: 'import', alreadyPublished: false, publishing: true }),
    ).resolves.toBe(false);
    expect(agency.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to publish when the balance is empty', async () => {
    const { service, agency } = setup(true);
    agency.updateMany.mockResolvedValue({ count: 0 });

    const error = await service
      .chargeForPublication({ source: 'manual', alreadyPublished: false, publishing: true })
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect((error as HttpException).getResponse()).toMatchObject({ code: 'listing_credits' });
  });

  it('adds the credits and records the price when the owner buys a pack', async () => {
    const { service, agency, orders } = setup(true);
    agency.update.mockResolvedValue({});
    agency.findUnique.mockResolvedValue({ listingCredits: 10 });
    orders.create.mockResolvedValue({ id: 'order-1' });

    await expect(service.purchase(10)).resolves.toEqual({
      orderId: 'order-1',
      size: 10,
      unitAgorot: 2_000,
      totalAgorot: 20_000,
      balance: 10,
    });
    expect(orders.create).toHaveBeenCalledWith({
      data: {
        agencyId: 'agency-1',
        size: 10,
        unitAgorot: 2_000,
        totalAgorot: 20_000,
        purchasedById: 'user-1',
      },
    });
  });

  it('lets only the owner buy', async () => {
    const { service, context, agency } = setup(true);
    context.getPrincipal = () => principal('agent');

    await expect(service.purchase(1)).rejects.toBeInstanceOf(HttpException);
    expect(agency.update).not.toHaveBeenCalled();
  });

  it('hides the packs and reports nothing to buy while billing is off', async () => {
    const { service, agency } = setup(false);

    await expect(service.summary()).resolves.toEqual({
      enabled: false,
      balance: 0,
      canPurchase: false,
      packages: [],
    });
    expect(agency.findUnique).not.toHaveBeenCalled();
  });
});

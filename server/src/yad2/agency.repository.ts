import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Section as DbSection, type Listing } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { listingRowToAsset } from './listing-row.js';
import { EXCLUSIVE_AMENITY, toAgencySummary, toAsset, toTeam } from './yad2.transform.js';
import type { AgencyDump, AgencyResult, Asset, RawListing, Section } from './yad2.types.js';
import { dropColumns, priceChange } from '../listings/price-history.js';

const toDbSection = (section: Section): DbSection => section as DbSection;
const asDate = (v: string | undefined | null): Date | null => (v ? new Date(v) : null);

/**
 * Persists a scrape into Postgres. Everything is keyed on yad2's own identifiers
 * (`customerId` for an agency, `token` for a listing) so re-scraping updates rows in
 * place instead of duplicating them, and history survives.
 */
@Injectable()
export class AgencyRepository {
  private readonly logger = new Logger(AgencyRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Columns for one listing, shared by create and update so the two cannot drift. */
  private listingData(asset: Asset, item: RawListing | null, agencyId: string, section: Section) {
    return {
      agencyId,
      section: toDbSection(section),
      adNumber: asset.adNumber === null ? null : BigInt(asset.adNumber),
      listingUrl: asset.listingUrl,
      price: asset.price,
      priceBeforeDrop: asset.priceBeforeDrop,
      pricePerSquareMeter: asset.pricePerSquareMeter,
      propertyType: asset.propertyType || null,
      propertyGroup: asset.propertyGroup || null,
      propertyCondition: asset.propertyCondition || null,
      rooms: asset.rooms,
      floor: asset.floor,
      buildingTopFloor: asset.buildingTopFloor,
      squareMeter: asset.squareMeter,
      squareMeterBuilt: asset.squareMeterBuilt,
      squareMeterGarden: asset.squareMeterGarden,
      balconiesCount: asset.balconiesCount,
      parkingSpacesCount: asset.parkingSpacesCount,
      city: asset.city || null,
      neighborhood: asset.neighborhood || null,
      street: asset.street || null,
      houseNumber: asset.houseNumber,
      region: asset.region || null,
      area: asset.area || null,
      latitude: asset.latitude,
      longitude: asset.longitude,
      amenities: asset.amenities.filter((a) => a.present).map((a) => a.label),
      // Also a column, because exclusivity is queried on its own. yad2 owns the rows it
      // discovered, so a run that no longer reports it clears the column too.
      isExclusive: asset.amenities.some((a) => a.key === EXCLUSIVE_AMENITY.key && a.present),
      tags: asset.tags,
      description: asset.description || null,
      coverImageUrl: asset.coverImageUrl || null,
      imageUrls: asset.imageUrls,
      imagesCount: asset.imagesCount,
      contactName: asset.contactName || null,
      brokerName: asset.brokerName || null,
      brokerLicenseNumber: asset.brokerLicenseNumber || null,
      hasFullDetails: asset.hasFullDetails,
      raw: (item ?? undefined) as Prisma.InputJsonValue | undefined,
      listedAt: asDate(asset.createdAt),
      updatedAtSource: asDate(asset.updatedAt),
      delistedAt: null,
    };
  }

  /**
   * Writes an agency, its team and its listings in one transaction. Listings that were
   * in the agency's feed before and are gone now are marked delisted rather than
   * deleted, so price history and past inventory stay queryable.
   */
  /**
   * `preserveProfile` is set when an agency imports its *own* yad2 page. The scraper
   * owns these fields for rows it discovered, but an agency that has written its own
   * name and description must not have them overwritten by what yad2 happens to hold.
   * Counts, logo, phone and opening hours still come from yad2 either way.
   */
  async saveDump(
    dump: AgencyDump,
    agencyId: string,
    section: Section,
    opts: { preserveProfile?: boolean } = {},
  ): Promise<void> {
    const summary = toAgencySummary(dump, agencyId, section);
    const team = toTeam(dump);

    const cards = new Map<string, RawListing>();
    for (const c of dump.feed) if (c.token && !cards.has(c.token)) cards.set(c.token, c);
    const details = new Map<string, RawListing>();
    for (const i of dump.items) if (i.token) details.set(i.token, i);

    const assets = [...cards.values()].map((c) => ({
      asset: toAsset(c, details.get(String(c.token)) ?? null),
      item: details.get(String(c.token)) ?? null,
    }));

    await this.prisma.$transaction(async (tx) => {
      const agency = await tx.agency.upsert({
        where: { yad2Id: agencyId },
        create: {
          yad2Id: agencyId,
          name: summary.name,
          licenseNumber: summary.licenseNumber || null,
          phone: summary.phone || null,
          logoUrl: summary.logoUrl || null,
          description: summary.description || null,
          openingHours: summary.openingHours as unknown as Prisma.InputJsonValue,
          assetsForSaleCount: summary.counts.forSale,
          assetsForRentCount: summary.counts.forRent,
          commercialAssetsCount: summary.counts.commercial,
        },
        update: {
          ...(opts.preserveProfile ? {} : { name: summary.name, description: summary.description || null }),
          licenseNumber: summary.licenseNumber || null,
          phone: summary.phone || null,
          logoUrl: summary.logoUrl || null,
          openingHours: summary.openingHours as unknown as Prisma.InputJsonValue,
          assetsForSaleCount: summary.counts.forSale,
          assetsForRentCount: summary.counts.forRent,
          commercialAssetsCount: summary.counts.commercial,
        },
      });

      for (const member of team) {
        const yad2Id = member.id === null ? null : String(member.id);
        const data = {
          name: member.name,
          licenseNumber: member.licenseNumber || null,
          activeAssetsCount: member.activeAssetsCount,
          specialization: member.specialization || null,
          avatarUrl: member.avatarUrl || null,
        };

        // The composite unique needs a yad2 id; the rare broker without one is matched
        // on name instead so repeat scrapes do not pile up duplicates.
        if (yad2Id) {
          await tx.broker.upsert({
            where: { agencyId_yad2Id: { agencyId: agency.id, yad2Id } },
            create: { agencyId: agency.id, yad2Id, ...data },
            update: data,
          });
        } else {
          const existing = await tx.broker.findFirst({ where: { agencyId: agency.id, name: member.name } });
          if (existing) await tx.broker.update({ where: { id: existing.id }, data });
          else await tx.broker.create({ data: { agencyId: agency.id, yad2Id: null, ...data } });
        }
      }

      const now = new Date();

      /*
       * What each of these listings costs today, read before anything is written.
       *
       * One query for the batch rather than one per listing: a feed page is fifty
       * properties and the scrape runs hourly. After the upsert the old price is gone,
       * so this has to happen first — which is the whole reason the loop below cannot
       * simply compare as it goes.
       */
      const tokens = assets.map(({ asset }) => asset.token);
      const before = new Map(
        (
          await tx.listing.findMany({
            where: { token: { in: tokens } },
            select: { id: true, token: true, price: true },
          })
        ).map((row) => [row.token as string, row]),
      );

      for (const { asset, item } of assets) {
        const data = this.listingData(asset, item, agency.id, section);
        const was = before.get(asset.token);
        const change = was ? priceChange(was.id, was.price, data.price) : null;

        await tx.listing.upsert({
          where: { token: asset.token },
          create: { token: asset.token, ...data, firstSeenAt: now, lastSeenAt: now },
          update: {
            ...data,
            lastSeenAt: now,
            ...(change ? dropColumns(change, now) : {}),
          },
        });

        if (change) {
          await tx.listingPriceChange.create({ data: { ...change, changedAt: now } });
        }
      }

      /*
       * A listing we are seeing for the first time gets the price it arrived with as
       * the start of its series. Done after the upsert because that is when it has an
       * id, and only for the ones that were not there before.
       */
      const fresh = await tx.listing.findMany({
        where: { token: { in: tokens.filter((t) => !before.has(t)) }, price: { not: null } },
        select: { id: true, price: true },
      });
      if (fresh.length > 0) {
        await tx.listingPriceChange.createMany({
          data: fresh.map((row) => ({
            listingId: row.id,
            previous: null,
            price: row.price as number,
            changedAt: now,
          })),
        });
      }

      const seen = assets.map(({ asset }) => asset.token);
      const { count: delisted } = await tx.listing.updateMany({
        where: {
          agencyId: agency.id,
          section: toDbSection(section),
          delistedAt: null,
          // Only yad2 rows: a listing the agency created here is not absent from the
          // feed, it was never in it, and must not be delisted by a scrape.
          source: 'yad2',
          token: { notIn: seen.length > 0 ? seen : ['__none__'] },
        },
        data: { delistedAt: now },
      });

      await tx.scrapeRun.create({
        data: {
          agencyId: agency.id,
          section: toDbSection(section),
          cardsFound: dump.feed.length,
          listingsUpserted: assets.length,
          detailsMissing: assets.filter(({ asset }) => !asset.hasFullDetails).length,
          failedTokens: dump.failed,
          finishedAt: now,
        },
      });

      this.logger.log(
        `Saved ${agencyId}/${section}: ${assets.length} listing(s), ${team.length} broker(s)` +
          (delisted > 0 ? `, ${delisted} delisted` : ''),
      );
    });
  }

  /** Rebuilds the API shape from the stored rows. */
  async getAgency(agencyId: string, section: Section): Promise<AgencyResult | null> {
    const agency = await this.prisma.agency.findUnique({
      where: { yad2Id: agencyId },
      include: {
        brokers: { orderBy: { activeAssetsCount: 'desc' } },
        listings: {
          where: { section: toDbSection(section), delistedAt: null },
          orderBy: { lastSeenAt: 'desc' },
        },
        runs: {
          where: { section: toDbSection(section) },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!agency || agency.listings.length === 0) return null;

    const assets = agency.listings.map((l) => listingRowToAsset(l));

    return {
      agency: {
        agencyId: agencyId,
        name: agency.name,
        licenseNumber: agency.licenseNumber ?? '',
        phone: agency.phone ?? '',
        logoUrl: agency.logoUrl ?? '',
        description: agency.description ?? '',
        openingHours: (agency.openingHours ?? []) as AgencyResult['agency']['openingHours'],
        counts: {
          forSale: agency.assetsForSaleCount,
          forRent: agency.assetsForRentCount,
          commercial: agency.commercialAssetsCount,
        },
        agencyUrl: `https://www.yad2.co.il/realestate/agency/${agency.yad2Id}/${section}`,
      },
      team: agency.brokers.map((b) => ({
        id: b.yad2Id === null ? null : Number(b.yad2Id),
        name: b.name,
        licenseNumber: b.licenseNumber ?? '',
        activeAssetsCount: b.activeAssetsCount,
        specialization: b.specialization ?? '',
        avatarUrl: b.avatarUrl ?? '',
      })),
      assets,
      meta: {
        agencyId: agencyId,
        section,
        total: assets.length,
        scrapedAt: (agency.runs[0]?.finishedAt ?? agency.updatedAt).toISOString(),
        source: 'cache',
        listingsWithoutDetails: assets.filter((a) => !a.hasFullDetails).length,
      },
    };
  }

  async listAgencies(): Promise<{ agencyId: string; section: Section; name: string; total: number; scrapedAt: string }[]> {
    const runs = await this.prisma.scrapeRun.findMany({
      orderBy: { startedAt: 'desc' },
      include: { agency: true },
      take: 100,
    });

    const seen = new Set<string>();
    const out: { agencyId: string; section: Section; name: string; total: number; scrapedAt: string }[] = [];
    for (const run of runs) {
      const key = `${run.agency.yad2Id ?? run.agency.id}/${run.section}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        // Only scraped agencies have runs, so yad2Id is always set here.
        agencyId: run.agency.yad2Id ?? run.agency.id,
        section: run.section as Section,
        name: run.agency.name,
        total: run.listingsUpserted,
        scrapedAt: (run.finishedAt ?? run.startedAt).toISOString(),
      });
    }
    return out;
  }
}

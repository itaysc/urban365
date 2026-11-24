import { Injectable } from '@nestjs/common';

import { cellRangeWithin } from '../cadastre/parcel-index.js';
import { cityKey } from '../listings/city-name.js';
import { FROM_A_VISIBLE_AGENCY } from '../listings/on-the-market.js';
import { listingOnStreet, pickStreet } from '../listings/street-match.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { median } from '../seo/stats.js';
import {
  RESIDENTIAL_GROUPS,
  STREET_HISTORY_LIMIT,
  STREET_HISTORY_RADIUS_METRES,
  STREET_HISTORY_YEARS,
  type AskingPrices,
  type RecordedDeal,
} from '../agents/end-user/street-history.js';
import { metresBetween } from './geo.js';
import type { FoundHistory } from './market-history.js';
import { PlaceService } from './place.service.js';

export type HistoryLookup =
  | { status: 'ok'; history: FoundHistory }
  | { status: 'unknown-city' }
  | { status: 'unknown-street'; choices: string[] }
  | { status: 'unplaced'; street: string };

/**
 * Recorded sales around a street, for the history page and for the assistant.
 *
 * The registry has no street names — a sale is a settlement plus a block and parcel —
 * so "what sold on סוקולוב" is "what sold within 300 metres of the point we have for
 * סוקולוב". Same rule the assistant already used; this is that query with a name.
 */
@Injectable()
export class MarketHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly places: PlaceService,
  ) {}

  async forStreet(input: {
    city: string;
    street: string;
    rooms?: number;
    years?: number;
  }): Promise<HistoryLookup> {
    const picked = await this.registeredStreet(input.city, input.street);
    if (!('name' in picked)) return { status: 'unknown-street', choices: picked.choices };

    const place = await this.places.find(input.city);
    if (!place) return { status: 'unknown-city' };

    const point = await this.places.locateStreet(input.city, picked.name);
    if (!point) return { status: 'unplaced', street: picked.name };

    const years = input.years ?? STREET_HISTORY_YEARS;
    const since = new Date();
    since.setUTCFullYear(since.getUTCFullYear() - years);

    const cells = cellRangeWithin(point.latitude, point.longitude, STREET_HISTORY_RADIUS_METRES);
    const latSpan = STREET_HISTORY_RADIUS_METRES / 111_320;
    const lngSpan =
      STREET_HISTORY_RADIUS_METRES / (111_320 * Math.max(0.1, Math.cos((point.latitude * Math.PI) / 180)));

    const rows = await this.prisma.marketDeal.findMany({
      where: {
        settlementCode: place.settlementCode,
        cellLat: { gte: cells.minCellLat, lte: cells.maxCellLat },
        cellLng: { gte: cells.minCellLng, lte: cells.maxCellLng },
        latitude: { gte: point.latitude - latSpan, lte: point.latitude + latSpan },
        longitude: { gte: point.longitude - lngSpan, lte: point.longitude + lngSpan },
        dealDate: { gte: since },
        propertyGroup: { in: [...RESIDENTIAL_GROUPS] },
        inStats: true,
        isFullDeal: true,
        ...(input.rooms !== undefined ? { rooms: input.rooms } : {}),
      },
      orderBy: { dealDate: 'desc' },
      take: STREET_HISTORY_LIMIT,
      select: {
        dealDate: true,
        dealAmount: true,
        rooms: true,
        area: true,
        pricePerSqm: true,
        dealNature: true,
        latitude: true,
        longitude: true,
      },
    });

    const deals: RecordedDeal[] = rows
      .filter(
        (row) =>
          row.latitude !== null &&
          row.longitude !== null &&
          metresBetween(point, { latitude: row.latitude, longitude: row.longitude }) <=
            STREET_HISTORY_RADIUS_METRES,
      )
      .map((row) => ({
        dealDate: row.dealDate,
        amount: Number(row.dealAmount),
        rooms: row.rooms,
        area: row.area,
        pricePerSqm: row.pricePerSqm,
        nature: row.dealNature,
      }));

    const asking = await this.askingOnStreet(place.settlement, input.city, picked.name, input.rooms);

    return {
      status: 'ok',
      history: {
        city: place.settlement,
        street: picked.name,
        years,
        deals,
        truncated: rows.length === STREET_HISTORY_LIMIT,
        ...(input.rooms !== undefined ? { rooms: input.rooms } : {}),
        asking,
      },
    };
  }

  /** The register's spelling of a street someone named. Same test the address box uses. */
  private async registeredStreet(city: string, street: string) {
    const names = await this.prisma.street.findMany({
      where: { cityKey: cityKey(city) },
      select: { name: true },
    });
    return pickStreet(street, names.map((row) => row.name));
  }

  /** Published for-sale listings on this street, matched the way a person names it. */
  private async askingOnStreet(
    settlement: string,
    city: string,
    street: string,
    rooms?: number,
  ): Promise<AskingPrices | null> {
    const cities = [...new Set([settlement.trim(), city.trim()].filter((name) => name.length > 0))];
    const rows = await this.prisma.listing.findMany({
      where: {
        status: 'published',
        delistedAt: null,
        section: 'forsale',
        OR: cities.map((name) => ({ city: { equals: name, mode: 'insensitive' as const } })),
        price: { gt: 0 },
        ...(rooms !== undefined ? { rooms } : {}),
        AND: [FROM_A_VISIBLE_AGENCY],
      },
      select: { street: true, price: true, pricePerSquareMeter: true },
      take: 400,
    });

    const onStreet = rows.filter(
      (row) => row.street && row.price !== null && row.price > 0 && listingOnStreet(row.street, street),
    );
    if (onStreet.length === 0) return null;

    const perSqm = onStreet
      .map((row) => row.pricePerSquareMeter)
      .filter((value): value is number => value !== null && value > 0);
    return {
      count: onStreet.length,
      median: median(onStreet.map((row) => row.price as number)) ?? 0,
      perSqm: perSqm.length > 0 ? median(perSqm) : null,
    };
  }
}

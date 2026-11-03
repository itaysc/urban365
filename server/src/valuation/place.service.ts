import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { cityKey } from '../listings/city-name.js';
import { GeocodeService, type Coordinates } from '../geocode/geocode.service.js';
import { metresBetween } from './geo.js';

/**
 * Where a town is, and what the registry calls it.
 *
 * The valuation needs a point to search around, and the form only has a city name.
 * Geocoding it would mean an outside request per valuation, against a service whose
 * terms allow geocoding on write and not on every read — so the answer comes out of
 * the deals table instead, which already holds a coordinate for every sale in the
 * country.
 *
 * The median rather than the mean: a settlement with one outlying sale on its
 * agricultural edge would otherwise open the map in a field.
 */

export interface Place {
  settlementCode: number;
  settlement: string;
  latitude: number;
  longitude: number;
  /** Recorded sales behind the point — thin towns are worth saying so about. */
  deals: number;
}

/**
 * How far a street may sit from its town's centre before we disbelieve the geocoder.
 *
 * Generous on purpose — Jerusalem is twenty kilometres across — because this is not a
 * precision check. It is there for the one failure that matters: הרצל exists in a
 * hundred towns, and a geocoder that answers with the wrong one would fly the map to
 * another city without saying so.
 */
const MAX_STREET_DRIFT_METRES = 25_000;

/**
 * What the geocoder must not come back with when it was asked for a street.
 *
 * Nominatim answers with its best match and does not say it settled for something
 * broader, so asking for a street it has never heard of can return the town instead.
 * The coordinates look perfectly good — and dropping a pin on a city centre while
 * telling someone it is their street is worse than admitting we could not find it,
 * because the estimate that follows is built around that point.
 *
 * A denylist rather than a list of road types: OSM has dozens of those and gains more,
 * and the only answers worth refusing are the ones that are plainly not a street.
 */
const NOT_A_STREET = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'municipality',
  'suburb',
  'quarter',
  'neighbourhood',
  'borough',
  'district',
  'county',
  'state',
  'region',
  'country',
  'postcode',
]);

@Injectable()
export class PlaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocode: GeocodeService,
  ) {}

  async find(city: string): Promise<Place | null> {
    const key = cityKey(city);
    if (key === '') return null;

    /*
     * Matched on `cityKey`, not on the raw string. OpenStreetMap writes Tel Aviv with
     * a maqaf and an en dash, our listings with spaces, and the Tax Authority with
     * its own spelling again; a direct comparison finds none of them.
     */
    const rows = await this.prisma.$queryRaw<
      { settlementCode: number; settlement: string; lat: number; lng: number; n: bigint }[]
    >`
      SELECT "settlementCode",
             max(settlement) AS "settlement",
             percentile_cont(0.5) WITHIN GROUP (ORDER BY latitude) AS "lat",
             percentile_cont(0.5) WITHIN GROUP (ORDER BY longitude) AS "lng",
             count(*) AS "n"
      FROM "MarketDeal"
      WHERE latitude IS NOT NULL
        AND lower(regexp_replace(regexp_replace(settlement, '[־‐-―-]', ' ', 'g'), '\s+', ' ', 'g')) = ${key}
      GROUP BY "settlementCode"
      ORDER BY count(*) DESC
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return null;

    return {
      settlementCode: row.settlementCode,
      settlement: row.settlement,
      latitude: row.lat,
      longitude: row.lng,
      deals: Number(row.n),
    };
  }

  /**
   * A point on a named street, so the map can open on the right road.
   *
   * The street register has names and no coordinates, and the deals table has
   * coordinates and no street names, so neither can answer this on its own. The
   * geocoder can — and this is the one place in the valuation that is allowed to ask
   * it, under two conditions that together keep it inside the policy that forbids
   * geocoding on read:
   *
   * **Only names already in the register.** A street we do not hold a row for returns
   * null without a request, so a half-typed name never reaches the geocoder and no
   * user-supplied text ever does. The set of possible queries is the 62,000 rows of
   * the Interior Ministry's own file.
   *
   * **Once, ever.** The answer is written back to the row, failures included, so each
   * street costs one request for the lifetime of the database rather than one per
   * valuation. That makes this the same shape as geocoding an office on save, which
   * is the use the policy does allow.
   *
   * It is a convenience and never an input to the estimate: the valuation uses the
   * pin the person drops, so a street placed badly moves the map and nothing else.
   */
  async locateStreet(city: string, street: string): Promise<Coordinates | null> {
    const key = cityKey(city);
    const name = street.trim();
    if (key === '' || name === '') return null;

    const row = await this.prisma.street.findUnique({
      where: { cityKey_name: { cityKey: key, name } },
      select: { id: true, city: true, name: true, latitude: true, longitude: true, locatedAt: true },
    });

    // Not a street we know. No request, and nothing to learn by making one.
    if (!row) return null;

    if (row.locatedAt !== null) {
      return row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : null;
    }

    const found = await this.geocode.locate({ city: row.city, street: row.name });
    const point = found !== null && (await this.isStreet(city, found)) ? found : null;

    await this.prisma.street.update({
      where: { id: row.id },
      data: {
        latitude: point?.latitude ?? null,
        longitude: point?.longitude ?? null,
        locatedAt: new Date(),
      },
    });

    return point;
  }

  /** Is this answer a street, and is it in the town we asked about? */
  private async isStreet(city: string, point: Coordinates): Promise<boolean> {
    if (point.kind !== undefined && NOT_A_STREET.has(point.kind)) return false;

    const place = await this.find(city);

    // No recorded sales to check against. Nothing to contradict, so let it stand.
    if (!place) return true;

    return metresBetween(place, point) <= MAX_STREET_DRIFT_METRES;
  }
}

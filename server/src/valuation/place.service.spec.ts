import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaceService } from './place.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { GeocodeService } from '../geocode/geocode.service.js';

/**
 * These are about {@link PlaceService.locateStreet}, and really about one promise:
 * that the geocoder behind it is asked once per street and never for anything a
 * person typed. That promise is the only reason the valuation form is allowed to use
 * a service whose terms forbid geocoding on read, so it is worth a test each.
 */

const DIZENGOFF = { id: 'street-1', city: 'תל אביב-יפו', name: 'דיזנגוף' };

/** Tel Aviv, roughly, as the deals table would give it. */
const TOWN = [
  { settlementCode: 5000, settlement: 'תל אביב-יפו', lat: 32.08, lng: 34.78, n: 50_000n },
];

function build(row: Record<string, unknown> | null, found: { latitude: number; longitude: number } | null) {
  const findUnique = vi.fn().mockResolvedValue(row);
  const update = vi.fn().mockResolvedValue({});
  const locate = vi.fn().mockResolvedValue(found);

  const prisma = {
    street: { findUnique, update },
    $queryRaw: vi.fn().mockResolvedValue(TOWN),
  } as unknown as PrismaService;

  return {
    service: new PlaceService(prisma, { locate } as unknown as GeocodeService),
    findUnique,
    update,
    locate,
  };
}

describe('locateStreet', () => {
  let point: { latitude: number; longitude: number };

  beforeEach(() => {
    point = { latitude: 32.0754, longitude: 34.7752 };
  });

  /*
   * The gate that matters. `StreetBox` reports every keystroke, so without this a
   * geocoder would see "ד", "די", "דיז" and the rest of someone's typing — which is
   * both the forbidden use and a way to send arbitrary text to a third party.
   */
  it('never asks the geocoder about a name that is not in the register', async () => {
    const { service, locate } = build(null, point);

    expect(await service.locateStreet('תל אביב-יפו', 'דיז')).toBeNull();
    expect(locate).not.toHaveBeenCalled();
  });

  it('asks about a street in the register, and writes the answer down', async () => {
    const { service, locate, update } = build(
      { ...DIZENGOFF, latitude: null, longitude: null, locatedAt: null },
      point,
    );

    expect(await service.locateStreet('תל אביב יפו', 'דיזנגוף')).toEqual(point);
    expect(locate).toHaveBeenCalledWith({ city: DIZENGOFF.city, street: DIZENGOFF.name });
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      data: { latitude: point.latitude, longitude: point.longitude },
    });
  });

  it('answers a street it already knows without asking again', async () => {
    const { service, locate } = build(
      { ...DIZENGOFF, latitude: 32.0754, longitude: 34.7752, locatedAt: new Date() },
      point,
    );

    expect(await service.locateStreet('תל אביב-יפו', 'דיזנגוף')).toEqual(point);
    expect(locate).not.toHaveBeenCalled();
  });

  /*
   * A street the geocoder could not place is a street it still cannot place. Without
   * `locatedAt` standing in for "we tried", every such street would cost a request on
   * every single valuation — the exact pattern the rate limit exists to stop.
   */
  it('does not go back for a street that was already looked for and not found', async () => {
    const { service, locate } = build(
      { ...DIZENGOFF, latitude: null, longitude: null, locatedAt: new Date() },
      point,
    );

    expect(await service.locateStreet('תל אביב-יפו', 'דיזנגוף')).toBeNull();
    expect(locate).not.toHaveBeenCalled();
  });

  /*
   * Nominatim answers with its best match and never says it settled for something
   * broader, so a street it has never heard of comes back as the town — about a third
   * of the Interior Ministry's names are missing from OSM under the spelling the
   * register uses, so this is the common case, not the exotic one.
   */
  it('refuses the town when it asked for a street', () => {
    const { service, update } = build(
      { ...DIZENGOFF, latitude: null, longitude: null, locatedAt: null },
      { latitude: 32.08, longitude: 34.78, kind: 'city' },
    );

    return service.locateStreet('תל אביב-יפו', 'דיזנגוף').then((found) => {
      expect(found).toBeNull();
      expect(update.mock.calls[0]?.[0]).toMatchObject({
        data: { latitude: null, longitude: null },
      });
    });
  });

  it('takes a road, whatever kind of road OSM calls it', async () => {
    const { service } = build(
      { ...DIZENGOFF, latitude: null, longitude: null, locatedAt: null },
      { ...point, kind: 'tertiary' },
    );

    expect(await service.locateStreet('תל אביב-יפו', 'דיזנגוף')).toMatchObject(point);
  });

  /*
   * הרצל is a street in a hundred towns. An answer from the wrong one would fly the
   * map to another city and say nothing about it, so a point nowhere near the town's
   * own sales is treated as no answer — and recorded as such, so it is not retried.
   */
  it('refuses a point that is nowhere near the town', async () => {
    const { service, update } = build(
      { ...DIZENGOFF, latitude: null, longitude: null, locatedAt: null },
      { latitude: 29.55, longitude: 34.95 },
    );

    expect(await service.locateStreet('תל אביב-יפו', 'דיזנגוף')).toBeNull();
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      data: { latitude: null, longitude: null },
    });
  });

  it('wants both a town and a street before it does anything at all', async () => {
    const { service, findUnique } = build(null, point);

    expect(await service.locateStreet('', 'דיזנגוף')).toBeNull();
    expect(await service.locateStreet('תל אביב-יפו', '   ')).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

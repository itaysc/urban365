import { describe, expect, it } from 'vitest';
import { fromMercator, toMercator } from './web-mercator.js';

/**
 * GovMap's own answer for סוקולוב 38 חולון, taken from its autocomplete:
 * `POINT(3870928.84417173 3766290.1908682673)`. Using their number as the fixture
 * rather than coordinates of my own is the whole point — an invented lat/lon would
 * test the formula against itself, and the first version of this test did exactly
 * that and passed nothing.
 */
const GOVMAP_POINT = { x: 3_870_928.844_171_73, y: 3_766_290.190_868_267_3 };

describe('web mercator', () => {
  it('agrees with GovMap on a point GovMap produced', () => {
    const place = fromMercator(GOVMAP_POINT);

    // Holon, which is where that address is. A projection that is subtly wrong lands
    // in the sea or in Jordan rather than erroring, so the sanity check is worth it.
    expect(place.latitude).toBeCloseTo(32.0227, 4);
    expect(place.longitude).toBeCloseTo(34.7731, 4);

    // And back again, to the metre: this is the direction the parcel lookup uses, and
    // a hundred metres out is a different parcel with somebody else's sale prices.
    const back = toMercator(place.latitude, place.longitude);
    expect(back.x).toBeCloseTo(GOVMAP_POINT.x, 3);
    expect(back.y).toBeCloseTo(GOVMAP_POINT.y, 3);
  });

  it('puts the origin at zero', () => {
    const origin = toMercator(0, 0);
    expect(origin.x).toBe(0);
    expect(origin.y).toBeCloseTo(0, 6);
  });

  it('does not produce infinity at the pole', () => {
    // Mercator is undefined at ±90; a corrupt row should not become a request that
    // fails in a way nobody can read.
    expect(Number.isFinite(toMercator(90, 34).y)).toBe(true);
    expect(Number.isFinite(toMercator(-90, 34).y)).toBe(true);
  });
});

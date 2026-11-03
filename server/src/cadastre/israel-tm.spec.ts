import { describe, expect, it } from 'vitest';
import { pointInGeometry } from '../listings/point-in-polygon.js';
import { itmToWgs84 } from './israel-tm.js';

describe('itmToWgs84', () => {
  it('agrees with GovMap about where a parcel is', () => {
    /*
     * A cross-check between two independent government sources, which is the only
     * kind worth having for a projection.
     *
     * The Survey of Israel's parcels layer puts gush 7166 chelka 144 — a parcel in
     * Holon — at ITM (178711.6, 658905.5). GovMap, asked separately about the address
     * סוקולוב 38 חולון, answered with a Web Mercator point that converts to
     * 32.02270, 34.77315 and reported that same gush and chelka.
     *
     * If the projection constants were wrong the result would still look like a
     * plausible coordinate — a few hundred metres out, or in the sea — so "it ran" is
     * no evidence at all. Agreeing with a second source to a few metres is.
     */
    const place = itmToWgs84(178_711.625, 658_905.5);

    // Half a metre, which is as close as two sources' own rounding allows. Loose
    // tolerances here are worthless: the first version of this passed at three
    // decimal places while being 77 m out.
    expect(place.latitude).toBeCloseTo(32.022_595, 5);
    expect(place.longitude).toBeCloseTo(34.773_147, 5);
  });

  it('puts the address inside the parcel it belongs to', () => {
    /*
     * The operation this exists for, end to end. The same parcel's ring, straight
     * out of the shapefile in ITM, converted and then asked the only question the
     * lookup ever asks: is this address on it?
     *
     * A projection can be 70 m out and still produce coordinates that look like
     * Holon. It cannot be 70 m out and still contain the right point — the parcel is
     * 13 m wide.
     */
    const ring = [
      [178_718.0469, 658_889.0],
      [178_705.2031, 658_891.625],
      [178_707.0625, 658_922.0],
      [178_716.2031, 658_920.3125],
      [178_718.0469, 658_889.0],
    ].map(([x, y]) => {
      const point = itmToWgs84(x, y);
      return [point.longitude, point.latitude];
    });

    // GovMap's own point for סוקולוב 38 חולון.
    expect(pointInGeometry(34.773_145_4, 32.022_695_9, { type: 'Polygon', coordinates: [ring] })).toBe(
      true,
    );
  });

  it('lands the grid origin a datum shift away from its stated coordinates', () => {
    /*
     * The false easting and northing are the origin's coordinates *on the Israel
     * 1993 datum* — so un-projecting them gives exactly the `.prj` values, and then
     * the shift to WGS84 moves the result by some tens of metres.
     *
     * This test asserted an exact match until the datum shift went in, and then
     * failed. The failure was right: a version of this function that returns the
     * stated origin exactly is one that has skipped the shift entirely, which is the
     * 77 m bug. The tolerance here is wide on purpose — it is checking the projection
     * is pointed at the right place, while the Holon parcel above checks the metres.
     */
    const origin = itmToWgs84(219_529.584, 626_907.39);

    expect(origin.latitude).toBeCloseTo(31.734_4, 2);
    expect(origin.longitude).toBeCloseTo(35.204_5, 2);

    // And the gap is the datum shift: present, and smaller than a city block.
    const metres = Math.hypot(
      (origin.latitude - 31.734_393_6) * 111_320,
      (origin.longitude - 35.204_516_9) * 111_320 * Math.cos(0.554),
    );
    expect(metres).toBeGreaterThan(5);
    expect(metres).toBeLessThan(120);
  });

  it('keeps the whole country on land', () => {
    // The layer's own bounding box, from the .shp header. Every corner has to come
    // back inside Israel's rough lat/lng envelope, which catches a sign error or a
    // swapped axis that the single point above might not.
    for (const [x, y] of [
      [130_170, 374_226],
      [284_068, 804_540],
      [130_170, 804_540],
      [284_068, 374_226],
    ]) {
      const { latitude, longitude } = itmToWgs84(x, y);
      expect(latitude).toBeGreaterThan(29);
      expect(latitude).toBeLessThan(34);
      expect(longitude).toBeGreaterThan(33.5);
      expect(longitude).toBeLessThan(36.5);
    }
  });
});

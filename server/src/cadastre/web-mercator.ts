/**
 * WGS84 → Web Mercator (EPSG:3857).
 *
 * GovMap's parcel lookup takes a point in 3857 — its autocomplete hands back
 * `POINT(3870928.84 3766290.19)` for an address in Holon, which is metres on the
 * Mercator plane, not degrees. Our listings already store latitude and longitude from
 * the geocoder, so converting here means a listing we have already placed needs no
 * address search at all: one call instead of two, and no dependence on GovMap's
 * spelling of a street we already know.
 *
 * Note it is **not** Israeli ITM (EPSG:2039), whose numbers for the same point are
 * around 180,000 / 660,000. Anything validating for that range is reading a different
 * API than the one GovMap serves today.
 */

/** Half the circumference of the Mercator square, in metres. */
const EDGE = 20_037_508.342_789_244;

export interface Mercator {
  x: number;
  y: number;
}

export function toMercator(latitude: number, longitude: number): Mercator {
  const x = (longitude * EDGE) / 180;

  /*
   * Mercator stretches towards the poles without bound, so the projection is only
   * defined up to about ±85.05°. Israel is nowhere near that, but a latitude of 90
   * from a corrupt row would otherwise produce Infinity and a request that fails in a
   * way nobody can read.
   */
  const clamped = Math.max(-85.051_128_78, Math.min(85.051_128_78, latitude));
  const y = (Math.log(Math.tan(((90 + clamped) * Math.PI) / 360)) / (Math.PI / 180)) * (EDGE / 180);

  return { x, y };
}

/** The way back, for reading a point out of a GovMap response. */
export function fromMercator({ x, y }: Mercator): { latitude: number; longitude: number } {
  const longitude = (x / EDGE) * 180;
  const latitude = (Math.atan(Math.exp((y / EDGE) * Math.PI)) * 360) / Math.PI - 90;
  return { latitude, longitude };
}

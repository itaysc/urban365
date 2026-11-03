/**
 * Distance between two points, in metres.
 *
 * Equirectangular rather than haversine: over the few kilometres a comparable sale can
 * sit from a flat, the two agree to well under a metre, and this is run across
 * thousands of candidate deals per request. Haversine's accuracy buys nothing at this
 * scale and costs four trigonometric calls per row.
 *
 * The `cos(latitude)` term is the part that cannot be skipped. At Israel's latitude a
 * degree of longitude is about 94 km against 111 km for a degree of latitude, so
 * treating the two as equal stretches every east–west distance by 18% — which would
 * quietly pull comps from the wrong side of a neighbourhood into the tightest tier.
 */

/** Metres per degree of latitude. Constant enough for this purpose. */
const METRES_PER_DEGREE = 111_320;

export interface Point {
  latitude: number;
  longitude: number;
}

export function metresBetween(a: Point, b: Point): number {
  const meanLat = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const north = (a.latitude - b.latitude) * METRES_PER_DEGREE;
  const east = (a.longitude - b.longitude) * METRES_PER_DEGREE * Math.cos(meanLat);
  return Math.hypot(north, east);
}

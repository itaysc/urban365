import { pointInGeometry } from '../listings/point-in-polygon.js';

/**
 * A hand-rolled spatial index, because this Postgres has no PostGIS.
 *
 * `pg_available_extensions` offers cube and earthdistance and not much else, so there
 * is no GIST index on geometry to lean on. A plain btree over the bounding box does
 * not help either: `minLat <= :lat` matches about half the table however it is
 * indexed, and half of one and a half million parcels is not a shortlist.
 *
 * So parcels are filed by the grid cell their centroid falls in, and a lookup reads
 * the nine cells around the point. That is an equality-ish range on a composite btree
 * — fast — and it is correct as long as no parcel is wider than a cell, which is the
 * assumption written down in CELL_DEGREES below.
 */

/**
 * Cell size in degrees. 0.01° is about 1.1 km north–south and 0.95 km east–west at
 * Israel's latitude.
 *
 * A parcel has to be smaller than a cell for the nine-cell search to be guaranteed:
 * if its centroid is up to one cell away from any point inside it, the 3×3 covers it.
 * Urban parcels are tens of metres; agricultural ones can be hundreds. A kilometre of
 * margin holds for all but a handful of enormous rural blocks, and `boundsOf` records
 * each parcel's own bounding box so those can be found by a slower fallback rather
 * than silently missed.
 */
export const CELL_DEGREES = 0.01;

export interface Cell {
  cellLat: number;
  cellLng: number;
}

export const cellOf = (latitude: number, longitude: number): Cell => ({
  cellLat: Math.floor(latitude / CELL_DEGREES),
  cellLng: Math.floor(longitude / CELL_DEGREES),
});

/** The 3×3 block of cells to search, as inclusive ranges for the query. */
export function cellRange(latitude: number, longitude: number) {
  const { cellLat, cellLng } = cellOf(latitude, longitude);
  return {
    minCellLat: cellLat - 1,
    maxCellLat: cellLat + 1,
    minCellLng: cellLng - 1,
    maxCellLng: cellLng + 1,
  };
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** The bounding box of a GeoJSON polygon or multipolygon, in lng/lat order. */
export function boundsOf(geometry: unknown): Bounds | null {
  const shape = geometry as { type?: string; coordinates?: unknown } | null;
  if (!shape || typeof shape !== 'object') return null;

  const rings: number[][][] =
    shape.type === 'Polygon'
      ? (shape.coordinates as number[][][])
      : shape.type === 'MultiPolygon'
        ? (shape.coordinates as number[][][][]).flat()
        : [];

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const ring of rings) {
    for (const point of ring) {
      const [lng, lat] = point;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  return Number.isFinite(minLat) ? { minLat, maxLat, minLng, maxLng } : null;
}

/** The centre of a bounding box — what decides which cell a parcel is filed under. */
export const centroidOf = (b: Bounds) => ({
  latitude: (b.minLat + b.maxLat) / 2,
  longitude: (b.minLng + b.maxLng) / 2,
});

export interface ParcelShape extends Bounds {
  gush: number;
  chelka: number;
  geometry: unknown;
}

/**
 * The parcel a point actually falls in, out of the shortlist the cells produced.
 *
 * Two passes on purpose: the bounding box is a cheap rejection that removes almost
 * every candidate, and ray casting then settles the handful that survive. Doing the
 * expensive test first would work and would be slower for no benefit.
 *
 * A point on a shared boundary belongs to whichever parcel is tested first — the two
 * are adjacent, the point is a geocoder's approximation of a building anyway, and
 * inventing a tie-break would dress a coin toss up as precision.
 */
export function pickParcel<T extends ParcelShape>(
  candidates: T[],
  latitude: number,
  longitude: number,
): T | null {
  for (const parcel of candidates) {
    if (
      latitude < parcel.minLat ||
      latitude > parcel.maxLat ||
      longitude < parcel.minLng ||
      longitude > parcel.maxLng
    ) {
      continue;
    }

    if (pointInGeometry(longitude, latitude, parcel.geometry)) return parcel;
  }

  return null;
}

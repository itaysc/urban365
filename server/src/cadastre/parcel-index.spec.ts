import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  CELL_DEGREES,
  cellOf,
  cellRange,
  centroidOf,
  pickParcel,
  type ParcelShape,
} from './parcel-index.js';

/** A square parcel of `size` degrees with its south-west corner at (lat, lng). */
function square(gush: number, chelka: number, lat: number, lng: number, size: number): ParcelShape {
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [lng, lat],
        [lng + size, lat],
        [lng + size, lat + size],
        [lng, lat + size],
        [lng, lat],
      ],
    ],
  };
  return { gush, chelka, geometry, ...boundsOf(geometry)! };
}

describe('cells', () => {
  it('files a point by the cell it falls in', () => {
    expect(cellOf(32.0853, 34.7818)).toEqual({ cellLat: 3208, cellLng: 3478 });
  });

  it('floors rather than rounds, so a cell is a half-open square', () => {
    // 32.089 and 32.081 are the same cell; rounding would split them.
    expect(cellOf(32.089, 34.78)).toEqual(cellOf(32.081, 34.78));
  });

  it('searches the ring of cells around the point', () => {
    const range = cellRange(32.0853, 34.7818);
    expect(range).toEqual({
      minCellLat: 3207,
      maxCellLat: 3209,
      minCellLng: 3477,
      maxCellLng: 3479,
    });
  });
});

/** Floats: the fixtures add degrees together, so 34.7 + 0.002 is 34.702000000000005. */
const expectBounds = (actual: ReturnType<typeof boundsOf>, expected: Record<string, number>) => {
  for (const [key, value] of Object.entries(expected)) {
    expect(actual![key as keyof typeof expected]).toBeCloseTo(value, 9);
  }
};

describe('boundsOf', () => {
  it('measures a polygon', () => {
    expectBounds(boundsOf(square(1, 1, 32, 34.7, 0.002).geometry), {
      minLat: 32,
      maxLat: 32.002,
      minLng: 34.7,
      maxLng: 34.702,
    });
  });

  it('measures every ring of a multipolygon', () => {
    const geometry = {
      type: 'MultiPolygon',
      coordinates: [
        square(1, 1, 32, 34.7, 0.001).geometry,
        square(1, 2, 32.01, 34.72, 0.001).geometry,
      ].map((g) => (g as { coordinates: number[][][] }).coordinates),
    };

    expectBounds(boundsOf(geometry), {
      minLat: 32,
      maxLat: 32.011,
      minLng: 34.7,
      maxLng: 34.721,
    });
  });

  it('is null for something that is not a shape', () => {
    expect(boundsOf(null)).toBeNull();
    expect(boundsOf({ type: 'Point', coordinates: [34, 32] })).toBeNull();
  });
});

describe('pickParcel', () => {
  // Two touching parcels, each 50m-ish across, as an urban block would be.
  const a = square(7166, 144, 32.0, 34.77, 0.0005);
  const b = square(7166, 145, 32.0, 34.7705, 0.0005);

  it('finds the one the point is inside', () => {
    expect(pickParcel([a, b], 32.0002, 34.7702)?.chelka).toBe(144);
    expect(pickParcel([a, b], 32.0002, 34.7707)?.chelka).toBe(145);
  });

  it('rejects a point in neither', () => {
    expect(pickParcel([a, b], 32.05, 34.9)).toBeNull();
  });

  it('is not fooled by a candidate whose box contains the point but whose shape does not', () => {
    /*
     * The reason there are two passes. An L-shaped parcel has a bounding box covering
     * the notch it does not own; stopping at the box would hand back the neighbour's
     * sale prices for a building that is not on it.
     */
    const lShaped: ParcelShape = (() => {
      const geometry = {
        type: 'Polygon',
        coordinates: [
          [
            [34.77, 32.0],
            [34.772, 32.0],
            [34.772, 32.001],
            [34.771, 32.001],
            [34.771, 32.002],
            [34.77, 32.002],
            [34.77, 32.0],
          ],
        ],
      };
      return { gush: 1, chelka: 1, geometry, ...boundsOf(geometry)! };
    })();

    // Inside the bounding box, inside the notch, outside the parcel.
    expect(pickParcel([lShaped], 32.0015, 34.7715)).toBeNull();
    // And a point on the solid part is still found.
    expect(pickParcel([lShaped], 32.0005, 34.7715)).not.toBeNull();
  });

  it('files a parcel in a cell that the 3x3 search around any of its points reaches', () => {
    /*
     * The assumption the whole index rests on: a parcel smaller than a cell is always
     * found from any point inside it. Checked here rather than assumed, because if it
     * were false the lookup would silently return null for real addresses.
     */
    const parcel = square(1, 1, 32.0098, 34.7798, CELL_DEGREES / 2);
    const filed = cellOf(centroidOf(parcel).latitude, centroidOf(parcel).longitude);

    for (const [lat, lng] of [
      [parcel.minLat, parcel.minLng],
      [parcel.maxLat, parcel.maxLng],
      [parcel.minLat, parcel.maxLng],
    ]) {
      const range = cellRange(lat, lng);
      expect(filed.cellLat).toBeGreaterThanOrEqual(range.minCellLat);
      expect(filed.cellLat).toBeLessThanOrEqual(range.maxCellLat);
      expect(filed.cellLng).toBeGreaterThanOrEqual(range.minCellLng);
      expect(filed.cellLng).toBeLessThanOrEqual(range.maxCellLng);
    }
  });
});

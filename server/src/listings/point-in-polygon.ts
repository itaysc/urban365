/** The GeoJSON shapes `CityBoundary.geometry` is written as. */
export type GeoJsonGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

/**
 * Ray casting: count how often a ray due east from the point crosses the ring. An odd
 * count means the point is inside.
 *
 * Only the outer ring is tested. The boundaries are stored without holes — the sync
 * script keeps `role != inner` members and treats several rings as an exclave, so every
 * ring here encloses land rather than cutting one out.
 */
function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    // Does this edge straddle the ray's latitude? One endpoint strictly above and one
    // not, so a vertex exactly on the ray is counted once rather than twice.
    const straddles = yi > y !== yj > y;
    if (!straddles) continue;

    // Where the edge crosses that latitude, in longitude.
    const crossing = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (x < crossing) inside = !inside;
  }

  return inside;
}

/** Whether a longitude/latitude falls inside a stored boundary. */
export function pointInGeometry(lng: number, lat: number, geometry: unknown): boolean {
  const shape = geometry as GeoJsonGeometry | null;
  if (!shape || typeof shape !== 'object' || !('type' in shape)) return false;

  const rings =
    shape.type === 'Polygon'
      ? shape.coordinates
      : shape.type === 'MultiPolygon'
        ? shape.coordinates.flat()
        : [];

  return rings.some((ring) => Array.isArray(ring) && inRing(lng, lat, ring));
}

import { describe, expect, it } from 'vitest';
import { pointInGeometry } from './point-in-polygon.js';

/** A unit square from (0,0) to (10,10), closed. */
const square = {
  type: 'Polygon' as const,
  coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
};

describe('pointInGeometry', () => {
  it('finds a point inside', () => {
    expect(pointInGeometry(5, 5, square)).toBe(true);
  });

  it('rejects a point outside', () => {
    expect(pointInGeometry(15, 5, square)).toBe(false);
    expect(pointInGeometry(-1, 5, square)).toBe(false);
    expect(pointInGeometry(5, 20, square)).toBe(false);
  });

  /**
   * The case ray casting is written wrong for: a ray leaving a vertex can be counted
   * twice and flip the answer. The half-open test (`yi > y !== yj > y`) is what stops it.
   */
  it('does not double-count a ray that leaves through a vertex', () => {
    const diamond = {
      type: 'Polygon' as const,
      coordinates: [[[5, 0], [10, 5], [5, 10], [0, 5], [5, 0]]],
    };
    // Level with the left and right vertices, inside the shape.
    expect(pointInGeometry(5, 5, diamond)).toBe(true);
    // Level with them, outside.
    expect(pointInGeometry(12, 5, diamond)).toBe(false);
  });

  it('handles an exclave, which Israeli municipalities have', () => {
    const multi = {
      type: 'MultiPolygon' as const,
      coordinates: [
        [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
        [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]],
      ],
    };
    expect(pointInGeometry(5, 5, multi)).toBe(true);
    expect(pointInGeometry(25, 25, multi)).toBe(true);
    expect(pointInGeometry(15, 15, multi)).toBe(false);
  });

  it('treats anything that is not a geometry as no match, rather than throwing', () => {
    // `geometry` is a Json column: a malformed row must not take the request down.
    expect(pointInGeometry(5, 5, null)).toBe(false);
    expect(pointInGeometry(5, 5, {})).toBe(false);
    expect(pointInGeometry(5, 5, 'nonsense')).toBe(false);
    expect(pointInGeometry(5, 5, { type: 'Point', coordinates: [5, 5] })).toBe(false);
  });
});

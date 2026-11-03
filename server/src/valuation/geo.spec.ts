import { describe, expect, it } from 'vitest';
import { metresBetween } from './geo.js';

describe('metresBetween', () => {
  it('is zero for a point and itself', () => {
    expect(metresBetween({ latitude: 32.07, longitude: 34.78 }, { latitude: 32.07, longitude: 34.78 })).toBe(0);
  });

  it('measures a degree of latitude', () => {
    const north = metresBetween({ latitude: 32, longitude: 34.78 }, { latitude: 33, longitude: 34.78 });
    expect(north).toBeCloseTo(111_320, -2);
  });

  it('shrinks a degree of longitude by the cosine of the latitude', () => {
    /*
     * The whole reason the cos term exists. At 32°N a degree of longitude is about
     * 94 km, not 111 km. Treating them alike would stretch every east-west distance
     * by 18% and pull comps from the next neighbourhood into the tightest tier.
     */
    const east = metresBetween({ latitude: 32, longitude: 34 }, { latitude: 32, longitude: 35 });

    expect(east).toBeCloseTo(111_320 * Math.cos((32 * Math.PI) / 180), -2);
    expect(east).toBeLessThan(95_000);
  });

  it('matches a known short distance', () => {
    // Two points 300 m apart north-south, give or take the metre this method costs.
    const a = { latitude: 32.0, longitude: 34.78 };
    const b = { latitude: 32.0 + 300 / 111_320, longitude: 34.78 };
    expect(metresBetween(a, b)).toBeCloseTo(300, 1);
  });

  it('is symmetric', () => {
    const a = { latitude: 32.0853, longitude: 34.7818 };
    const b = { latitude: 31.7683, longitude: 35.2137 };
    expect(metresBetween(a, b)).toBeCloseTo(metresBetween(b, a), 6);
  });
});

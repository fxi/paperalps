import { describe, it, expect } from 'vitest';
import { lonLatToWorld, worldToLonLat, metresPerPixel, TILE } from '../src/geo/mercator';

describe('mercator', () => {
  it('puts the Matterhorn in tile 12/2135/1457 at the expected pixel', () => {
    const [x, y] = lonLatToWorld(7.6586, 45.9763, 12);
    expect(Math.floor(x / TILE)).toBe(2135);
    expect(Math.floor(y / TILE)).toBe(1457);
    // the decode spike found the summit pixel at (68, 299) in that tile
    expect(Math.abs((x % TILE) - 68)).toBeLessThan(4);
    expect(Math.abs((y % TILE) - 299)).toBeLessThan(4);
  });

  it('round-trips lon/lat', () => {
    for (const [lon, lat] of [[7.6586, 45.9763], [-122.4, 37.8], [0, 0], [16.9, 48.4]]) {
      const [x, y] = lonLatToWorld(lon, lat, 13.7);
      const [lo, la] = worldToLonLat(x, y, 13.7);
      expect(lo).toBeCloseTo(lon, 9);
      expect(la).toBeCloseTo(lat, 9);
    }
  });

  it('metres per pixel at 46°N, z12 with 512px tiles', () => {
    expect(metresPerPixel(46, 12)).toBeCloseTo(13.276, 2);
    expect(metresPerPixel(0, 0)).toBeCloseTo(78271.5, 0);
  });
});

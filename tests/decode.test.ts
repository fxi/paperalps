import { describe, it, expect } from 'vitest';
import { terrarium, decodeTerrarium, encodeTerrarium } from '../src/dem/decode';

describe('terrarium decode', () => {
  it('decodes the reference values', () => {
    expect(terrarium(128, 0, 0)).toBe(0); // sea level
    expect(terrarium(0, 0, 0)).toBe(-32768);
    expect(terrarium(145, 123, 128)).toBeCloseTo(4475.5, 6); // ~Matterhorn
    expect(terrarium(127, 255, 0)).toBe(-1);
  });

  it('round-trips through encode', () => {
    for (const h of [-420.5, 0, 0.25, 372.75, 1240, 4807.996]) {
      const [r, g, b] = encodeTerrarium(h);
      expect(terrarium(r, g, b)).toBeCloseTo(h, 2);
    }
  });

  it('decodes an RGBA buffer, ignoring alpha', () => {
    const rgba = new Uint8ClampedArray([128, 0, 0, 255, 145, 123, 128, 0]);
    const h = decodeTerrarium(rgba);
    expect(Array.from(h)).toEqual([0, 4475.5]);
  });
});

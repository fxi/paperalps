import { describe, it, expect } from 'vitest';
import { upsample } from '../src/dem/heightAtlas';

describe('ancestor upsampling', () => {
  it('reproduces a linear ramp exactly (away from clamped edges)', () => {
    const src = new Float32Array(512 * 512);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) src[y * 512 + x] = x * 2 + y;
    const out = upsample(src, 1, 1, 0, new Float32Array(512 * 512));
    // child pixel i maps to parent coordinate 256 + (i + 0.5) / 2 - 0.5
    for (const [i, j] of [[10, 10], [200, 300], [400, 100]]) {
      const px = 256 + (i + 0.5) / 2 - 0.5;
      const py = (j + 0.5) / 2 - 0.5;
      expect(out[j * 512 + i]).toBeCloseTo(px * 2 + py, 3);
    }
  });
});

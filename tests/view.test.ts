import { describe, it, expect } from 'vitest';
import { octaves, pickDataZoom } from '../src/render/view';

describe('facet octaves', () => {
  it('weights always sum to 1 and vanish at the octave ends', () => {
    for (let z = 9; z < 15; z += 0.037) {
      const o = octaves({ mx: 0.52, my: 0.35, zoom: z }, Math.floor(z), 10);
      const sum = o.reduce((s, x) => s + x.weight, 0);
      expect(sum).toBeCloseTo(1, 9);
    }
    // just as the zoom crosses an integer, the octave being reassigned is ~0
    const a = octaves({ mx: 0.5, my: 0.5, zoom: 11.9999 }, 11, 10);
    const b = octaves({ mx: 0.5, my: 0.5, zoom: 12.0001 }, 12, 10);
    expect(a[3].weight).toBeGreaterThan(0.0);
    expect(b[0].weight).toBeLessThan(1e-6);
    // the same absolute levels keep the same weight across the boundary
    for (const oa of a) {
      const ob = b.find((x) => x.level === oa.level);
      if (ob) expect(ob.weight).toBeCloseTo(oa.weight, 3);
      else expect(oa.weight).toBeLessThan(1e-6);
    }
  });

  it('expresses cells in data px and keeps base/frac consistent', () => {
    const cam = { mx: 0.5212345, my: 0.3561234, zoom: 12.3 };
    const o = octaves(cam, 12, 10);
    expect(o[0].cellData).toBe(10);
    expect(o[1].cellData).toBe(20);
    for (const x of o) {
      const ws = 512 * Math.pow(2, x.level);
      expect((x.baseX + x.fracX) * 10).toBeCloseTo(cam.mx * ws, 5);
    }
  });

  it('picks data zoom with hysteresis', () => {
    expect(pickDataZoom(12.3, -1, 8, 14)).toBe(12);
    expect(pickDataZoom(13.1, 12, 8, 14)).toBe(12); // within hysteresis
    expect(pickDataZoom(13.2, 12, 8, 14)).toBe(13);
    expect(pickDataZoom(11.9, 12, 8, 14)).toBe(12);
    expect(pickDataZoom(11.8, 12, 8, 14)).toBe(11);
    expect(pickDataZoom(20, 12, 8, 14)).toBe(14);
  });
});

import { clipLevel } from '../src/render/view';

describe('clipmap levels', () => {
  it('keep vertices on a fixed world lattice and cover the flyer', () => {
    for (const L of [0, 1, 3, 6]) {
      for (const [fx, fy] of [[2186543.37, 1491234.9], [2186549.81, 1491230.02], [1e6 + 0.5, 7e5 - 0.25]]) {
        const { s, ox, oy, reach } = clipLevel(fx, fy, L, 96, 2);
        // origin on the 2s lattice -> grid parity matches world parity (morph-safe)
        expect(ox / (2 * s)).toBe(Math.round(ox / (2 * s)));
        expect(oy / (2 * s)).toBe(Math.round(oy / (2 * s)));
        // the grid covers at least `reach` around the flyer in every direction
        expect(fx - ox).toBeGreaterThanOrEqual(reach);
        expect(ox + 96 * s - fx).toBeGreaterThanOrEqual(reach);
        expect(fy - oy).toBeGreaterThanOrEqual(reach);
        expect(oy + 96 * s - fy).toBeGreaterThanOrEqual(reach);
      }
    }
  });

  it('moving the flyer slightly does not move any vertex', () => {
    const a = clipLevel(2186543.37, 1491234.9, 2, 96, 2);
    const b = clipLevel(2186545.1, 1491236.2, 2, 96, 2);
    // same lattice: origins differ by a whole number of cells
    expect(((b.ox - a.ox) / a.s) % 1).toBe(0);
    expect(((b.oy - a.oy) / a.s) % 1).toBe(0);
  });
});

describe('clipmap nesting', () => {
  it('the finer level always sits N/4 or N/4+1 coarse cells in (ring hole offsets)', () => {
    for (let i = 0; i < 500; i++) {
      const fx = 1e6 + Math.random() * 1e5;
      const fy = 7e5 + Math.random() * 1e5;
      for (let L = 1; L < 8; L++) {
        const f = clipLevel(fx, fy, L - 1, 80, 2);
        const c = clipLevel(fx, fy, L, 80, 2);
        const off = [(f.ox - c.ox) / c.s, (f.oy - c.oy) / c.s];
        for (const o of off) expect([20, 21]).toContain(o);
      }
    }
  });
});

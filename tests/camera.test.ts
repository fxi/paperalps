import { describe, it, expect } from 'vitest';
import { basis, makeView, project, focusDistance, mercToLocal, localToMerc, type Flyer } from '../src/render/camera';

const flat = (h: number) => () => h;

function flyer(o: Partial<Flyer> = {}): Flyer {
  return { mx: 0.5212, my: 0.3559, alt: 3000, yaw: 0, tilt: 0, ...o };
}

describe('camera basis', () => {
  it('is orthonormal for any yaw/tilt', () => {
    for (const yaw of [0, 1, 2.5, -2]) {
      for (const tilt of [0, 0.5, 1.2]) {
        const b = basis(yaw, tilt);
        const dot = (a: number[], c: number[]) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
        expect(dot(b.right, b.up)).toBeCloseTo(0, 9);
        expect(dot(b.right, b.fwd)).toBeCloseTo(0, 9);
        expect(dot(b.up, b.fwd)).toBeCloseTo(0, 9);
        expect(dot(b.up, b.up)).toBeCloseTo(1, 9);
      }
    }
  });

  it('stays orthonormal with roll and keeps the view axis', () => {
    const dot = (a: number[], c: number[]) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
    for (const roll of [-0.6, 0.3, 1]) {
      const b = basis(0.8, 1.0, roll);
      const b0 = basis(0.8, 1.0);
      expect(dot(b.right, b.up)).toBeCloseTo(0, 9);
      expect(dot(b.right, b.right)).toBeCloseTo(1, 9);
      expect(dot(b.up, b.fwd)).toBeCloseTo(0, 9);
      expect(b.fwd).toEqual(b0.fwd);
    }
    // positive roll: right side dips
    expect(basis(0, 1.0, 0.4).right[2]).toBeLessThan(0);
    expect(basis(0.8, 1.0, 0)).toEqual(basis(0.8, 1.0));
  });

  it('top-down, north-up: north is screen-up, east is screen-right', () => {
    const b = basis(0, 0);
    expect(b.up[1]).toBeCloseTo(1);
    expect(b.right[0]).toBeCloseTo(1);
    expect(b.fwd[2]).toBeCloseTo(-1);
  });
});

describe('projection', () => {
  it('centre ray hits the focus point', () => {
    const fl = flyer({ tilt: 0.9, yaw: 0.7 });
    const v = makeView(fl, 800, 600, 1.5, flat(1000), 1000);
    const p = project(v, v.focusE, v.focusN, 1000)!;
    expect(p[0]).toBeCloseTo(400, 0);
    expect(p[1]).toBeCloseTo(300, 0);
  });

  it('top-down maps ground offsets linearly at the focus scale', () => {
    const fl = flyer({ alt: 3000 });
    const v = makeView(fl, 800, 800, 1, flat(1000), 1000);
    // 2000 m below; half-height spans tan(24°)·2000 m
    const half = Math.tan((24 * Math.PI) / 180) * 2000;
    const p = project(v, half, half, 1000)!;
    expect(p[0]).toBeCloseTo(800, 2);
    expect(p[1]).toBeCloseTo(0, 2); // north = up
  });

  it('returns null behind the camera', () => {
    const v = makeView(flyer({ tilt: 1.0 }), 800, 600, 1, flat(0), 0);
    expect(project(v, 0, -5000, 0)).toBeNull();
  });

  it('effective zoom falls as altitude rises', () => {
    const z = [1500, 3000, 6000].map((alt) => makeView(flyer({ alt, tilt: 0.8 }), 800, 600, 1, flat(500), 500).ez);
    expect(z[0]).toBeGreaterThan(z[1]);
    expect(z[1]).toBeGreaterThan(z[2]);
  });
});

describe('focus distance', () => {
  it('meets a flat ground where expected', () => {
    const fl = flyer({ alt: 2000, tilt: Math.PI / 4 });
    const d = focusDistance(fl, basis(fl.yaw, fl.tilt), 1, flat(1000), 1000);
    expect(d).toBeCloseTo(1000 * Math.SQRT2, 0);
  });

  it('stops at a wall in front', () => {
    const fl = flyer({ alt: 2000, tilt: Math.PI / 4 });
    const wall = (_e: number, n: number) => (n > 300 ? 5000 : 0);
    const d = focusDistance(fl, basis(0, fl.tilt), 1, wall, 0);
    expect(d * Math.sin(Math.PI / 4)).toBeGreaterThan(299);
    expect(d * Math.sin(Math.PI / 4)).toBeLessThan(330);
  });
});

describe('local frame', () => {
  it('round-trips', () => {
    const fl = flyer();
    const [mx, my] = localToMerc(fl, 1234, -567);
    const [e, n] = mercToLocal(fl, mx, my);
    expect(e).toBeCloseTo(1234, 6);
    expect(n).toBeCloseTo(-567, 6);
  });
});

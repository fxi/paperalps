// Flight camera. All 3D math happens in a flyer-relative metre frame:
//   E (x, east), N (y, north), Z (z, up), eye at the origin.
// Terrain heights are multiplied by `lift`, and so is the flyer altitude, so
// "above ground" stays true under exaggeration: Z = (h - alt) * lift.

import { EARTH_CIRC, TILE } from '../geo/mercator';

export interface Flyer {
  mx: number; // normalised Mercator [0,1)
  my: number;
  alt: number; // metres above sea level
  yaw: number; // radians, 0 = north, clockwise positive
  tilt: number; // radians from nadir, 0 = straight down
  roll?: number; // radians about the view axis, positive = right side down
}

export const FOVY = (48 * Math.PI) / 180;

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export interface Basis {
  right: Vec3;
  up: Vec3;
  fwd: Vec3; // view direction
  heading: Vec3; // horizontal forward
}

export function basis(yaw: number, tilt: number, roll = 0): Basis {
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const st = Math.sin(tilt);
  const ct = Math.cos(tilt);
  const heading: Vec3 = [sy, cy, 0];
  const r0: Vec3 = [cy, -sy, 0];
  const fwd: Vec3 = [st * sy, st * cy, -ct];
  // up = right × fwd
  const u0: Vec3 = [
    r0[1] * fwd[2] - r0[2] * fwd[1],
    r0[2] * fwd[0] - r0[0] * fwd[2],
    r0[0] * fwd[1] - r0[1] * fwd[0],
  ];
  if (!roll) return { right: r0, up: u0, fwd, heading };
  // bank about the view axis: positive roll dips the right side
  const sr = Math.sin(roll);
  const cr = Math.cos(roll);
  const right: Vec3 = [r0[0] * cr - u0[0] * sr, r0[1] * cr - u0[1] * sr, r0[2] * cr - u0[2] * sr];
  const up: Vec3 = [u0[0] * cr + r0[0] * sr, u0[1] * cr + r0[1] * sr, u0[2] * cr + r0[2] * sr];
  return { right, up, fwd, heading };
}

/** Column-major view matrix for an eye at the origin. */
export function viewMatrix(b: Basis): Mat4 {
  const { right: r, up: u, fwd: f } = b;
  // rows: r, u, -f
  return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, 0, 0, 0, 1]);
}

export function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}

/** Metres (E, N) of a Mercator point relative to the flyer (local tangent approx). */
export function mercToLocal(fl: Flyer, mx: number, my: number): [number, number] {
  const lat = mercLat(fl.my);
  const k = EARTH_CIRC * Math.cos(lat);
  return [(mx - fl.mx) * k, -(my - fl.my) * k];
}

export function localToMerc(fl: Flyer, e: number, n: number): [number, number] {
  const k = EARTH_CIRC * Math.cos(mercLat(fl.my));
  return [fl.mx + e / k, fl.my - n / k];
}

/** Latitude (radians) of a normalised Mercator y. */
export function mercLat(my: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * my)));
}

export interface View {
  flyer: Flyer;
  basis: Basis;
  viewProj: Mat4;
  cssW: number;
  cssH: number;
  near: number;
  far: number;
  lift: number;
  focusDist: number; // slant metres to the ground under the screen centre
  focusE: number; // ground point under the screen centre, metres from flyer
  focusN: number;
  ez: number; // effective web-mercator zoom at the focus point
}

/**
 * Build the view. `heightAt(e, n)` returns terrain metres at a local offset
 * (NaN if unknown); it's used to find where the centre ray meets the ground.
 */
export function makeView(
  fl: Flyer,
  cssW: number,
  cssH: number,
  lift: number,
  heightAt: (e: number, n: number) => number,
  ground: number,
): View {
  const b = basis(fl.yaw, fl.tilt, fl.roll ?? 0);
  const agl = Math.max(30, fl.alt - ground);
  const focusDist = focusDistance(fl, b, lift, heightAt, ground);
  const focusE = b.fwd[0] * focusDist;
  const focusN = b.fwd[1] * focusDist;
  const lat = mercLat(fl.my);
  const mPerCss = (2 * focusDist * Math.tan(FOVY / 2)) / cssH;
  const ez = Math.log2((EARTH_CIRC * Math.cos(lat)) / (TILE * mPerCss));
  const near = Math.max(2, agl * lift * 0.08);
  const far = farDistance(focusDist, agl * lift);
  const proj = perspective(FOVY, cssW / cssH, near, far * 1.05);
  return {
    flyer: fl,
    basis: b,
    viewProj: mul(proj, viewMatrix(b)),
    cssW,
    cssH,
    near,
    far,
    lift,
    focusDist,
    focusE,
    focusN,
    ez,
  };
}

/** Horizontal visibility limit (metres), hidden by fog well before. */
export function farDistance(focusDist: number, aglLifted: number): number {
  return Math.min(90000, Math.max(focusDist * 9, aglLifted * 14, 6000));
}

/** March the centre ray until it dips under the terrain. */
export function focusDistance(
  fl: Flyer,
  b: Basis,
  lift: number,
  heightAt: (e: number, n: number) => number,
  ground: number,
): number {
  const agl = Math.max(30, fl.alt - ground);
  // flat-ground estimate as a fallback and an upper bound
  const flat = b.fwd[2] < -0.05 ? (agl * lift) / -b.fwd[2] : agl * lift * 20;
  const maxD = Math.min(flat * 1.6, 120000);
  let t = Math.max(5, agl * 0.02);
  let prevT = 0;
  for (let i = 0; i < 96 && t < maxD; i++) {
    const e = b.fwd[0] * t;
    const n = b.fwd[1] * t;
    const z = b.fwd[2] * t;
    let h = heightAt(e, n);
    if (Number.isNaN(h)) h = ground;
    if (z <= (h - fl.alt) * lift) {
      // refine between prevT and t
      let lo = prevT;
      let hi = t;
      for (let k = 0; k < 8; k++) {
        const m = (lo + hi) / 2;
        let hm = heightAt(b.fwd[0] * m, b.fwd[1] * m);
        if (Number.isNaN(hm)) hm = ground;
        if (b.fwd[2] * m <= (hm - fl.alt) * lift) hi = m;
        else lo = m;
      }
      return hi;
    }
    prevT = t;
    t = t * 1.06 + agl * 0.01;
  }
  return Math.min(flat, maxD);
}

/**
 * Project a local point (metres E, N and *unlifted* elevation) to CSS px.
 * Returns [x, y, distance] or null if behind the camera / outside depth range.
 */
export function project(v: View, e: number, n: number, ele: number): [number, number, number] | null {
  const z = (ele - v.flyer.alt) * v.lift;
  const m = v.viewProj;
  const cx = m[0] * e + m[4] * n + m[8] * z + m[12];
  const cy = m[1] * e + m[5] * n + m[9] * z + m[13];
  const cw = m[3] * e + m[7] * n + m[11] * z + m[15];
  if (cw <= v.near) return null;
  const x = (cx / cw * 0.5 + 0.5) * v.cssW;
  const y = (1 - (cy / cw * 0.5 + 0.5)) * v.cssH;
  return [x, y, Math.hypot(e, n, z)];
}

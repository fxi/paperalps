import { TILE } from '../geo/mercator';

/** Camera in normalised Mercator [0,1) plus fractional zoom. */
export interface Camera {
  mx: number;
  my: number;
  zoom: number;
}

export interface Octave {
  level: number; // absolute zoom at which one cell = `cell` world px
  baseX: number; // integer cell index of camera
  baseY: number;
  fracX: number; // fractional cell position of camera
  fracY: number;
  cellData: number; // cell size in data px (at dz)
  weight: number;
}

/**
 * Four world-anchored facet lattices. Octave k sits at level floor(zoom) - k,
 * so its on-screen cell size is cell * 2^(zoom - level) ∈ [cell, 16 cell).
 * Weights sin²(π u / 4) / 2 (u = zoom - level) vanish at both ends and sum to
 * exactly 1, which makes zooming seamless: an octave fades out completely
 * before its level is reassigned.
 */
export function octaves(cam: Camera, dz: number, cell: number, sharp = 1): Octave[] {
  const out: Octave[] = [];
  const fz = Math.floor(cam.zoom);
  let total = 0;
  for (let k = 0; k < 4; k++) {
    const level = fz - k;
    const u = cam.zoom - level;
    // `sharp` > 1 lets one octave dominate (bolder folds) while keeping the
    // weights continuous and zero at both ends; normalised below.
    const w = Math.pow(Math.pow(Math.sin((Math.PI * u) / 4), 2) / 2, sharp);
    total += w;
    const ws = TILE * Math.pow(2, level);
    const cx = (cam.mx * ws) / cell;
    const cy = (cam.my * ws) / cell;
    const bx = Math.floor(cx);
    const by = Math.floor(cy);
    out.push({
      level,
      baseX: bx,
      baseY: by,
      fracX: cx - bx,
      fracY: cy - by,
      cellData: cell * Math.pow(2, dz - level),
      weight: w,
    });
  }
  for (const o of out) o.weight /= total;
  return out;
}

/** Data zoom with hysteresis so we don't thrash around integer zooms. */
export function pickDataZoom(zoom: number, current: number, min: number, max: number): number {
  let dz = current;
  if (dz < 0 || zoom >= dz + 1.15 || zoom < dz - 0.15) dz = Math.floor(zoom);
  return Math.max(min, Math.min(max, dz));
}

/** CSS px offset from screen centre -> normalised Mercator. */
export function screenToMerc(cam: Camera, dx: number, dy: number): [number, number] {
  const ws = TILE * Math.pow(2, cam.zoom);
  return [cam.mx + dx / ws, cam.my + dy / ws];
}

/** Normalised Mercator -> CSS px offset from screen centre. */
export function mercToScreen(cam: Camera, mx: number, my: number): [number, number] {
  const ws = TILE * Math.pow(2, cam.zoom);
  return [(mx - cam.mx) * ws, (my - cam.my) * ws];
}

/**
 * Clipmap level placement. Level L has spacing s = base·2^L (data px) and an
 * N x N grid whose origin sits on a 2s lattice, so every vertex is at a fixed
 * world position (multiples of s) whatever the flyer position: no swimming.
 * `reach` is the Chebyshev radius around the flyer that the grid always covers.
 */
export function clipLevel(fx: number, fy: number, L: number, n: number, base: number) {
  const s = base * Math.pow(2, L);
  const ox = Math.floor(fx / (2 * s)) * 2 * s - (n / 2) * s;
  const oy = Math.floor(fy / (2 * s)) * 2 * s - (n / 2) * s;
  return { s, ox, oy, reach: (n / 2 - 2) * s };
}

/**
 * Tyndall — pure part (no imports: also run by the sealing script).
 *
 * Light from the sky goes through a polariser P, then through a sheet of
 * triangular birefringent facets (each a wave plate: fast axis α, retardance
 * δ), then a quarter-wave plate W, then an analyser A. Jones calculus gives
 * the brightness of each facet. Each of P, W, A turns in 15° steps (period
 * 180°). The facets were cut so that one setting shows the figure in full
 * contrast; nearby settings show it in part.
 */

export const STEP = 15;
export const POS = 180 / STEP; // 12 positions per disc
export const COLS = 8;
export const ROWS = 6;

type C = [number, number]; // complex
type V = [C, C];
const D2R = Math.PI / 180;

function plate(v: V, axis: number, delta: number): V {
  const c = Math.cos(axis);
  const s = Math.sin(axis);
  // into the plate's frame
  const f: C = [c * v[0][0] + s * v[1][0], c * v[0][1] + s * v[1][1]];
  const sl: C = [-s * v[0][0] + c * v[1][0], -s * v[0][1] + c * v[1][1]];
  // slow axis lags by delta
  const cd = Math.cos(delta);
  const sd = Math.sin(delta);
  const sl2: C = [sl[0] * cd - sl[1] * sd, sl[0] * sd + sl[1] * cd];
  // back
  return [
    [c * f[0] - s * sl2[0], c * f[1] - s * sl2[1]],
    [s * f[0] + c * sl2[0], s * f[1] + c * sl2[1]],
  ];
}

/** Brightness (0..1) of a facet (α, δ in radians) for disc angles in degrees. */
export function intensity(alpha: number, delta: number, p: number, w: number, a: number): number {
  const pr = p * D2R;
  let v: V = [
    [Math.cos(pr), 0],
    [Math.sin(pr), 0],
  ];
  v = plate(v, alpha, delta);
  v = plate(v, w * D2R, Math.PI / 2);
  const ar = a * D2R;
  const re = Math.cos(ar) * v[0][0] + Math.sin(ar) * v[1][0];
  const im = Math.cos(ar) * v[0][1] + Math.sin(ar) * v[1][1];
  return re * re + im * im;
}

// ---------------------------------------------------------------- sheet ---

/** The horn, as seen from the Turtmanntal (unit square, y down). */
export const HORN: [number, number][] = [
  [0.0, 0.95], [0.18, 0.78], [0.3, 0.7], [0.4, 0.5], [0.47, 0.34], [0.52, 0.12], [0.56, 0.1],
  [0.62, 0.3], [0.7, 0.44], [0.78, 0.5], [0.86, 0.66], [1.0, 0.8], [1.0, 1.0], [0.0, 1.0],
];

export interface Facet {
  pts: [number, number][];
  fig: boolean;
  alpha: number;
  delta: number;
}

function inside(x: number, y: number, poly: [number, number][]): boolean {
  let s = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) s = !s;
  }
  return s;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The setting that reveals the figure. */
export const TARGET: [number, number, number] = [30, 75, 150];
export const SEED = 1862;

export function sheet(seed = SEED, target = TARGET): Facet[] {
  const r = rng(seed);
  const out: Facet[] = [];
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      // jittered lattice, split along alternating diagonals
      const q = (x: number, y: number): [number, number] => {
        const edge = x === 0 || y === 0 || x === COLS || y === ROWS;
        const jx = edge ? 0 : (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        const jy = edge ? 0 : (Math.sin(x * 39.346 + y * 11.135) * 24634.6345) % 1;
        return [(x + jx * 0.28) / COLS, (y + jy * 0.28) / ROWS];
      };
      const a = q(i, j);
      const b = q(i + 1, j);
      const c = q(i + 1, j + 1);
      const d = q(i, j + 1);
      const tris: [number, number][][] = (i + j) % 2 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
      for (const pts of tris) {
        const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
        const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
        const fig = inside(cx, cy, HORN);
        let alpha = 0;
        let delta = 0;
        for (let k = 0; k < 400; k++) {
          alpha = r() * Math.PI;
          delta = (0.25 + 0.75 * r()) * Math.PI;
          const v = intensity(alpha, delta, ...target);
          if (fig ? v > 0.8 : v < 0.06) break;
        }
        out.push({ pts, fig, alpha, delta });
      }
    }
  return out;
}

export function levels(facets: Facet[], p: number, w: number, a: number): number[] {
  return facets.map((f) => intensity(f.alpha, f.delta, p, w, a));
}

/** The figure is shown: every facet clearly lit or clearly dark. */
export function clear(lv: number[]): boolean {
  return lv.every((v) => v > 0.6 || v < 0.15);
}

export const bitmap = (lv: number[]) => lv.map((v) => (v > 0.5 ? '1' : '0')).join('');

/** What the analyser shows, as an answer: only when the image is clear. */
export function candidate(facets: Facet[], p: number, w: number, a: number): string | null {
  const lv = levels(facets, p, w, a);
  return clear(lv) ? bitmap(lv) : null;
}

export const answer = () => bitmap(levels(sheet(), ...TARGET));

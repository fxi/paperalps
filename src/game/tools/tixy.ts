/**
 * Tixy fields (after tixy.land / fxi.io/tixyac): a 16×16 grid of dots whose
 * size and sign come from f(t, i, x, y). Shared by the quine tool and the
 * puzzles; `sample()` gives a canonical, quantised trace of a formula.
 */

export const N = 16;
export type Tixy = (t: number, i: number, x: number, y: number) => number;

const MATH = Object.getOwnPropertyNames(Math);

/** Compile the body of `(t, i, x, y) => …`; Math is in scope. Null on a syntax error. */
export function compile(code: string): Tixy | null {
  try {
    const f = new Function('t', 'i', 'x', 'y', ...MATH, `return (${code || 0});`) as (...a: unknown[]) => unknown;
    const m = MATH.map((k) => (Math as unknown as Record<string, unknown>)[k]);
    const g: Tixy = (t, i, x, y) => {
      const v = Number(f(t, i, x, y, ...m));
      return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
    };
    g(0, 0, 0, 0);
    return g;
  } catch {
    return null;
  }
}

/** One frame: 256 values clamped to [-1, 1]. */
export function frame(f: Tixy, t: number): Float32Array {
  const out = new Float32Array(N * N);
  for (let y = 0, i = 0; y < N; y++)
    for (let x = 0; x < N; x++, i++) {
      try {
        out[i] = f(t, i, x, y);
      } catch {
        out[i] = 0;
      }
    }
  return out;
}

/**
 * Canonical trace: `frames` frames at t = k·dt, each value quantised to one
 * of 9 levels (sign × 4 sizes + empty). Two formulas that draw the same
 * field give the same string.
 */
export function sample(f: Tixy, frames: number, dt: number): string {
  let s = '';
  for (let k = 0; k < frames; k++) {
    const fr = frame(f, k * dt);
    for (const v of fr) s += String.fromCharCode(97 + Math.round(v * 4) + 4);
  }
  return s;
}

/** Draw a field on a canvas in ink: size ∝ |v|, filled when positive, ringed when negative. */
export function paint(g: CanvasRenderingContext2D, vals: Float32Array, size: number, ink: string): void {
  const cell = size / N;
  g.clearRect(0, 0, size, size);
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.lineWidth = Math.max(1, cell * 0.08);
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (!v) continue;
    const r = (Math.abs(v) * cell) / 2 - 1;
    if (r <= 0.3) continue;
    const cx = (i % N) * cell + cell / 2;
    const cy = Math.floor(i / N) * cell + cell / 2;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    if (v > 0) g.fill();
    else g.stroke();
  }
}

/**
 * Téléphérique — pure part. The field to reproduce, and how it is sampled
 * (one period, 32 frames): any formula that draws the same frames is right.
 * Like tixy.land, a formula is at most 32 bytes.
 */
export const TARGET = 'x+y==15&&1-abs(x-8+8*cos(t))/4';

/** Where the player starts. */
export const TEMPLATE = 'x+y==15&&1-abs(x-t*4%16)/4';

export const MAX_BYTES = 32;
export const bytes = (s: string) => new TextEncoder().encode(s).length;

export const FRAMES = 32;
export const DT = (2 * Math.PI) / FRAMES;

/**
 * How much ink two samples share, 0..1: the level differences summed over the
 * cells where either is lit, against the larger of the two. Empty cells don't
 * count (most of the field is empty in both, which says nothing).
 */
export function likeness(got: string, want: string): number {
  if (got.length !== want.length) return 0;
  let err = 0;
  let mag = 0;
  for (let k = 0; k < got.length; k++) {
    const a = got.charCodeAt(k) - 101;
    const b = want.charCodeAt(k) - 101;
    err += Math.abs(a - b);
    mag += Math.max(Math.abs(a), Math.abs(b));
  }
  return mag ? Math.max(0, 1 - err / mag) : 1;
}

/** Diamonds lit out of n: the last one only for the exact field. */
export const lit = (got: string, want: string, n: number) =>
  got === want ? n : Math.min(n - 1, Math.floor(likeness(got, want) * n));

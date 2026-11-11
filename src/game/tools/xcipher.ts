/**
 * The "x" cipher (fxi.io/x), ported verbatim so documents round-trip with
 * that app: a sequence of arrow directions is the key; text (UTF-16 code
 * units split into bytes) becomes rows of 8 bits, and bit rows become a
 * pixel image (one row of 8 cells per byte).
 */

export type Direction = 'up' | 'down' | 'left' | 'right';
export const ARROW: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' };

const stringToBytes = (str: string): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return bytes;
};

const bytesToString = (bytes: number[]): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | (bytes[i + 1] ?? 0));
  return out;
};

const PRIME: Record<Direction, number> = { up: 17, down: 23, left: 29, right: 31 };

const pattern = (step: number, d: Direction): number => (((step + 1) * PRIME[d] * 0x9e3779b9) >>> 0) % 256 & 0xff;

const transform = (byte: number, p: number, step: number): number => {
  const pos = step % 8;
  const rot = ((byte << pos) | (byte >> (8 - pos))) & 0xff;
  return (((rot ^ p) * 7 + step * 11) >>> 0) % 256 & 0xff;
};

// 7 is odd, so x -> 7x + c (mod 256) is a bijection: invert with 7^-1 = 183
const untransform = (byte: number, p: number, step: number): number => {
  const unmixed = (((byte - ((step * 11) % 256) + 512) % 256) * 183) % 256;
  const x = unmixed ^ p;
  const pos = step % 8;
  return ((x >> pos) | (x << (8 - pos))) & 0xff;
};

export function encrypt(text: string, key: Direction[]): string {
  if (!text) return '';
  let bytes = stringToBytes(text);
  key.forEach((d, step) => {
    const p = pattern(step, d);
    bytes = bytes.map((b) => transform(b, p, step));
  });
  return bytes.map((b) => b.toString(2).padStart(8, '0')).join('\n');
}

export function decrypt(bits: string, key: Direction[]): string {
  const rows = bits.split(/\s+/).filter(Boolean);
  if (!rows.length) return '';
  let bytes = rows.map((r) => parseInt(r.replace(/[^01]/g, '0').padEnd(8, '0').slice(0, 8), 2));
  for (let i = key.length - 1; i >= 0; i--) {
    const p = pattern(i, key[i]);
    bytes = bytes.map((b) => untransform(b, p, i));
  }
  return bytesToString(bytes);
}

/** Same layout as x's image export: 8 cells per row, `scale` px per cell. */
export const IMG = { scale: 6, threshold: 125 } as const;

export function bitsToCanvas(bits: string, fg: string, bg: string, scale: number = IMG.scale): HTMLCanvasElement {
  const rows = bits.split(/\s+/).filter(Boolean);
  const c = document.createElement('canvas');
  c.width = 8 * scale;
  c.height = Math.max(1, rows.length) * scale;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  rows.forEach((r, y) => {
    for (let x = 0; x < 8; x++) if (r[x] === '1') g.fillRect(x * scale, y * scale, scale, scale);
  });
  return c;
}

/** Read bit rows back from an image in x's layout (light cell = 1). */
export function canvasToBits(c: HTMLCanvasElement, scale: number = IMG.scale): string {
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const n = Math.floor(c.height / scale);
  const lines: string[] = [];
  for (let y = 0; y < n; y++) {
    let line = '';
    for (let x = 0; x < 8; x++) {
      const d = g.getImageData(x * scale + (scale >> 1), y * scale + (scale >> 1), 1, 1).data;
      line += Math.max(d[0], d[1], d[2]) > IMG.threshold ? '1' : '0';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

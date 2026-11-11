/**
 * Bits ⇄ UTF-16, as in fxi.io/binary_utf: a grid of 16 columns, one row per
 * code unit. By default the leftmost cell is the least significant bit (the
 * binutf grid); `msbLeft` reads rows the usual way.
 */

export const COLS = 16;

export function rowToChar(row: ArrayLike<number>, msbLeft = false): string {
  let v = 0;
  for (let x = 0; x < COLS; x++) if (row[x]) v |= 1 << (msbLeft ? COLS - 1 - x : x);
  return v ? String.fromCharCode(v) : '';
}

export function charToRow(ch: string, msbLeft = false): number[] {
  const v = ch.charCodeAt(0) || 0;
  return Array.from({ length: COLS }, (_, x) => (v >> (msbLeft ? COLS - 1 - x : x)) & 1);
}

/** Grid (rows of 16 cells) to text. */
export const gridToText = (rows: ArrayLike<number>[], msbLeft = false) => rows.map((r) => rowToChar(r, msbLeft)).join('');

/** Text to grid rows, one per UTF-16 code unit. */
export const textToGrid = (s: string, msbLeft = false) => Array.from({ length: s.length }, (_, i) => charToRow(s[i], msbLeft));

/** Free-form binary text ("0100 0001 ...") to UTF-16, in groups of `width` bits, MSB first. */
export function binToText(bin: string, width = 16): string {
  const b = bin.replace(/[^01]/g, '');
  let out = '';
  for (let i = 0; i + width <= b.length; i += width) out += String.fromCharCode(parseInt(b.slice(i, i + width), 2));
  return out;
}

export function textToBin(s: string, width = 16): string {
  return Array.from({ length: s.length }, (_, i) => s.charCodeAt(i).toString(2).padStart(width, '0')).join(' ');
}

export function textToHex(s: string): string {
  return Array.from({ length: s.length }, (_, i) => s.charCodeAt(i).toString(16).padStart(4, '0')).join(' ');
}

export function hexToText(h: string): string {
  return (h.match(/[0-9a-f]{1,4}/gi) ?? []).map((x) => String.fromCharCode(parseInt(x, 16))).join('');
}

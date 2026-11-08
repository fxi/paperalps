// Mapterhorn tiles are lossless WebP, 512x512, Terrarium-encoded:
//   h = R * 256 + G + B / 256 - 32768   (metres)
// Verified against the Matterhorn summit (z12 pixel reads 4471.5 m vs 4478 m).

export function terrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Decode RGBA pixels (as from getImageData) into a Float32Array of metres. */
export function decodeTerrarium(rgba: Uint8ClampedArray | Uint8Array, out?: Float32Array): Float32Array {
  const n = rgba.length >> 2;
  const h = out ?? new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    h[i] = rgba[j] * 256 + rgba[j + 1] + rgba[j + 2] / 256 - 32768;
  }
  return h;
}

/** Inverse, handy for tests and synthetic tiles. */
export function encodeTerrarium(h: number): [number, number, number] {
  const v = h + 32768;
  const r = Math.floor(v / 256);
  const g = Math.floor(v - r * 256);
  const b = Math.round((v - r * 256 - g) * 256);
  return [r, g, Math.min(255, b)];
}

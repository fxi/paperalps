// Web Mercator helpers for 512px tiles. "World px at zoom z" means the global
// pixel coordinate where the whole world is 512 * 2^z pixels wide.

export const TILE = 512;
export const EARTH_CIRC = 40075016.686;

export function worldSize(z: number): number {
  return TILE * Math.pow(2, z);
}

export function lonLatToWorld(lon: number, lat: number, z: number): [number, number] {
  const s = worldSize(z);
  const x = ((lon + 180) / 360) * s;
  const latR = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  const y = (1 - Math.asinh(Math.tan(latR)) / Math.PI) / 2 * s;
  return [x, y];
}

export function worldToLonLat(x: number, y: number, z: number): [number, number] {
  const s = worldSize(z);
  const lon = (x / s) * 360 - 180;
  const n = Math.PI * (1 - (2 * y) / s);
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return [lon, lat];
}

/** Ground metres per world pixel at zoom z and latitude lat. */
export function metresPerPixel(lat: number, z: number): number {
  return (EARTH_CIRC * Math.cos((lat * Math.PI) / 180)) / worldSize(z);
}

/** Rescale a world pixel coordinate from zoom `from` to zoom `to`. */
export function rescale(v: number, from: number, to: number): number {
  return v * Math.pow(2, to - from);
}

export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

/** Positive modulo. */
export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

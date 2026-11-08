import { decodeTerrarium } from './decode';
import { TILE, mod, tileKey } from '../geo/mercator';

export const TILE_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
const MAX_CONCURRENT = 8;

export type Heights = Float32Array;
export type Decoder = (blob: Blob) => Promise<Heights>;

/** Browser decoder: lossless WebP -> raw RGBA without colour management -> metres. */
export const browserDecoder: Decoder = async (blob) => {
  const bmp = await createImageBitmap(blob, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' }) as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const { data } = ctx.getImageData(0, 0, c.width, c.height, { colorSpace: 'srgb' } as ImageDataSettings);
  return decodeTerrarium(data);
};

interface Pending {
  z: number;
  x: number;
  y: number;
  key: string;
  priority: number;
  ctrl?: AbortController;
}

/**
 * Fetches, decodes and caches DEM tiles (LRU). Missing tiles (404, outside
 * coverage) are cached as flat sea level so we never refetch them.
 */
export class TileStore {
  private cache = new Map<string, Heights>();
  private queue = new Map<string, Pending>();
  private inflight = new Map<string, Pending>();
  private failed = new Set<string>();
  onLoad: (z: number, x: number, y: number) => void = () => {};

  constructor(
    private maxTiles = 96,
    private decoder: Decoder = browserDecoder,
    private url = TILE_URL,
    private maxZoom = 17,
  ) {}

  has(z: number, x: number, y: number): boolean {
    return this.cache.has(tileKey(z, x, y));
  }

  get(z: number, x: number, y: number): Heights | undefined {
    const k = tileKey(z, x, y);
    const t = this.cache.get(k);
    if (t) {
      // LRU touch
      this.cache.delete(k);
      this.cache.set(k, t);
    }
    return t;
  }

  /** Queue a tile; lower priority value = sooner. Re-requesting updates priority. */
  request(z: number, x: number, y: number, priority = 0): void {
    if (z > this.maxZoom || z < 0) return;
    const n = 1 << z;
    if (y < 0 || y >= n) return;
    x = mod(x, n);
    const key = tileKey(z, x, y);
    if (this.cache.has(key) || this.failed.has(key)) return;
    const f = this.inflight.get(key);
    if (f) {
      f.priority = priority;
      return;
    }
    const q = this.queue.get(key);
    if (q) q.priority = Math.min(q.priority, priority);
    else this.queue.set(key, { z, x, y, key, priority });
  }

  /** Drop queued and abort in-flight requests not in `keep`. */
  retain(keep: Set<string>): void {
    for (const k of this.queue.keys()) if (!keep.has(k)) this.queue.delete(k);
    for (const [k, p] of this.inflight) if (!keep.has(k)) p.ctrl?.abort();
  }

  /** Start fetches up to the concurrency limit. Call once per frame. */
  pump(): void {
    while (this.inflight.size < MAX_CONCURRENT && this.queue.size) {
      let best: Pending | undefined;
      for (const p of this.queue.values()) if (!best || p.priority < best.priority) best = p;
      if (!best) break;
      this.queue.delete(best.key);
      this.start(best);
    }
  }

  get pending(): number {
    return this.queue.size + this.inflight.size;
  }

  private async start(p: Pending): Promise<void> {
    p.ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    this.inflight.set(p.key, p);
    try {
      const url = this.url.replace('{z}', String(p.z)).replace('{x}', String(p.x)).replace('{y}', String(p.y));
      const res = await fetch(url, { signal: p.ctrl?.signal });
      let h: Heights;
      if (res.status === 404 || res.status === 204) h = new Float32Array(TILE * TILE);
      else if (!res.ok) throw new Error(`HTTP ${res.status}`);
      else h = await this.decoder(await res.blob());
      this.put(p.key, h);
      this.onLoad(p.z, p.x, p.y);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.warn('tile failed', p.key, e);
        this.failed.add(p.key);
        setTimeout(() => this.failed.delete(p.key), 15000);
      }
    } finally {
      this.inflight.delete(p.key);
    }
  }

  put(key: string, h: Heights): void {
    this.cache.set(key, h);
    while (this.cache.size > this.maxTiles) {
      const oldest = this.cache.keys().next().value as string;
      this.cache.delete(oldest);
    }
  }

  /**
   * Bilinear elevation at world px (wx, wy) of zoom z, falling back to the
   * nearest cached ancestor. Returns NaN if nothing is available.
   */
  sample(z: number, wx: number, wy: number, maxUp = 6): number {
    for (let lz = z; lz >= Math.max(0, z - maxUp); lz--) {
      const s = Math.pow(2, lz - z);
      const v = this.sampleAt(lz, wx * s, wy * s);
      if (!Number.isNaN(v)) return v;
    }
    return NaN;
  }

  private sampleAt(z: number, wx: number, wy: number): number {
    const fx = wx - 0.5;
    const fy = wy - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = this.px(z, x0, y0);
    const b = this.px(z, x0 + 1, y0);
    const c = this.px(z, x0, y0 + 1);
    const d = this.px(z, x0 + 1, y0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  /** Single texel at integer world px; NaN if the tile isn't cached. */
  px(z: number, x: number, y: number): number {
    const n = 1 << z;
    const tx = mod(Math.floor(x / TILE), n);
    const ty = Math.floor(y / TILE);
    if (ty < 0 || ty >= n) return 0;
    const t = this.cache.get(tileKey(z, tx, ty));
    if (!t) return NaN;
    return t[mod(y, TILE) * TILE + mod(x, TILE)];
  }
}

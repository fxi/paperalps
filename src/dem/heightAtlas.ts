import { TILE, mod } from '../geo/mercator';
import type { TileStore } from './tileStore';

/**
 * A toroidal GPU atlas of DEM tiles at one data zoom `dz`.
 * Tile (x, y) lives in slot (x mod kx, y mod ky); moving the camera only
 * requires uploading the newly exposed tiles. A small RG32I status texture
 * records which tile each slot currently holds so the shader can reject
 * stale or empty slots.
 *
 * Tiles not yet downloaded are filled with an upsampled ancestor so the
 * terrain is never blank; they are replaced as soon as the real tile arrives.
 */
export class HeightAtlas {
  tex: WebGLTexture;
  readonly status: WebGLTexture;
  kx = 0;
  ky = 0;
  dz = -1;
  private slotTile: Int32Array = new Int32Array(0); // x,y per slot (-1 = empty)
  private slotDepth: Float32Array = new Float32Array(0); // 0 = exact, n = ancestor depth
  private scratch = new Float32Array(TILE * TILE);
  private statusDirty = true;
  /** Copy of the provisional (ancestor) data shown in a slot, kept for the fade. */
  private provisional = new Map<number, Float32Array>();
  /** Slots fading from provisional to exact data: t goes 0 -> 1. */
  private fades = new Map<number, { from: Float32Array; to: Float32Array; t: number }>();

  constructor(private gl: WebGL2RenderingContext, private store: TileStore) {
    this.tex = gl.createTexture()!;
    this.status = gl.createTexture()!;
  }

  /** (Re)allocate for a ring of kx * ky tiles at data zoom dz. */
  configure(kx: number, ky: number, dz: number): void {
    if (kx === this.kx && ky === this.ky && dz === this.dz) return;
    const gl = this.gl;
    if (kx !== this.kx || ky !== this.ky) {
      // texStorage is immutable: recreate the texture on size change.
      gl.deleteTexture(this.tex);
      this.tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32F, kx * TILE, ky * TILE);
      setNearest(gl);
    }
    this.kx = kx;
    this.ky = ky;
    this.dz = dz;
    this.slotTile = new Int32Array(kx * ky * 2).fill(-1);
    this.slotDepth = new Float32Array(kx * ky).fill(Infinity);
    this.provisional.clear();
    this.fades.clear();
    this.statusDirty = true;
  }

  /**
   * Ensure the tiles in [tx0..tx1] x [ty0..ty1] are resident. `budget` caps
   * the number of uploads this call (Infinity right after a reconfigure, so
   * zoom changes never show empty slots).
   */
  update(tx0: number, ty0: number, tx1: number, ty1: number, budget: number, dt = 1 / 60): number {
    const z = this.dz;
    let uploads = 0;

    // Advance fades: provisional ancestor data eases into the exact tile
    // instead of snapping (a snap reads as the relief jumping).
    for (const [s, f] of this.fades) {
      f.t = Math.min(1, f.t + dt / FADE_S);
      if (f.t >= 1) {
        this.upload(s, f.to);
        this.slotDepth[s] = 0;
        this.fades.delete(s);
        this.provisional.delete(s);
      } else {
        const k = f.t * f.t * (3 - 2 * f.t);
        const out = this.scratch;
        const a = f.from;
        const b = f.to;
        for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * k;
        this.upload(s, out);
      }
    }
    const cx = (tx0 + tx1) / 2;
    const cy = (ty0 + ty1) / 2;
    // centre-out order
    const tiles: [number, number, number][] = [];
    for (let y = ty0; y <= ty1; y++)
      for (let x = tx0; x <= tx1; x++) tiles.push([x, y, Math.hypot(x - cx, y - cy)]);
    tiles.sort((a, b) => a[2] - b[2]);

    for (const [x, y] of tiles) {
      const s = mod(x, this.kx) + mod(y, this.ky) * this.kx;
      const same = this.slotTile[s * 2] === x && this.slotTile[s * 2 + 1] === y;
      const depth = same ? this.slotDepth[s] : Infinity;
      if (this.fades.has(s)) {
        if (same) continue; // still fading in
        this.fades.delete(s); // slot reassigned to another tile
      }
      if (depth === 0) continue;
      if (uploads >= budget) continue;

      const exact = this.store.get(z, x, y);
      if (exact) {
        const prev = same ? this.provisional.get(s) : undefined;
        if (prev && Number.isFinite(budget) && this.fades.size < MAX_FADES) {
          // on screen as a placeholder: fade to the real data
          this.fades.set(s, { from: prev, to: exact, t: 0 });
        } else if (!prev || !Number.isFinite(budget)) {
          this.upload(s, exact);
          this.mark(s, x, y, 0);
          this.provisional.delete(s);
          uploads++;
        }
        continue;
      }
      // Ancestor fallback, only if it improves on what the slot already has.
      for (let d = 1; d <= 6 && d < depth; d++) {
        const az = z - d;
        if (az < 0) break;
        const ax = Math.floor(x / (1 << d));
        const ay = Math.floor(y / (1 << d));
        const anc = this.store.get(az, ax, ay);
        if (!anc) continue;
        const prov = upsample(anc, d, x - ax * (1 << d), y - ay * (1 << d), this.provisional.get(s) ?? new Float32Array(TILE * TILE));
        this.provisional.set(s, prov);
        this.upload(s, prov);
        this.mark(s, x, y, d);
        uploads++;
        break;
      }
    }
    this.flushStatus();
    return uploads;
  }

  /** True when all slots in range hold exact tiles. */
  complete(tx0: number, ty0: number, tx1: number, ty1: number): boolean {
    for (let y = ty0; y <= ty1; y++)
      for (let x = tx0; x <= tx1; x++) {
        const s = mod(x, this.kx) + mod(y, this.ky) * this.kx;
        if (this.slotTile[s * 2] !== x || this.slotTile[s * 2 + 1] !== y || this.slotDepth[s] !== 0) return false;
      }
    return true;
  }

  private upload(slot: number, h: Float32Array): void {
    const gl = this.gl;
    const sx = slot % this.kx;
    const sy = Math.floor(slot / this.kx);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, sx * TILE, sy * TILE, TILE, TILE, gl.RED, gl.FLOAT, h);
  }

  private mark(slot: number, x: number, y: number, depth: number): void {
    this.slotTile[slot * 2] = x;
    this.slotTile[slot * 2 + 1] = y;
    this.slotDepth[slot] = depth;
    this.statusDirty = true;
  }

  private flushStatus(): void {
    if (!this.statusDirty) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.status);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32I, this.kx, this.ky, 0, gl.RG_INTEGER, gl.INT, this.slotTile);
    setNearest(gl);
    this.statusDirty = false;
  }
}

const FADE_S = 0.5;
const MAX_FADES = 4;

function setNearest(gl: WebGL2RenderingContext): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/**
 * Bilinearly upsample the (ox, oy) child at depth d of ancestor tile `src`
 * into `out` (TILE x TILE). Pixel centres are respected so levels align.
 */
export function upsample(src: Float32Array, d: number, ox: number, oy: number, out: Float32Array): Float32Array {
  const f = 1 / (1 << d);
  const bx = ox * TILE * f;
  const by = oy * TILE * f;
  const max = TILE - 1;
  for (let j = 0; j < TILE; j++) {
    let sy = by + (j + 0.5) * f - 0.5;
    if (sy < 0) sy = 0;
    if (sy > max) sy = max;
    const y0 = Math.floor(sy);
    const y1 = Math.min(max, y0 + 1);
    const ty = sy - y0;
    const r0 = y0 * TILE;
    const r1 = y1 * TILE;
    for (let i = 0; i < TILE; i++) {
      let sx = bx + (i + 0.5) * f - 0.5;
      if (sx < 0) sx = 0;
      if (sx > max) sx = max;
      const x0 = Math.floor(sx);
      const x1 = Math.min(max, x0 + 1);
      const tx = sx - x0;
      const a = src[r0 + x0] * (1 - tx) + src[r0 + x1] * tx;
      const b = src[r1 + x0] * (1 - tx) + src[r1 + x1] * tx;
      out[j * TILE + i] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

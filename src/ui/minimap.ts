import type { TileStore } from '../dem/tileStore';
import { TILE } from '../geo/mercator';
import { EARTH_CIRC } from '../geo/mercator';
import { mercLat, FOVY, type Flyer } from '../render/camera';
import { displayName, type Peak } from './peaks';

const N = 44; // sample grid

/**
 * Overview map: stair-stepped contour bands (iso-band boundaries drawn along
 * grid cell edges, which gives the pixel-stepped line look), the player as a
 * square at the centre and a few named summits with leader lines.
 */
export class Minimap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private grid = new Float32Array((N + 1) * (N + 1));
  private tmp = new Float32Array((N + 1) * (N + 1));
  private last = 0;
  /** Low percentile of elevations near the player (for valley fog). */
  lowAlt = NaN;
  /** Solved game summits in order, drawn as a dashed line. */
  trail: Peak[] = [];

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'minimap';
    this.canvas = document.createElement('canvas');
    this.el.appendChild(this.canvas);
    parent.appendChild(this.el);
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** Data zoom used for the overview. */
  level(dz: number): number {
    return Math.max(5, dz - 3);
  }

  /** World extent (normalised merc) shown: a square of side `metres`. */
  extent(fl: Flyer, metres: number): number {
    return metres / (EARTH_CIRC * Math.cos(mercLat(fl.my)));
  }

  /** Tiles to request at the overview level. */
  tiles(cam: Flyer, dz: number, metres: number): [number, number, number, number, number] {
    const z = this.level(dz);
    const e = this.extent(cam, metres) / 2;
    const n = 1 << z;
    return [z, Math.floor((cam.mx - e) * n), Math.floor((cam.my - e) * n), Math.floor((cam.mx + e) * n), Math.floor((cam.my + e) * n)];
  }

  draw(now: number, cam: Flyer, dz: number, metres: number, store: TileStore, peaks: Peak[], force = false): void {
    if (!force && now - this.last < 180) return;
    this.last = now;

    const css = this.el.clientWidth || 180;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    if (this.canvas.width !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
    const ctx = this.ctx;
    const z = this.level(dz);
    const ws = TILE * Math.pow(2, z);
    const ext = this.extent(cam, metres);
    const x0 = (cam.mx - ext / 2) * ws;
    const y0 = (cam.my - ext / 2) * ws;
    const step = (ext * ws) / N;

    let lo = Infinity;
    let hi = -Infinity;
    let missing = 0;
    for (let j = 0; j <= N; j++)
      for (let i = 0; i <= N; i++) {
        const v = store.sample(z, x0 + i * step, y0 + j * step);
        this.grid[j * (N + 1) + i] = v;
        if (Number.isNaN(v)) missing++;
        else {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }

    // 3x3 box blur: calmer, more graphic contours
    this.tmp.set(this.grid);
    for (let j = 1; j < N; j++)
      for (let i = 1; i < N; i++) {
        let sum = 0;
        let c = 0;
        for (let b = -1; b <= 1; b++)
          for (let a = -1; a <= 1; a++) {
            const v = this.tmp[(j + b) * (N + 1) + i + a];
            if (!Number.isNaN(v)) {
              sum += v;
              c++;
            }
          }
        if (c) this.grid[j * (N + 1) + i] = sum / c;
      }

    // valley fog reference: 15th percentile of the central third
    const near: number[] = [];
    for (let j = Math.floor(N / 3); j <= Math.ceil((2 * N) / 3); j++)
      for (let i = Math.floor(N / 3); i <= Math.ceil((2 * N) / 3); i++) {
        const v = this.grid[j * (N + 1) + i];
        if (!Number.isNaN(v)) near.push(v);
      }
    if (near.length > 10) {
      near.sort((a, b) => a - b);
      this.lowAlt = near[Math.floor(near.length * 0.15)];
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    const css2 = getComputedStyle(document.body);
    const ink = css2.getPropertyValue('--ink').trim() || '#1b1b1d';
    ctx.fillStyle = css2.getPropertyValue('--hud-bg').trim() || 'rgba(232,231,227,0.88)';
    ctx.fillRect(0, 0, px, px);
    const cs = px / N;

    if (missing < (N + 1) * (N + 1) && hi > lo) {
      const interval = niceInterval((hi - lo) / 5);
      const band = (v: number) => (Number.isNaN(v) ? NaN : Math.floor(v / interval));
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1, dpr * 0.9);
      ctx.beginPath();
      // cell (i,j) is centred on sample (i,j); boundaries between neighbours
      for (let j = 0; j <= N; j++)
        for (let i = 0; i <= N; i++) {
          const b = band(this.grid[j * (N + 1) + i]);
          if (Number.isNaN(b)) continue;
          if (i < N) {
            const r = band(this.grid[j * (N + 1) + i + 1]);
            if (!Number.isNaN(r) && r !== b) {
              const x = (i + 1) * cs - cs / 2;
              ctx.moveTo(snap(x), snap(j * cs - cs / 2));
              ctx.lineTo(snap(x), snap((j + 1) * cs - cs / 2));
            }
          }
          if (j < N) {
            const d = band(this.grid[(j + 1) * (N + 1) + i]);
            if (!Number.isNaN(d) && d !== b) {
              const y = (j + 1) * cs - cs / 2;
              ctx.moveTo(snap(i * cs - cs / 2), snap(y));
              ctx.lineTo(snap((i + 1) * cs - cs / 2), snap(y));
            }
          }
        }
      ctx.stroke();
    }

    // game trail: solved summits in order, dashed ink
    if (this.trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.6 * dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.beginPath();
      this.trail.forEach((p, i) => {
        const sx = ((p.mx - cam.mx) / ext + 0.5) * px;
        const sy = ((p.my - cam.my) / ext + 0.5) * px;
        if (i) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
      });
      ctx.stroke();
      ctx.restore();
    }

    // view cone (horizontal field of view along the heading)
    const hfov = Math.atan(Math.tan(FOVY / 2) * (window.innerWidth / window.innerHeight));
    const coneR = px * 0.34;
    ctx.save();
    ctx.translate(px / 2, px / 2);
    ctx.rotate(cam.yaw);
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = ink;
    ctx.lineWidth = dpr;
    ctx.setLineDash([2 * dpr, 3 * dpr]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-Math.sin(hfov) * coneR, -Math.cos(hfov) * coneR);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(hfov) * coneR, -Math.cos(hfov) * coneR);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // peaks: the three most prominent within the map
    ctx.font = `500 ${11 * dpr}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    let shown = 0;
    // occupied rects: the player marker in the middle, then each label
    const boxes: [number, number, number, number][] = [[px / 2 - 8 * dpr, px / 2 - 8 * dpr, px / 2 + 8 * dpr, px / 2 + 8 * dpr]];
    const lineH = 12 * dpr;
    for (const p of peaks) {
      if (shown >= 3) break;
      const sx = ((p.mx - cam.mx) / ext + 0.5) * px;
      const sy = ((p.my - cam.my) / ext + 0.5) * px;
      if (sx < px * 0.06 || sx > px * 0.94 || sy < px * 0.2 || sy > px * 0.94) continue;
      const name = displayName(p.name);
      const words = name.length > 10 ? splitName(name) : [name];
      const left = sx > px / 2;
      const lx = left ? sx - 16 * dpr : sx + 16 * dpr;
      const ly = sy - 14 * dpr;
      const tw = Math.max(...words.map((w) => ctx.measureText(w).width)) + 4 * dpr;
      const box: [number, number, number, number] = [
        left ? lx - tw : Math.min(sx, lx) - 4 * dpr,
        ly - words.length * lineH,
        left ? Math.max(sx, lx) + 4 * dpr : lx + tw,
        sy + 4 * dpr,
      ];
      if (box[0] < 0 || box[2] > px || box[1] < 0) continue;
      if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      boxes.push(box);
      shown++;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.6 * dpr, 0, Math.PI * 2);
      ctx.lineWidth = dpr;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx + (left ? -2 : 2) * dpr, sy - 2 * dpr);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.textAlign = left ? 'right' : 'left';
      words.forEach((w, k) => ctx.fillText(w, lx + (left ? -2 : 2) * dpr, ly - (words.length - 1 - k) * lineH));
    }

    // frame ticks
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5 * dpr;
    const t = 8 * dpr;
    ctx.beginPath();
    ctx.moveTo(px / 2, px);
    ctx.lineTo(px / 2, px - t);
    ctx.moveTo(px, px / 2);
    ctx.lineTo(px - t, px / 2);
    ctx.moveTo(0, px / 2);
    ctx.lineTo(t, px / 2);
    ctx.stroke();

    // player: heading arrow
    ctx.save();
    ctx.translate(px / 2, px / 2);
    ctx.rotate(cam.yaw);
    ctx.fillStyle = ink;
    const s = 5 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.5);
    ctx.lineTo(s, s);
    ctx.lineTo(0, s * 0.4);
    ctx.lineTo(-s, s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function snap(v: number): number {
  return Math.round(v) + 0.5;
}

function splitName(n: string): string[] {
  const i = n.lastIndexOf(' ', 11);
  return i > 0 ? [n.slice(0, i), n.slice(i + 1)] : [n.slice(0, 11)];
}

export function niceInterval(raw: number): number {
  const steps = [100, 200, 250, 500, 1000];
  for (const s of steps) if (raw <= s) return s;
  return 1000;
}

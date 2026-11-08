import { FULLSCREEN_VS, program, uniforms } from './gl';
import commonGLSL from './common.glsl?raw';
import terrainVS from './terrain.vert?raw';
import paperFS from './paper.frag?raw';
import skyFS from './sky.frag?raw';
import { HeightAtlas } from '../dem/heightAtlas';
import type { TileStore } from '../dem/tileStore';
import { TILE, EARTH_CIRC } from '../geo/mercator';
import { octaves, clipLevel } from './view';
import { mercLat, type View } from './camera';

export interface Art {
  exag: number; // shading exaggeration
  lift: number; // geometric exaggeration (2.5D relief)
  crumple: number;
  facet: number;
  cell: number; // base facet size in CSS px
  shadow: number;
  fog: number;
  clouds: number;
  sunAz: number; // degrees from north, clockwise
  sunEl: number; // degrees
  sharp: number; // octave dominance
  expo: number;
  contrast: number;
  tilt: number; // degrees, 3D view tilt
}

export const DEFAULT_ART: Art = {
  exag: 4,
  lift: 1.6,
  crumple: 0,
  facet: 1,
  cell: 5,
  shadow: 1,
  fog: 0.5,
  clouds: 1,
  sunAz: 318,
  sunEl: 41,
  sharp: 6,
  expo: 1.14,
  contrast: 0.34,
  tilt: 62,
};

/** Rings (tiles per side) for the near (dz) and far (dz-3) height atlases. */
export const NEAR_K = 7;
export const FAR_K = 5;
export const FAR_DROP = 3;

/** Must match NOISE_K and the lattice mask in paper.frag. */
const NOISE_P = 4096;
const NOISE_K = [0.045, 0.12, 2.6, 9.0, 0.6]; // clouds, mist, fibre, fibre, brush
const NOISE_DRIFT: [number, number][] = [[0.01, 0.004], [-0.006, 0.003], [0, 0], [0, 0], [0, 0]];

/** Clipmap: quads per side (multiple of 4 so origins snap to 2·spacing) and levels. */
const GRID_N = 80;
const MAX_LEVELS = 12;
/** Level-0 spacing in near data px. */
const BASE_SPACING = 2;

const PAPER_SKY = { top: [0.79, 0.79, 0.78], low: [0.885, 0.882, 0.875] };
const INK_SKY = { top: [0.025, 0.025, 0.028], low: [0.105, 0.105, 0.11] };

export interface FrameExtra {
  time: number;
  fogAlt: number;
  fade: number;
  ink: number; // 0..1
  ground: number; // terrain under the flyer
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly near: HeightAtlas;
  readonly far: HeightAtlas;
  private terrain: WebGLProgram;
  private sky: WebGLProgram;
  private ut: (n: string) => WebGLUniformLocation | null;
  private us: (n: string) => WebGLUniformLocation | null;
  private meshVao: WebGLVertexArrayObject;
  private emptyVao: WebGLVertexArrayObject;
  /** Index ranges: [0] full grid, [1 + ix + 2·iy] ring with its hole at offset (N/4+ix, N/4+iy). */
  private parts: { offset: number; count: number }[];
  /** GPU time per frame (ms, smoothed) when profiling is on (`?debug`). */
  gpuMs = NaN;
  profile = false;
  private timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  private queries: WebGLQuery[] = [];
  renderScale = 1;
  cssW = 1;
  cssH = 1;

  constructor(private canvas: HTMLCanvasElement, store: TileStore) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is required');
    this.gl = gl;
    const V = '#version 300 es\n';
    this.terrain = program(gl, V + commonGLSL + terrainVS, V + commonGLSL + paperFS);
    this.sky = program(gl, FULLSCREEN_VS, V + skyFS);
    this.ut = uniforms(gl, this.terrain);
    this.us = uniforms(gl, this.sky);
    this.near = new HeightAtlas(gl, store);
    this.far = new HeightAtlas(gl, store);
    this.emptyVao = gl.createVertexArray()!;
    this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    [this.meshVao, this.parts] = this.buildMesh();
  }

  /**
   * One (N+1)² vertex grid shared by every clipmap level, with five index
   * ranges: the full grid (finest level) and four rings whose N/2-wide hole
   * sits at cell offset N/4 or N/4+1 on each axis, which is exactly where the
   * snapped finer level lands. Levels never overlap, so no discard is needed.
   * All quads split along the same (a–d) diagonal, so a fully blended 2x2
   * block is coplanar with the coarse quad it sits in.
   */
  private buildMesh(): [WebGLVertexArrayObject, { offset: number; count: number }[]] {
    const gl = this.gl;
    const n = GRID_N;
    const verts = new Float32Array((n + 1) * (n + 1) * 2);
    let v = 0;
    for (let y = 0; y <= n; y++)
      for (let x = 0; x <= n; x++) {
        verts[v++] = x;
        verts[v++] = y;
      }
    const idx: number[] = [];
    const parts: { offset: number; count: number }[] = [];
    const at = (x: number, y: number) => y * (n + 1) + x;
    const emit = (hx: number, hy: number) => {
      const start = idx.length;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          if (hx >= 0 && x >= hx && x < hx + n / 2 && y >= hy && y < hy + n / 2) continue;
          const a = at(x, y), b = at(x + 1, y), c = at(x, y + 1), d = at(x + 1, y + 1);
          idx.push(a, c, d, a, d, b);
        }
      parts.push({ offset: start * 4, count: idx.length - start });
    };
    const h = n / 4;
    emit(-1, -1);
    for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) emit(h + ix, h + iy);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.terrain, 'aGrid');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return [vao, parts];
  }

  resize(cssW: number, cssH: number, renderScale: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.renderScale = renderScale;
    const w = Math.max(1, Math.round(cssW * renderScale));
    const h = Math.max(1, Math.round(cssH * renderScale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** k x k tile range at zoom z centred on a normalised Mercator point. */
  static range(mx: number, my: number, z: number, k: number): [number, number, number, number] {
    const n = Math.pow(2, z);
    const x0 = Math.round(mx * n - k / 2);
    const y0 = Math.round(my * n - k / 2);
    return [x0, y0, x0 + k - 1, y0 + k - 1];
  }

  draw(view: View, dz: number, art: Art, ex: FrameExtra): void {
    const gl = this.gl;
    const fl = view.flyer;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    let q: WebGLQuery | null = null;
    if (this.profile && this.timerExt) {
      this.readTimers();
      q = gl.createQuery();
      if (q) gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, q);
    }
    const mix = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] - v) * ex.ink);
    const skyTop = mix(PAPER_SKY.top, INK_SKY.top);
    const skyLow = mix(PAPER_SKY.low, INK_SKY.low);

    // ---- sky ----
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.sky);
    gl.bindVertexArray(this.emptyVao);
    const us = this.us;
    gl.uniform2f(us('uRes'), this.canvas.width, this.canvas.height);
    const hp = view.basis.heading;
    const horizon = projectY(view, hp[0] * 1e6, hp[1] * 1e6, 0);
    gl.uniform1f(us('uHorizon'), horizon * this.renderScale);
    gl.uniform3fv(us('uSkyTop'), skyTop);
    gl.uniform3fv(us('uSkyLow'), skyLow);
    gl.uniform1f(us('uTime'), ex.time);
    gl.uniform1f(us('uCssPx'), this.renderScale);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- terrain ----
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.terrain);
    gl.bindVertexArray(this.meshVao);
    const u = this.ut;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.near.tex);
    gl.uniform1i(u('uHeights'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.near.status);
    gl.uniform1i(u('uStatus'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.far.tex);
    gl.uniform1i(u('uHeightsF'), 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.far.status);
    gl.uniform1i(u('uStatusF'), 3);
    gl.uniform2i(u('uK'), this.near.kx, this.near.ky);
    gl.uniform2i(u('uKF'), this.far.kx, this.far.ky);
    gl.uniform1f(u('uNearReach'), (NEAR_K / 2 - 0.5) * TILE);

    const ws = TILE * Math.pow(2, dz);
    setCam(gl, u('uCamInt'), u('uCamFrac'), fl.mx * ws, fl.my * ws);
    const wsF = TILE * Math.pow(2, dz - FAR_DROP);
    setCam(gl, u('uCamIntF'), u('uCamFracF'), fl.mx * wsF, fl.my * wsF);

    const mpp = (EARTH_CIRC * Math.cos(mercLat(fl.my))) / ws;
    gl.uniform1f(u('uMpp'), mpp);
    gl.uniformMatrix4fv(u('uViewProj'), false, view.viewProj);
    gl.uniform1f(u('uLift'), art.lift);
    gl.uniform1f(u('uAlt'), fl.alt);
    gl.uniform1f(u('uGnd'), ex.ground);

    gl.uniform2f(u('uRes'), this.canvas.width, this.canvas.height);
    gl.uniform1f(u('uCssPx'), this.renderScale);

    const oct = octaves({ mx: fl.mx, my: fl.my, zoom: view.ez }, dz, art.cell, art.sharp);
    for (let i = 0; i < 4; i++) {
      const o = oct[i];
      gl.uniform2i(u(`uOctBase[${i}]`), o.baseX, o.baseY);
      gl.uniform2f(u(`uOctFrac[${i}]`), o.fracX, o.fracY);
      gl.uniform1f(u(`uOctCell[${i}]`), o.cellData);
      gl.uniform1f(u(`uOctW[${i}]`), o.weight);
      gl.uniform1i(u(`uOctLevel[${i}]`), o.level);
    }

    gl.uniform1f(u('uExag'), art.exag);
    gl.uniform1f(u('uCrumple'), art.crumple);
    gl.uniform1f(u('uFacet'), art.facet);
    const az = (art.sunAz * Math.PI) / 180;
    const el = (art.sunEl * Math.PI) / 180;
    gl.uniform3f(u('uSun'), Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el));
    gl.uniform1f(u('uShadow'), art.shadow);
    gl.uniform1f(u('uFogAlt'), ex.fogAlt);
    gl.uniform1f(u('uFog'), art.fog);
    gl.uniform1f(u('uClouds'), art.clouds);
    gl.uniform1f(u('uFogDist'), view.far * 0.42);
    gl.uniform3fv(u('uFogCol'), skyLow);
    gl.uniform1f(u('uInk'), ex.ink);
    // Noise anchors (see paper.frag): flyer in z8 px times each domain's
    // frequency, plus its drift, wrapped to the noise lattice period in double
    // precision. Small coordinates on the GPU, and no visible seam at the wrap.
    const w8 = TILE * 256;
    const zx = fl.mx * w8;
    const zy = fl.my * w8;
    const t = ex.time;
    const wrap = (v: number) => v - Math.floor(v / NOISE_P) * NOISE_P;
    NOISE_K.forEach((k, i) => {
      const [dx, dy] = NOISE_DRIFT[i];
      gl.uniform2f(u(`uNoiseA[${i}]`), wrap(zx * k + dx * t), wrap(zy * k + dy * t));
    });
    gl.uniform1f(u('uZ8PerData'), Math.pow(2, 8 - dz));
    gl.uniform1f(u('uTime'), ex.time);
    gl.uniform1f(u('uFade'), ex.fade);
    gl.uniform1f(u('uExpo'), art.expo);
    gl.uniform1f(u('uContrast'), art.contrast);

    // ---- clipmap levels, finest first (front-to-back helps early-z) ----
    const fx = fl.mx * ws;
    const fy = fl.my * ws;
    const farPx = (view.far * 1.05) / mpp;
    let prev: { ox: number; oy: number } | null = null;
    for (let L = 0; L < MAX_LEVELS; L++) {
      const { s, ox, oy, reach } = clipLevel(fx, fy, L, GRID_N, BASE_SPACING);
      const last = L === MAX_LEVELS - 1 || reach >= farPx;
      let part = this.parts[0];
      if (prev) {
        // where the finer level sits inside this one, in cells: N/4 or N/4+1
        const ix = Math.round((prev.ox - ox) / s) - GRID_N / 4;
        const iy = Math.round((prev.oy - oy) / s) - GRID_N / 4;
        part = this.parts[1 + ix + 2 * iy];
      }
      gl.uniform2f(u('uOrigin'), ox - fx, oy - fy);
      gl.uniform1f(u('uSpacing'), s);
      // same blend band on every level, including the outermost, so adding or
      // dropping a far level never toggles a visible band
      gl.uniform2f(u('uMorph'), reach * 0.62, reach * 0.86);
      gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, part.offset);
      prev = { ox, oy };
      if (last) break;
    }
    if (q && this.timerExt) {
      gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
      this.queries.push(q);
    }
  }

  private readTimers(): void {
    const gl = this.gl;
    const disjoint = gl.getParameter(this.timerExt!.GPU_DISJOINT_EXT);
    while (this.queries.length) {
      const q = this.queries[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      gl.deleteQuery(q);
      this.queries.shift();
      if (disjoint) continue;
      const ms = ns / 1e6;
      this.gpuMs = Number.isNaN(this.gpuMs) ? ms : this.gpuMs * 0.9 + ms * 0.1;
    }
  }
}

function setCam(gl: WebGL2RenderingContext, li: WebGLUniformLocation | null, lf: WebGLUniformLocation | null, x: number, y: number): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  gl.uniform2i(li, ix, iy);
  gl.uniform2f(lf, x - ix, y - iy);
}

/** Screen y (CSS px) of a local point, extrapolating behind/above the view. */
function projectY(v: View, e: number, n: number, z: number): number {
  const m = v.viewProj;
  const cy = m[1] * e + m[5] * n + m[9] * z + m[13];
  const cw = m[3] * e + m[7] * n + m[11] * z + m[15];
  if (cw <= 1e-6) return -1e5; // horizon behind (looking straight down)
  return (1 - (cy / cw * 0.5 + 0.5)) * v.cssH;
}

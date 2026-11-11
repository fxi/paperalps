/**
 * World hooks for puzzles and tools: geometry laid on the landscape (lines,
 * points, tappable glyphs), a screen-space ghost (a skyline to match), night
 * with lamps, and the plan / plane view. Everything is anchored in lon/lat
 * and re-projected every frame by main.ts through `WorldHost`.
 */
import { SVG_NS, icon, type IconName } from './kit';

export interface Camera {
  lat: number;
  lon: number;
  alt: number;
  ground: number;
  heading: number; // degrees, 0 = north, clockwise
  plan: boolean;
}

export interface WorldHost {
  camera(): Camera;
  /** Screen position of a lon/lat (ele NaN = on the ground); null if hidden or unknown. */
  project(lon: number, lat: number, ele?: number): [number, number, number] | null;
  /** Screen position of a direction from the eye (azimuth, lifted elevation angle), radians. */
  projectDir(az: number, el: number): [number, number] | null;
  ground(lon: number, lat: number): number;
  lift: number;
  setPlan(on: boolean): void;
  isPlan(): boolean;
  setNight(v: number, lamps: Lamp[]): void;
  flyToLonLat(lon: number, lat: number): void;
}

export interface Lamp {
  lon: number;
  lat: number;
  ele: number;
  radius: number; // metres
  power: number; // 0..1
}

export type Show = 'always' | 'plan' | 'near';

export interface LineItem {
  coords: [number, number][]; // lon, lat
  cls?: string;
  show?: Show;
  ele?: number[]; // optional fixed elevation per vertex (else draped)
}

export interface PointItem {
  lon: number;
  lat: number;
  ele?: number;
  cls?: string;
  glyph?: string;
  icon?: IconName;
  show?: Show;
  onTap?: () => void;
  label?: string; // aria label only
}

export class Layer {
  lines: LineItem[] = [];
  points: PointItem[] = [];
  g: SVGGElement;
  constructor(public id: string, parent: SVGElement) {
    this.g = document.createElementNS(SVG_NS, 'g');
    this.g.setAttribute('class', `wl wl-${id}`);
    parent.appendChild(this.g);
  }
  clear(): void {
    this.lines = [];
    this.points = [];
  }
}

/** Densify a lon/lat polyline to steps of ~`stepM` metres so it drapes over relief. */
export function densify(coords: [number, number][], stepM = 400): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < coords.length; i++) {
    const a = coords[i];
    if (i === 0) {
      out.push(a);
      continue;
    }
    const p = coords[i - 1];
    const k = Math.cos((a[1] * Math.PI) / 180);
    const d = Math.hypot((a[0] - p[0]) * k, a[1] - p[1]) * 111320;
    const n = Math.max(1, Math.ceil(d / stepM));
    for (let j = 1; j <= n; j++) out.push([p[0] + ((a[0] - p[0]) * j) / n, p[1] + ((a[1] - p[1]) * j) / n]);
  }
  return out;
}

export class World {
  private layers = new Map<string, Layer>();
  private svg: SVGSVGElement;
  private ghostPath: SVGPathElement;
  private eleCache = new Map<string, number>();
  ghost: { az: number[]; el: number[]; flip: boolean } | null = null;

  constructor(
    svg: SVGSVGElement,
    public host: WorldHost,
  ) {
    this.svg = svg;
    this.ghostPath = document.createElementNS(SVG_NS, 'path');
    this.ghostPath.setAttribute('class', 'ghost-line');
    svg.appendChild(this.ghostPath);
  }

  private shutterBtn: HTMLButtonElement | null = null;

  /** Lay a skyline over the view (null removes it); a shutter appears while it is up. */
  setGhost(g: { az: number[]; el: number[]; flip: boolean } | null, onShutter?: () => Promise<boolean>): void {
    this.ghost = g;
    this.shutterBtn?.remove();
    this.shutterBtn = null;
    if (!g || !onShutter) return;
    const b = document.createElement('button');
    b.className = 'shutter';
    b.type = 'button';
    b.setAttribute('aria-label', 'shutter');
    b.innerHTML = '<span></span>';
    b.addEventListener('click', async () => {
      b.classList.remove('miss', 'hit');
      void b.offsetWidth;
      b.classList.add('flash');
      const ok = await onShutter();
      b.classList.add(ok ? 'hit' : 'miss');
      if (ok) setTimeout(() => this.setGhost(null), 900);
    });
    document.body.appendChild(b);
    this.shutterBtn = b;
  }

  layer(id: string): Layer {
    let l = this.layers.get(id);
    if (!l) {
      l = new Layer(id, this.svg);
      this.layers.set(id, l);
    }
    return l;
  }

  has(id: string): boolean {
    return this.layers.has(id);
  }

  drop(id: string): void {
    const l = this.layers.get(id);
    if (!l) return;
    l.g.remove();
    this.layers.delete(id);
  }

  private ele(lon: number, lat: number): number {
    const k = `${lon.toFixed(5)},${lat.toFixed(5)}`;
    const c = this.eleCache.get(k);
    if (c !== undefined) return c;
    const g = this.host.ground(lon, lat);
    if (!Number.isNaN(g)) {
      if (this.eleCache.size > 50000) this.eleCache.clear();
      this.eleCache.set(k, g);
    }
    return g;
  }

  /** Called every frame by main.ts. */
  update(w: number, h: number): void {
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const plan = this.host.isPlan();
    const cam = this.host.camera();
    for (const l of this.layers.values()) {
      const byCls = new Map<string, string>();
      for (const li of l.lines) {
        if (!visible(li.show, plan, cam, li.coords[0])) continue;
        let s = '';
        let pen = false;
        for (let i = 0; i < li.coords.length; i++) {
          const [lon, lat] = li.coords[i];
          const e = li.ele?.[i] ?? this.ele(lon, lat);
          const p = Number.isNaN(e) ? null : this.host.project(lon, lat, e + 6);
          if (!p) {
            pen = false;
            continue;
          }
          s += `${pen ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
          pen = true;
        }
        const cls = li.cls ?? 'wl-line';
        byCls.set(cls, (byCls.get(cls) ?? '') + s);
      }
      // one path per class
      const paths = Array.from(l.g.querySelectorAll<SVGPathElement>(':scope > path'));
      let pi = 0;
      for (const [cls, dd] of byCls) {
        let p = paths[pi++];
        if (!p) {
          p = document.createElementNS(SVG_NS, 'path');
          l.g.insertBefore(p, l.g.firstChild);
        }
        p.setAttribute('class', cls);
        p.setAttribute('d', dd);
      }
      for (; pi < paths.length; pi++) paths[pi].setAttribute('d', '');
      this.drawPoints(l, plan, cam);
    }
    this.drawGhost();
  }

  private drawPoints(l: Layer, plan: boolean, cam: Camera): void {
    const els = Array.from(l.g.querySelectorAll<SVGGElement>(':scope > g.wp'));
    l.points.forEach((pt, i) => {
      let g = els[i];
      if (!g) {
        g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'wp');
        const hit = document.createElementNS(SVG_NS, 'circle');
        hit.setAttribute('r', '30');
        hit.setAttribute('class', 'wp-hit');
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('class', 'wp-dot');
        const txt = document.createElementNS(SVG_NS, 'text');
        txt.setAttribute('class', 'wp-glyph');
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('dy', '0.35em');
        g.append(hit, dot, txt);
        l.g.appendChild(g);
        g.addEventListener('click', () => (g as unknown as { _tap?: () => void })._tap?.());
        g.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (g as unknown as { _tap?: () => void })._tap?.();
          }
        });
      }
      (g as unknown as { _tap?: () => void })._tap = pt.onTap;
      g.setAttribute('class', `wp ${pt.cls ?? ''}${pt.onTap ? ' tap' : ''}`);
      if (pt.onTap) {
        g.setAttribute('role', 'button');
        g.setAttribute('tabindex', '0');
        if (pt.label) g.setAttribute('aria-label', pt.label);
      }
      const e = pt.ele ?? this.ele(pt.lon, pt.lat);
      const p = visible(pt.show, plan, cam, [pt.lon, pt.lat]) && !Number.isNaN(e) ? this.host.project(pt.lon, pt.lat, e) : null;
      if (!p) {
        g.setAttribute('display', 'none');
        return;
      }
      g.removeAttribute('display');
      g.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`);
      const t = g.querySelector('text')!;
      if (t.textContent !== (pt.glyph ?? '')) t.textContent = pt.glyph ?? '';
      const want = pt.icon ?? '';
      if (g.dataset.icon !== want) {
        g.dataset.icon = want;
        g.querySelector('svg.ico')?.remove();
        if (pt.icon) {
          const ic = icon(pt.icon, 'wp-icon');
          for (const [k, v] of Object.entries({ x: -11, y: -11, width: 22, height: 22 })) ic.setAttribute(k, String(v));
          g.appendChild(ic);
        }
      }
    });
    for (let i = l.points.length; i < els.length; i++) els[i].remove();
  }

  private drawGhost(): void {
    const gh = this.ghost;
    if (!gh || this.host.isPlan()) {
      this.ghostPath.setAttribute('d', '');
      return;
    }
    let s = '';
    let pen = false;
    for (let i = 0; i < gh.az.length; i++) {
      const p = this.host.projectDir(gh.az[i], gh.flip ? -gh.el[i] : gh.el[i]);
      if (!p) {
        pen = false;
        continue;
      }
      s += `${pen ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
      pen = true;
    }
    this.ghostPath.setAttribute("d", s);
  }

  /**
   * The skyline seen from a point: for each azimuth, the highest lifted
   * elevation angle of the terrain out to `reach` metres. Authoring helper
   * (needs the tiles loaded) and the ground truth of a photo puzzle.
   */
  skyline(lon: number, lat: number, alt: number, az0: number, az1: number, n: number, reach = 40000): { az: number[]; el: number[] } {
    const az: number[] = [];
    const el: number[] = [];
    const k = Math.cos((lat * Math.PI) / 180) * 111320;
    for (let i = 0; i < n; i++) {
      const a = az0 + ((az1 - az0) * i) / (n - 1);
      let best = -Math.PI / 2;
      for (let d = 60; d < reach; d *= 1.012) {
        const lo = lon + (Math.sin(a) * d) / k;
        const la = lat + (Math.cos(a) * d) / 111320;
        const g = this.host.ground(lo, la);
        if (Number.isNaN(g)) continue;
        const e = Math.atan2((g - alt) * this.host.lift, d);
        if (e > best) best = e;
      }
      az.push(a);
      el.push(best);
    }
    return { az, el };
  }
}

function visible(show: Show | undefined, plan: boolean, cam: Camera, at: [number, number]): boolean {
  if (!show || show === 'always') return true;
  if (show === 'plan') return plan;
  // near: within ~25 km
  const k = Math.cos((cam.lat * Math.PI) / 180);
  return Math.hypot((at[0] - cam.lon) * k, at[1] - cam.lat) * 111.32 < 25;
}

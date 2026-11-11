/**
 * Matterhorn — a print. Still water, a skyline in it; the photographer's
 * viewfinder. The print goes to the notepad; from there it can be laid over
 * the view and shot. The back of the developed print carries the next clue.
 */
import type { PuzzleModule } from '../puzzle';
import { svg, html, inkColors, reducedMotion } from '../kit';
import { candidates } from './riffelseeLogic';
import SKY from './riffelsee.sky.json';

const NOTE_ID = 'riffelsee-print';
const W = 600;
const H = 400;

/** Hash for the facets (deterministic). */
const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The print: the reflection only — the skyline mirrored under a thin strip of
 * shore, the sky bright in the water, ridges broken by ripples.
 */
function print(parent: Element, sky: { az: number[]; el: number[] }): SVGSVGElement {
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rf-print', role: 'img', 'aria-label': 'photo' }, parent);
  const defs = svg('defs', {}, s);
  const f = svg('filter', { id: 'rf-ripple', x: '-5%', y: '-5%', width: '110%', height: '110%' }, defs);
  svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.002 0.09', numOctaves: '2', seed: '7', result: 'n' }, f);
  svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '9', xChannelSelector: 'R', yChannelSelector: 'G' }, f);
  const g = svg('g', { filter: 'url(#rf-ripple)' }, s);

  const n = sky.az.length;
  const a0 = sky.az[0];
  const a1 = sky.az[n - 1];
  const hfov = a1 - a0;
  const k = W / (2 * Math.tan(hfov / 2)); // pinhole, same as the view
  const ac = (a0 + a1) / 2;
  const hz = 70; // the shore line (the horizon of the reflection)
  const X = (a: number) => W / 2 + Math.tan(a - ac) * k;
  // reflection: elevation below the horizon line
  const Y = (e: number) => hz - Math.tan(e) * k;
  const pts: [number, number][] = sky.az.map((a, i) => [X(a), Y(-sky.el[i])]);

  // water: the bright sky reflected, in fine horizontal strokes
  svg('rect', { x: 0, y: hz, width: W, height: H - hz, class: 'rf-water' }, g);
  for (let y = hz + 4; y < H; y += 5 + hash(y) * 6) {
    const x0 = hash(y * 3) * W * 0.6;
    svg('line', { x1: x0, y1: y, x2: x0 + 40 + hash(y * 7) * 220, y2: y, class: 'rf-glint' }, g);
  }
  // the mountains in the water: faceted, dark, fading with depth
  // the mountains in the water: a low-poly mesh between the shore line and
  // the mirrored ridge, lit from the left like the map, darker near the ridge
  const STEP = 4;
  let prevMid: [number, number] | null = null;
  for (let i = 0; i + STEP < n; i += STEP) {
    const a = pts[i];
    const b = pts[i + STEP];
    const depth = Math.max(a[1], b[1]) - hz;
    const m: [number, number] = [(a[0] + b[0]) / 2 + (hash(i) - 0.5) * 10, hz + depth * (0.3 + 0.35 * hash(i + 3))];
    const slope = (b[1] - a[1]) / (b[0] - a[0] || 1);
    const lit = 0.5 + Math.max(-0.35, Math.min(0.35, slope * 0.6));
    const tri = (p: [number, number][], s: number) =>
      svg('polygon', { points: p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' '), class: 'rf-facet', style: `--s:${Math.max(0.12, Math.min(0.95, s)).toFixed(2)}` }, g);
    tri([a, b, m], lit + 0.15 * hash(i + 11));
    tri([a, m, [a[0], hz]], lit * 0.62 + 0.1 * hash(i + 5));
    tri([m, b, [b[0], hz]], lit * 0.55 + 0.1 * hash(i + 9));
    tri([[a[0], hz], m, [b[0], hz]], lit * 0.35);
    if (prevMid) tri([prevMid, a, m], lit * 0.75);
    prevMid = m;
  }
  svg('polyline', { points: pts.map((p) => p.join(',')).join(' '), class: 'rf-ridge' }, g);
  // the shore: faceted rocks along the top edge
  let x = 0;
  let prevTop = hz - 6;
  for (let k = 0; x < W; k++) {
    const nx = Math.min(W, x + 20 + hash(k * 13) * 34);
    const top = hz - 4 - hash(k * 7) * 22;
    svg('polygon', { points: `${x},${hz} ${x},${prevTop} ${nx},${top} ${nx},${hz}`, class: 'rf-rock', style: `--s:${(0.45 + hash(k) * 0.45).toFixed(2)}` }, s);
    svg('polygon', { points: `${x},${prevTop} ${(x + nx) / 2},${Math.min(prevTop, top) - 6 * hash(k + 1)} ${nx},${top}`, class: 'rf-rock', style: `--s:${(0.25 + hash(k + 2) * 0.3).toFixed(2)}` }, s);
    prevTop = top;
    x = nx;
  }
  svg('rect', { x: 0, y: 0, width: W, height: hz - 26, class: 'rf-sky' }, s);
  // viewfinder marks
  for (const [fx, fy, dx, dy] of [[24, 24, 1, 1], [W - 24, 24, -1, 1], [24, H - 24, 1, -1], [W - 24, H - 24, -1, -1]])
    svg('path', { d: `M${fx} ${fy + dy * 22}V${fy}H${fx + dx * 22}`, class: 'rf-finder' }, s);
  svg('path', { d: `M${W / 2 - 10} ${H / 2}H${W / 2 + 10}M${W / 2} ${H / 2 - 10}V${H / 2 + 10}`, class: 'rf-finder' }, s);
  return s;
}

/** Rasterise the print for the notepad. */
async function toPng(el: SVGSVGElement): Promise<Blob | null> {
  const c = inkColors();
  const clone = el.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(W));
  clone.setAttribute('height', String(H));
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `.rf-water{fill:${c.paper}}.rf-glint{stroke:${c.ink};stroke-opacity:.18;stroke-width:1}.rf-facet{fill:${c.ink};fill-opacity:calc(var(--s) * .9);stroke:${c.ink};stroke-opacity:.25;stroke-width:.5}.rf-ridge{fill:none;stroke:${c.ink};stroke-width:1.2}.rf-rock{fill:${c.ink};fill-opacity:var(--s)}.rf-sky{fill:${c.ink};fill-opacity:.55}.rf-finder{fill:none;stroke:${c.soft};stroke-width:1.5}`;
  clone.prepend(style);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d')!;
    g.fillStyle = c.paper;
    g.fillRect(0, 0, W, H);
    g.drawImage(img, 0, 0);
    return await new Promise((res) => cv.toBlob(res, 'image/png'));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const mod: PuzzleModule = {
  mount(root, ctx) {
    ctx.mood('paper');
    const wrap = html('div', { class: 'pz rf' }, root);
    const stage = html('button', { class: 'rf-stage', type: 'button', 'aria-label': 'photo' }, wrap);
    const el = print(stage, SKY);
    const filed = () => ctx.notes.has(NOTE_ID);
    const sync = () => wrap.classList.toggle('filed', filed());
    stage.addEventListener('click', async () => {
      if (filed()) return;
      const png = await toPng(el);
      ctx.notes.add({ id: NOTE_ID, kind: 'photo', label: '01', icon: 'camera', step: ctx.step, data: { az: SKY.az, el: SKY.el.map((e: number) => -e) } }, png ?? undefined);
      ctx.save({ filed: true });
      if (!reducedMotion()) {
        stage.classList.add('fly');
        await new Promise((r) => setTimeout(r, 650));
      }
      sync();
    });
    sync();
    return { destroy() {} };
  },

  reveal(root, clue) {
    const c = (clue ?? {}) as { back?: string };
    const card = html('div', { class: 'rf-back', 'aria-label': c.back ?? '' }, root);
    html('div', { class: 'rf-back-inner' }, card);
    const pencil = html('div', { class: 'rf-pencil' }, card.firstElementChild!, c.back ?? '');
    void pencil;
    requestAnimationFrame(() => card.classList.add('in'));
    return { destroy() {} };
  },

  shutter(cam) {
    if (cam.plan) return [];
    return candidates(cam.lat, cam.lon, cam.heading);
  },
};
export default mod;

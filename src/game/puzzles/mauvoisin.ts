/**
 * Grand Combin — a lever. Pulled, the valley falls into night; the summits
 * around the lake glow; the dam is dark. Cable lamp to lamp (tap, tap): the
 * gauge shows the cable used and a notch. The dam wakes on the right network.
 */
import type { PuzzleModule, PuzzleCtx } from '../puzzle';
import type { Lamp } from '../world';
import { svg, html } from '../kit';
import { LAMPS, DAM, edgeKey, total, lit, mst } from './mauvoisinLogic';
import { ARROW, type Direction } from '../tools/xcipher';
import { noteIcon } from '../tools/common';

interface Save {
  on?: boolean;
  edges?: string[];
}

const NOTCH = mst().length;
const SCALE = 60000; // gauge full scale, metres
const byId = new Map(LAMPS.map((n) => [n.id, n]));

function read(ctx: PuzzleCtx): Save {
  const p = (ctx.progress ?? {}) as Save;
  return { on: !!p.on, edges: Array.isArray(p.edges) ? p.edges.filter((k) => typeof k === 'string') : [] };
}

/** The night field: lamps, cables, gauge. */
function field(ctx: PuzzleCtx): { destroy(): void } {
  let st = read(ctx);
  const w = ctx.world;
  let sel: string | null = null;
  let gauge: HTMLElement | null = null;
  let busy = false;

  const sync = () => {
    st = read(ctx);
    if (!st.on) {
      w.host.setNight(0, []);
      w.drop('mauvoisin');
      gauge?.remove();
      gauge = null;
      return;
    }
    const edges = new Set(st.edges);
    const on = lit(edges);
    const lamps: Lamp[] = LAMPS.map((n) => ({
      lon: n.lon,
      lat: n.lat,
      ele: n.ele,
      radius: n.id === DAM.id ? 900 : 1300,
      power: n.id === DAM.id ? 0.08 : on.has(n.id) ? 0.95 : 0.3,
    }));
    w.host.setNight(1, lamps);
    const l = w.layer('mauvoisin');
    l.clear();
    for (const k of edges) {
      const [a, b] = splitAny(k);
      if (!a || !b) continue;
      const coords: [number, number][] = [];
      const ele: number[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        coords.push([a.lon + (b.lon - a.lon) * t, a.lat + (b.lat - a.lat) * t]);
        ele.push(a.ele + (b.ele - a.ele) * t - Math.sin(t * Math.PI) * 60 + 25); // a slight sag, above the lamps
      }
      l.lines.push({ coords, ele, cls: on.has(a.id) && on.has(b.id) ? 'mv-cable lit' : 'mv-cable' });
    }
    for (const n of LAMPS) {
      l.points.push({
        lon: n.lon,
        lat: n.lat,
        ele: n.ele + 25,
        icon: n.id === DAM.id ? 'lightning' : undefined,
        cls: `mv-lamp${on.has(n.id) ? ' lit' : ''}${sel === n.id ? ' sel' : ''}${n.id === DAM.id ? ' dam' : ''}`,
        label: n.name || 'dam',
        onTap: () => tap(n.id),
      });
    }
    if (!gauge) {
      gauge = html('div', { class: 'mv-gauge', 'aria-live': 'polite' }, document.body);
      html('div', { class: 'mv-bar' }, gauge);
      html('div', { class: 'mv-notch' }, gauge).style.left = `${(NOTCH / SCALE) * 100}%`;
      html('div', { class: 'mv-num' }, gauge);
    }
    const len = total(edges);
    (gauge.querySelector('.mv-bar') as HTMLElement).style.width = `${Math.min(100, (len / SCALE) * 100)}%`;
    gauge.querySelector('.mv-num')!.textContent = `${(len / 1000).toFixed(3)}`;
    gauge.classList.toggle('all', on.size === LAMPS.length);
  };

  function splitAny(k: string) {
    for (let i = k.indexOf('-'); i > 0; i = k.indexOf('-', i + 1)) {
      const a = byId.get(k.slice(0, i));
      const b = byId.get(k.slice(i + 1));
      if (a && b) return [a, b];
    }
    return [undefined, undefined];
  }

  async function tap(id: string): Promise<void> {
    if (busy) return;
    if (!sel) {
      sel = id;
      return sync();
    }
    if (sel === id) {
      sel = null;
      return sync();
    }
    const k = edgeKey(sel, id);
    sel = null;
    const edges = new Set(st.edges);
    if (edges.has(k)) edges.delete(k);
    else edges.add(k);
    ctx.save({ on: true, edges: [...edges].sort() });
    sync();
    const on = lit(edges);
    if (on.size === LAMPS.length && total(edges) === NOTCH) {
      busy = true;
      await ctx.submit([...edges].sort().join(' '));
      busy = false;
    }
  }

  if (st.on) ctx.mood('night');
  sync();
  const iv = window.setInterval(() => {
    // the tableau may switch the night on or off
    const on = read(ctx).on;
    if (on !== st.on) {
      ctx.mood(on ? 'night' : 'map');
      sync();
    }
  }, 300);
  return {
    destroy() {
      clearInterval(iv);
      w.host.setNight(0, []);
      w.drop('mauvoisin');
      gauge?.remove();
    },
  };
}

const mod: PuzzleModule = {
  mount(root, ctx) {
    ctx.mood('night');
    const wrap = html('div', { class: 'pz mv' }, root);
    const s = svg('svg', { viewBox: '0 0 300 260', class: 'mv-stage' }, wrap);
    // the dam: an arch across a gorge, in section
    svg('path', { d: 'M20 40 L70 40 L110 230 L190 230 L230 40 L280 40', class: 'mv-gorge' }, s);
    svg('path', { d: 'M70 40 Q150 70 230 40 L222 60 Q150 92 78 60 Z', class: 'mv-dam' }, s);
    // the lever
    const lever = svg('g', { class: 'mv-lever', role: 'button', tabindex: '0', 'aria-label': 'lever' }, s);
    svg('rect', { x: 120, y: 120, width: 60, height: 90, rx: 4, class: 'mv-box' }, lever);
    svg('circle', { cx: 150, cy: 190, r: 7, class: 'mv-pivot' }, lever);
    const arm = svg('g', { class: 'mv-arm' }, lever);
    svg('line', { x1: 150, y1: 190, x2: 150, y2: 128, class: 'mv-handle' }, arm);
    svg('circle', { cx: 150, cy: 124, r: 9, class: 'mv-knob' }, arm);
    const syncLever = () => lever.classList.toggle('on', !!read(ctx).on);
    const pull = () => {
      if (ctx.solved) return;
      const st = read(ctx);
      ctx.save({ ...st, on: !st.on });
      syncLever();
      if (!st.on) setTimeout(() => ctx.close(), 500);
    };
    lever.addEventListener('click', pull);
    lever.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pull();
      }
    });
    syncLever();
    return { destroy() {} };
  },

  field,

  reveal(root, clue, ctx) {
    // the turbine hall: four gate lamps blink a sequence, over and over
    const gates = ((clue as { gates?: Direction[] } | null)?.gates ?? []).filter((d) => d in ARROW);
    const s = svg('svg', { viewBox: '0 0 200 200', class: 'mv-turbine', role: 'img', 'aria-label': 'turbine' }, root);
    svg('circle', { cx: 100, cy: 100, r: 46, class: 'mv-wheel' }, s);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      svg('path', { d: `M100 100 Q${100 + Math.cos(a + 0.4) * 30} ${100 + Math.sin(a + 0.4) * 30} ${100 + Math.cos(a) * 44} ${100 + Math.sin(a) * 44}`, class: 'mv-blade' }, s);
    }
    const pos: Record<Direction, [number, number]> = { up: [100, 28], down: [100, 172], left: [28, 100], right: [172, 100] };
    const lampEl = {} as Record<Direction, SVGCircleElement>;
    for (const d of ['up', 'down', 'left', 'right'] as Direction[]) lampEl[d] = svg('circle', { cx: pos[d][0], cy: pos[d][1], r: 11, class: 'mv-gate' }, s);
    // each pulse: 330 ms lit, then dark, so a repeated gate reads as two flashes;
    // a long rest marks where the sequence starts again
    let i = 0;
    let off = 0;
    const iv = window.setInterval(() => {
      if (!gates.length) return;
      const k = i++ % (gates.length + 6);
      if (k >= gates.length) return;
      const el = lampEl[gates[k]];
      el.classList.add('on');
      off = window.setTimeout(() => el.classList.remove('on'), 330);
    }, 520);
    const n = ctx.notes.list().find((x) => x.step === ctx.step + 1);
    if (n) {
      const el = html('div', { class: 'ty-filed', 'aria-label': n.label }, root);
      html('span', { class: 'ty-filed-k' }, el).appendChild(noteIcon(n));
      html('span', {}, el, n.label);
    }
    return {
      destroy: () => {
        clearInterval(iv);
        clearTimeout(off);
      },
    };
  },
};
export default mod;

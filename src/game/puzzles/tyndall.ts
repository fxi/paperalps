/**
 * Weisshorn — white on white. A sheet of birefringent facets between three
 * turning discs (polariser, quarter-wave plate, analyser). Turn them until
 * the sheet shows what it holds, white.
 */
import type { PuzzleModule } from '../puzzle';
import { svg, html, glyph } from '../kit';
import { noteIcon } from '../tools/common';
import { sheet, levels, candidate, STEP, POS } from './tyndallLogic';

const DISCS = ['P', 'W', 'A'] as const;
const S = 300;

const mod: PuzzleModule = {
  mount(root, ctx) {
    ctx.mood('hush');
    const facets = sheet();
    const saved = (ctx.progress as { ang?: number[] } | null)?.ang;
    const ang = Array.isArray(saved) && saved.length === 3 ? saved.map((v) => ((Math.round(v / STEP) % POS) + POS) % POS * STEP) : [0, 0, 0];

    const wrap = html('div', { class: 'pz ty' }, root);
    const s = svg('svg', { viewBox: `-40 -40 ${S + 80} ${S + 80}`, class: 'ty-stage' }, wrap);
    const defs = svg('defs', {}, s);
    const clip = svg('clipPath', { id: 'ty-clip' }, defs);
    svg('circle', { cx: S / 2, cy: S / 2, r: S / 2 }, clip);
    const sheetG = svg('g', { 'clip-path': 'url(#ty-clip)' }, s);
    const polys = facets.map((f) =>
      svg('polygon', { points: f.pts.map(([x, y]) => `${(x * S).toFixed(1)},${(y * S).toFixed(1)}`).join(' '), class: 'ty-facet' }, sheetG),
    );
    // the discs: concentric rims, each with its axis drawn as hatching
    const discG = DISCS.map((_, i) => {
      const r = S / 2 + 8 + i * 11;
      const g = svg('g', { class: `ty-disc ty-${DISCS[i]}` }, s);
      svg('circle', { cx: S / 2, cy: S / 2, r, class: 'ty-rim' }, g);
      // axis ticks at both ends
      svg('line', { x1: S / 2 - r - 5, y1: S / 2, x2: S / 2 - r + 5, y2: S / 2, class: 'ty-tick' }, g);
      svg('line', { x1: S / 2 + r - 5, y1: S / 2, x2: S / 2 + r + 5, y2: S / 2, class: 'ty-tick' }, g);
      return g;
    });
    // hatching of the analyser (the top disc) across the whole sheet, faint
    const hatch = svg('g', { class: 'ty-hatch', 'clip-path': 'url(#ty-clip)' }, s);
    for (let k = -S; k <= 2 * S; k += 9) svg('line', { x1: k, y1: -S, x2: k, y2: 2 * S }, hatch);

    // controls: one row per disc, ↺ glyph ↻
    const ctl = html('div', { class: 'ty-ctl' }, wrap);
    DISCS.forEach((d, i) => {
      const row = html('div', { class: 'ty-row' }, ctl);
      glyph(row, 'arrow-counter-clockwise', `${d} −`, () => turn(i, -1));
      const ind = svg('svg', { viewBox: '-12 -12 24 24', class: `ty-ind ty-${d}` }, row);
      svg('circle', { r: 10, class: 'ty-rim' }, ind);
      svg('line', { x1: -10, y1: 0, x2: 10, y2: 0, class: 'ty-axis' }, ind);
      glyph(row, 'arrow-clockwise', `${d} +`, () => turn(i, 1));
    });

    let busy = false;
    function draw(): void {
      const lv = levels(facets, ang[0], ang[1], ang[2]);
      polys.forEach((p, i) => p.style.setProperty('--l', lv[i].toFixed(3)));
      discG.forEach((g, i) => g.setAttribute('transform', `rotate(${ang[i]} ${S / 2} ${S / 2})`));
      hatch.setAttribute('transform', `rotate(${ang[2] + 90} ${S / 2} ${S / 2})`);
      ctl.querySelectorAll<SVGLineElement>('.ty-axis').forEach((l, i) => l.setAttribute('transform', `rotate(${ang[i]})`));
    }
    async function turn(i: number, dir: number): Promise<void> {
      ang[i] = (((ang[i] + dir * STEP) % 180) + 180) % 180;
      draw();
      ctx.save({ ang: [...ang] });
      if (ctx.solved || busy) return;
      const c = candidate(facets, ang[0], ang[1], ang[2]);
      if (!c) return;
      busy = true;
      if (await ctx.submit(c)) wrap.classList.add('done');
      busy = false;
    }
    draw();
    return { destroy() {} };
  },

  reveal(root, _clue, ctx) {
    // a document was filed: show its glyph, the notepad has it
    const n = ctx.notes.list().find((x) => x.step === ctx.step + 1);
    const el = html('div', { class: 'ty-filed', 'aria-label': n?.label ?? '' }, root);
    if (n) html('span', { class: 'ty-filed-k' }, el).appendChild(noteIcon(n));
    html('span', {}, el, n?.label ?? '');
    return { destroy() {} };
  },
};
export default mod;

/**
 * Aiguille du Midi — two fields of dots. One runs on its own; the other runs
 * the line of code underneath (32 bytes at most, as on tixy.land). Make them
 * the same.
 */
import type { PuzzleModule } from '../puzzle';
import { html, glyph, icon, inkColors } from '../kit';
import { compile, frame, paint, sample, type Tixy } from '../tools/tixy';
import { TARGET, TEMPLATE, FRAMES, DT, MAX_BYTES, bytes, lit } from './midiLogic';

const SIZE = 320;

const mod: PuzzleModule = {
  mount(root, ctx) {
    ctx.mood('hush');
    const target = compile(TARGET)!;
    const wrap = html('div', { class: 'pz md' }, root);

    const fields = html('div', { class: 'md-fields' }, wrap);
    const mk = (name: 'eye' | 'code') => {
      const fig = html('figure', { class: 'md-fig' }, fields);
      const c = html('canvas', { width: String(SIZE), height: String(SIZE), class: 'md-field' }, fig);
      html('figcaption', {}, fig).appendChild(icon(name));
      return c.getContext('2d')!;
    };
    const gT = mk('eye');
    const gM = mk('code');

    // one line of code, like tixy.land: (t, i, x, y) => …
    const line = html('div', { class: 'md-line' }, wrap);
    html('span', { class: 'md-sig-fn', 'aria-hidden': 'true' }, line, '(t,i,x,y)=>');
    const code = html('input', { class: 'md-code', type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'f(t, i, x, y)' }, line);
    const count = html('span', { class: 'md-count', 'aria-live': 'polite' }, line);
    glyph(line, 'arrow-u-up-left', 'reset', () => {
      code.value = TEMPLATE;
      void check();
    });
    const saved = (ctx.progress as { code?: string } | null)?.code;
    code.value = typeof saved === 'string' && bytes(saved) <= MAX_BYTES ? saved : TEMPLATE;
    const tally = html('div', { class: 'md-tally', 'aria-hidden': 'true' }, wrap);
    const cells = Array.from({ length: 16 }, () => html('i', {}, tally));

    let mine: Tixy | null = compile(code.value);
    const want = sample(target, FRAMES, DT);
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      const ink = inkColors().ink;
      paint(gT, frame(target, t), SIZE, ink);
      if (mine) paint(gM, frame(mine, t), SIZE, ink);
      else gM.clearRect(0, 0, SIZE, SIZE);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    let deb = 0;
    let busy = false;
    let lastGood = code.value;
    async function check(): Promise<void> {
      // the 32-byte limit: refuse what does not fit (typing or pasting)
      let n = bytes(code.value);
      if (n > MAX_BYTES) {
        const pos = code.selectionStart;
        code.value = lastGood;
        if (pos !== null) code.setSelectionRange(Math.min(pos - 1, code.value.length), Math.min(pos - 1, code.value.length));
        line.classList.remove('full');
        void line.offsetWidth;
        line.classList.add('full');
        n = bytes(code.value);
      }
      lastGood = code.value;
      count.textContent = `${n}/${MAX_BYTES}`;
      mine = compile(code.value);
      line.classList.toggle('bad', !mine);
      ctx.save({ code: code.value });
      if (!mine) return cells.forEach((c) => c.classList.remove('on'));
      const got = sample(mine, FRAMES, DT);
      // a quiet tally: how much ink already agrees; the last diamond only when exact
      const on = lit(got, want, cells.length);
      cells.forEach((c, k) => c.classList.toggle('on', k < on));
      if (got !== want || ctx.solved || busy) return;
      busy = true;
      if (await ctx.submit(got)) wrap.classList.add('done');
      busy = false;
    }
    code.addEventListener('input', () => {
      clearTimeout(deb);
      if (bytes(code.value) > MAX_BYTES) return void check(); // refuse at once
      count.textContent = `${bytes(code.value)}/${MAX_BYTES}`;
      deb = window.setTimeout(check, 200);
    });
    // keys typed here are code, not flight
    code.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
    });
    void check();
    return {
      destroy() {
        cancelAnimationFrame(raf);
        clearTimeout(deb);
      },
    };
  },
};
export default mod;

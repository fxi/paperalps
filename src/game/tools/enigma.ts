/**
 * enigma — the x cipher. A field in, a key of arrows, a field out, live.
 * Text in → bit rows out (and their image); bit rows (or an image of them)
 * in → text out. Arrow keys type the key while the pad has focus.
 */
import type { ToolModule } from './index';
import { encrypt, decrypt, bitsToCanvas, canvasToBits, type Direction } from './xcipher';
import { html, glyph, icon, field, blobToCanvas, pickFile, inkColors } from '../kit';
import { notePicker, row, stamp } from './common';

const isBits = (s: string) => /^[01]{8}(\s+[01]{8})*\s*$/.test(s.trim());

const mod: ToolModule = {
  mount(root, host) {
    root.classList.add('tl', 'tl-enigma');
    const top = row(root);
    const inp = field(root, 5);
    notePicker(top, host.notes, ['text', 'image'], async (n) => {
      if (n.kind === 'text') inp.value = n.text ?? '';
      else {
        const b = await host.notes.blob(n);
        if (b) inp.value = canvasToBits(await blobToCanvas(b));
      }
      run();
    });
    glyph(top, 'upload-simple', 'image', async () => {
      const f = await pickFile('image/*');
      if (!f) return;
      inp.value = canvasToBits(await blobToCanvas(f));
      run();
    });
    const imgIn = html('div', { class: 'tl-bitsimg' }, top);

    // the key pad: a cross of arrows
    const pad = html('div', { class: 'tl-pad', tabindex: '0', 'aria-label': 'key' }, root);
    const keyEl = html('div', { class: 'tl-key', 'aria-live': 'polite' }, root);
    const key: Direction[] = [];
    const add = (d: Direction) => {
      key.push(d);
      run();
    };
    for (const d of ['up', 'left', 'right', 'down'] as Direction[]) glyph(pad, `arrow-${d}`, d, () => add(d), `tl-arrow tl-${d}`);
    glyph(pad, 'backspace', 'back', () => {
      key.pop();
      run();
    }, 'tl-back');
    glyph(pad, 'eraser', 'clear', () => {
      key.length = 0;
      run();
    }, 'tl-clear');
    pad.addEventListener('keydown', (e) => {
      const d = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as Record<string, Direction>)[e.key];
      if (d) {
        e.preventDefault();
        add(d);
      } else if (e.key === 'Backspace') {
        key.pop();
        run();
      }
    });

    const outRow = row(root);
    const out = field(root, 5, 'tl-out');
    out.readOnly = true;
    const imgOut = html('div', { class: 'tl-bitsimg' }, outRow);
    glyph(outRow, 'arrows-down-up', 'swap', () => {
      inp.value = out.value;
      key.length = 0;
      run();
    });
    glyph(outRow, 'download-simple', 'keep', () => {
      if (!out.value) return;
      host.notes.add({ id: `x-${Date.now()}`, kind: 'text', label: `x ${stamp()}`, text: out.value });
    });

    const showBits = (box: HTMLElement, s: string) => {
      box.replaceChildren();
      if (!isBits(s)) return;
      const c = inkColors();
      const cv = bitsToCanvas(s, c.ink, c.paper, 3);
      box.appendChild(cv);
    };

    function run(): void {
      keyEl.replaceChildren(...key.map((d) => icon(`arrow-${d}`)));
      const v = inp.value;
      showBits(imgIn, v);
      try {
        out.value = !v.trim() ? '' : isBits(v) ? decrypt(v, key) : encrypt(v, key);
      } catch {
        out.value = '';
      }
      showBits(imgOut, out.value);
    }
    inp.addEventListener('input', run);
    // paste an image straight into the field
    inp.addEventListener('paste', async (e) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/'));
      if (!f) return;
      e.preventDefault();
      inp.value = canvasToBits(await blobToCanvas(f));
      run();
    });
    run();
    return { destroy() {} };
  },
};
export default mod;

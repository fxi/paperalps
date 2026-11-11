/**
 * binutf — a grid of bits, one row of 16 per UTF-16 code unit (leftmost =
 * least significant, as fxi.io/binary_utf; ⇋ flips the bit order), synced
 * with a text field, and free binary / hex fields.
 */
import type { ToolModule } from './index';
import { html, glyph, field } from '../kit';
import { COLS, gridToText, textToGrid, binToText, textToBin, textToHex, hexToText } from './bits';
import { notePicker, row, stamp } from './common';

const mod: ToolModule = {
  mount(root, host) {
    root.classList.add('tl', 'tl-binutf');
    let rows: number[][] = Array.from({ length: 8 }, () => new Array(COLS).fill(0));
    let msb = false;

    const bar = row(root);
    glyph(bar, 'plus', 'row', () => {
      rows.push(new Array(COLS).fill(0));
      draw();
    });
    glyph(bar, 'minus', 'row', () => {
      if (rows.length > 1) rows.pop();
      draw();
    });
    const flip = glyph(bar, 'arrows-left-right', 'bit order', () => {
      msb = !msb;
      flip.classList.toggle('on', msb);
      fromGrid(); // same cells, read the other way
    });
    glyph(bar, 'eraser', 'clear', () => {
      rows = rows.map(() => new Array(COLS).fill(0));
      draw();
    });

    const grid = html('div', { class: 'tl-grid', role: 'grid' }, root);
    grid.style.setProperty('--cols', String(COLS));
    const txtRow = row(root);
    const txt = field(root, 2);
    txt.setAttribute('aria-label', 'text');
    notePicker(txtRow, host.notes, ['text'], (n) => {
      const v = n.text ?? '';
      if (/^[01\s]+$/.test(v)) {
        bin.value = v;
        fromBin();
      } else {
        txt.value = v;
        fromText();
      }
    });
    glyph(txtRow, 'download-simple', 'keep', () => {
      if (txt.value) host.notes.add({ id: `b-${Date.now()}`, kind: 'text', label: `bin ${stamp()}`, text: txt.value });
    });
    const bin = field(root, 3);
    bin.setAttribute('aria-label', 'binary');
    const hex = field(root, 2);
    hex.setAttribute('aria-label', 'hex');

    function draw(): void {
      grid.replaceChildren();
      rows.forEach((r, y) =>
        r.forEach((v, x) => {
          const c = html('button', { class: `tl-cell${v ? ' on' : ''}`, type: 'button', 'aria-pressed': String(!!v), 'aria-label': `${y}.${x}` }, grid);
          c.addEventListener('click', () => {
            r[x] = r[x] ? 0 : 1;
            c.classList.toggle('on', !!r[x]);
            c.setAttribute('aria-pressed', String(!!r[x]));
            fromGrid();
          });
        }),
      );
      fromGrid();
    }
    function fromGrid(): void {
      txt.value = gridToText(rows, msb);
      bin.value = textToBin(txt.value);
      hex.value = textToHex(txt.value);
    }
    function fromText(): void {
      rows = textToGrid(txt.value, msb);
      if (!rows.length) rows = [new Array(COLS).fill(0)];
      bin.value = textToBin(txt.value);
      hex.value = textToHex(txt.value);
      drawGridOnly();
    }
    function fromBin(): void {
      txt.value = binToText(bin.value);
      rows = textToGrid(txt.value, msb);
      hex.value = textToHex(txt.value);
      drawGridOnly();
    }
    function drawGridOnly(): void {
      const t = txt.value;
      draw();
      txt.value = t;
    }
    txt.addEventListener('input', fromText);
    bin.addEventListener('input', fromBin);
    hex.addEventListener('input', () => {
      txt.value = hexToText(hex.value);
      rows = textToGrid(txt.value, msb);
      bin.value = textToBin(txt.value);
      const t = txt.value;
      const h = hex.value;
      draw();
      txt.value = t;
      hex.value = h;
    });
    draw();
    return { destroy() {} };
  },
};
export default mod;

/**
 * Small DOM/SVG kit for puzzles: same paper/ink tokens and type as the map,
 * big touch targets (>= 44 px), no dependencies.
 */

import { icon, type IconName } from '../ui/icons';
export { icon, type IconName };

/** Swap the icon of a button (toggles). */
export function setIcon(b: Element, name: IconName): void {
  b.querySelector('svg.ico')?.replaceWith(icon(name));
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

export function html<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** A plain text button in the tableau style. */
export function button(parent: Element, label: string, onClick: () => void, aria?: string): HTMLButtonElement {
  const b = html('button', { class: 'tb-btn', type: 'button' }, parent, label);
  if (aria) b.setAttribute('aria-label', aria);
  b.addEventListener('click', onClick);
  return b;
}

/** Points list for an SVG polygon. */
export const pts = (poly: [number, number][]) => poly.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' ');

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** requestAnimationFrame tween, t in 0..1 (eased); resolves when done. */
export function tween(ms: number, step: (t: number) => void): Promise<void> {
  if (reducedMotion()) {
    step(1);
    return Promise.resolve();
  }
  return new Promise((done) => {
    const t0 = performance.now();
    const f = (now: number) => {
      const x = Math.min(1, (now - t0) / ms);
      step(x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
      if (x < 1) requestAnimationFrame(f);
      else done();
    };
    requestAnimationFrame(f);
  });
}

/** An icon button (no words): `aria` names it for screen readers. */
export function glyph(parent: Element, name: IconName, aria: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = html('button', { class: `gl-btn ${cls}`.trim(), type: 'button', 'aria-label': aria, title: aria }, parent);
  b.appendChild(icon(name));
  b.addEventListener('click', onClick);
  return b;
}

/** A monospace text field in the paper style. */
export function field(parent: Element, rows = 4, cls = ''): HTMLTextAreaElement {
  const t = html('textarea', { class: `tl-field ${cls}`.trim(), rows, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off' }, parent);
  return t;
}

/** Read a File as text / data / an image canvas. */
export const fileText = (f: Blob) => f.text();

export async function blobToCanvas(b: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(b);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return c;
}

/** Ask for a file (hidden input). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((res) => {
    const i = html('input', { type: 'file', accept });
    i.addEventListener('change', () => res(i.files?.[0] ?? null));
    i.click();
  });
}

/** Current ink / paper colours (follow the ink mode). */
export function inkColors(): { ink: string; soft: string; faint: string; paper: string } {
  const s = getComputedStyle(document.body);
  return {
    ink: s.getPropertyValue('--ink').trim() || '#1b1b1d',
    soft: s.getPropertyValue('--ink-soft').trim() || 'rgba(27,27,29,.55)',
    faint: s.getPropertyValue('--ink-faint').trim() || 'rgba(27,27,29,.32)',
    paper: s.getPropertyValue('--paper').trim() || '#e6e5e1',
  };
}

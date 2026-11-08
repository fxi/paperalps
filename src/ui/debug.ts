import type { Art } from '../render/renderer';

const RANGES: Record<keyof Art, [number, number, number]> = {
  exag: [0.5, 8, 0.05],
  lift: [0.5, 4, 0.05],
  tilt: [0, 85, 1],
  crumple: [0, 2, 0.01],
  facet: [0, 1, 0.01],
  cell: [4, 40, 0.5],
  shadow: [0, 1, 0.01],
  fog: [0, 1, 0.01],
  clouds: [0, 1, 0.01],
  sunAz: [0, 360, 1],
  sunEl: [5, 80, 1],
  sharp: [1, 6, 0.1],
  expo: [0.5, 1.6, 0.01],
  contrast: [0, 1.5, 0.01],
};

/** `?debug` tuning panel: live sliders bound to the art parameters. */
export function debugPanel(parent: HTMLElement, art: Art): void {
  const el = document.createElement('div');
  el.className = 'debug';
  for (const key of Object.keys(RANGES) as (keyof Art)[]) {
    const [min, max, step] = RANGES[key];
    const row = document.createElement('label');
    row.innerHTML = `<span>${key}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
    const inp = row.querySelector('input')!;
    const out = row.querySelector('output')!;
    inp.value = String(art[key]);
    out.textContent = String(art[key]);
    inp.addEventListener('input', () => {
      art[key] = +inp.value;
      out.textContent = inp.value;
    });
    el.appendChild(row);
  }
  parent.appendChild(el);
}

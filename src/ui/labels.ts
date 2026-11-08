import { displayName, placePeaks, type Peak, type Projector } from './peaks';

/**
 * DOM peak labels. Placement (declutter) runs a few times per second; label
 * positions follow the camera every frame. Labels fade in/out and dim with
 * distance.
 */
export class Labels {
  private els = new Map<number, HTMLElement>();
  private peakOf = new Map<number, Peak>();
  private lastPlace = 0;

  constructor(private layer: HTMLElement) {}

  update(now: number, project: Projector, w: number, h: number, peaks: Peak[], maxDist: number): void {
    if (now - this.lastPlace > 280) {
      this.lastPlace = now;
      const budget = Math.round(Math.min(14, Math.max(5, (w * h) / 65000)));
      const avoid = [...document.querySelectorAll('.stick, .mapbox, .north, .readout, .toolbar')].map((e) => {
        const r = e.getBoundingClientRect();
        return [r.left, r.top, r.right, r.bottom] as [number, number, number, number];
      });
      const placed = placePeaks(peaks, project, w, h, budget, { avoid, maxDist });
      const next = new Set(placed.map((p) => p.peak.id));
      for (const [id, el] of this.els) {
        if (!next.has(id) && !el.classList.contains('out')) {
          el.classList.add('out');
          setTimeout(() => {
            if (el.classList.contains('out')) {
              el.remove();
              this.els.delete(id);
              this.peakOf.delete(id);
            }
          }, 700);
        }
      }
      for (const { peak } of placed) {
        let el = this.els.get(peak.id);
        if (!el) {
          el = document.createElement('div');
          el.className = 'peak out';
          el.innerHTML = `<div class="box"><span class="peak-name"></span> <span class="peak-ele"></span></div><b></b><i></i>`;
          el.querySelector('.peak-name')!.textContent = displayName(peak.name);
          el.querySelector('.peak-ele')!.textContent = `${peak.ele}`;
          this.layer.appendChild(el);
          this.els.set(peak.id, el);
          const e = el;
          requestAnimationFrame(() => e.classList.remove('out'));
        } else el.classList.remove('out');
        this.peakOf.set(peak.id, peak);
      }
    }
    for (const [id, el] of this.els) {
      const p = this.peakOf.get(id);
      if (!p) continue;
      const s = project(p);
      if (!s) {
        el.style.visibility = 'hidden';
        continue;
      }
      el.style.visibility = '';
      el.style.transform = `translate3d(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px, 0)`;
      const fade = 1 - Math.max(0, Math.min(1, (s[2] / maxDist - 0.55) / 0.45));
      el.style.setProperty('--fade', fade.toFixed(2));
    }
  }
}

import { displayName, placePeaks, type Peak, type Projector } from './peaks';

/**
 * DOM peak labels. Placement (declutter) runs a few times per second; label
 * positions follow the camera every frame. Labels fade in/out and dim with
 * distance.
 */
export class Labels {
  private els = new Map<number, HTMLElement>();
  private peakOf = new Map<number, Peak>();
  private timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  private lastPlace = 0;
  /** The autopilot destination: always placed first, highlighted. */
  private target: Peak | null = null;
  /** Game hooks: a marker per peak (star / solved) and the peaks that win the declutter. */
  markOf: (p: Peak) => 'star' | 'done' | null = () => null;
  priority: () => Peak[] = () => [];

  /** Re-place now (e.g. after a puzzle was solved). */
  refresh(): void {
    this.lastPlace = 0;
  }

  /** `onPick` fires when a label is clicked or tapped. */
  constructor(
    private layer: HTMLElement,
    onPick: (p: Peak) => void,
  ) {
    layer.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.peak');
      const p = el && this.peakOf.get(Number(el.dataset.id));
      if (p) onPick(p);
    });
  }

  setTarget(p: Peak | null): void {
    if (this.target === p) return;
    if (this.target) this.els.get(this.target.id)?.classList.remove('target');
    this.target = p;
    if (p) this.els.get(p.id)?.classList.add('target');
    this.lastPlace = 0; // re-place now so the target shows up at once
  }

  update(now: number, project: Projector, w: number, h: number, peaks: Peak[], maxDist: number): void {
    if (now - this.lastPlace > 280) {
      this.lastPlace = now;
      const budget = Math.round(Math.min(14, Math.max(5, (w * h) / 65000)));
      const avoid = [...document.querySelectorAll('.stick, .mapbox:not(.off), .readout, .toolbar')].map((e) => {
        const r = e.getBoundingClientRect();
        return [r.left, r.top, r.right, r.bottom] as [number, number, number, number];
      });
      const placed = placePeaks(peaks, project, w, h, budget, { avoid, maxDist, pinned: this.target ?? undefined, priority: this.priority() });
      const next = new Set(placed.map((p) => p.peak.id));
      for (const [id, el] of this.els) {
        if (!next.has(id) && !el.classList.contains('out')) {
          el.classList.add('out');
          // One pending removal per element. A stale timer must never delete
          // a newer element of the same peak from the map: that orphan would
          // stay in the DOM, frozen where it was last placed.
          clearTimeout(this.timers.get(el));
          this.timers.set(
            el,
            setTimeout(() => {
              this.timers.delete(el);
              if (!el.classList.contains('out')) return;
              el.remove();
              if (this.els.get(id) === el) {
                this.els.delete(id);
                this.peakOf.delete(id);
              }
            }, 700),
          );
        }
      }
      for (const { peak } of placed) {
        let el = this.els.get(peak.id);
        if (!el) {
          el = document.createElement('div');
          el.className = peak.kind === 'city' ? 'peak city out' : 'peak out';
          if (peak === this.target) el.classList.add('target');
          el.dataset.id = String(peak.id);
          el.innerHTML = `<span class="peak-name"></span><span class="peak-ele"></span><i></i>`;
          el.querySelector('.peak-name')!.textContent = displayName(peak.name);
          el.querySelector('.peak-ele')!.textContent = peak.kind === 'city' ? '' : `${peak.ele}`;
          this.layer.appendChild(el);
          this.els.set(peak.id, el);
          const e = el;
          requestAnimationFrame(() => e.classList.remove('out'));
        } else {
          el.classList.remove('out');
          clearTimeout(this.timers.get(el));
          this.timers.delete(el);
        }
        this.peakOf.set(peak.id, peak);
        const m = this.markOf(peak);
        el.classList.toggle('star', m === 'star');
        el.classList.toggle('done', m === 'done');
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
      let fade = p === this.target ? 1 : 1 - Math.max(0, Math.min(1, (s[2] / maxDist - 0.55) / 0.45));
      if (el.classList.contains('star')) fade = Math.max(fade, 0.6); // stars stay findable far away
      el.style.setProperty('--fade', fade.toFixed(2));
    }
  }
}

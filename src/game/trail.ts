/**
 * The progress trail over the 3D view: a dashed ink line through the solved
 * summits, in solving order. Re-projected every frame like the labels; a
 * segment is drawn only when both ends are in front of the camera.
 */
import { SVG_NS } from './kit';
import type { Peak, Projector } from '../ui/peaks';

export class Trail {
  private path: SVGPathElement;

  constructor(private svg: SVGSVGElement) {
    this.path = document.createElementNS(SVG_NS, 'path');
    this.path.setAttribute('class', 'trail-line');
    svg.appendChild(this.path);
  }

  update(project: Projector, peaks: Peak[], w: number, h: number): void {
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    if (peaks.length < 2) {
      this.path.setAttribute('d', '');
      return;
    }
    let d = '';
    let prev: [number, number, number] | null = null;
    for (const p of peaks) {
      const s = project(p);
      if (s && prev) d += `M${prev[0].toFixed(1)} ${prev[1].toFixed(1)}L${s[0].toFixed(1)} ${s[1].toFixed(1)}`;
      prev = s;
    }
    this.path.setAttribute('d', d);
  }
}

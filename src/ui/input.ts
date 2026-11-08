/**
 * Map-surface input: keyboard (WASD / arrows, +/-), drag-to-pan with inertia,
 * mouse wheel and two-finger pinch zoom.
 */
export class Input {
  keys = new Set<string>();
  /** Accumulated pan in CSS px since last consume (from dragging). */
  dragX = 0;
  dragY = 0;
  dragging = false;
  /** Accumulated zoom delta since last consume. */
  zoomDelta = 0;
  private pts = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  constructor(surface: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === '+' || k === '=') this.zoomDelta += 0.5;
      if (k === '-' || k === '_') this.zoomDelta -= 0.5;
      if (k.startsWith('arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    surface.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const scale = e.deltaMode === 1 ? 0.05 : 0.0022;
        this.zoomDelta -= e.deltaY * scale;
      },
      { passive: false },
    );

    surface.addEventListener('pointerdown', (e) => {
      surface.setPointerCapture(e.pointerId);
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragging = true;
      if (this.pts.size === 2) this.pinchDist = this.spread();
    });
    surface.addEventListener('pointermove', (e) => {
      const p = this.pts.get(e.pointerId);
      if (!p) return;
      if (this.pts.size === 1) {
        this.dragX += e.clientX - p.x;
        this.dragY += e.clientY - p.y;
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pts.size === 2) {
        const d = this.spread();
        if (this.pinchDist > 0 && d > 0) this.zoomDelta += Math.log2(d / this.pinchDist);
        this.pinchDist = d;
      }
    });
    const up = (e: PointerEvent) => {
      this.pts.delete(e.pointerId);
      if (this.pts.size < 2) this.pinchDist = 0;
      if (this.pts.size === 0) this.dragging = false;
    };
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
  }

  private spread(): number {
    const [a, b] = [...this.pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Keyboard mirrors the sticks: WASD = left stick, arrows = right stick.

  /** Forward/back: W/S. */
  forward(): number {
    const k = this.keys;
    return (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0);
  }

  /** Turn: A/D (positive = clockwise). */
  turn(): number {
    const k = this.keys;
    return (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
  }

  /** Strafe: ←/→ or Q/E. */
  strafe(): number {
    const k = this.keys;
    return (k.has('arrowright') || k.has('e') ? 1 : 0) - (k.has('arrowleft') || k.has('q') ? 1 : 0);
  }

  /** Climb: ↑/↓ or R/F. */
  climb(): number {
    const k = this.keys;
    return (k.has('arrowup') || k.has('r') ? 1 : 0) - (k.has('arrowdown') || k.has('f') ? 1 : 0);
  }
}

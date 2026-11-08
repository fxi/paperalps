/**
 * Minimal "nipple" stick: a thin ring and a small solid knob.
 *
 * It rests in a screen corner. On touch screens, pressing anywhere in its
 * zone (the lower part of that half of the screen) moves the stick under the
 * finger, like nipplejs' dynamic mode, and it returns home on release.
 * `value` is in the unit disc (x right, y down) with a dead zone and a
 * gentle response curve.
 */
export class Stick {
  readonly el: HTMLElement;
  private knob: HTMLElement;
  private pointer: number | null = null;
  private cx = 0;
  private cy = 0;
  private radius = 1;
  private raw = { x: 0, y: 0 };
  private shown = { x: 0, y: 0 };
  value = { x: 0, y: 0 };
  active = false;

  constructor(parent: HTMLElement, side: 'left' | 'right', label: string, zone?: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = `stick stick-${side}`;
    this.el.innerHTML = `<div class="stick-knob"></div>`;
    this.el.setAttribute('role', 'slider');
    this.el.setAttribute('aria-label', label);
    this.knob = this.el.querySelector('.stick-knob')!;
    parent.appendChild(this.el);

    this.el.addEventListener('pointerdown', (e) => this.start(e, false));
    zone?.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.start(e, true);
    });
    const move = (e: PointerEvent) => {
      if (e.pointerId === this.pointer) this.move(e);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointer) return;
      this.pointer = null;
      this.active = false;
      this.raw.x = this.raw.y = 0;
      this.el.classList.remove('on');
      this.el.style.transform = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  private start(e: PointerEvent, dynamic: boolean): void {
    if (this.pointer !== null) return;
    e.preventDefault();
    e.stopPropagation();
    this.pointer = e.pointerId;
    const r = this.el.getBoundingClientRect();
    let cx = r.left + r.width / 2;
    let cy = r.top + r.height / 2;
    if (dynamic) {
      // move the base under the finger
      this.el.style.transform = `translate(${e.clientX - cx}px, ${e.clientY - cy}px)`;
      cx = e.clientX;
      cy = e.clientY;
    }
    this.cx = cx;
    this.cy = cy;
    this.radius = r.width * 0.42;
    this.active = true;
    this.el.classList.add('on');
    this.move(e);
  }

  private move(e: PointerEvent): void {
    let dx = (e.clientX - this.cx) / this.radius;
    let dy = (e.clientY - this.cy) / this.radius;
    const l = Math.hypot(dx, dy);
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    this.raw.x = dx;
    this.raw.y = dy;
  }

  /** Advance the spring animation and compute `value`. */
  tick(dt: number): void {
    const k = this.active ? 1 - Math.exp(-dt * 40) : 1 - Math.exp(-dt * 14);
    this.shown.x += (this.raw.x - this.shown.x) * k;
    this.shown.y += (this.raw.y - this.shown.y) * k;
    this.knob.style.transform = `translate(${this.shown.x * this.radius}px, ${this.shown.y * this.radius}px)`;

    const l = Math.hypot(this.raw.x, this.raw.y);
    const dead = 0.08;
    if (l < dead) {
      this.value.x = this.value.y = 0;
    } else {
      const m = Math.pow((l - dead) / (1 - dead), 1.5) / l;
      this.value.x = this.raw.x * m;
      this.value.y = this.raw.y * m;
    }
  }
}

/**
 * The toolbox: six instruments always at hand, each its own lazy chunk.
 * Opened one at a time in a paper sheet beside the map, which keeps flying.
 * No words: an icon per tool, glyphs inside.
 */
import type { Notes } from '../notes';
import type { World } from '../world';
import type { Game } from '../game';
import { html, icon } from '../kit';

export interface ToolAudio {
  ctx: AudioContext;
  out: AudioNode;
  /** A live stream of everything the game plays (for the recorder). */
  tap(): MediaStream;
  /** Straight to the speakers, outside the score (not recorded, not hushed). */
  direct: AudioNode;
  /** Silence the game music while listening. */
  hush(on: boolean): void;
}

export interface ToolHost {
  notes: Notes;
  world: World;
  game: Game;
  audio(): ToolAudio | null;
  close(): void;
}

export interface ToolInstance {
  destroy(): void;
}

export interface ToolModule {
  mount(root: HTMLElement, host: ToolHost): ToolInstance;
}

export type ToolId = 'enigma' | 'notepad' | 'binutf' | 'gis' | 'recorder' | 'quine';

const LOAD: Record<ToolId, () => Promise<ToolModule>> = {
  enigma: () => import('./enigma').then((m) => m.default),
  notepad: () => import('./notepad').then((m) => m.default),
  binutf: () => import('./binutf').then((m) => m.default),
  gis: () => import('./gis').then((m) => m.default),
  recorder: () => import('./recorder').then((m) => m.default),
  quine: () => import('./quine').then((m) => m.default),
};

export class Toolbox {
  private sheet: HTMLElement | null = null;
  private inst: ToolInstance | null = null;
  private openId: ToolId | null = null;
  private token = 0;

  constructor(
    private bar: HTMLElement,
    private host: Omit<ToolHost, 'close'>,
  ) {
    for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
      b.addEventListener('click', () => void this.toggle(b.dataset.tool as ToolId));
    }
  }

  get isOpen(): boolean {
    return this.sheet !== null;
  }

  async toggle(id: ToolId): Promise<void> {
    if (this.openId === id) return this.close();
    await this.open(id);
  }

  async open(id: ToolId): Promise<void> {
    this.close();
    const tok = ++this.token;
    this.openId = id;
    this.sync();
    const el = html('section', { class: `tool-sheet tool-${id}`, role: 'dialog', 'aria-label': id }, document.body);
    // keys typed in a tool must not fly the plane
    for (const t of ['keydown', 'keyup'] as const)
      el.addEventListener(t, (e) => {
        if (t === 'keydown' && e.key === 'Escape') this.close();
        e.stopPropagation();
      });
    const x = html('button', { class: 'tool-x', type: 'button', 'aria-label': 'close' }, el);
    x.appendChild(icon('x'));
    x.addEventListener('click', () => this.close());
    const body = html('div', { class: 'tool-body' }, el);
    this.sheet = el;
    requestAnimationFrame(() => el.classList.add('in'));
    let mod: ToolModule;
    try {
      mod = await LOAD[id]();
    } catch {
      body.textContent = '· · ·';
      return;
    }
    if (tok !== this.token) return;
    this.inst = mod.mount(body, { ...this.host, close: () => this.close() });
  }

  close(): void {
    this.token++;
    this.inst?.destroy();
    this.inst = null;
    const el = this.sheet;
    this.sheet = null;
    this.openId = null;
    this.sync();
    if (el) {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 300);
    }
  }

  private sync(): void {
    for (const b of this.bar.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
      const on = b.dataset.tool === this.openId;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
}

/**
 * Game controller: replays the sealed chain from the saved answers, owns the
 * tableau (a puzzle laid over the frozen map) and the notebook, and tells the
 * map which label carries the star. No prose anywhere: glyphs and numbers.
 */
import { resolveSummits } from './catalog';
import { loadGame, saveGame, saveProgress, answer, truncate, type GameState } from './state';
import { openChain, accept, next, TOTAL, type Rec } from './chain';
import { PUZZLES, type PuzzleCtx, type PuzzleInstance, type PuzzleModule, type Mood } from './puzzle';
import { Notes } from './notes';
import type { World } from './world';
import { html, icon } from './kit';
import { displayName, type Peak } from '../ui/peaks';

export type Mark = 'star' | 'done';

export interface GameHost {
  /** Fly to a peak; `arrive` runs once there (not if the pilot takes over). */
  flyTo(p: Peak, arrive?: () => void): void;
  /** The map pauses while a sheet covers it. */
  setPaused(paused: boolean): void;
  setMood(m: Mood): void;
  puzzleAudio(): { ctx: AudioContext; out: AudioNode } | null;
  /** The labels changed (star moved). */
  refresh(): void;
}

const pad = (n: number) => String(n).padStart(2, '0');

export class Game {
  state: GameState = loadGame();
  notes = new Notes();
  recs: Rec[] = [];
  ready: Promise<void>;
  private peakOf: Map<string, Peak>;
  private summitOfPeak = new Map<number, string>();
  private sheet: HTMLElement | null = null;
  private instance: PuzzleInstance | null = null;
  private revealInst: PuzzleInstance | null = null;
  private field: { step: number; inst: PuzzleInstance } | null = null;
  private mods = new Map<string, PuzzleModule>();
  private openToken = 0;

  constructor(
    peaks: Peak[],
    private host: GameHost,
    public world: World,
  ) {
    this.peakOf = resolveSummits(peaks);
    for (const [id, p] of this.peakOf) this.summitOfPeak.set(p.id, id);
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const { recs, answers } = await openChain(this.state.answers);
    this.recs = recs;
    if (answers.length !== this.state.answers.length) this.commit(truncate(this.state, answers.length));
    this.fileNotes();
    this.host.refresh();
    const cur = this.current;
    if (cur && this.state.progress[cur.puzzle] !== undefined) void this.startField(this.solvedCount + 1);
  }

  get isOpen(): boolean {
    return this.sheet !== null;
  }

  get solvedCount(): number {
    return this.state.answers.length;
  }

  /** The record of the step to play, or null at the end of the written chain. */
  get current(): Rec | null {
    return this.recs[this.solvedCount] ?? null;
  }

  private stepOfSummit(id: string): number {
    return this.recs.findIndex((r) => r.summit === id) + 1; // 0 = not in the opened chain
  }

  /** Label marker: a star on the current summit, ink on solved ones. */
  mark(p: Peak): Mark | null {
    const id = this.summitOfPeak.get(p.id);
    if (!id) return null;
    const n = this.stepOfSummit(id);
    if (!n) return null;
    return n <= this.solvedCount ? 'done' : 'star';
  }

  /** Peaks that should win the declutter: the current star. */
  stars(): Peak[] {
    const c = this.current;
    const p = c ? this.peakOf.get(c.summit) : undefined;
    return p ? [p] : [];
  }

  /** Solved summits in order (the trail). */
  trail(): Peak[] {
    return this.recs
      .slice(0, this.solvedCount)
      .map((r) => this.peakOf.get(r.summit))
      .filter((p): p is Peak => !!p);
  }

  /** A tap on a label. Returns true when the game handled it. */
  pick(p: Peak): boolean {
    const id = this.summitOfPeak.get(p.id);
    const n = id ? this.stepOfSummit(id) : 0;
    if (!n) return false;
    this.host.flyTo(p, () => void this.openStep(n));
    return true;
  }

  private commit(next: GameState): void {
    this.state = next;
    saveGame(next);
  }

  private fileNotes(): void {
    this.recs.forEach((r, i) =>
      r.notes?.forEach((s, j) => {
        const id = s.id || `s${pad(i + 1)}-${j}`;
        if (!this.notes.has(id)) this.notes.add({ ...s, id, step: i + 1 });
      }),
    );
  }

  private async module(key: string): Promise<PuzzleModule | null> {
    const m = this.mods.get(key);
    if (m) return m;
    const load = PUZZLES[key];
    if (!load) return null;
    try {
      const mod = await load();
      this.mods.set(key, mod);
      return mod;
    } catch {
      return null;
    }
  }

  private ctx(n: number, sheet: boolean): PuzzleCtx {
    const rec = this.recs[n - 1];
    const game = this;
    return {
      step: n,
      get progress() {
        return game.state.progress[rec.puzzle];
      },
      save: (p) => this.commit(saveProgress(this.state, rec.puzzle, p)),
      submit: (c) => this.submit(n, Array.isArray(c) ? c : [c]),
      get solved() {
        return n <= game.solvedCount;
      },
      audio: () => this.host.puzzleAudio(),
      mood: (m) => this.host.setMood(m),
      notes: this.notes,
      world: this.world,
      close: () => (sheet ? this.closeSheet() : undefined),
    };
  }

  private async submit(n: number, cands: string[]): Promise<boolean> {
    if (n !== this.solvedCount + 1) return n <= this.solvedCount;
    const rec = this.recs[n - 1];
    const ok = await accept(n, rec, cands);
    if (ok === null || n !== this.solvedCount + 1) return false;
    this.commit(answer(this.state, n, ok));
    const nx = await next(n, ok);
    if (nx) this.recs[n] = nx;
    this.fileNotes();
    this.field?.inst.destroy();
    this.field = null;
    this.host.refresh();
    if (this.sheet && this.sheet.dataset.step === String(n)) void this.showReveal(n);
    else if (!this.sheet) void this.openStep(n); // solved from the world: show what was won
    return true;
  }

  /** Start the world part of a step (idempotent). */
  private async startField(n: number): Promise<void> {
    if (this.field?.step === n || n !== this.solvedCount + 1) return;
    const rec = this.recs[n - 1];
    const mod = rec && (await this.module(rec.puzzle));
    if (!mod?.field || n !== this.solvedCount + 1 || this.field?.step === n) return;
    this.field = { step: n, inst: mod.field(this.ctx(n, false)) };
  }

  /** The shutter of a photo note: ask the current puzzle for candidates from the pose. */
  async shutter(): Promise<boolean> {
    const n = this.solvedCount + 1;
    const rec = this.current;
    const mod = rec && (await this.module(rec.puzzle));
    if (!mod?.shutter) return false;
    const c = mod.shutter(this.world.host.camera(), this.ctx(n, false));
    return c.length ? this.submit(n, c) : false;
  }

  // ------------------------------------------------------------ sheets ---

  private openSheet(cls: string, label: string): HTMLElement {
    this.closeSheet(false);
    const el = html('div', { class: `sheet ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, document.body);
    requestAnimationFrame(() => el.classList.add('in'));
    this.sheet = el;
    this.host.setPaused(true);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeSheet();
    });
    const x = html('button', { class: 'sheet-x', type: 'button', 'aria-label': 'close' }, el);
    x.appendChild(icon('x'));
    x.addEventListener('click', () => this.closeSheet());
    return el;
  }

  closeSheet(resume = true): void {
    this.openToken++;
    this.instance?.destroy();
    this.revealInst?.destroy();
    this.instance = this.revealInst = null;
    const el = this.sheet;
    this.sheet = null;
    if (el) {
      el.classList.remove('in');
      el.classList.add('out');
      setTimeout(() => el.remove(), 450);
    }
    if (resume) {
      this.host.setMood('map');
      this.host.setPaused(false);
    }
  }

  async openStep(n: number): Promise<void> {
    await this.ready;
    const rec = this.recs[n - 1];
    if (!rec || n > this.solvedCount + 1) return;
    const peak = this.peakOf.get(rec.summit);
    const el = this.openSheet('tableau', peak ? displayName(peak.name) : pad(n));
    el.dataset.step = String(n);
    const token = this.openToken;
    html('div', { class: 'sheet-step', 'aria-hidden': 'true' }, el, `${pad(n)} / ${TOTAL}`);
    const body = html('div', { class: 'sheet-body' }, el);
    html('div', { class: 'sheet-reveal', hidden: '' }, el);
    const mod = await this.module(rec.puzzle);
    if (token !== this.openToken) return;
    if (!mod) {
      body.replaceChildren(html('div', { class: 'pz-void' }, undefined, '· · ·'));
      return;
    }
    if (this.state.progress[rec.puzzle] === undefined && n === this.solvedCount + 1) this.commit(saveProgress(this.state, rec.puzzle, null));
    this.instance = mod.mount(body, this.ctx(n, true));
    if (n === this.solvedCount + 1) void this.startField(n);
    if (n <= this.solvedCount) void this.showReveal(n);
  }

  private async showReveal(n: number): Promise<void> {
    const el = this.sheet;
    const box = el?.querySelector<HTMLElement>('.sheet-reveal');
    if (!el || !box) return;
    const rec = this.recs[n - 1];
    const mod = await this.module(rec.puzzle);
    if (el !== this.sheet) return;
    this.revealInst?.destroy();
    box.hidden = false;
    box.replaceChildren();
    el.classList.add('solved');
    const nx = this.recs[n];
    if (!nx) {
      html('div', { class: 'pz-void' }, box, '· · ·'); // the chain continues in a later release
      return;
    }
    if (mod?.reveal) this.revealInst = mod.reveal(box, nx.clue, this.ctx(n, true));
  }

  // ---------------------------------------------------------- notebook ---

  openNotebook(): void {
    const el = this.openSheet('notebook', 'notebook');
    const body = html('div', { class: 'sheet-body nb' }, el);
    const list = html('ol', { class: 'nb-list' }, body);
    for (let i = 0; i < TOTAL; i++) {
      const n = i + 1;
      const rec = this.recs[i];
      const solved = n <= this.solvedCount;
      const li = html('li', { class: solved ? 'solved' : rec ? 'current' : '' }, list);
      const peak = rec && solved ? this.peakOf.get(rec.summit) : undefined;
      const b = html('button', { class: 'nb-row', type: 'button' }, li);
      html('span', { class: 'nb-n' }, b, pad(n));
      html('span', { class: 'nb-name' }, b, peak ? displayName(peak.name) : '·'.repeat(18));
      const mk = html('span', { class: 'nb-mark', 'aria-hidden': 'true' }, b);
      if (solved || rec) mk.appendChild(icon(solved ? 'check' : 'star-four'));
      if (solved && peak) b.addEventListener('click', () => {
        this.closeSheet();
        this.host.flyTo(peak, () => void this.openStep(n));
      });
      else if (rec && n > 1) {
        // the current step: show again the clue that led here
        b.addEventListener('click', () => void this.openStep(n - 1));
      } else if (rec) {
        const p = this.peakOf.get(rec.summit);
        if (p) b.addEventListener('click', () => {
          this.closeSheet();
          this.host.flyTo(p, () => void this.openStep(n));
        });
      } else b.disabled = true;
    }
  }
}

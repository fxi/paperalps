/**
 * Puzzle contract. Each puzzle lives in its own module under ./puzzles and is
 * loaded on demand (one chunk each). Which summit holds which puzzle, and in
 * what order, is only known by unsealing the chain (chain.ts).
 *
 * A puzzle never ships its answer: it derives candidate strings from what the
 * player did and submits them; the engine checks them against the sealed
 * hash. No text explains anything (see PUZZLE_SPEC.md).
 */
import type { Notes } from './notes';
import type { World, Camera } from './world';
import type { ThemeId } from '../audio/ambient';

export interface PuzzleAudio {
  ctx: AudioContext;
  /** Connect voices here: it goes through the score's room and master. */
  out: AudioNode;
}

export interface PuzzleCtx {
  /** 1-based position in the chain. */
  step: number;
  /** Saved working state from a previous visit (validate it, it may be stale). */
  progress: unknown;
  save(progress: unknown): void;
  /** Submit candidate answers; resolves true when one is accepted (the step is solved). */
  submit(candidates: string | string[]): Promise<boolean>;
  /** Already solved (re-opened to look at it again). */
  readonly solved: boolean;
  /** Sound: null when the player has it off. */
  audio(): PuzzleAudio | null;
  /** Set the score's mood while the puzzle is open. */
  mood(m: Mood): void;
  notes: Notes;
  world: World;
  /** Close the tableau (e.g. to fly); the puzzle's field part stays alive. */
  close(): void;
}

export type Mood = ThemeId;

export interface PuzzleInstance {
  destroy(): void;
}

export interface PuzzleModule {
  /** The tableau. */
  mount(root: HTMLElement, ctx: PuzzleCtx): PuzzleInstance;
  /** The clue to the next step, drawn after solving (payload from the sealed record). */
  reveal?(root: HTMLElement, clue: unknown, ctx: PuzzleCtx): PuzzleInstance;
  /** World part, alive while this step is the current one (also with the tableau closed). */
  field?(ctx: PuzzleCtx): PuzzleInstance;
  /** Candidate answers from the camera pose (the shutter of a photo note). */
  shutter?(cam: Camera, ctx: PuzzleCtx): string[];
}

/** Puzzle modules by key. Keys are the summit ids they belong to. */
export const PUZZLES: Record<string, () => Promise<PuzzleModule>> = {
  matterhorn: () => import('./puzzles/riffelsee').then((m) => m.default),
  dom: () => import('./puzzles/canon').then((m) => m.default),
  weisshorn: () => import('./puzzles/tyndall').then((m) => m.default),
  'grand-combin': () => import('./puzzles/mauvoisin').then((m) => m.default),
  'aiguille-du-midi': () => import('./puzzles/midi').then((m) => m.default),
};

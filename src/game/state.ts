/**
 * Game save state: pure reducers + a versioned localStorage slot.
 *
 * Only the player's own facts are stored: the accepted answers, in order, and
 * each puzzle's working state. Everything else (which summit is current, the
 * clues) is re-derived by unsealing the chain with those answers.
 */

export interface GameState {
  v: 2;
  answers: string[]; // accepted answer of step 1, 2, ...
  progress: Record<string, unknown>; // puzzle key -> its own JSON
}

export const KEY = 'paperalps.game.v2';

export function initial(): GameState {
  return { v: 2, answers: [], progress: {} };
}

export const saveProgress = (s: GameState, puzzle: string, progress: unknown): GameState => ({
  ...s,
  progress: { ...s.progress, [puzzle]: progress },
});

/** Record the answer of step `n` (1-based). Only the next step can be answered. */
export function answer(s: GameState, n: number, value: string): GameState {
  if (n !== s.answers.length + 1) return s;
  return { ...s, answers: [...s.answers, value] };
}

/** Keep only the answers the chain accepted (a stale or edited save). */
export const truncate = (s: GameState, n: number): GameState => (n >= s.answers.length ? s : { ...s, answers: s.answers.slice(0, n) });

/** Parse a stored state; anything unknown or broken starts fresh. */
export function parse(raw: string | null): GameState {
  if (!raw) return initial();
  try {
    const s = JSON.parse(raw) as Partial<GameState>;
    if (s.v !== 2 || !Array.isArray(s.answers) || typeof s.progress !== 'object' || s.progress === null) return initial();
    return { v: 2, answers: s.answers.filter((a): a is string => typeof a === 'string'), progress: s.progress };
  } catch {
    return initial();
  }
}

export function loadGame(): GameState {
  try {
    localStorage.removeItem('paperalps.game.v1'); // the first prototype's save
    return parse(localStorage.getItem(KEY));
  } catch {
    return initial();
  }
}

export function saveGame(s: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: progress lives for this session only */
  }
}

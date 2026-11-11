/**
 * Runtime side of the sealed chain (see seal.ts and scripts/seal-chain.mjs).
 *
 *   chain.sealed.json = { first, boxes }
 *   first     step 1's record, in the clear
 *   boxes[i]  step i+2's record, sealed with the answer of step i+1
 *
 * A record names its summit and puzzle, carries the hash of its own answer,
 * and the clue that leads to it (shown by the previous step's puzzle) plus
 * notes filed in the notepad when it opens.
 */
import { okHash, unseal, type Box } from './seal';
import sealedJson from './chain.sealed.json';
import type { NoteSeed } from './notes';

export const TOTAL = 50;

export interface Rec {
  summit: string;
  puzzle: string;
  ok: string;
  /** Payload for the previous puzzle's reveal(): the clue leading here. */
  clue?: unknown;
  notes?: NoteSeed[];
}

export interface Sealed {
  first: Rec;
  boxes: Box[];
}

const SEALED = sealedJson as unknown as Sealed;

/**
 * Replay saved answers: returns the records opened so far (one more than the
 * accepted answers while the chain goes on) and the answers that held.
 */
export async function openChain(answers: string[], sealed: Sealed = SEALED): Promise<{ recs: Rec[]; answers: string[] }> {
  const recs: Rec[] = [sealed.first];
  const good: string[] = [];
  for (let i = 0; i < answers.length; i++) {
    if ((await okHash(i + 1, answers[i])) !== recs[i].ok) break;
    good.push(answers[i]);
    const box = sealed.boxes[i];
    if (!box) break;
    const r = await unseal<Rec>(box, i + 1, answers[i]);
    if (!r) break;
    recs.push(r);
  }
  return { recs, answers: good };
}

/** The first candidate accepted for step `n`, or null. */
export async function accept(n: number, rec: Rec, candidates: string[]): Promise<string | null> {
  for (const c of candidates) if ((await okHash(n, c)) === rec.ok) return c;
  return null;
}

/** The record after step `n`, opened with its answer (null at the end of the written chain). */
export async function next(n: number, answer: string, sealed: Sealed = SEALED): Promise<Rec | null> {
  const box = sealed.boxes[n - 1];
  return box ? unseal<Rec>(box, n, answer) : null;
}

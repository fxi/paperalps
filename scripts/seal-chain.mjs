// Seal the chain: game-src/chain.json (plain, never bundled) ->
// src/game/chain.sealed.json. Run: npm run seal
//
// chain.json: [{ summit, puzzle, answer, clue?, notes? }, ...] in play order.
// `clue` / `notes` of step k are what the player gets after solving step k-1
// (they lead to step k), so they are sealed with the answer of step k-1.
import { readFileSync, writeFileSync } from 'node:fs';
import { okHash, seal, norm } from '../src/game/seal.ts';

const steps = JSON.parse(readFileSync(new URL('../game-src/chain.json', import.meta.url), 'utf8'));

// answers that are computed rather than written: { "fn": "<puzzle>" }
const FN = {
  riffelsee: async () => (await import('../src/game/puzzles/riffelseeLogic.ts')).answer(),
  tyndall: async () => (await import('../src/game/puzzles/tyndallLogic.ts')).answer(),
  mauvoisin: async () => (await import('../src/game/puzzles/mauvoisinLogic.ts')).answer(),
  midi: async () => {
    const t = await import('../src/game/tools/tixy.ts');
    const m = await import('../src/game/puzzles/midiLogic.ts');
    return t.sample(t.compile(m.TARGET), m.FRAMES, m.DT);
  },
};
for (const s of steps) if (s.answer && typeof s.answer === 'object') s.answer = await FN[s.answer.fn]();
const rec = async (s, n) => ({
  summit: s.summit,
  puzzle: s.puzzle,
  ok: await okHash(n, s.answer),
  ...(s.clue !== undefined ? { clue: s.clue } : {}),
  ...(s.notes ? { notes: s.notes } : {}),
});

const first = await rec(steps[0], 1);
const boxes = [];
for (let i = 1; i < steps.length; i++) {
  if (!steps[i - 1].answer) throw new Error(`step ${i} has no answer`);
  boxes.push(await seal(await rec(steps[i], i + 1), i, steps[i - 1].answer));
}
writeFileSync(new URL('../src/game/chain.sealed.json', import.meta.url), JSON.stringify({ first, boxes }) + '\n');
console.log(`sealed ${steps.length} steps:`, steps.map((s, i) => `${i + 1}:${norm(s.answer).length}ch`).join(' '));

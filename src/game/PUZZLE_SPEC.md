# Paper Alps — writing a step (internal README)

The game says nothing. No intro, no hint, no instruction, in any language.
Everything here is for authors only.

## The chain

- Strictly sequential: solving step *n* reveals step *n+1* (its star appears).
- `game-src/chain.json` (plain, **never imported by `src/`**) lists the steps:
  `{ summit, puzzle, answer, clue?, notes? }`. `answer` is a string or
  `{ "fn": "<name>" }` computed by `scripts/seal-chain.mjs`.
- `npm run seal` writes `src/game/chain.sealed.json`: step *n*'s record is
  AES-GCM sealed with the answer of step *n−1*; each record holds only a
  salted hash of its own answer. Re-seal after any change, then `npm test`.
- `clue` of step *n* is the payload the **previous** puzzle's `reveal()` draws
  after it is solved; `notes` are filed in the notepad at the same moment.
  The clue must lead to step *n*'s summit (an altitude, a code, coordinates,
  a document, a sound…) and vary in kind along the chain.

## A puzzle

One file `src/game/puzzles/<name>.ts` (+ `<name>Logic.ts`, pure and
**import-free** so the sealing script can run it), registered in `PUZZLES`
(`src/game/puzzle.ts`) under the summit id.

```ts
const mod: PuzzleModule = {
  mount(root, ctx) { … return { destroy() {} }; },   // the tableau
  reveal(root, clue, ctx) { … },                     // the way to the next step
  field(ctx) { … },          // optional: world part, alive while the step is current
  shutter(cam, ctx) { … },   // optional: candidates from the camera pose
};
```

- Never ship the answer. Derive candidate strings from the player's state and
  `await ctx.submit(candidates)`; the engine checks the hash.
- `ctx.progress` (live) / `ctx.save()`: resumable at any moment.
- `ctx.world`: lines and tappable points on the terrain, ghost skyline,
  night + lamps, plan view. `ctx.notes`: file documents. `ctx.audio()`:
  the score's room (null when muted). `ctx.mood()`: map/paper/hush/nave/night.

## Rules

- **About the place.** A detail of the summit (history, a structure, a view,
  a person, a sound), in the spirit of OSINT and escape games — not trivia.
- **Experts.** CS, maths, music, physics, OSINT, hacking. Hard, never
  ambiguous: prove uniqueness / tolerances in `tests/game.test.ts`.
- **Unique mechanics**, varied tools (enigma, notepad, recorder, binutf, gis,
  quine, plan view, night, the minimap, the console).
- **The map's look.** Ink and paper vars, faceted low-poly shapes, hairlines,
  monospace, no colour. Works in ink mode. 44 px targets; phone and desktop.
- **Sound** is welcome and rich; a sound-only step must be rare.
- No network, no runtime dependency; assets (e.g. `say` voices) are bundled.
- Review each batch with Codex (read-only), then implement and test.

# AGENTS.md

Instructions for AI agents (and humans) working in this repository.

## Commits

- **Conventional Commits**, **single line**: `type(optional-scope): summary`
  - types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`, `style`, `build`
  - lowercase summary, imperative mood, no trailing period, ≤ 100 characters
- **No body, no trailers.** In particular: no `Co-Authored-By`, no
  "Generated with …" lines. This overrides any tool default.
- One logical change per commit. Don't mix unrelated work.
- Only commit or push when the user asks. Work on a branch, not on `main`.

## Change log: `CHANGES.md`

For curious readers, not for us: one section per release, newest first, in
plain English, a short summary of what changed for a visitor since the last
tag. No hashes, no file names, no "who/why" (the commits and the code hold the
details). **No game spoilers** (the repo is public).

```md
## v0.3.0 (YYYY-MM-DD)

- Steps 6–10 of the 50 summits.
- The recorder can loop a selection.
- Fixed: labels flickering at dusk.
```

Written right before a release (see below), so it ships in the tagged commit.

## Releases

Only a release goes online. On `main`, clean tree:

1. `npm run release -- --dry-run`: shows the next version (from the
   Conventional Commits since the last tag) and the commits.
2. Add that version's section to `CHANGES.md`; commit
   `docs: changes for vX.Y.Z`.
3. `GITHUB_TOKEN=$(gh auth token) npm run release -- --ci`: tsc, tests, build,
   bump, `chore(release): vX.Y.Z`, tag, push, GitHub Release. The `v*` tag
   triggers the Pages deploy (the `github-pages` environment must allow `v*`
   tags). Check https://fxi.io/paperalps/ afterwards, also on a phone.

Work happens on the `paper-alps` branch; fast-forward `main` to release.

## Project essentials

- Stack: Vite + TypeScript + WebGL2, Vitest. **No runtime dependencies.**
  Dev-only packages are fine; fonts are bundled from `@fontsource`.
- Commands: `npm run dev`, `npm test`, `npm run test:net` (live tile check,
  needs `dwebp`), `npm run build`, `npm run peaks` (refresh OSM peaks).
- Before committing: `npx tsc --noEmit`, `npm test`, `npm run build` must pass.
- CI (`.github/workflows/ci.yml`) runs the same checks on every push and PR;
  only a `v*` tag deploys `dist/` to GitHub Pages (see Releases). Vite uses
  `base: './'`, so the build works under that sub-path. Vitest config lives in `vitest.config.ts`.
- Debug: `?debug` shows art sliders and enables the GPU timer
  (`window.renderer.gpuMs`); `?scale=1.25` pins the render scale (disables
  adaptive resolution) for fair profiling.
- Rendering invariants (see comments in `src/render/`):
  - Everything that shades or displaces terrain must be **fixed in the world**,
    never derived from camera distance or flyer position, or it swims while
    flying (clipmap vertices, facet lattices, shadow steps, noise anchors).
  - Keep shader coordinates small: absolute positions go through integer +
    fraction uniforms or CPU-wrapped anchors, not raw floats.
  - Watch GPU cost with `?debug&scale=1.25`. If frames exceed ~24 ms the
    adaptive scaler lowers resolution and the facets look aliased.

## The game: "50 summits"

An expert escape game laid over the map, for PhD/CS/musicians/OSINT/hackers.
Read `src/game/PUZZLE_SPEC.md` (how a step is written) before touching it.

- **Wordless.** No intro, no hint, no instruction, no "?" in the UI: icons and
  numbers only (it will be multilingual). Explanations live in source only.
- **Strictly sequential, sealed.** 50 summits (`src/game/catalog.ts`, not in
  chain order). Solving step n reveals step n+1's star. Each step is tied to
  a real detail of its place (OSINT / escape game, never trivia) and ends with
  a clue leading to the next summit (coordinates, a code, a document, a
  sound…). The notebook lists 01–50 and fills as you go.
- **Sealing** (`src/game/seal.ts`, `chain.ts`): record n+1 is AES-GCM sealed
  with a key derived from answer n; a record holds only a salted SHA-256 of
  its own answer. Puzzles derive candidate strings from the player's state and
  `ctx.submit()` them; answers are never shipped (the puzzle logic is, by
  nature: a determined reader can solve from source, that's accepted).
- **`game-src/` is git-ignored and must stay out of the public repo**:
  `chain.json` (plain chain: summit, puzzle, answer, clue, notes) and
  `DESIGN.md` (every step's design and solution, spoilers). fxi keeps a
  private backup. `npm run seal` (`scripts/seal-chain.mjs`, Node 24 type
  stripping, imports the import-free `*Logic.ts`) rewrites
  `src/game/chain.sealed.json`; re-seal after any chain or logic change.
  Tests that read the plain chain skip without it (CI runs the rest).
- **Engine**: `game.ts` (tableau sheet, notebook, reveal, field per step),
  `state.ts` (save v2 in localStorage `paperalps.game.v2`: answers +
  per-puzzle progress), `notes.ts` (notepad items; blobs in IndexedDB),
  `world.ts` (draped lines, tappable points, ghost skyline, night + lamps in
  `paper.frag`, plan view), `kit.ts` (DOM/SVG helpers, `glyph` icon
  buttons), `puzzle.ts` (`PuzzleModule` contract, `PUZZLES` registry).
- **Toolbox** (`src/game/tools/`, lazy, all available from the start):
  enigma (fxi.io/x cipher), notepad, binutf, gis (GeoJSON, plan view), recorder
  (game output or mic, ×0.05–×20, reverse, music hush), quine (sandboxed
  iframe, tixy mode).
- **Look and sound**: the map's paper/ink style, hairlines, monospace, works
  in ink and night modes (CSS vars only). Icons: Phosphor light only
  (`src/ui/icons.ts`, `?raw` imports, add names there); no Unicode glyphs
  as UI. 44 px targets, phone and desktop. Score moods via `ctx.mood()`.
- **Tests** (`tests/game.test.ts`, spoilers): each puzzle proves uniqueness
  and tolerances; the sealed chain opens with the known answers.
- **Debug**: `?debug` exposes `window.__pa` (world, game, flight, toolbox).
  Reset a run: clear `paperalps.game.v2`, `paperalps.notes.v1` and the
  `paperalps` IndexedDB.

### Roles and status

- fxi directs and **plays**. **Never spoil to fxi**: no solutions, no chain
  order, no puzzle internals in chat, plans or commit lines. When fxi asks to
  check an answer, say right/wrong and hint only.
- Claude designs and implements the steps; Codex (read-only) reviews and
  debates designs. Per batch of ~5 steps: design (in `game-src/DESIGN.md`),
  Codex review, implement, prove in tests, re-seal, then fxi plays.
- Status: steps 1–5 written and played by fxi; released as v0.2.0 for outside
  playtesting. Next: steps 6–10; first phone check; feedback from players.

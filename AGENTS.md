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

Details that don't fit in a one-line commit go in `CHANGES.md`, one entry per
commit (or per small group of related commits), **newest first**:

```md
## <short title>

- **Commit:** `<hash or hashes>`: `<the commit line>`
- **Date:** YYYY-MM-DD
- **Who:** who asked, who implemented, who reviewed
  (e.g. "fxi (direction, testing) · Claude (implementation) · Codex (review)")
- **Why:** the problem or request that motivated it
- **What:** the changes, with key files
- **Notes:** trade-offs, known limits, follow-ups (optional)
```

Add the entry in the same commit as the change when practical, otherwise in a
`docs: update changes` commit right after. Hashes in an entry may refer to
earlier commits only (a commit can't contain its own hash).

## Project essentials

- Stack: Vite + TypeScript + WebGL2, Vitest. **No runtime dependencies.**
  Dev-only packages are fine; fonts are bundled from `@fontsource`.
- Commands: `npm run dev`, `npm test`, `npm run test:net` (live tile check,
  needs `dwebp`), `npm run build`, `npm run peaks` (refresh OSM peaks).
- Before committing: `npx tsc --noEmit`, `npm test`, `npm run build` must pass.
- CI (`.github/workflows/ci.yml`) runs the same checks on every push and PR.
  Only a release deploys `dist/` to GitHub Pages (source: GitHub Actions) at
  https://fxi.io/paperalps/: `npm run release` on `main` (release-it,
  `.release-it.json`) runs the checks, bumps the version from the commits,
  tags `v*`, pushes and creates a GitHub Release; the tag triggers the deploy.
  Pushing to `main` alone deploys nothing. Vite uses `base: './'`, so the build
  works under that sub-path. Vitest config lives in `vitest.config.ts`.
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

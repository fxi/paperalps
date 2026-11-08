# Changes

Newest first. Format and rules: see `AGENTS.md`.

## Commit rules and change log

- **Commit:** `docs: add agent commit rules and change log`
- **Date:** 2026-11-08
- **Who:** fxi (request) · Claude (implementation)
- **Why:** keep commit history to one conventional line, with no co-author
  trailers, and move the detail into a readable log.
- **What:** `AGENTS.md` (commit conventions, change-log format, project
  essentials and rendering invariants) and this `CHANGES.md`, backfilled for
  the earlier commits. The first commit's message was reworded to a
  conventional single line (`2d1b216` → `7680d30`; content unchanged, author
  dates preserved; `chore: gitignore _tmp` replayed on top as `1779762`).

## Restore sharp rendering, revert HUD restyle

- **Commit:** `f9917f7`: `fix: restore full-resolution rendering, per-pixel shadows and ink default with plain labels`
- **Date:** 2026-11-08
- **Who:** fxi (report: "antialias issue", label style not as intended) ·
  Claude (diagnosis and fix)
- **Why:** after the stability fixes, the GPU cost per frame rose until the
  adaptive scaler dropped the render scale from 1.25× to ~0.55×. The small
  facets then looked blocky and aliased, which white paper made obvious.
  The boxed peak-label style wasn't what was wanted.
- **What:**
  - Reverted: white-paper default, boxed peak labels and coordinates
    (`index.html`, `src/style.css`, `src/ui/labels.ts`, `src/ui/peaks.ts`,
    `src/main.ts`).
  - Facet octave visibility measured in framebuffer px again; CSS-px
    thresholds kept 1-px facets alive at low render scale (cost + aliasing).
  - Ink brush and paper fibre noise only computed in their own mode.
  - Cast shadows back per pixel, with world-fixed step length (clipmap level
    spacing), 10 steps. Per-vertex shadows followed the grid cells
    (`src/render/paper.frag`, `src/render/terrain.vert`).
  - Removed two edge-antialiasing experiments: neighbour re-sampling roughly
    doubled the facet cost through warp divergence, and the 2×2 quad average
    drew dashed lines along edges. MSAA stays off.
  - Profiling: `?debug` GPU timer (`EXT_disjoint_timer_query_webgl2`),
    `?scale=` to pin the render scale (`src/render/renderer.ts`, `src/main.ts`).
- **Notes:** GPU ≈ 18 ms/frame at 1.25× on an M1 Pro (was 35 ms at worst).

## Ignore `_tmp`

- **Commit:** `1779762`: `chore: gitignore _tmp`
- **Date:** 2026-11-08
- **Who:** fxi
- **What:** `.gitignore` entry for a local scratch folder.

## Paper Alps: initial version

- **Commit:** `7680d30`: `feat: paper alps terrain explorer with 2.5d flight, clipmap terrain and paper/ink shading`
- **Date:** 2026-11-08
- **Who:** fxi (concept, art direction, feedback, testing) · Claude
  (design and implementation) · Codex `gpt-6.1-sol` (review of the wobble and
  texture-glitch fixes)
- **Why:** an art/game experiment: fly the real Alps from Mapterhorn DEM
  tiles, rendered as crumpled paper, with a moody, "feel-good" atmosphere.
- **What:**
  - DEM: lossless WebP Terrarium decode without colour management (verified
    against the Matterhorn: 4471.5 m at z12 vs 4478 m); LRU tile store;
    toroidal R32F atlases; near/far cascade with a distance-based blend;
    prefetch before data-zoom switches; placeholder → exact tile fades
    (`src/dem/`).
  - 2.5D flight camera (heading, tilt, top-down toggle), soft terrain floor,
    URL hash state (`src/render/camera.ts`, `src/main.ts`).
  - Clipmap terrain: world-snapped nested grids, ring index buffers,
    height-only seam blending, so there is no vertex swimming
    (`src/render/terrain.vert`, `src/render/renderer.ts`, `clipLevel` in
    `src/render/view.ts`).
  - Paper shading: world-anchored jittered facet lattices sampled from the
    DEM, sin²-weighted octaves with a hysteresis-latched scale, curvature AO,
    clouds, valley mist, grain, and an ink mode (white paint on black paper,
    with contour-following dry-brush streaks from fixed lattice directions).
    Noise domains are periodic and CPU-anchored (`src/render/paper.frag`).
  - HUD: ALT/GND/AGL readout, compass, stair-step contour minimap with
    heading cone, 2,500 decluttered OSM peak labels, minimal twin sticks
    (left: forward/turn, right: climb/strafe) and keyboard, IBM Plex Mono at a
    single size (`src/ui/`, `src/style.css`).
  - Generative WebAudio ambient score steered by altitude and speed
    (`src/audio/ambient.ts`).
  - Tests: decode, mercator, camera, clipmap, octaves, peaks, upsample
    (`tests/`).
- **Notes:** peaks © OpenStreetMap contributors (ODbL), fetched once by
  `scripts/fetch-peaks.mjs`.

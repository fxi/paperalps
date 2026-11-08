# Changes

Newest first. Format and rules: see `AGENTS.md`.

## Quieter HUD and peak labels

- **Commit:** `47f2e45`: `feat(ui): aircraft sticks, fly splash with sound toggle and quieter hud`
- **Date:** 2026-11-08
- **Who:** fxi (direction, mockup) · Claude (implementation)
- **Why:** the boxed altitude, boxed chips and bold peak labels were too loud.
- **What:** altitude uses the same soft style as the other readouts; the
  toolbar keeps only bare sound and paper/ink icons under the readout; the 3D
  button is gone (T still toggles top-down, not saved, always starts in 3D).
  Peak names in soft ink, regular weight; elevations fainter; smaller, thinner
  marker. `index.html`, `src/style.css`, `src/main.ts`.

## Splash "fly" button and saved sound preference

- **Commit:** `47f2e45`: `feat(ui): aircraft sticks, fly splash with sound toggle and quieter hud`
- **Date:** 2026-11-08
- **Who:** fxi (direction) · Claude (implementation)
- **Why:** start with sound from the splash screen and keep the choice.
- **What:** the veil now waits for a **FLY** button (or Enter) next to a sound
  toggle; it fades once the user entered and the terrain is ready. The toolbar
  play/pause chip is now a speaker/muted toggle (M). The preference is saved as
  `paperalps.sound` in localStorage (default on); audio starts on the FLY
  gesture. `index.html`, `src/main.ts`, `src/style.css`.

## Sonic variometer

- **Commit:** `83cd15e`: `feat(audio): dark drone score with in-key variometer`
- **Date:** 2026-11-08
- **Who:** fxi (idea) · Claude (implementation)
- **Why:** tie the music to what the pilot does, like a glider's audio vario.
- **What:** `Steering` gained `vario` (climb / max climb) and `bank`. Climbing
  plays soft triangle pings on a sixteenth grid of the score, rising through
  D minor pentatonic and getting denser with climb rate. Sinking fades in a
  low, filtered growl that steps down A–G–F–E–D with sink rate. Both pan with
  the bank.

## Camera looks at the horizon

- **Commit:** `2e9e66f`: `feat(render): camera roll, tilted sky horizon and 75 degree default tilt`
- **Date:** 2026-11-08
- **Who:** fxi (request) · Claude (implementation)
- **What:** `DEFAULT_ART.tilt` 62 → 75 so the horizon and sky are in view; debug
  slider up to 85; the pitch-led view may reach 86°.
- **Notes:** measured GPU time with `?debug&scale=1.25` at 62/70/75°: no
  difference.

## Dark drone score

- **Commit:** `83cd15e`: `feat(audio): dark drone score with in-key variometer`
- **Date:** 2026-11-08
- **Who:** fxi (direction) · Claude (implementation)
- **Why:** the D major pentatonic pad and bell plucks sounded too bright and
  naive; wanted something dark, low, drone-like, still relaxing.
- **What:** rewrote `src/audio/ambient.ts`: D minor (i–bVI–iv–v sus) at 44 BPM,
  chords change every ~44 s by gliding persistent voices (sub sine, bass,
  detuned saw drone through a breathing low-pass) instead of retriggering.
  A throb on the drone deepens with speed; high fifths and air noise fade in
  with altitude; low rumble noise. Rare low FM tolls and short muted minor
  motifs through a slow delay. Longer, darker reverb; 28 Hz high-pass.
- **Notes:** same public API (`play/pause/toggle/setSteering`).

## Aircraft-style sticks: throttle/yaw and pitch/roll

- **Commit:** `2e9e66f`: `feat(render): camera roll, tilted sky horizon and 75 degree default tilt`, `47f2e45`: `feat(ui): aircraft sticks, fly splash with sound toggle and quieter hud`
- **Date:** 2026-11-08
- **Who:** fxi (direction) · Claude (implementation)
- **Why:** forward/turn + climb/strafe did not feel natural; wanted a small
  fast aircraft feel.
- **What:** left stick = throttle + yaw, right stick = pitch (pull back = nose
  up) + roll. Banking makes a coordinated turn; pitch converts airspeed into
  climb (with a small direct term so it still works when hovering); both
  auto-level on release. The camera rolls with the bank and tilts with the
  pitch (reduced in top-down mode). `basis()` gained a `roll` argument
  (`src/render/camera.ts`); the sky gradient now follows a tilted horizon line
  (`uHorizonPt`/`uHorizonN` in `sky.frag`). Keys: W/S throttle, A/D yaw,
  ↓/↑ (F/R) pitch, ←/→ (Q/E) roll. Strafe removed.
- **Notes:** the facet scale uses the base tilt, not the pitched one, so nodding
  the nose does not rescale the folds.

## Deploy on manual runs, newer actions

- **Commit:** `ci: deploy on manual runs and update action versions`
- **Date:** 2026-11-08
- **Who:** Claude (fix after the first CI run)
- **Why:** the first push to the empty repo triggered no run, and the manual
  `workflow_dispatch` run passed its checks but skipped the deploy (the
  condition allowed `push` events only). The actions also warned about the
  Node 20 deprecation.
- **What:** deploy on any non-PR run of `main`; `actions/checkout@v5`,
  `actions/setup-node@v5`, `actions/upload-pages-artifact@v4`.

## Rename to paperalps, CI and GitHub Pages

- **Commit:** `ci: rename to paperalps, add vitest config and github pages workflow`
- **Date:** 2026-11-08
- **Who:** fxi (name, remote `git@github.com:fxi/paperalps.git`, Pages set to
  GitHub Actions) · Claude (implementation and sub-path check)
- **Why:** "shadegl" was a placeholder name. Publish the app at
  https://fxi.io/paperalps/ with checks on every push.
- **What:**
  - Package, README title, peaks script user-agent and test temp prefix
    renamed to `paperalps`. The local folder name is unchanged.
  - `vitest.config.ts` (node env, `tests/**/*.test.ts`); `vite.config.ts`
    keeps only `base: './'` for sub-path hosting.
  - `.github/workflows/ci.yml`: Node 24, `npm ci`, type-check, tests and
    build on push/PR; on `main`, upload `dist/` and deploy with
    `actions/deploy-pages`.
- **Notes:** the production build was verified locally under a
  `/paperalps/` prefix: assets, fonts, tiles and labels all load.

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

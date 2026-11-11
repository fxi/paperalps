# Changes

Newest first. Format and rules: see `AGENTS.md`.

## Releases with release-it, deploy on tags

- **Commit:** `build: release-it, deploy only tagged releases`
- **Date:** 2026-11-11
- **Who:** fxi (request) · Claude (implementation)
- **Why:** the game goes to outside playtesters: what is online must be a
  deliberate, versioned release, not whatever was last pushed to `main`.
- **What:** `release-it` 21.1.1 and `@release-it/conventional-changelog`
  (dev only), `.release-it.json`, `npm run release`: on `main` with a clean
  tree it runs tsc, tests and build, bumps the version from the Conventional
  Commits, commits `chore(release): v<version>`, tags, pushes and writes the
  GitHub Release notes from the commits. CI deploys Pages only on `v*` tags.
  `AGENTS.md` updated.
- **Notes:** needs a GitHub token (`GITHUB_TOKEN=$(gh auth token)`). The
  `github-pages` environment must allow `v*` tags. `CHANGES.md` stays
  hand-written; no generated changelog file.

## The 50 summits: a sealed escape game, toolbox, first five steps

- **Commit:** `1be59a4`: `feat(game): sealed puzzle chain, toolbox, world hooks and first five steps`
- **Date:** 2026-11-08
- **Who:** fxi (concept, direction, playtesting) · Claude (design,
  implementation) · Codex gpt-6.1-sol (design review)
- **Why:** turn the flight into an expert escape game (CS, music, OSINT,
  hackers). The first prototype (groups, waves, two simple puzzles, hints,
  explanatory text) was judged too easy and off-theme: the game must be
  strictly sequential, wordless (multilingual later), tied to details of each
  place, and give players real instruments.
- **What:**
  - Sealed chain (`src/game/seal.ts`, `chain.ts`, `scripts/seal-chain.mjs`,
    `npm run seal`): each step's record (summit, puzzle, the clue that leads
    to it) is AES-GCM encrypted with a key derived from the previous answer;
    a step only carries a salted hash of its own answer. The plain chain lives
    in `game-src/` (not bundled). Puzzles derive candidate answers from what
    the player did and submit them; answers are never shipped.
  - Save v2 (`paperalps.game.v2`): accepted answers + per-puzzle progress;
    everything else is re-derived by unsealing. Notes in localStorage, binary
    payloads in IndexedDB (`src/game/notes.ts`).
  - Tableau: the frozen map inked over, paper grain, a facet unfold; only a
    step number and ✕. Notebook: 01–50, names appear as they are solved.
    The star moves to the next summit when a step is solved.
  - Toolbox (`src/game/tools/`, one lazy chunk each, always available):
    enigma (fxi.io/x cipher, compatible both ways, bits ⇄ image), notepad
    (text/image/sound, carry an item), binutf (16-bit grid ⇄ UTF-16, binary,
    hex), gis (GeoJSON numbers, draw on the relief, fly to it, plan view),
    recorder (records the game's own output or the mic; slow/fast/reverse,
    ink waveform), quine (sandboxed iframe with console relay, tixy mode).
  - World hooks (`src/game/world.ts`): lines and tappable points draped on the
    terrain, a direction-anchored ghost skyline with a shutter, night with up
    to 16 world-anchored lamps (`paper.frag` `uNight`/`uLamps`, positions sent
    flyer-relative every frame), plan view.
  - One icon set: Phosphor (light, MIT), inlined at build from a dev
    dependency (`src/ui/icons.ts`), for the toolbar, the toolbox, every tool
    and puzzle button and the note labels. No Unicode glyphs left in the UI,
    so it renders the same on every OS.
  - Score moods (`map`, `paper`, `hush`, `nave`, `night`) and a stream tap of
    the master output for the recorder.
  - Steps 1–5 (Valais and Mont Blanc): pure logic per puzzle with tests that
    prove uniqueness and tolerances (`tests/game.test.ts`, spoilers).
- **Notes:** the chain stops after step 5 (an empty reveal) until the next
  batch. Not yet checked on a phone. One step is sound-only by design.
  Removed: groups, waves, hints, the fold and fifth puzzles. The plain chain
  (`game-src/`) is git-ignored since the repo is public: keep a private
  backup; tests that read it skip without it (CI runs the rest).

## Click-to-fly autopilot

- **Commit:** `8266aeb`: `feat(labels): city labels and click-to-fly autopilot`
- **Date:** 2026-11-08
- **Who:** fxi (idea) · Claude (implementation)
- **Why:** pick a summit or city and be flown there, with the same banking
  feel as manual flight.
- **What:** `src/ui/autopilot.ts` (pure, tested in `tests/autopilot.test.ts`)
  outputs throttle / roll / pitch in stick units that feed the normal flight
  model: bank from the heading error, pitch to cruise above the target and
  450 m above the terrain sampled ahead along the route, speed proportional to
  the distance left to a 3 km stand-off point, so it brakes and stops facing
  the target 600 m above it. Labels are clickable (name and a wide dot area);
  the target is pinned first in the declutter (`placePeaks` `pinned` option,
  ignores distance and significance) and highlighted. Any stick, key, drag or
  zoom cancels it.
- **Notes:** on touch, labels under the lower stick zones are not tappable.
  Stops rather than orbiting at the end.

## City labels

- **Commit:** `8266aeb`: `feat(labels): city labels and click-to-fly autopilot`
- **Date:** 2026-11-08
- **Who:** fxi (idea) · Claude (implementation)
- **What:** `npm run cities` (`scripts/fetch-cities.mjs`, Overpass with retry
  and a mirror) writes `src/data/cities.json`: 264 cities and towns ≥ 30 000
  inhabitants in the app bounds, 10 kB. They join the peaks in one priority
  list (`mergePlaces`, score from population); reach scales with √population
  (a 30k town within ~15 km, Milano ~100 km). Elevation is read from the
  terrain when first shown. Square marker, no elevation line. The minimap
  keeps peaks only.

## Map toggle and north button

- **Commit:** `7989ef0`: `feat(ui): map toggle and rotating north button that resets heading`
- **Date:** 2026-11-08
- **Who:** fxi (direction) · Claude (implementation)
- **What:** two bare toolbar icons next to sound and paper/ink. **Map** (P)
  shows/hides the minimap, saved as `paperalps.minimap`; when hidden it stays
  laid out (invisible) so it keeps sampling the ground for the fog, and labels
  no longer avoid its area. **North** (N) is a compass needle that rotates with
  the heading (replaces the tall arrow beside the map); clicking it eases the
  heading back to north the short way, cancelled by any yaw/roll input. Heading
  readout now shows `000°` instead of `360°` near north.

## Frozen / duplicated peak labels

- **Commit:** `4df50fe`: `fix(labels): stale fade-out timer orphaned peak labels`
- **Date:** 2026-11-08
- **Who:** fxi (report) · Claude (fix)
- **Why:** labels sometimes stayed frozen (often near the horizon), doubled, or
  piled up 4–5 at a time.
- **What:** a peak could fade out twice (two removal timers), be removed by the
  first, then re-created; the second timer then deleted the *new* element from
  the map while it stayed in the DOM, never updated again. Now one timer per
  element, cancelled when the label comes back, and a timer only unmaps the
  element it belongs to. `src/ui/labels.ts`.

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

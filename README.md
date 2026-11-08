# Paper Alps (shadegl)

Explore the real Alps rendered as crumpled paper. Elevation comes from
[Mapterhorn](https://mapterhorn.com) DEM tiles, decoded in the browser, then
shaded by a custom WebGL2 fragment shader. Zero runtime dependencies.

```sh
npm i
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run test:net   # + live Matterhorn tile check (needs `dwebp`)
npm run peaks      # refresh src/data/peaks.json from OSM Overpass
```

Controls: left stick (or W/S, A/D) flies forward/back and turns; right stick (or
↑↓ / R/F to climb, ←→ / Q/E to strafe) climbs, descends and slides sideways; drag to pan, wheel / pinch for height. `T` toggles 2D/3D, `I` toggles black
ink / white paper, `M` music. On touch screens the sticks appear under your thumb
(lower-left / lower-right). Append `?debug` for live art-direction sliders. The
URL hash (`#alt/lat/lon/heading`) is shareable.

## How it works

- **Decode** (`src/dem`): tiles are 512 px lossless WebP, Terrarium-encoded
  (`h = R·256 + G + B/256 − 32768`). They are decoded with `createImageBitmap`
  with colour conversion and premultiplication off, so values are bit-exact. A
  toroidal `R32F` atlas holds the tiles around the camera, and tiles still
  loading are filled from an upsampled ancestor.
- **2.5D** (`src/render/camera.ts`, `terrain.vert`): a polar grid mesh around the
  flyer, displaced by the DEM, rendered with a perspective camera (heading + tilt;
  tilt 0 = top-down). Heights come from a two-level cascade: a near ring at the data
  zoom and a far ring three levels coarser for the distance, fogged into the sky.
  Soft cast shadows and large-scale AO are computed per vertex.
- **Paper** (`src/render/paper.frag`): four world-anchored, jittered triangle
  lattices sample the DEM at their vertices. Each triangle is a flat plane,
  which gives the folds, plus a per-vertex random "crumple" that is stronger on
  steep ground. Octave weights are `sin²` based and sum to 1, so zoom is
  seamless. Then come soft cast shadows, large-scale curvature AO, drifting
  cloud shadows, valley mist, grain and vignette.
- **Peaks**: 2,500 named OSM summits ranked by elevation and isolation, with
  greedy label declutter that avoids the HUD.
- **Minimap**: iso-band edges drawn along a coarse grid, which gives the
  stair-stepped contours.
- **Ink mode**: lit faces get dry-brushed white paint (streaks run along the
  contours), shadow sides stay bare black paper.
- **Music** (`src/audio/ambient.ts`): WebAudio pads, bell plucks, bass and wind
  through a generated convolution reverb. Altitude steers brightness, register
  and wind; speed steers note density.

Data: DEM © Mapterhorn contributors; peaks © OpenStreetMap contributors (ODbL).

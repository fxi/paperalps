import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './style.css';
import { hydrateIcons } from './ui/icons';
import { TileStore } from './dem/tileStore';
import { TILE, lonLatToWorld, tileKey, mod, EARTH_CIRC } from './geo/mercator';
import { Renderer, DEFAULT_ART, NEAR_K, FAR_K, FAR_DROP, MAX_LAMPS, type Art } from './render/renderer';
import { pickDataZoom } from './render/view';
import { makeView, project, mercToLocal, localToMerc, mercLat, FOVY, type Flyer, type View } from './render/camera';
import { Stick } from './ui/joystick';
import { Input } from './ui/input';
import { Minimap } from './ui/minimap';
import { Labels } from './ui/labels';
import { preparePeaks, prepareCities, mergePlaces, type RawPeak, type RawCity, type Peak } from './ui/peaks';
import { autopilot, STANDOFF } from './ui/autopilot';
import { Game } from './game/game';
import { Trail } from './game/trail';
import { World, type Lamp } from './game/world';
import { Toolbox } from './game/tools';
import { Ambient } from './audio/ambient';
import { debugPanel } from './ui/debug';
import rawPeaks from './data/peaks.json';
import rawCities from './data/cities.json';

hydrateIcons(); // toolbar icons (Phosphor, inlined)

const MIN_DZ = 8;
const MAX_DZ = 14;
const MIN_AGL = 120;
const MAX_ALT = 9000;
const BOUNDS = { w: 4.5, e: 17.0, s: 43.4, n: 48.4 };
const DEG = Math.PI / 180;
const MAX_BANK = 35 * DEG;
const MAX_PITCH = 25 * DEG;
// North-east of Zermatt, looking south-west at the Matterhorn
const START = { lat: 46.035, lon: 7.79, alt: 5200, yaw: 232 };

// ---------------------------------------------------------------- setup ---
const canvas = document.getElementById('terrain') as HTMLCanvasElement;
const hud = document.getElementById('hud')!;
const altEl = document.getElementById('alt-value')!;
const gndEl = document.getElementById('gnd')!;
const coordEl = document.getElementById('coord')!;
const northBtn = document.getElementById('north') as HTMLButtonElement;
const northEl = northBtn.querySelector('svg') as SVGElement;
const mapBtn = document.getElementById('minimap') as HTMLButtonElement;
const mapEl = document.getElementById('mapbox')!;
const notebookBtn = document.getElementById('notebook') as HTMLButtonElement;
const musicBtn = document.getElementById('music') as HTMLButtonElement;
const inkBtn = document.getElementById('inkmode') as HTMLButtonElement;
const veil = document.getElementById('veil')!;
const enterBtn = document.getElementById('enter') as HTMLButtonElement;
const veilSoundBtn = document.getElementById('veil-sound') as HTMLButtonElement;

const store = new TileStore(220);
let renderer: Renderer;
try {
  renderer = new Renderer(canvas, store);
} catch (e) {
  veil.querySelector('.veil-sub')!.textContent = 'This needs WebGL2 — try a recent browser.';
  throw e;
}
const coarse = matchMedia('(pointer: coarse)').matches;
const zoneL = document.getElementById('zone-left')!;
const zoneR = document.getElementById('zone-right')!;
// left: throttle + yaw · right: pitch + roll (aircraft style: pull back to climb)
const moveStick = new Stick(hud, 'left', 'Throttle and yaw', coarse ? zoneL : undefined);
const altStick = new Stick(hud, 'right', 'Pitch and roll', coarse ? zoneR : undefined);
const input = new Input(canvas);
const minimap = new Minimap(document.getElementById('mapbox')!);
const peaks = preparePeaks(rawPeaks as RawPeak[]);
// labels: peaks and cities in one priority list (the minimap keeps peaks only)
const places = mergePlaces(peaks, prepareCities(rawCities as RawCity[]));
// a tap on a star opens its puzzle (after the flight); on any other label, just fly
const labels = new Labels(document.getElementById('labels')!, (p) => {
  if (!game.pick(p)) setTarget(p);
});
const music = new Ambient();
const art: Art = { ...DEFAULT_ART };
if (new URLSearchParams(location.search).has('debug')) {
  debugPanel(document.body, art);
  renderer.profile = true;
  (window as unknown as { renderer: Renderer }).renderer = renderer;
}
const DEBUG = new URLSearchParams(location.search).has('debug');

const fl: Flyer = fromHash() ?? startFlyer();
let mode3d = true;
let inkTarget = load('ink', '1') === '1' ? 1 : 0;
let ink = inkTarget;
let soundOn = load('sound', '1') === '1';
let mapOn = load('minimap', '1') === '1';
let northReset = false;
let entered = false; // the splash was dismissed (a user gesture: audio may start)
let tiltNow = mode3d ? art.tilt * DEG : 0;
let dz = -1;
let vel = { e: 0, n: 0 }; // m/s
let climb = 0; // m/s
let yawRate = 0;
let airspeed = 0; // fraction of the altitude-scaled max speed
let bank = 0; // radians, positive = right wing down
let pitch = 0; // radians, positive = nose up
let ground = NaN;
let slowGround = NaN; // heavily smoothed ground: drives the facet scale
let ezStable = NaN;
let ezLatched = NaN; // fold scale target, only moves past a hysteresis margin
let pendingDz = -1; // data zoom being prefetched before a switch
let pendingSince = 0;
let shownAlt = fl.alt;
let fade = 0;
let fullRefill = true;
// `?scale=1` pins the render scale (no adaptive resolution), for profiling
const pinnedScale = Number(new URLSearchParams(location.search).get('scale')) || 0;
let renderScale = pinnedScale || Math.min(window.devicePixelRatio || 1, 1.25);
const maxScale = renderScale;
let slowFrames = 0;
let fastFrames = 0;
syncButtons();

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight, renderScale);
  fullRefill = true;
}
window.addEventListener('resize', resize);
resize();

window.addEventListener('hashchange', () => {
  const f = fromHash();
  if (!f) return;
  Object.assign(fl, f);
  vel = { e: 0, n: 0 };
});

// Sound is a saved preference. Audio can only start from a user gesture, so
// the splash "fly" button is where it first starts.
async function setSound(on: boolean): Promise<void> {
  soundOn = on;
  save('sound', on ? '1' : '0');
  syncButtons();
  if (!entered) return;
  if (on) await music.play();
  else await music.pause();
}
musicBtn.addEventListener('click', () => void setSound(!soundOn));
veilSoundBtn.addEventListener('click', () => void setSound(!soundOn));
function enter(): void {
  if (entered) return;
  entered = true;
  enterBtn.disabled = true;
  if (soundOn) void music.play();
  canvas.focus?.();
}
enterBtn.addEventListener('click', enter);
enterBtn.focus();
mapBtn.addEventListener('click', () => {
  mapOn = !mapOn;
  save('minimap', mapOn ? '1' : '0');
  syncButtons();
});
// ease the heading back to north; any turn input cancels it
northBtn.addEventListener('click', () => {
  northReset = true;
});
inkBtn.addEventListener('click', () => {
  inkTarget = inkTarget ? 0 : 1;
  save('ink', String(inkTarget));
  syncButtons();
});
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (!entered) {
    if (e.key === 'Enter' && e.target === document.body) enter();
    return;
  }
  if (game.isOpen) {
    if (e.key === 'Escape') game.closeSheet();
    return;
  }
  if (e.key === 'c') game.openNotebook();
  if (e.key === 'm') musicBtn.click();
  if (e.key === 't') mode3d = !mode3d; // top-down view: keyboard only, not saved
  if (e.key === 'i') inkBtn.click();
  if (e.key === 'p') mapBtn.click();
  if (e.key === 'n') northBtn.click();
});

function syncButtons(): void {
  for (const b of [musicBtn, veilSoundBtn]) {
    b.classList.toggle('on', soundOn);
    b.setAttribute('aria-pressed', String(soundOn));
    b.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
  }
  inkBtn.setAttribute('aria-label', inkTarget ? 'Switch to white paper' : 'Switch to black paper');
  mapBtn.setAttribute('aria-pressed', String(mapOn));
  mapBtn.setAttribute('aria-label', mapOn ? 'Hide the map' : 'Show the map');
  mapEl.classList.toggle('off', !mapOn);
  document.body.classList.toggle('ink', inkTarget === 1);
}

// ------------------------------------------------------------- autopilot ---
// Click / tap a label to fly there; any stick, key, drag or zoom cancels it.
let target: Peak | null = null;
let arrive: (() => void) | null = null; // runs on arrival (opens a puzzle)
function setTarget(p: Peak | null): void {
  target = p;
  arrive = null;
  labels.setTarget(p);
  if (p) northReset = false;
}

/** Fly to a place; `then` runs on arrival, or at once when already there. */
function flyTo(p: Peak, then?: () => void): void {
  const [e, n] = mercToLocal(fl, p.mx, p.my);
  if (then && Math.hypot(e, n) < STANDOFF + 1500) {
    setTarget(null);
    then();
    return;
  }
  setTarget(p);
  arrive = then ?? null;
}

// ------------------------------------------------------------------ game ---
// While a paper sheet (puzzle or notebook) is open the map is frozen.
let paused = false;
const world = new World(document.getElementById('world') as unknown as SVGSVGElement, {
  camera: () => ({
    lat: mercLat(fl.my) / DEG,
    lon: fl.mx * 360 - 180,
    alt: fl.alt,
    ground: Number.isNaN(ground) ? fl.alt : ground,
    heading: ((fl.yaw / DEG) % 360 + 360) % 360,
    plan: !mode3d,
  }),
  project(lon, lat, ele) {
    if (!view) return null;
    const [x, y] = lonLatToWorld(lon, lat, 0);
    const [e, n] = mercToLocal(fl, x / TILE, y / TILE);
    const h = ele === undefined || Number.isNaN(ele) ? groundAt(x / TILE, y / TILE) : ele;
    return Number.isNaN(h) ? null : project(view, e, n, h);
  },
  projectDir(az, el) {
    if (!view) return null;
    const D = 5000;
    const p = project(view, Math.sin(az) * Math.cos(el) * D, Math.cos(az) * Math.cos(el) * D, fl.alt + (Math.sin(el) * D) / art.lift);
    return p ? [p[0], p[1]] : null;
  },
  ground(lon, lat) {
    const [x, y] = lonLatToWorld(lon, lat, 0);
    return groundAt(x / TILE, y / TILE);
  },
  get lift() {
    return art.lift;
  },
  setPlan(on) {
    mode3d = !on;
  },
  isPlan: () => !mode3d,
  setNight(v, l) {
    nightTarget = v;
    lamps = l;
    if (paused && v === 0) {
      // the map is frozen under a sheet: no time to fade, day comes back at once
      night = 0;
      document.body.classList.remove('night');
    }
  },
  flyToLonLat(lon, lat) {
    const [x, y] = lonLatToWorld(lon, lat, 0);
    setTarget({ id: -1, name: '', ele: NaN, lon, lat, iso: 0, mx: x / TILE, my: y / TILE });
  },
});
let nightTarget = 0;
let night = 0;
let lamps: Lamp[] = [];
const lampBuf = new Float32Array(MAX_LAMPS * 4);
const game = new Game(peaks, {
  flyTo,
  setPaused(v) {
    paused = v;
    if (v) {
      setTarget(null);
      if (nightTarget === 0) {
        night = 0;
        document.body.classList.remove('night');
      }
      music.setSteering({ altitude: fl.alt, speed: 0, vario: 0, bank: 0 });
    } else {
      labels.refresh();
      canvas.focus?.();
    }
  },
  setMood: (m) => music.setTheme(m),
  puzzleAudio: () => (soundOn ? music.puzzleAudio() : null),
  refresh: () => labels.refresh(),
}, world);
const toolbox = new Toolbox(document.getElementById('toolbox')!, {
  notes: game.notes,
  world,
  game,
  audio() {
    const a = soundOn ? music.puzzleAudio() : null;
    const tap = a ? music.tap() : null;
    return a && tap ? { ...a, tap: () => tap, direct: a.ctx.destination, hush: (on: boolean) => music.hush(on) } : null;
  },
});
void toolbox;
if (DEBUG) Object.assign(window, { __pa: { world, game, fl, toolbox } });
labels.markOf = (p) => game.mark(p);
labels.priority = () => game.stars();
const trail = new Trail(document.getElementById('trail') as unknown as SVGSVGElement);
notebookBtn.addEventListener('click', () => game.openNotebook());

/** Terrain metres at a Mercator point, from the coarse level (NaN if not loaded). */
function groundAt(mx: number, my: number): number {
  const z = dz > 0 ? dz - FAR_DROP : 9;
  const ws = TILE * Math.pow(2, z);
  return store.sample(z, mx * ws, my * ws);
}

/** Highest ground along the way to (te, tn), looking ~5 s ahead (at least 3 km). */
function terrainAhead(te: number, tn: number, speed: number): number {
  const d = Math.hypot(te, tn);
  const reach = Math.min(d, Math.max(3000, speed * 5));
  let hi = -Infinity;
  for (let i = 1; i <= 8; i++) {
    const t = (reach * i) / 8 / Math.max(1, d);
    const [mx, my] = localToMerc(fl, te * t, tn * t);
    const h = groundAt(mx, my);
    if (!Number.isNaN(h)) hi = Math.max(hi, h);
  }
  return Number.isFinite(hi) ? hi : -Infinity;
}

// ------------------------------------------------------------------ loop ---
let last = performance.now();
const t0 = last;
let lastHash = 0;
let view: View | null = null;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (paused) {
    // a sheet covers the map: keep the last frame, spend nothing
    requestAnimationFrame(frame);
    return;
  }
  const time = (now - t0) / 1000;
  const w = renderer.cssW;
  const h = renderer.cssH;

  // ---- terrain under the flyer ----
  if (dz > 0) {
    const ws = TILE * Math.pow(2, dz);
    const g = store.sample(dz, fl.mx * ws, fl.my * ws);
    if (!Number.isNaN(g)) ground = Number.isNaN(ground) ? g : ground + (g - ground) * (1 - Math.exp(-dt * 10));
  }
  const gnd = Number.isNaN(ground) ? 1500 : ground;
  // regional ground: follows the landscape over tens of seconds, not every ridge
  if (!Number.isNaN(ground)) slowGround = Number.isNaN(slowGround) ? ground : slowGround + (ground - slowGround) * (1 - Math.exp(-dt / 25));
  const agl = Math.max(MIN_AGL * 0.5, fl.alt - gnd);

  // ---- controls ----
  moveStick.tick(dt);
  altStick.tick(dt);
  // left: throttle + yaw (rudder) · right: pitch + roll, aircraft style
  let throttle = clamp1(-moveStick.value.y + input.forward());
  const rudder = clamp1(moveStick.value.x + input.turn());
  let rollIn = clamp1(altStick.value.x + input.roll());
  let pitchIn = clamp1(altStick.value.y + input.pitch()); // stick back (down) = nose up

  // horizontal speed scales with height above ground: same screen feel at any altitude
  const maxSpeed = Math.max(60, agl * 0.9 + 250);

  // autopilot holds the sticks until the pilot touches anything
  if (target) {
    const manual = Math.max(Math.abs(throttle), Math.abs(rudder), Math.abs(rollIn), Math.abs(pitchIn));
    if (manual > 0.05 || input.dragX || input.dragY || input.zoomDelta) setTarget(null);
  }
  if (target) {
    const [te, tn] = mercToLocal(fl, target.mx, target.my);
    const tEle = Number.isNaN(target.ele) ? groundAt(target.mx, target.my) : target.ele;
    const cmd = autopilot({
      e: te,
      n: tn,
      yaw: fl.yaw,
      alt: fl.alt,
      targetEle: Number.isNaN(tEle) ? gnd : tEle,
      terrainAhead: terrainAhead(te, tn, maxSpeed * Math.max(0, airspeed)),
      airspeed,
      maxSpeed,
    });
    throttle = cmd.throttle;
    rollIn = cmd.roll;
    pitchIn = cmd.pitch;
    if (cmd.arrived) {
      const then = arrive;
      setTarget(null);
      then?.();
    }
  }
  const sy = Math.sin(fl.yaw);
  const cy = Math.cos(fl.yaw);
  // airspeed as a fraction of maxSpeed; reverse is a slow back-off
  const speedTarget = throttle >= 0 ? throttle : throttle * 0.4;
  airspeed += (speedTarget - airspeed) * (1 - Math.exp(-dt * (Math.abs(throttle) > 0.01 ? 1.4 : 0.8)));

  // bank and pitch ease towards the stick and level out when released
  bank += (rollIn * MAX_BANK - bank) * (1 - Math.exp(-dt * 3));
  pitch += (pitchIn * MAX_PITCH - pitch) * (1 - Math.exp(-dt * 2.5));

  vel.e = sy * airspeed * maxSpeed;
  vel.n = cy * airspeed * maxSpeed;

  // drag (mouse / single touch outside the stick zones): pan the ground
  if (input.dragX || input.dragY) {
    const mPerPx = view ? (2 * view.focusDist * Math.tan(24 * DEG)) / h : agl / 500;
    const dx = -input.dragX * mPerPx;
    const dy = input.dragY * mPerPx;
    input.dragX = input.dragY = 0;
    moveLocal(dx * cy + dy * sy, -dx * sy + dy * cy);
    vel = { e: 0, n: 0 };
    airspeed = 0;
  }
  moveLocal(vel.e * dt, vel.n * dt);

  // rudder yaws directly; banking makes a coordinated turn
  const turnRate = rudder * 0.75 + Math.sin(bank) * 1.6;
  yawRate += (turnRate - yawRate) * (1 - Math.exp(-dt * 4));
  if (northReset && (Math.abs(rudder) > 0.05 || Math.abs(rollIn) > 0.05)) northReset = false;
  if (northReset) {
    // short way round, eased
    fl.yaw = wrapAngle(fl.yaw * Math.exp(-dt * 3.5));
    yawRate = 0;
    if (Math.abs(fl.yaw) < 0.002) {
      fl.yaw = 0;
      northReset = false;
    }
  } else fl.yaw = wrapAngle(fl.yaw + yawRate * dt);

  // pitch trades airspeed for climb; a small direct term still works when hovering
  const climbMax = Math.min(700, Math.max(180, agl * 0.3));
  const climbTarget = Math.max(-climbMax, Math.min(climbMax, Math.sin(pitch) * airspeed * maxSpeed + pitchIn * 0.25 * climbMax));
  climb += (climbTarget - climb) * (1 - Math.exp(-dt * 3));
  fl.alt += climb * dt;
  if (input.zoomDelta) {
    // wheel / pinch: multiplicative height above ground
    const target = Math.max(MIN_AGL, agl * Math.pow(2, -input.zoomDelta));
    fl.alt = gnd + target;
    input.zoomDelta = 0;
  }
  // soft floor: never crash, glide back up
  const floor = gnd + MIN_AGL;
  if (fl.alt < floor) fl.alt += (floor - fl.alt) * (1 - Math.exp(-dt * 6));
  fl.alt = Math.min(MAX_ALT, fl.alt);

  // tilt eases between top-down and the 3D angle
  const tiltTarget = mode3d ? art.tilt * DEG : 0;
  tiltNow += (tiltTarget - tiltNow) * (1 - Math.exp(-dt * 3));
  // the nose leads the view: pitch up looks towards the horizon, bank rolls it
  // (both faded out in top-down mode)
  const m3 = Math.max(0, Math.min(1, tiltNow / (art.tilt * DEG || 1)));
  fl.tilt = Math.max(0, Math.min(86 * DEG, tiltNow + pitch * 0.5 * m3));
  fl.roll = bank * (0.3 + 0.7 * m3);
  ink += (inkTarget - ink) * (1 - Math.exp(-dt * 5));

  // ---- view ----
  const zSample = dz > 0 ? dz - FAR_DROP : 9;
  const wsS = TILE * Math.pow(2, zSample);
  const heightAt = (e: number, n: number) => {
    const [mx, my] = localToMerc(fl, e, n);
    return store.sample(zSample, mx * wsS, my * wsS);
  };
  view = makeView(fl, w, h, art.lift, heightAt, gnd);
  // The facet scale and data zoom must not follow the bumpy centre ray, or the
  // folds reshuffle as you fly. Derive them from the height above a slowly
  // smoothed ground on a flat-earth view instead.
  {
    const aglS = Math.max(MIN_AGL * 3, fl.alt - (Number.isNaN(slowGround) ? gnd : slowGround)) * art.lift;
    // base tilt, not the pitch-led one: nodding the nose must not rescale the folds
    const dFlat = aglS / Math.max(0.17, Math.cos(tiltNow));
    const mPerCss = (2 * dFlat * Math.tan(FOVY / 2)) / h;
    const ez = Math.log2((EARTH_CIRC * Math.cos(mercLat(fl.my))) / (TILE * mPerCss));
    // Latch: cruising over relief must not slowly drift the folds. The target
    // only moves once it differs by a clear margin (intentional climbs/dives),
    // then the fold scale eases there.
    const first = Number.isNaN(ezLatched) || Number.isNaN(slowGround);
    if (first || Math.abs(ez - ezLatched) > 0.3) ezLatched = ez;
    ezStable = first || Number.isNaN(ezStable) ? ezLatched : ezStable + (ezLatched - ezStable) * (1 - Math.exp(-dt * 1.5));
    view.ez = ezStable;
  }

  // centre the far ring between the flyer and the focus point
  const [fmx, fmy] = localToMerc(fl, view.focusE * 0.6, view.focusN * 0.6);
  const keep = new Set<string>();
  const req = (z: number, r: number[], base: number) => {
    const n = 1 << z;
    const cx = fmx * n - 0.5;
    const cyy = fmy * n - 0.5;
    for (let y = r[1]; y <= r[3]; y++)
      for (let x = r[0]; x <= r[2]; x++) {
        store.request(z, x, y, base + Math.hypot(x - cx, y - cyy));
        keep.add(tileKey(z, mod(x, n), y));
      }
  };

  // ---- data zoom: prefetch the new level, switch once it is on hand ----
  const wantDz = pickDataZoom(view.ez, dz, MIN_DZ, MAX_DZ);
  let switchNow = dz < 0;
  if (dz >= 0 && wantDz !== dz) {
    if (pendingDz !== wantDz) {
      pendingDz = wantDz;
      pendingSince = now;
    }
    const pn = Renderer.range(fl.mx, fl.my, wantDz, NEAR_K);
    const pfr = Renderer.range(fmx, fmy, wantDz - FAR_DROP, FAR_K);
    req(wantDz - FAR_DROP, pfr, 0.5);
    req(wantDz, pn, 1.5);
    // ready when the far ring and the inner 5x5 of the near ring are cached
    const c = (pn[0] + pn[2]) / 2;
    const r = (pn[1] + pn[3]) / 2;
    const ready = allCached(wantDz - FAR_DROP, pfr) && allCached(wantDz, [Math.ceil(c - 2), Math.ceil(r - 2), Math.floor(c + 2), Math.floor(r + 2)]);
    switchNow = ready || now - pendingSince > 6000;
  } else pendingDz = -1;
  if (switchNow && wantDz !== dz) {
    dz = wantDz;
    pendingDz = -1;
    renderer.near.configure(NEAR_K, NEAR_K, dz);
    renderer.far.configure(FAR_K, FAR_K, dz - FAR_DROP);
    fullRefill = true;
  }

  const nearR = Renderer.range(fl.mx, fl.my, dz, NEAR_K);
  const farR = Renderer.range(fmx, fmy, dz - FAR_DROP, FAR_K);
  const fz = dz - FAR_DROP;
  const fbz = Math.max(0, dz - 6);
  const fbR = Renderer.range(fmx, fmy, fbz, 2);
  req(fbz, fbR, -10); // tiny coarse fallback first
  req(fz, farR, 0);
  req(dz, nearR, 1);
  // minimap (same level as the far ring)
  const mapMetres = Math.max(6000, view.focusDist * 5);
  const [mz, mx0, my0, mx1, my1] = minimap.tiles(fl, dz, mapMetres);
  req(mz, [mx0, my0, mx1, my1], 2);
  store.retain(keep);
  store.pump();
  renderer.far.update(farR[0], farR[1], farR[2], farR[3], fullRefill ? Infinity : 2, dt);
  renderer.near.update(nearR[0], nearR[1], nearR[2], nearR[3], fullRefill ? Infinity : 3, dt);
  fullRefill = false;

  // ---- readouts ----
  shownAlt += (fl.alt - shownAlt) * (1 - Math.exp(-dt * 8));
  altEl.textContent = String(Math.round(shownAlt)).padStart(4, ' ');
  if (!Number.isNaN(ground)) gndEl.textContent = `GND ${Math.round(ground)}  AGL ${Math.round(fl.alt - ground)}`;
  const lat = mercLat(fl.my) / DEG;
  const lon = fl.mx * 360 - 180;
  coordEl.textContent = `${lat.toFixed(3)}°N  ${lon.toFixed(3)}°E  ${String(Math.round(((fl.yaw / DEG) % 360 + 360) % 360) % 360).padStart(3, '0')}°`;
  northEl.style.transform = `rotate(${-fl.yaw}rad)`;

  const speed = Math.hypot(vel.e, vel.n) / maxSpeed;
  music.setSteering({
    altitude: fl.alt - gnd + 600,
    speed: Math.min(1, speed),
    vario: climb / climbMax, // a sonic variometer: pings up, growl down
    bank: bank / MAX_BANK,
  });

  // ---- draw ----
  const ready = renderer.far.complete(farR[0] + 2, farR[1] + 2, farR[0] + 2, farR[1] + 2);
  if (ready || fade > 0) fade = Math.min(1, fade + dt * 0.7);
  if (ready && !veil.classList.contains('ready')) {
    veil.classList.add('ready');
    veil.querySelector('.veil-sub')!.textContent = 'ready';
  }
  if (entered && fade > 0.05) veil.classList.add('gone');
  const sunAz = art.sunAz + 22 * Math.sin(time / 75);
  const fogAlt = Number.isNaN(minimap.lowAlt) ? -1000 : minimap.lowAlt + 220;
  night += (nightTarget - night) * (1 - Math.exp(-dt * 0.8));
  let nl = 0;
  for (const l of lamps) {
    if (nl >= MAX_LAMPS) break;
    const [lx, ly] = lonLatToWorld(l.lon, l.lat, 0);
    const [le, ln] = mercToLocal(fl, lx / TILE, ly / TILE);
    lampBuf.set([le, ln, l.radius, l.power], nl++ * 4);
  }
  renderer.draw(view, dz, { ...art, sunAz }, { time, fogAlt, fade: fade * fade * (3 - 2 * fade), ink, ground: gnd, night, lamps: lampBuf.subarray(0, nl * 4) });
  document.body.classList.toggle('night', night > 0.5);

  const solvedTrail = game.trail();
  minimap.trail = solvedTrail;
  minimap.draw(now, fl, dz, mapMetres, store, peaks);
  const v = view;
  const proj = (p: Peak) => {
    if (Number.isNaN(p.ele)) {
      // cities: read the elevation from the terrain once it is loaded, then keep it
      const g = groundAt(p.mx, p.my);
      if (Number.isNaN(g)) return null;
      p.ele = Math.round(g);
    }
    const [e, n] = mercToLocal(fl, p.mx, p.my);
    return project(v, e, n, p.ele);
  };
  labels.update(now, proj, w, h, places, v.far * 0.6);
  trail.update(proj, solvedTrail, w, h);
  world.update(w, h);

  // ---- adaptive resolution ----
  if (pinnedScale) slowFrames = fastFrames = 0;
  else if (dt > 0.024) slowFrames++;
  else slowFrames = Math.max(0, slowFrames - 1);
  if (dt < 0.0175) fastFrames++;
  else fastFrames = 0;
  if (slowFrames > 20 && renderScale > 0.5) {
    renderScale = Math.max(0.5, renderScale - 0.1);
    slowFrames = 0;
    resize();
  } else if (fastFrames > 240 && renderScale < maxScale) {
    renderScale = Math.min(maxScale, renderScale + 0.05);
    fastFrames = 0;
    resize();
  }

  if (now - lastHash > 800) {
    lastHash = now;
    const yawDeg = Math.round(((fl.yaw / DEG) % 360 + 360) % 360);
    history.replaceState(null, '', `#${Math.round(fl.alt)}/${lat.toFixed(4)}/${lon.toFixed(4)}/${yawDeg}`);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function allCached(z: number, r: number[]): boolean {
  const n = 1 << z;
  for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) if (!store.has(z, mod(x, n), y)) return false;
  return true;
}

function moveLocal(e: number, n: number): void {
  const k = EARTH_CIRC * Math.cos(mercLat(fl.my));
  fl.mx += e / k;
  fl.my -= n / k;
  const [x0, y0] = lonLatToWorld(BOUNDS.w, BOUNDS.n, 0);
  const [x1, y1] = lonLatToWorld(BOUNDS.e, BOUNDS.s, 0);
  fl.mx = Math.max(x0 / TILE, Math.min(x1 / TILE, fl.mx));
  fl.my = Math.max(y0 / TILE, Math.min(y1 / TILE, fl.my));
}

function startFlyer(): Flyer {
  const [x, y] = lonLatToWorld(START.lon, START.lat, 0);
  return { mx: x / TILE, my: y / TILE, alt: START.alt, yaw: START.yaw * DEG, tilt: 0 };
}

/** #alt/lat/lon[/yaw] */
function fromHash(): Flyer | null {
  const m = location.hash.match(/^#([\d.]+)\/([\d.-]+)\/([\d.-]+)(?:\/([\d.-]+))?/);
  if (!m) return null;
  const [x, y] = lonLatToWorld(+m[3], +m[2], 0);
  return { mx: x / TILE, my: y / TILE, alt: Math.min(MAX_ALT, +m[1]), yaw: (m[4] ? +m[4] : 0) * DEG, tilt: 0 };
}

function clamp1(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function load(k: string, d: string): string {
  try {
    return localStorage.getItem('paperalps.' + k) ?? d;
  } catch {
    return d;
  }
}

function save(k: string, v: string): void {
  try {
    localStorage.setItem('paperalps.' + k, v);
  } catch {
    /* private mode: ignore */
  }
}

import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './style.css';
import { TileStore } from './dem/tileStore';
import { TILE, lonLatToWorld, tileKey, mod, EARTH_CIRC } from './geo/mercator';
import { Renderer, DEFAULT_ART, NEAR_K, FAR_K, FAR_DROP, type Art } from './render/renderer';
import { pickDataZoom } from './render/view';
import { makeView, project, mercToLocal, localToMerc, mercLat, FOVY, type Flyer, type View } from './render/camera';
import { Stick } from './ui/joystick';
import { Input } from './ui/input';
import { Minimap } from './ui/minimap';
import { Labels } from './ui/labels';
import { preparePeaks, type RawPeak, type Peak } from './ui/peaks';
import { Ambient } from './audio/ambient';
import { debugPanel } from './ui/debug';
import rawPeaks from './data/peaks.json';

const MIN_DZ = 8;
const MAX_DZ = 14;
const MIN_AGL = 120;
const MAX_ALT = 9000;
const BOUNDS = { w: 4.5, e: 17.0, s: 43.4, n: 48.4 };
const DEG = Math.PI / 180;
// North-east of Zermatt, looking south-west at the Matterhorn
const START = { lat: 46.035, lon: 7.79, alt: 5200, yaw: 232 };

// ---------------------------------------------------------------- setup ---
const canvas = document.getElementById('terrain') as HTMLCanvasElement;
const hud = document.getElementById('hud')!;
const altEl = document.getElementById('alt-value')!;
const gndEl = document.getElementById('gnd')!;
const coordEl = document.getElementById('coord')!;
const northEl = document.querySelector('.north svg') as SVGElement;
const musicBtn = document.getElementById('music') as HTMLButtonElement;
const viewBtn = document.getElementById('view3d') as HTMLButtonElement;
const inkBtn = document.getElementById('inkmode') as HTMLButtonElement;
const veil = document.getElementById('veil')!;

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
// left: forward/back + turn · right: climb/descend + strafe
const moveStick = new Stick(hud, 'left', 'Forward, back and turn', coarse ? zoneL : undefined);
const altStick = new Stick(hud, 'right', 'Climb, descend and strafe', coarse ? zoneR : undefined);
const input = new Input(canvas);
const minimap = new Minimap(document.getElementById('mapbox')!);
const peaks = preparePeaks(rawPeaks as RawPeak[]);
const labels = new Labels(document.getElementById('labels')!);
const music = new Ambient();
const art: Art = { ...DEFAULT_ART };
if (new URLSearchParams(location.search).has('debug')) debugPanel(document.body, art);

const fl: Flyer = fromHash() ?? startFlyer();
let mode3d = load('mode3d', '1') === '1';
let inkTarget = load('ink', '0') === '1' ? 1 : 0;
let ink = inkTarget;
let tiltNow = mode3d ? art.tilt * DEG : 0;
let dz = -1;
let vel = { e: 0, n: 0 }; // m/s
let climb = 0; // m/s
let yawRate = 0;
let ground = NaN;
let slowGround = NaN; // heavily smoothed ground: drives the facet scale
let ezStable = NaN;
let ezLatched = NaN; // fold scale target, only moves past a hysteresis margin
let pendingDz = -1; // data zoom being prefetched before a switch
let pendingSince = 0;
let shownAlt = fl.alt;
let fade = 0;
let fullRefill = true;
let renderScale = Math.min(window.devicePixelRatio || 1, 1.25);
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

musicBtn.addEventListener('click', async () => {
  musicBtn.disabled = true;
  const on = await music.toggle();
  musicBtn.disabled = false;
  syncButtons(on);
});
viewBtn.addEventListener('click', () => {
  mode3d = !mode3d;
  save('mode3d', mode3d ? '1' : '0');
  syncButtons();
});
inkBtn.addEventListener('click', () => {
  inkTarget = inkTarget ? 0 : 1;
  save('ink', String(inkTarget));
  syncButtons();
});
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'm') musicBtn.click();
  if (e.key === 't') viewBtn.click();
  if (e.key === 'i') inkBtn.click();
});

function syncButtons(musicOn = music.playing): void {
  musicBtn.classList.toggle('on', musicOn);
  musicBtn.setAttribute('aria-pressed', String(musicOn));
  musicBtn.setAttribute('aria-label', musicOn ? 'Pause music' : 'Play music');
  viewBtn.textContent = mode3d ? '3D' : '2D';
  viewBtn.setAttribute('aria-label', mode3d ? 'Switch to top-down view' : 'Switch to tilted view');
  inkBtn.setAttribute('aria-label', inkTarget ? 'Switch to white paper' : 'Switch to black paper');
  document.body.classList.toggle('ink', inkTarget === 1);
}

// ------------------------------------------------------------------ loop ---
let last = performance.now();
const t0 = last;
let lastHash = 0;
let view: View | null = null;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
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
  const fwd = clamp1(-moveStick.value.y + input.forward());
  const turn = clamp1(moveStick.value.x + input.turn());
  const mvx = clamp1(altStick.value.x + input.strafe()); // lateral
  const mvy = -fwd; // screen-down convention for the velocity maths below
  const lift = clamp1(-altStick.value.y + input.climb());

  // horizontal speed scales with height above ground: same screen feel at any altitude
  const maxSpeed = Math.max(60, agl * 0.9 + 250);
  const sy = Math.sin(fl.yaw);
  const cy = Math.cos(fl.yaw);
  const te = (mvx * cy + -mvy * sy) * maxSpeed;
  const tn = (-mvx * sy + -mvy * cy) * maxSpeed;
  const kMove = 1 - Math.exp(-dt * (Math.hypot(mvx, mvy) > 0.01 ? 2.4 : 1.5));
  vel.e += (te - vel.e) * kMove;
  vel.n += (tn - vel.n) * kMove;

  // drag (mouse / single touch outside the stick zones): pan the ground
  if (input.dragX || input.dragY) {
    const mPerPx = view ? (2 * view.focusDist * Math.tan(24 * DEG)) / h : agl / 500;
    const dx = -input.dragX * mPerPx;
    const dy = input.dragY * mPerPx;
    input.dragX = input.dragY = 0;
    moveLocal(dx * cy + dy * sy, -dx * sy + dy * cy);
    vel = { e: 0, n: 0 };
  }
  moveLocal(vel.e * dt, vel.n * dt);

  yawRate += (turn * 1.1 - yawRate) * (1 - Math.exp(-dt * 4));
  fl.yaw = wrapAngle(fl.yaw + yawRate * dt);

  const climbMax = Math.min(700, Math.max(180, agl * 0.3));
  climb += (lift * climbMax - climb) * (1 - Math.exp(-dt * 3));
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
  fl.tilt = tiltNow;
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
    const dFlat = aglS / Math.max(0.17, Math.cos(fl.tilt));
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
  coordEl.textContent = `${lat.toFixed(3)}°N  ${lon.toFixed(3)}°E  ${String(Math.round(((fl.yaw / DEG) % 360 + 360) % 360)).padStart(3, '0')}°`;
  northEl.style.transform = `rotate(${-fl.yaw}rad)`;

  const speed = Math.hypot(vel.e, vel.n) / maxSpeed;
  music.setSteering({ altitude: fl.alt - gnd + 600, speed: Math.min(1, speed) });

  // ---- draw ----
  const ready = renderer.far.complete(farR[0] + 2, farR[1] + 2, farR[0] + 2, farR[1] + 2);
  if (ready || fade > 0) fade = Math.min(1, fade + dt * 0.7);
  if (fade > 0.05) veil.classList.add('gone');
  const sunAz = art.sunAz + 22 * Math.sin(time / 75);
  const fogAlt = Number.isNaN(minimap.lowAlt) ? -1000 : minimap.lowAlt + 220;
  renderer.draw(view, dz, { ...art, sunAz }, { time, fogAlt, fade: fade * fade * (3 - 2 * fade), ink, ground: gnd });

  minimap.draw(now, fl, dz, mapMetres, store, peaks);
  const v = view;
  const proj = (p: Peak) => {
    const [e, n] = mercToLocal(fl, p.mx, p.my);
    return project(v, e, n, p.ele);
  };
  labels.update(now, proj, w, h, peaks, v.far * 0.6);

  // ---- adaptive resolution ----
  if (dt > 0.024) slowFrames++;
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

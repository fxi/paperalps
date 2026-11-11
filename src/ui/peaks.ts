/** A labelled place: a summit, or a city (kind 'city'). */
export interface Peak {
  id: number;
  name: string;
  ele: number; // metres; NaN for a city until read from the terrain
  lon: number;
  lat: number;
  iso: number; // km to nearest higher peak; for cities, derived from population
  mx: number;
  my: number;
  kind?: 'city';
  pop?: number;
}

export type RawPeak = [name: string, lat: number, lon: number, ele: number, iso: number];
export type RawCity = [name: string, lat: number, lon: number, pop: number];

/** City ids start here so they never collide with peak ids. */
export const CITY_ID0 = 100000;

function merc(lon: number, lat: number): [number, number] {
  const latR = (lat * Math.PI) / 180;
  return [(lon + 180) / 360, (1 - Math.asinh(Math.tan(latR)) / Math.PI) / 2];
}

/**
 * Cities reuse the peak declutter: `iso` sets how far away they may still be
 * labelled (iso >= 0.05 km per km of distance), so a 30k town shows within
 * ~15 km and Milano within ~100 km.
 */
export function prepareCities(raw: RawCity[]): Peak[] {
  return raw.map(([name, lat, lon, pop], i) => {
    const [mx, my] = merc(lon, lat);
    return { id: CITY_ID0 + i, name, ele: NaN, lon, lat, iso: 0.75 * Math.sqrt(pop / 30000), mx, my, kind: 'city' as const, pop };
  });
}

/** Label priority, highest first (peaks: height and isolation; cities: population). */
export function placeScore(p: Peak): number {
  if (p.kind === 'city') return 4 + Math.log2((p.pop ?? 30000) / 30000) * 1.2;
  return p.ele / 1000 + Math.log2(1 + p.iso) * 0.9;
}

/** Peaks and cities in one priority list for the declutter. */
export function mergePlaces(peaks: Peak[], cities: Peak[]): Peak[] {
  return [...peaks, ...cities].sort((a, b) => placeScore(b) - placeScore(a));
}

export function preparePeaks(raw: RawPeak[]): Peak[] {
  return raw.map(([name, lat, lon, ele, iso], id) => {
    const [mx, my] = merc(lon, lat);
    return { id, name, ele, lon, lat, iso, mx, my };
  });
}

/** Screen projection: [x, y, distance in metres] in CSS px, or null if not visible. */
export type Projector = (p: Peak) => [number, number, number] | null;

export interface PlacedPeak {
  peak: Peak;
  x: number;
  y: number;
  dist: number;
}

/** Short display name: first variant of bilingual names, upper-cased. */
export function displayName(name: string): string {
  return name.split(/\s+[/-]\s+|\s*\/\s*/)[0].toUpperCase();
}

export interface PlaceOptions {
  charW?: number;
  lineH?: number;
  pad?: number;
  /** A peak must be isolated by at least this many km per km of distance. */
  isoPerKm?: number;
  /** Absolute minimum isolation (km). */
  minIsoKm?: number;
  maxDist?: number; // metres
  avoid?: [number, number, number, number][];
  /** Placed first whenever on screen, ignoring significance and distance. */
  pinned?: Peak;
  /** Placed right after `pinned`, without the significance test and with twice the reach. */
  priority?: Peak[];
}

/**
 * Greedy declutter in priority order (input order): keep peaks that project
 * into the viewport, are significant enough for their distance, and whose
 * label box doesn't overlap an accepted one or a HUD element.
 */
export function placePeaks(peaks: Peak[], project: Projector, w: number, h: number, budget: number, opts: PlaceOptions = {}): PlacedPeak[] {
  const charW = opts.charW ?? 7.4;
  const lineH = opts.lineH ?? 30;
  const pad = opts.pad ?? 10;
  const isoPerKm = opts.isoPerKm ?? 0.05;
  const minIso = opts.minIsoKm ?? 0;
  const maxDist = opts.maxDist ?? Infinity;

  const boxes: [number, number, number, number][] = [...(opts.avoid ?? [])];
  const out: PlacedPeak[] = [];
  const pinned = opts.pinned;
  const priority = new Set(opts.priority ?? []);
  const tried = new Set<Peak>();
  // pinned first (no limits), then priority places (no significance test, twice
  // the reach), then everything else in input order
  const order = [...(pinned ? [pinned] : []), ...priority, ...peaks];
  for (const p of order) {
    if (out.length >= budget) break;
    if (tried.has(p)) continue;
    tried.add(p);
    const pin = p === pinned;
    const prio = !pin && priority.has(p);
    if (!pin && !prio && p.iso < minIso) continue;
    const s = project(p);
    if (!s) continue;
    const [x, y, dist] = s;
    if (!pin && dist > maxDist * (prio ? 2 : 1)) continue;
    if (!pin && !prio && p.iso < (dist / 1000) * isoPerKm) continue;
    if (x < 24 || y < 24 || x > w - 24 || y > h - 24) continue;
    const bw = displayName(p.name).length * charW + 16;
    const box: [number, number, number, number] = [x - bw / 2 - pad, y - lineH - pad, x + bw / 2 + pad, y + 14 + pad];
    let hit = false;
    for (const b of boxes) {
      if (box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]) {
        hit = true;
        break;
      }
    }
    if (hit) continue;
    boxes.push(box);
    out.push({ peak: p, x, y, dist });
  }
  return out;
}

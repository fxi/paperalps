export interface Peak {
  id: number;
  name: string;
  ele: number;
  lon: number;
  lat: number;
  iso: number; // km to nearest higher peak
  mx: number;
  my: number;
}

export type RawPeak = [name: string, lat: number, lon: number, ele: number, iso: number];

export function preparePeaks(raw: RawPeak[]): Peak[] {
  return raw.map(([name, lat, lon, ele, iso], id) => {
    const latR = (lat * Math.PI) / 180;
    return {
      id,
      name,
      ele,
      lon,
      lat,
      iso,
      mx: (lon + 180) / 360,
      my: (1 - Math.asinh(Math.tan(latR)) / Math.PI) / 2,
    };
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
  for (const p of peaks) {
    if (out.length >= budget) break;
    if (p.iso < minIso) continue;
    const s = project(p);
    if (!s) continue;
    const [x, y, dist] = s;
    if (dist > maxDist) continue;
    if (p.iso < (dist / 1000) * isoPerKm) continue;
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

/**
 * Riffelsee — pure part. A pose (where the camera stands, which way it
 * looks) is quantised on a fixed grid of 500 m cells and 10° headings; the
 * shutter submits the cell and its neighbours, so roughly ±1 km and ±15°
 * around the authored pose are accepted. No imports (sealed by a node script).
 */

const K_LON = Math.cos((46 * Math.PI) / 180) * 111320; // metres per degree of longitude (fixed, not the local one)
const K_LAT = 111320;
const CELL = 500;

export function cell(lat: number, lon: number, heading: number): [number, number, number] {
  const h = (((Math.round(heading / 10) % 36) + 36) % 36);
  return [Math.round((lon * K_LON) / CELL), Math.round((lat * K_LAT) / CELL), h];
}

export const key = (c: [number, number, number]) => `${c[0]},${c[1]},${c[2]}`;

export function candidates(lat: number, lon: number, heading: number): string[] {
  const [x, y, h] = cell(lat, lon, heading);
  const out: string[] = [];
  for (const dx of [0, -1, 1]) for (const dy of [0, -1, 1]) for (const dh of [0, -1, 1]) out.push(key([x + dx, y + dy, (h + dh + 36) % 36]));
  return out;
}

/** The authored pose: the north shore of the lake, facing the mountain. */
export const POSE = { lat: 45.984549, lon: 7.759018, heading: 260 }; // a cell centre, by the lake

export const answer = () => key(cell(POSE.lat, POSE.lon, POSE.heading));

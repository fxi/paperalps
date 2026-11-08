// One-off build script: fetch the larger towns and cities around the Alps from
// OpenStreetMap (Overpass) and write a compact list to src/data/cities.json.
// Elevation is not stored: the app reads it from the terrain at runtime.
// Data © OpenStreetMap contributors, ODbL.
import { writeFileSync, mkdirSync } from 'node:fs';

const BBOX = [43.4, 4.5, 48.4, 17.0]; // S, W, N, E — same as the app BOUNDS
const MIN_POP = 30000;
const MAX_CITIES = 400;

const query = `[out:json][timeout:180];
node["place"~"^(city|town)$"]["name"]["population"](${BBOX.join(',')});
out;`;

// public servers are often busy: try a mirror, back off and retry
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = SERVERS[attempt % SERVERS.length];
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'paperalps-cities/0.1' },
      body: 'data=' + encodeURIComponent(query),
    }).catch((e) => ({ ok: false, status: String(e) }));
    if (res.ok) return res.json();
    const wait = 2000 * 2 ** attempt;
    console.warn(`${url}: ${res.status}, retrying in ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error('Overpass unavailable');
}
const { elements } = await overpass();

const byName = new Map();
for (const e of elements) {
  const pop = parseInt(String(e.tags.population).replace(/[\s.,']/g, ''), 10);
  if (!Number.isFinite(pop) || pop < MIN_POP) continue;
  const name = e.tags['name'];
  if (!name || name.length > 32) continue;
  // the same city mapped twice: keep the larger figure
  const prev = byName.get(name);
  if (prev && prev.pop >= pop) continue;
  byName.set(name, { name, lat: e.lat, lon: e.lon, pop });
}
const cities = [...byName.values()].sort((a, b) => b.pop - a.pop).slice(0, MAX_CITIES);
const out = cities.map((c) => [c.name, +c.lat.toFixed(5), +c.lon.toFixed(5), c.pop]);

mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/data/cities.json', import.meta.url), JSON.stringify(out));
console.log(`wrote ${out.length} cities (from ${elements.length} raw)`);

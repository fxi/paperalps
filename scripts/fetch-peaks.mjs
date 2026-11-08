// One-off build script: fetch named Alpine peaks from OpenStreetMap (Overpass)
// and write a compact, prioritised list to src/data/peaks.json.
// Data © OpenStreetMap contributors, ODbL.
import { writeFileSync, mkdirSync } from 'node:fs';

const BBOX = [43.6, 5.0, 48.4, 16.8]; // S, W, N, E — the Alpine arc
const MIN_ELE = 2000;
const MAX_PEAKS = 2500;

const query = `[out:json][timeout:180];
node["natural"="peak"]["name"]["ele"](${BBOX.join(',')});
out;`;

const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'paperalps-peaks/0.1' },
  body: 'data=' + encodeURIComponent(query),
});
if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
const { elements } = await res.json();

const peaks = [];
for (const e of elements) {
  const ele = parseFloat(String(e.tags.ele).replace(',', '.'));
  if (!Number.isFinite(ele) || ele < MIN_ELE || ele > 4810) continue;
  const name = e.tags['name'];
  if (!name || name.length > 40) continue;
  peaks.push({ name, lat: e.lat, lon: e.lon, ele: Math.round(ele) });
}

// Isolation-ish score: distance (km) to the nearest higher peak. Higher peaks with
// bigger isolation get shown first when decluttering at low zoom.
const R = 6371;
const rad = Math.PI / 180;
function dist(a, b) {
  const dlat = (b.lat - a.lat) * rad;
  const dlon = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  return R * Math.hypot(dlat, dlon);
}
peaks.sort((a, b) => b.ele - a.ele);
for (let i = 0; i < peaks.length; i++) {
  let iso = 300;
  for (let j = 0; j < i; j++) {
    const d = dist(peaks[i], peaks[j]);
    if (d < iso) iso = d;
  }
  peaks[i].iso = Math.round(iso * 100) / 100;
}
// Drop near-duplicates (same summit mapped twice) and very minor bumps.
const kept = peaks.filter((p) => p.iso > 0.25);
kept.sort((a, b) => score(b) - score(a));
function score(p) {
  return p.ele / 1000 + Math.log2(1 + p.iso) * 0.9;
}
const out = kept.slice(0, MAX_PEAKS).map((p) => [p.name, +p.lat.toFixed(5), +p.lon.toFixed(5), p.ele, p.iso]);

mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/data/peaks.json', import.meta.url), JSON.stringify(out));
console.log(`wrote ${out.length} peaks (from ${elements.length} raw)`);

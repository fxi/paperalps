import { describe, it, expect } from 'vitest';
import { preparePeaks, placePeaks, displayName, prepareCities, mergePlaces, CITY_ID0, type RawPeak, type RawCity, type Peak } from '../src/ui/peaks';
import rawCities from '../src/data/cities.json';
import { makeView, project, mercToLocal, type Flyer } from '../src/render/camera';
import raw from '../src/data/peaks.json';

const peaks = preparePeaks(raw as RawPeak[]);

function flyerAt(lon: number, lat: number, alt: number, yawDeg: number, tiltDeg: number): Flyer {
  const p = preparePeaks([['x', lat, lon, 0, 0]])[0];
  return { mx: p.mx, my: p.my, alt, yaw: (yawDeg * Math.PI) / 180, tilt: (tiltDeg * Math.PI) / 180 };
}

describe('peaks', () => {
  it('bundles a prioritised list starting with Mont Blanc', () => {
    expect(peaks.length).toBeGreaterThan(1000);
    expect(peaks[0].name).toMatch(/Mont Blanc/);
  });

  it('shortens bilingual names', () => {
    expect(displayName('Mont Blanc / Monte Bianco')).toBe('MONT BLANC');
    expect(displayName('Matterhorn - Monte Cervino')).toBe('MATTERHORN');
    expect(displayName('Piz Bernina')).toBe('PIZ BERNINA');
  });

  it('labels the Matterhorn ahead when flying in from Zermatt, without overlaps', () => {
    const fl = flyerAt(7.79, 46.035, 5200, 232, 62);
    const W = 1200, H = 800;
    const v = makeView(fl, W, H, 1.6, () => 1800, 1800);
    const proj = (p: Peak) => {
      const [e, n] = mercToLocal(fl, p.mx, p.my);
      return project(v, e, n, p.ele);
    };
    const out = placePeaks(peaks, proj, W, H, 12, { maxDist: v.far });
    expect(out.length).toBeGreaterThan(2);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out.some((p) => /Matterhorn/.test(p.peak.name))).toBe(true);
    for (const p of out) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(W);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(H);
    }
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++)
        expect(Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y)).toBeGreaterThan(20);
  });

  it('never labels peaks behind the camera', () => {
    const fl = flyerAt(7.79, 46.035, 5200, 52, 62); // facing away from the Matterhorn
    const v = makeView(fl, 1200, 800, 1.6, () => 1800, 1800);
    const proj = (p: Peak) => {
      const [e, n] = mercToLocal(fl, p.mx, p.my);
      return project(v, e, n, p.ele);
    };
    const out = placePeaks(peaks, proj, 1200, 800, 12, { maxDist: v.far });
    expect(out.some((p) => /Matterhorn/.test(p.peak.name))).toBe(false);
  });
});

describe('cities', () => {
  const cities = prepareCities(rawCities as RawCity[]);

  it('get ids apart from peaks, no elevation yet, reach scaled by population', () => {
    expect(cities.length).toBeGreaterThan(100);
    expect(cities.every((c) => c.id >= CITY_ID0 && c.kind === 'city' && Number.isNaN(c.ele))).toBe(true);
    const big = cities.find((c) => c.name === 'Milano')!;
    const small = cities[cities.length - 1];
    expect(big.iso).toBeGreaterThan(small.iso * 4);
  });

  it('merge with peaks in one priority list: big cities near the top', () => {
    const all = mergePlaces(peaks, cities);
    expect(all.length).toBe(peaks.length + cities.length);
    expect(all.findIndex((p) => p.name === 'Milano')).toBeLessThan(40);
    expect(all.findIndex((p) => p.name.startsWith('Mont Blanc'))).toBeLessThan(5);
  });
});

describe('pinned placement', () => {
  it('places the pinned place first, even when too far or minor, and only once', () => {
    const minor = peaks[peaks.length - 1];
    const proj = (p: Peak): [number, number, number] => (p === minor ? [600, 400, 1e6] : [600, 400, 1000]);
    const out = placePeaks(peaks, proj, 1200, 800, 5, { maxDist: 5000, pinned: minor });
    expect(out[0].peak).toBe(minor);
    expect(out.filter((p) => p.peak === minor).length).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { preparePeaks, placePeaks, displayName, type RawPeak, type Peak } from '../src/ui/peaks';
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

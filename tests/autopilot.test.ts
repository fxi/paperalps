import { describe, it, expect } from 'vitest';
import { autopilot, STANDOFF, ABOVE, type ApState } from '../src/ui/autopilot';

function state(o: Partial<ApState> = {}): ApState {
  return { e: 0, n: 20000, yaw: 0, alt: 3000, targetEle: 2400, terrainAhead: 1500, airspeed: 0, maxSpeed: 1000, ...o };
}

describe('autopilot', () => {
  it('flies straight at full throttle towards a target dead ahead', () => {
    const c = autopilot(state());
    expect(c.roll).toBeCloseTo(0);
    expect(c.throttle).toBe(1);
    expect(c.arrived).toBe(false);
  });

  it('banks towards a target on the right, and on the left', () => {
    expect(autopilot(state({ e: 10000, n: 0 })).roll).toBeGreaterThan(0.9);
    expect(autopilot(state({ e: -10000, n: 0 })).roll).toBeLessThan(-0.9);
    // behind and slightly right: still a right turn, the short way round
    expect(autopilot(state({ e: 100, n: -10000 })).roll).toBeGreaterThan(0.9);
  });

  it('turns before running: less throttle with a big heading error', () => {
    const ahead = autopilot(state()).throttle;
    const side = autopilot(state({ e: 20000, n: 0 })).throttle;
    expect(side).toBeLessThan(ahead * 0.6);
  });

  it('climbs over terrain in the way, descends to the final height near the end', () => {
    expect(autopilot(state({ terrainAhead: 4000 })).pitch).toBeGreaterThan(0.9);
    const near = autopilot(state({ n: STANDOFF, alt: 2400 + ABOVE + 1000 }));
    expect(near.pitch).toBeLessThan(-0.9);
  });

  it('brakes to the stand-off point and backs off if too close', () => {
    expect(autopilot(state({ n: STANDOFF + 200 })).throttle).toBeLessThan(0.15);
    expect(autopilot(state({ n: STANDOFF - 1500 })).throttle).toBeLessThan(0);
  });

  it('arrives when stopped at the stand-off point, facing the target, at height', () => {
    const c = autopilot(state({ n: STANDOFF, alt: 2400 + ABOVE, airspeed: 0.01 }));
    expect(c.arrived).toBe(true);
  });
});

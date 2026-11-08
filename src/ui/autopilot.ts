/**
 * Autopilot: flies to a picked peak or city by *holding the sticks*. It only
 * outputs throttle / roll / pitch in stick units, which go through the normal
 * flight model, so banking and coordinated turns look exactly like a pilot's.
 *
 * Guidance:
 *   roll     — heading error to the target bearing (bank into the turn)
 *   pitch    — altitude error; cruise above the target and above the terrain ahead
 *   throttle — speed proportional to the distance left to a stand-off point,
 *              so it brakes smoothly and stops facing the target (reverses a
 *              little if it overshoots or starts too close)
 */

export interface ApState {
  e: number; // target offset east, metres
  n: number; // target offset north, metres
  yaw: number; // radians, 0 = north, clockwise
  alt: number; // flyer altitude, metres
  targetEle: number; // target elevation, metres
  terrainAhead: number; // highest ground on the way, metres
  airspeed: number; // current fraction of maxSpeed (-0.4..1)
  maxSpeed: number; // m/s at full throttle, at the current height
}

export interface ApCmd {
  throttle: number; // -1..1
  roll: number; // -1..1, positive = bank right
  pitch: number; // -1..1, positive = nose up
  arrived: boolean;
}

/** Stop this far from the target: it sits in view, slightly below the horizon. */
export const STANDOFF = 3000;
/** Final height above the target. */
export const ABOVE = 600;
/** Keep at least this much above the terrain ahead. */
export const CLEARANCE = 450;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function autopilot(s: ApState): ApCmd {
  const dist = Math.hypot(s.e, s.n);
  const bearing = Math.atan2(s.e, s.n);
  const err = wrap(bearing - s.yaw);

  const roll = clamp(err * 1.8, -1, 1);

  // cruise higher on long legs, settle to the final height near the end
  const cruise = s.targetEle + ABOVE + clamp((dist - STANDOFF) * 0.06, 0, 1500);
  const want = Math.max(cruise, s.terrainAhead + CLEARANCE);
  const altErr = want - s.alt;
  const pitch = clamp(altErr / 500, -1, 1);

  // aim for a speed that closes the remaining gap in ~2 s, and turn before running
  let throttle = clamp((0.5 * (dist - STANDOFF)) / Math.max(1, s.maxSpeed), -0.4, 1);
  throttle *= 1 - 0.6 * Math.min(1, Math.abs(err) / 1.2);

  const arrived = Math.abs(dist - STANDOFF) < 300 && Math.abs(s.airspeed) < 0.04 && Math.abs(err) < 0.06 && Math.abs(altErr) < 120;
  return { throttle, roll, pitch, arrived };
}

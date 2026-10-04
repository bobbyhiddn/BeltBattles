// races: METRONOME mechanics (docs/RACES.md §3). Its belts are speed-locked at 1x, so ride
// time is exactly 0.4 x tiles + 0.2 s and the route length sets the beat. Pendulum damage
// follows a curve that peaks at 4.2 s of ride; ESCAPEMENT and LONGCASE move the peak.
// deck.ts imports this file, so it takes only TYPES from deck.ts and battle.ts.

import type { AmmoDef, HeroId } from "../content";
import type { Build } from "../deck";
import { ADAPTABLE_HEAD, PEAK_SHIFT, PENDULUM, heroRules, type AdaptableHead } from "./data";
import { roundHalfUp } from "../pct"; // NUM-1 (REQ-BFG-047)

/** Does this hero's every belt ignore speed states (its own speed gates and enemy Drag)? */
export function speedLocked(hero: HeroId): boolean {
  return heroRules(hero).speedLock;
}

/** Sweet-spot shift (s) from turret `turret`'s module: ESCAPEMENT -1.2, LONGCASE +1.2, else 0. */
export function pendulumShift(b: Build, turret: number): number {
  let shift = 0;
  for (const m of b.mods) if (m.turret === turret) shift += PEAK_SHIFT[m.def] ?? 0;
  return shift;
}

/** Damage of a ride-curve payload: curve(ride - shift) x split mult + flat, at least 1. */
export function curveDamage(ammo: AmmoDef, ride: number, mult: number, flat: number, shift = 0): number {
  const core = ammo.rideCurve ? ammo.rideCurve(ride - shift) : ammo.base + ammo.rideScale * ride;
  return Math.max(10, roundHalfUp(core * mult + flat)); // NUM-1: whole when fired, rounded half up once; at least 10 (x10)
}

/** Ride time (s) at which turret `turret` deals its peak pendulum damage. */
export function peakRide(b: Build, turret: number): number {
  return PENDULUM.peak + pendulumShift(b, turret);
}

/** Head art for an adaptable turret (display only): HAMMER, REPEATER (ESCAPEMENT), LANCE (LONGCASE). */
export function adaptableHead(b: Build, turret: number): AdaptableHead {
  for (const m of b.mods) {
    if (m.turret === turret && ADAPTABLE_HEAD[m.def]) return ADAPTABLE_HEAD[m.def];
  }
  return "hammer";
}

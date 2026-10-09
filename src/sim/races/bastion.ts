// races: BASTION mechanics (docs/RACES.md §2). A bulwark slug that loads into the chamber
// plates the hull; plating absorbs impact damage and Burn before HP. The dark wind bypasses it.

import type { Payload } from "../battle";
import { roundHalfUp } from "../pct"; // NUM-1 (REQ-BFG-047)
import { sustDayScale } from "../hullScale"; // HULL-1d (REQ-BFG-079): S(day) on the bulwark slugs' plating

export const PLATE_PER_SLUG = 20; // plating per arriving bulwark slug (x its split multiplier)
export const PLATE_CAP = 240;

export interface PlateState {
  plate: number; // current plating
  gained: number; // plating added (after the cap)
  absorbed: number; // damage soaked
  peak: number;
  // HULL-1d (REQ-BFG-079): set only in a battle whose S(day) is above 1 (Battle.makeSide): every gain x S where it lands
  // (hullScale.ts sustDayScale, the remainder in sustRem) and the cap PLATE_CAP x S, so the pool holds what it soaks
  tenths?: number;
  cap?: number;
  sustRem?: number;
}

export function newPlateState(): PlateState {
  return { plate: 0, gained: 0, absorbed: 0, peak: 0 };
}

/** Plating a payload adds when it arrives at the chamber (0 for non-bulwark ammo). */
export function plateFor(p: Payload): number {
  return p.ammo === "bulwark" ? roundHalfUp(PLATE_PER_SLUG * p.mult) : 0; // NUM-1: x the split share, rounded half up once
}

/** Chamber arrival: add plating, respecting the cap. Returns the plating actually added. */
export function plateOnLoad(st: PlateState, p: Payload): number {
  const n = st.tenths ? sustDayScale(plateFor(p), st.tenths, st) : plateFor(p); // HULL-1d: S(day), where it lands
  const add = Math.min(n, (st.cap ?? PLATE_CAP) - st.plate);
  if (add <= 0) return 0;
  st.plate += add;
  st.gained += add;
  if (st.plate > st.peak) st.peak = st.plate;
  return add;
}

/** Soak damage with plating. Returns the damage that still reaches the hull. */
export function absorb(st: PlateState, dmg: number): number {
  if (st.plate <= 0 || dmg <= 0) return dmg;
  const a = Math.min(st.plate, dmg);
  st.plate -= a;
  st.absorbed += a;
  return dmg - a;
}

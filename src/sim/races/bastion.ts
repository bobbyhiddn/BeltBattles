// races: BASTION mechanics (docs/RACES.md §2). A bulwark slug that loads into the chamber
// plates the hull; plating absorbs impact damage and Burn before HP. The dark wind bypasses it.

import type { Payload } from "../battle";

export const PLATE_PER_SLUG = 2; // plating per arriving bulwark slug (x its split multiplier)
export const PLATE_CAP = 24;

export interface PlateState {
  plate: number; // current plating
  gained: number; // plating added (after the cap)
  absorbed: number; // damage soaked
  peak: number;
}

export function newPlateState(): PlateState {
  return { plate: 0, gained: 0, absorbed: 0, peak: 0 };
}

/** Plating a payload adds when it arrives at the chamber (0 for non-bulwark ammo). */
export function plateFor(p: Payload): number {
  return p.ammo === "bulwark" ? PLATE_PER_SLUG * p.mult : 0;
}

/** Chamber arrival: add plating, respecting the cap. Returns the plating actually added. */
export function plateOnLoad(st: PlateState, p: Payload): number {
  const add = Math.min(plateFor(p), PLATE_CAP - st.plate);
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

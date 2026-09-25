// 0.6.1c: the overclock doubling (ARSENAL.md §3.4, the OVERCLOCKER rule), a small shared helper so 0.6.2's rig
// version can reuse it. Today only ASSEMBLY LINE ★3 HOT START calls it (Battle.applyGate, for its own belts' gates
// during the first seconds), so it is inert unless a 3-star Assembly Line is on the deck. Pure: no RNG, no state.

import type { GateEffect } from "./content";

/**
 * §3.4: speed gates are skipped (they set a belt state, not a payload effect). Wave 2 adds TOLLBOOTH, SIFTER,
 * RIVETER and POWDER KEG to the skipped list when they exist.
 */
export function boostable(e: GateEffect): boolean {
  return e.speed === undefined;
}

const cache = new WeakMap<GateEffect, GateEffect>();

/**
 * The gate's numeric effect twice (§3.4): Burn, flat and per-prior-gate damage double; a SPLITTER makes one extra
 * copy (same share); Shock is a flag, so twice is once (its stall and jump are unchanged). A gate that isn't
 * boostable comes back unchanged. Cached per effect object, so the sim allocates nothing per payload.
 */
export function overclocked(e: GateEffect): GateEffect {
  if (!boostable(e)) return e;
  const hit = cache.get(e);
  if (hit) return hit;
  const o: GateEffect = { ...e };
  if (e.burn) o.burn = e.burn * 2;
  if (e.flat) o.flat = e.flat * 2;
  if (e.perPriorGate) o.perPriorGate = e.perPriorGate * 2;
  if (e.split) o.split = { copies: e.split.copies + 1, mult: e.split.mult };
  cache.set(e, o);
  return o;
}

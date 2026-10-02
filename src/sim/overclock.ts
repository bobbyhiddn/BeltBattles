// 0.6.1c: the overclock doubling (ARSENAL.md §3.4, the OVERCLOCKER rule), a small shared helper so 0.6.2's rig
// version can reuse it. Today only ASSEMBLY LINE ★3 HOT START calls it (Battle.applyGate, for its own belts' gates
// during the first seconds), so it is inert unless a 3-star Assembly Line is on the deck. Pure: no RNG, no state.

import type { GateEffect } from "./content";

/**
 * §3.4: speed gates are skipped (they set a belt state, not a payload effect). Wave 2 adds TOLLBOOTH, SIFTER,
 * RIVETER and POWDER KEG to the skipped list when they exist.
 */
export function boostable(e: GateEffect): boolean {
  return e.speed === undefined && !e.pulse && !e.toll && !e.sift && !e.repair && !e.keg && !e.overclockCooldown &&
    !!(e.burn || e.flat || e.perPriorGate || e.shock || e.split || e.poison || e.burnPerRide || e.quench ||
      e.staticTime || e.perStalled || e.fray || e.perTile || e.heat || e.sort ||
      // 0.8.0 P1, wave 3 (DESIGN-wave3.md 3.2): plating, the gauge, the pincer, the latch's damage and the breaker.
      // STOKER and BRACE FRAME act on no payload, so they stay unboostable.
      e.plate || e.gauge || e.pincer || e.latch || e.breaker);
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
  if (e.poison) o.poison = e.poison * 2;
  if (e.burnPerRide) o.burnPerRide = { ...e.burnPerRide, seconds: e.burnPerRide.seconds / 2 };
  if (e.quench) o.quench = { ...e.quench, flat: e.quench.flat * 2, perBurn: e.quench.perBurn * 2 }; // flat doubles; same stacks
  if (e.staticTime) o.staticTime = e.staticTime * 2;
  if (e.perStalled) o.perStalled = { ...e.perStalled, each: e.perStalled.each * 2 };
  if (e.fray) o.fray = e.fray * 2;
  if (e.perTile) o.perTile = { ...e.perTile, each: e.perTile.each * 2 };
  if (e.heat) o.heat = e.heat * 2;
  if (e.sort) o.sort = { ...e.sort, copies: e.sort.copies + 1 };
  // 0.8.0 P1, wave 3: plating, both gauge numbers, the pincer's flat and each, the latch's damage (its hold unchanged),
  // and both breaker numbers (it still takes 1 plating). SHIELD WALL's plated bonus is not on the design's list.
  if (e.plate) o.plate = e.plate * 2;
  if (e.gauge) o.gauge = { flat: e.gauge.flat * 2, matched: e.gauge.matched * 2 };
  if (e.pincer) o.pincer = { ...e.pincer, flat: e.pincer.flat * 2, each: e.pincer.each * 2 };
  if (e.latch) o.latch = { ...e.latch, flat: e.latch.flat * 2 };
  if (e.breaker) o.breaker = { flat: e.breaker.flat * 2, floor: e.breaker.floor * 2 };
  cache.set(e, o);
  return o;
}

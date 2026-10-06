// 0.6.1b: turret cores (ARSENAL.md §2; REQ-BFG-018). Every turret has one core socket. A bought core (a
// Build.mods entry whose def is kind "core") changes how that turret fires. A turret without one runs its
// hero's signature core, the identity routine: today's Battle.chambers and Battle.fire rules, so every deck
// without a bought core fights bit for bit as in 0.6.0 (tests/golden.identity.test.ts).
//
// This file is pure: no RNG and no battle state beyond the turret passed in. Battle draws every random
// number, and only a fitted core adds draws (§2.1 rule 8): SCATTER CHOKE aims each pellet anew, and
// HULLBREAKER skips the target draw.

import { HEROES, classFactor, rateMul, secPer, type CoreRoutine, type CoreSpec, type TurretDef } from "./content";
import { coreFor, turretSlots, type Build } from "./deck";
import { effectAt, starsOf } from "./stars";
import type { TurretState } from "./battle";
import { pct, roundHalfUp } from "./pct"; // NUM-1 (REQ-BFG-047): the integer pipeline's rounding

/** The identity routine: one payload per firing opportunity from a LIFO window, the turret's own numbers. */
export const IDENTITY_CORE: CoreSpec = { routine: "identity" };

/**
 * The absolute per-shot numbers (ARSENAL.md §2.1 rule 4): flat damage per queued payload, flat per volley
 * shell and added Burn stacks. They are multiplied by the turret's class factor k. Ratios (shares, x1.3),
 * counts (pellets, maxCount), cadence multipliers and times (windowTime, gap, burnTime) are not.
 */
export const CORE_ABSOLUTE = ["perQueued", "volleyFlat", "addBurn", "perSecond", "anvilFlat", "perPlate"] as const; // 0.8.0 P1: + ANVIL BREECH's
/** Stack counts among the absolute numbers: rounded half up, at least 1. */
export const CORE_STACKS: readonly string[] = ["addBurn"];

/**
 * A core spec with its absolute numbers x k (CORE_ABSOLUTE; CORE_STACKS round half up, at least 1). NUM-1 (REQ-BFG-047,
 * N1 2.1): the class factor is a whole %, round(100 x k) (k = clamp(fireInterval, 0.4, 1.2); NUM-2 makes it round(3000 /
 * SPEED)), and each scaled number rounds half up once, here at install, so the battle and the placed panel read one
 * NUM-2 (REQ-BFG-047, N1 2.1): k = classFactor = clamp(30 / speed, 0.4, 1.2), so the class % below is exactly
 * clamp(roundHalfUp(3000 / speed), 40, 120) (the clamp's bounds are whole; every x.5 case, speed 16 / 48 / 80, is exact)
 * integer. ANVIL's perPlate is a ratio of two damage-family numbers (damage per plating): it becomes a whole % of the
 * hull's plating (x 100, x the class %, rounded), kept as that % / 100; Battle.fireCore applies it with pct.
 */
export function scaleCore(spec: CoreSpec, k: number): CoreSpec {
  const out: CoreSpec = { ...spec };
  const kp = roundHalfUp(100 * k); // NUM-1: the class factor as a whole %; NUM-2: clamp(roundHalfUp(3000 / speed), 40, 120)
  for (const key of CORE_ABSOLUTE) {
    const v = spec[key];
    if (typeof v !== "number") continue;
    out[key] = CORE_STACKS.includes(key) ? Math.max(1, pct(v, kp))
      : key === "perPlate" ? roundHalfUp(v * kp) / 100
      : pct(v, kp);
  }
  return out;
}

/** A turret's resolved core (TurretState.core). */
export interface TurretCore {
  def: string; // the bought core's ITEMS id, or the hero's signature core id (SIGNATURE_CORES)
  bought: boolean;
  routine: CoreRoutine;
  stars: number;
  k: number; // the turret's classFactor
  spec: CoreSpec; // at its stars (effectAt), absolute numbers x k
}

/**
 * Turret t's core in build b: its bought core (coreFor) at its stars, scaled by k, or else the hero's signature
 * core running the identity routine. `td` defaults to the turret installed in slot t (0.6.2s: deck.ts turretSlots;
 * tests pass a stand-in). The signature core runs on any turret when no core is bought (S3).
 */
export function resolveCore(b: Build, t: number, td: TurretDef = slotDef(b, t)): TurretCore {
  const k = classFactor(td);
  const m = coreFor(b, t);
  const spec = m ? effectAt(m.def, starsOf(m)).core : undefined;
  if (!m || !spec) return { def: HEROES[b.hero].core ?? "", bought: false, routine: "identity", stars: 1, k, spec: IDENTITY_CORE };
  return { def: m.def, bought: true, routine: spec.routine, stars: starsOf(m), k, spec: scaleCore(spec, k) };
}

/** 0.6.2s: the TurretDef installed in slot t (the helper); an empty or unknown slot falls back to the hull's starting turret. */
function slotDef(b: Build, t: number): TurretDef {
  return turretSlots(b)[t]?.td ?? HEROES[b.hero].turrets[t] ?? HEROES[b.hero].turrets[0];
}

/**
 * A routine's chamber hooks (Battle.chambers). Each identity hook is today's rule, word for word; the shape
 * hook (what a fired payload becomes) and the impact rules live in Battle.fireCore and Battle.impact.
 */
export interface Routine {
  /** ready: the window is closed, so the turret moves from loading to firing. */
  ready(tu: TurretState): boolean;
  /** Loads fired per firing opportunity. */
  count(tu: TurretState): number;
  /** select: the index in tu.stack of the next load to fire (a jam's random pick stays Battle's). */
  select(tu: TurretState): number;
  /** cadence: the cooldown after a firing opportunity (GATLING SPOOL updates its spin here). */
  cadence(tu: TurretState, t: number): number;
  /** This turret never jams. */
  noJam(tu: TurretState): boolean;
}

const lifo = (tu: TurretState): number => tu.stack.length - 1;

const IDENTITY: Routine = {
  ready: (tu) => tu.stack.length >= tu.window || (tu.stack.length > 0 && tu.loadTimer >= tu.windowTime),
  count: (tu) => tu.perShot,
  select: lifo,
  cadence: (tu) => tu.interval,
  noJam: (tu) => tu.core.spec.noJam === true,
};

/** GATLING SPOOL: a shot within `gap` s of the last cuts the multiplier by `step`, down to `floor`; a longer gap
 *  halves the spin (the multiplier moves halfway back to `start`). The first shot uses `start`. */
function gatlingCadence(tu: TurretState, t: number): number {
  const c = tu.core.spec;
  // NUM-2 (REQ-BFG-047, N1 2.3): start and top are whole rate %s (-17; +67 / +150 / +245); the spin stays the interval
  // share between them (100 / (100 + rate)), stepping by `step`
  const start = 1 / rateMul(c.start);
  if (tu.lastShot >= 0) {
    if (t - tu.lastShot <= (c.gap ?? Infinity)) tu.spin = Math.max(c.top !== undefined ? 1 / rateMul(c.top) : start, tu.spin - (c.step ?? 0));
    else tu.spin = start - (start - tu.spin) / 2;
  }
  tu.lastShot = t;
  return spinInterval(tu);
}

/** NUM-2 (REQ-BFG-047): a GATLING's seconds per shot at its spin: 30 / its whole speed there (the turret's unrounded speed
 *  over the spin, rounded half up once). */
export function spinInterval(tu: Pick<TurretState, "speedRaw" | "spin">): number {
  return secPer(Math.max(1, roundHalfUp(tu.speedRaw / tu.spin)));
}

/** NUM-2 (REQ-BFG-047): STEAM BREECH's seconds per shot: 30 / its whole speed, the turret's unrounded speed x its plated
 *  (or bare) rate %, rounded half up once. */
export function steamInterval(tu: Pick<TurretState, "speedRaw" | "plated" | "core">): number {
  const c = tu.core.spec;
  return secPer(Math.max(1, roundHalfUp(tu.speedRaw * rateMul(tu.plated ? c.steamPlated : c.steamBare))));
}

/**
 * Y4 (release Y; REQ-BFG-047; BRIEF-Y4 S1): SALVO RACK's VOLLEY PACE, the one helper the sim and the turret row share: its
 * turret's whole SPEED over reloadMul, rounded half up once as makeTurret rounds a SPEED (30 / 1.6 = 18.75 is 19). The
 * turret row's RATE (screens/build/inspector.ts turretPanel) is this (as Y1 made it).
 */
export function salvoSpeed(speed: number, reloadMul: number): number {
  return Math.max(1, roundHalfUp(speed / reloadMul));
}

/** Y4 (BRIEF-Y4 S1): a SALVO RACK's reload after a volley (ROUTINES.salvo cadence; battle.ts loadPace): the interval of a
 *  turret at its volley pace (secPer(salvoSpeed)), so the row's RATE is the sim's own value. */
export function salvoReload(tu: Pick<TurretState, "speed" | "core">): number {
  const mul = tu.core.spec.reloadMul ?? 1;
  return secPer(salvoSpeed(tu.speed, mul));
}

/**
 * GATLING SPOOL never holds a loading window (Prime-approved deviation from catalogue row 4, oracle
 * 5624d721a73a6282): each load fires as soon as the barrel is ready, i.e. interval x spin has passed since the
 * last shot, so a lone load on an idle barrel fires at once. While the barrel cools it keeps taking loads, up
 * to its payloads per shot (EXT. CHAMBER) within the window size, and they fire together when it is ready.
 */
function gatlingReady(tu: TurretState): boolean {
  return tu.stack.length > 0 && (tu.fireCd <= 0 || tu.stack.length >= Math.min(tu.window, tu.perShot));
}

export const ROUTINES: Record<CoreRoutine, Routine> = {
  identity: IDENTITY,
  scatter: IDENTITY, // shape: pellets (Battle.fireCore)
  rotary: { ...IDENTITY, select: (tu) => (tu.core.spec.order === "FIFO" ? 0 : lifo(tu)) }, // + windowTime, fireRate (NUM-2)
  pressure: IDENTITY, // noJam; shape: + perQueued x queued
  gatling: { ...IDENTITY, ready: gatlingReady, cadence: gatlingCadence },
  hullbreaker: IDENTITY, // shape: bare hull, x hullMul
  drake: IDENTITY, // shape: flat to Burn, + addBurn, burnTime, flightMul
  salvo: {
    ...IDENTITY,
    // waits for a full window (or twice the window time), fires all of it, then reloads at its volley pace (salvoReload)
    ready: (tu) => tu.stack.length >= tu.window || (tu.stack.length > 0 && tu.loadTimer >= 2 * tu.windowTime),
    count: (tu) => tu.stack.length,
    cadence: (tu) => salvoReload(tu),
  },
  mortar: IDENTITY,
  grapnel: IDENTITY,
  tesla: IDENTITY,
  capacitor: IDENTITY,
  compound: { ...IDENTITY, ready: (tu) => tu.stack.length >= 2 || (tu.stack.length > 0 && tu.loadTimer >= (tu.core.spec.hold ?? 3)) },
  lance: IDENTITY,
  // 0.8.0 P1, wave 3: ANVIL BREECH's flat and per-plating damage are its shape hook (Battle.fireCore); STEAM BREECH fires
  // at the interval x steamPlated while the hull holds plating (Battle.chambers sets tu.plated each tick), else x steamBare
  anvil: IDENTITY,
  steam: { ...IDENTITY, cadence: (tu) => steamInterval(tu) }, // NUM-2: 30 / its whole speed, plated or bare
};

/** DRAKE NOZZLE: Burn stacks from a payload's flat bonus (1 per flatPerBurn, rounded down) and the flat it uses. */
export function drakeConvert(spec: CoreSpec, flat: number): { stacks: number; used: number } {
  const per = spec.flatPerBurn ?? 0;
  if (per <= 0 || flat <= 0) return { stacks: 0, used: 0 };
  const stacks = Math.floor(flat / per + 1e-9);
  return { stacks, used: stacks * per };
}

/** PRESSURE BREECH: flat bonus for `queued` payloads (waiting at the intakes plus those in the window, this one included). */
export function pressureBonus(spec: CoreSpec, queued: number): number {
  return (spec.perQueued ?? 0) * Math.min(spec.maxCount ?? queued, Math.max(0, queued));
}

// SHOCK-1 (REQ-BFG-033; SHOCK-1D section 5.2, BRIEF-SHOCK1 B1): THE SMUGGLER'S TWO POOLS, in a leaf module.
//
// Moved out of eventDefs.ts as they were (SmugglerKind, SMUGGLER_EFFECT, smugglerPool and the road-part helpers they read,
// roadPart and roadParts); eventDefs.ts imports them from here and re-exports the three, so every importer keeps working.
// Why a file of its own: the effect floor in the per-run draw (wares.ts holdEffects, behind src/sim/effectFloor.ts) reads the
// SMUGGLER's own pools, so the card and the floor use one predicate, and eventDefs.ts imports `unlocked` from wares.ts, so
// wares.ts cannot import eventDefs.ts. This file imports only src/sim/content.ts and src/sim/stars.ts.

import { buyableModules, type GateEffect, type ItemDef } from "../sim/content";
import { fusible } from "../sim/stars";

/** A part a caravan sells and that merges: a merchant stocks it and stars.ts `fusible` holds (never a
 *  supply, price-0 signature or dormant prototype). A new race module joins on merchant assignment.
 *  0.6.2s (REQ-BFG-031 step 5): turrets ride only in the caravan in 0.6.2 (never a road part, like tradeGood). */
const roadPart = (d: ItemDef): boolean => fusible(d.id) && d.kind !== "turret" && d.kind !== "converter"; // GATES-1 (REQ-BFG-052): a GATE comes from the shop, never a road event (out of scope)

/** The ids of every road part that passes `test`, in catalogue order. */
export const roadParts = (test: (d: ItemDef) => boolean): string[] => buyableModules().filter((d) => roadPart(d) && test(d)).map((d) => d.id);

/** SMUGGLER's two pools: BURN (2 g) and SHOCK (3 g), the event's two choices. */
export type SmugglerKind = "BURN" | "SHOCK";

/**
 * 0.8.0 P1 (family map v2, DESIGN-wave3.md 2.5): what puts a gate in each SMUGGLER pool, read off its 1-star effect. BURN:
 * an effect that works with burn (`burn`, `burnPerRide` or `quench`); SHOCK: one that shocks or pays for stalls (`shock`,
 * `staticTime` or `perStalled`). v2 retired the BURN and SHOCK tags the pools were keyed on; this picks the same six rigs
 * as v070-rc (TEMPER, BELLOWS, QUENCH TANK; GALVANIC COIL, STATIC BRUSH, LODESTONE), and no wave-3 rig joins either pool.
 */
export const SMUGGLER_EFFECT: Readonly<Record<SmugglerKind, (e: GateEffect) => boolean>> = {
  BURN: (e) => !!(e.burn || e.burnPerRide || e.quench),
  SHOCK: (e) => !!(e.shock || e.staticTime || e.perStalled),
};

/** SMUGGLER's BURN or SHOCK pool: the gates whose effect SMUGGLER_EFFECT[kind] accepts (0.6.1: TEMPER; GALVANIC COIL). */
export const smugglerPool = (kind: SmugglerKind): string[] =>
  roadParts((d) => d.kind === "gate" && !!d.gate && SMUGGLER_EFFECT[kind](d.gate));

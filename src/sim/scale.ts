// SCALE-2a (REQ-BFG-098, REQ-BFG-110, REQ-BFG-050, REQ-BFG-100; BRIEF-SCALE2a; ref/scale1/REPORT-SCALE1.md 3.2, 8 S2):
// THE SCALING RELEASE'S SIM HOOKS ("1E"), behind one switch.
//
// What the switch turns on (battle.ts reads it once, when a Battle is made: Battle.scale):
//  - REQ-BFG-110's order of operations: FOR EACH DMG rides its own accumulator (Payload.each), so DRAKE NOZZLE converts
//    only the DMG from rigs' stat rows (Payload.flat); every other reader of the flat bonus reads the sum (flatOf);
//  - the counts the readers need: a rig's own hits (GateState.ownHits) and hits taken (SideState.hitsTaken), kept off
//    SideStats; hearts lost reach the Battle the way wins do (SideState.heartsLost);
//  - the data-only reader field (GateEffect.reads, ModSpec.reads: content.ts ReadSpec), read at a rig's HIT or a gun's SHOT.
// Off (as shipped), every hook is inert: the second accumulator is never set, the counts are never kept and `reads` is
// ignored, so the sim is byte for byte the base's (the pinned fp and parBench). C11's `add` on process and fire events is
// display data and is set either way (the fp tallies event types only).
//
// THE SWITCH: SCALE_RIGS (false until BUMP-1E flips it), in shapes.ts's form: scaleRules(), setScaleRigs(on) and
// withScaleRigs(fn, on = true), which puts the switch back even on a throw.
//
// Shared, pure and dependency-light (no DOM): the client, the server and the tests read the same helpers.

import type { HullState, Payload } from "./battle";
import { START_LIVES } from "./content";

/** THE switch (REQ-BFG-098, REQ-BFG-110): off in this rules version (bb-0.10.0); BUMP-1E turns it on. */
export const SCALE_RIGS: boolean = false;

let scOn = false;

/** Are the scaling hooks on now (SCALE_RIGS, or a withScaleRigs call)? A Battle reads this once, when it is made. */
export function scaleRules(): boolean {
  return scOn;
}

/** Turn the scaling hooks on or off (no content to swap: each hook reads the switch, through its Battle, where it acts). */
export function setScaleRigs(on: boolean): void {
  scOn = on;
}

/** Run `fn` with the scaling hooks on (or off), then put the switch back as it was, even if `fn` throws (withShapes's form). */
export function withScaleRigs<T>(fn: () => T, on = true): T {
  const was = scOn;
  setScaleRigs(on);
  try {
    return fn();
  } finally {
    setScaleRigs(was);
  }
}

setScaleRigs(SCALE_RIGS);

/** SCALE-2a (REQ-BFG-098; REPORT-SCALE1 1.1): the BURN stacks on a hull: the sum of `dps` over its entries (each burning
 *  impact pushes one entry holding that hit's stacks: battle.ts HullState.burns), not `burns.length`, which counts entries.
 *  The count KINDLING and CINDER MAIL read (ReadCount "foeBurn"). counters.ts's C1 keeps its own sum (COUNT-1). */
export function burnStacks(hull: Pick<HullState, "burns">): number {
  let n = 0;
  for (const b of hull.burns) n += b.dps;
  return n;
}

/** SCALE-2a (REQ-BFG-110): a payload's whole flat bonus: the stat rows' DMG (`flat`, step 2 of the order) plus its FOR
 *  EACH DMG (`each`, step 4; set only while SCALE_RIGS is on). Every reader of the flat bonus reads this, the sum it read
 *  before, except DRAKE NOZZLE (step 3), which converts `flat` alone. With the switch off it is `flat` itself. */
export function flatOf(p: Pick<Payload, "flat" | "each">): number {
  return p.each ? p.flat + p.each : p.flat;
}

/** SCALE-2a (REQ-BFG-098): THE one function that gives a run's start hearts, which hearts lost count from: the base's
 *  START_LIVES today. MERGE NOTE: when HULL-ON brings RETUNE-1's src/sim/hearts.ts into 0.9.9, its body becomes
 *  `return run ? livesCap(run) : startLives();` (hearts.ts: 10 with HEARTS on, a run on the scale it started on), and
 *  nothing else changes. `run` is the run whose scale counts (unread until then). */
export function startHearts(run?: { lives: number; hearts?: boolean }): number {
  void run;
  return START_LIVES;
}

/** SCALE-2a (REQ-BFG-098): the hearts lost by a side holding `lives` (the run's Run.lives, or a ghost snapshot's `lives`,
 *  1..MAX_LIVES, against the same start), from startHearts(run); whole, never below 0. What the Battle's `lost` carries. */
export function heartsLost(lives: number, run?: { lives: number; hearts?: boolean }): number {
  return Math.max(0, startHearts(run) - Math.floor(lives));
}

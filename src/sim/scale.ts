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

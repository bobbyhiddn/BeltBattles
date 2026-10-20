// SHOCK-1 (REQ-BFG-033; SHOCK-1D, W/output-shock1d/REPORT.md section 5; BRIEF-SHOCK1 B2): THE EFFECT FLOOR in the per-run ware
// draw, behind one switch.
//
// REQ-BFG-033: the SMUGGLER sells the run's own wares and only those (it never sells a module the run did not draw), and a run with
// no SHOCK ware stays rare (under 4%). SHOCK-1D measured bb-0.13.0 at 3.87% of runs drawing no SHOCK ware (the pool is three
// rares of two merchants: COIL and STATIC BRUSH, LODESTONE) and 0.92% drawing no BURN ware, and each buyable module added to the
// catalogue lowers every piece's chance (about +0.35 points of no-SHOCK runs a module). In those runs the SMUGGLER's card reads NONE
// ON OFFER. The fix it recommended, and cap chose: a FLOOR in the draw itself, the SWAP form. After the restocks are drawn, a run
// whose wares hold none of the SMUGGLER's SHOCK pool (or none of its BURN pool) gets one piece of that pool in place of one drawn
// piece of the same merchant and rarity (wares.ts holdEffects has the exact victim order), so the run keeps its size, each merchant's
// and rarity's share, its 12 restocks and every other ware's day. About 5% of seeds change, by one ware in and one out; no run
// draws no SHOCK or no BURN ware, at the catalogue's size now or after more modules.
//
// THE SWITCH: EFFECT_FLOOR (false), in shapes2.ts's and gates.ts's form: effectFloorRules(), setEffectFloor(on) and
// withEffectFloor(fn, on = true), which puts the switch back even on a throw. It adds no piece to ITEMS and patches no def (the floor
// only chooses among wares the catalogue already has), so unlike those two there is no catalogue to swap and no star cache to
// clear. While it is off the draw is exactly what it was (wares.ts drawWares calls holdEffects only with the switch on; the digest in
// tests/effectfloor.draw.test.ts was taken at the freeze d848af4cc0f7). The rules bump after bb-0.13.0 turns it on and absorbs the
// redraw (the stand-in pool, the seed-ghost pool and the par field regenerate in that bump anyway).
//
// NO rules literal and no rulesGate.ts row: nothing server-side reads a run's wares (src/net and server never mention them, ghost
// snapshots do not carry them, roadCap.ts deletes `run.wares`), a saved run keeps its saved wares (save.ts migrateRun), and the floor
// adds no piece outside pools that already exist. The release's own RULES_VERSION covers it.
//
// Shared, pure and dependency-light (no DOM, no catalogue): the game and the tests read the same switch.

/** THE switch (REQ-BFG-033): off until the rules bump after bb-0.13.0 turns it on. */
export const EFFECT_FLOOR: boolean = false;

/**
 * THE FLOOR'S DEPTH (SHOCK-1D 5.1, question 3): how many pieces of each effect (the SMUGGLER's SHOCK pool, its BURN pool) a run's
 * wares always hold. 1 = "drawn at all", the REQ's own measure; wares.ts holdEffects builds that and no more, so 0 turns the floor off
 * and 1 is the only depth built (a floor of 2 would redraw 32% of runs for SHOCK, a floor of 3 78%: SHOCK-1D 5.1, check-minstock). The
 * object is there so the knob is one number beside the other two levers (SHAPES2_ODDS, GATES_ODDS), not so it gets turned.
 */
export const EFFECT_FLOOR_ODDS: { minStock: number } = { minStock: 1 };

let floorOn = false;

/** Is the effect floor in the ware draw now (EFFECT_FLOOR, or a withEffectFloor call)? */
export function effectFloorRules(): boolean {
  return floorOn;
}

/** Turn the floor on or off. Setting the state it already has does nothing. */
export function setEffectFloor(on: boolean): void {
  floorOn = on;
}

/** Run `fn` with the floor on (or off), then put the switch back as it was, even if `fn` throws (withShapes2's and withGates' form). */
export function withEffectFloor<T>(fn: () => T, on = true): T {
  const was = floorOn;
  setEffectFloor(on);
  try {
    return fn();
  } finally {
    setEffectFloor(was);
  }
}

setEffectFloor(EFFECT_FLOOR);

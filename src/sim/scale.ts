// SCALE-2a (REQ-BFG-098, REQ-BFG-110, REQ-BFG-050, REQ-BFG-100; BRIEF-SCALE2a; ref/scale1/REPORT-SCALE1.md 3.2, 8 S2):
// THE SCALING RELEASE'S SIM HOOKS ("1E"), behind one switch.
//
// What the switch turns on (battle.ts reads it once, when a Battle is made: Battle.scaleRigs):
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
import { ITEMS, type ItemDef, type ReadCount } from "./content";
import type { Build } from "./deck";
import { clearStarCache, effectAt, starsOf } from "./stars";
import { livesCap, startLives } from "./hearts"; // SCALE-2c M0 (REQ-BFG-098): the RETUNE-1 hearts swap (startHearts)

/** THE switch (REQ-BFG-098, REQ-BFG-110): off in this rules version (bb-0.10.0); BUMP-1E turns it on. */
export const SCALE_RIGS: boolean = false;

let scOn = false;

/** Are the scaling hooks on now (SCALE_RIGS, or a withScaleRigs call)? A Battle reads this once, when it is made. */
export function scaleRules(): boolean {
  return scOn;
}

/** SCALE-2b (REQ-BFG-108; BRIEF-SCALE2b section 2): the live defs the switch changes, each built from its base def (the
 *  switch-off def, as content.ts writes it), in SHAPES-1's form (shapes.ts SHAPE_DEFS): while the switch is on ITEMS[id] is
 *  this def, while it is off the base def object itself, untouched, so every reader (effectAt, the faces, the bots, the
 *  pools) sees one def through one lookup and the off world is byte for byte the base's.
 *  - VENOM DRIP becomes POISON's source again: POISON +1 / +2 / +3 by star and no burnPlus (SLOW EMBERS still lengthens
 *    BURN); rarity, price, merchant, size, foot, desc and tags as the base's. */
export const SCALE_DEFS: Readonly<Record<string, (base: ItemDef) => ItemDef>> = {
  venom: (b) => ({ ...b, gate: { poison: 1 }, levels: { 2: { gate: { poison: 2 } }, 3: { gate: { poison: 3 } } } }),
};

/** The ids SCALE_DEFS changes, in its order. */
export const SCALE_DEF_IDS: readonly string[] = Object.keys(SCALE_DEFS);

/** The base defs, kept at the first swap (so a swap back restores the very object content.ts made). */
const SC_BASE = new Map<string, ItemDef>();
/** The switch-on defs, built once (so every swap on puts back the same object). */
const SC_ON = new Map<string, ItemDef>();

/** SCALE-2b (REQ-BFG-108; BRIEF-SCALE2b section 3): hooks run after each switch flip, with the new state: the screen's
 *  lists that gain POISON only while the switch is on (font.ts KEYWORDS, glossary.ts GLOSSARY, tips.ts
 *  FIRST_SIGHT_WORDS, richText.ts's keyword colours) register here, so this file never imports a screen module. With the
 *  switch off (as shipped) no hook adds anything: every list is the base's. content.ts onSetWave3's form. */
const afterScale: ((on: boolean) => void)[] = [];
/** Register `fn` to run after every flip; it runs once at once with the state now (a module loaded after a flip). */
export function onSetScaleRigs(fn: (on: boolean) => void): void {
  afterScale.push(fn);
  fn(scOn);
}

/** Turn the scaling hooks on or off. Each sim hook reads the switch through its Battle, where it acts; SCALE-2b: the
 *  defs in SCALE_DEFS swap to their switch-on or base def in ITEMS and the star cache is cleared (shapes.ts setShapes's
 *  form), then the screen's hooks run (onSetScaleRigs). Setting the state it already has does nothing. */
export function setScaleRigs(on: boolean): void {
  if (on === scOn) return;
  const items = ITEMS as Record<string, ItemDef>;
  for (const id of SCALE_DEF_IDS) {
    if (!items[id] && !SC_BASE.has(id)) continue; // a world without the def (none today): nothing to swap
    if (!SC_BASE.has(id)) SC_BASE.set(id, items[id]);
    if (!SC_ON.has(id)) SC_ON.set(id, SCALE_DEFS[id](SC_BASE.get(id)!));
    items[id] = on ? SC_ON.get(id)! : SC_BASE.get(id)!;
  }
  clearStarCache();
  scOn = on;
  for (const fn of afterScale) fn(on);
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

/** SCALE-2a (REQ-BFG-098): THE one function that gives a run's start hearts, which hearts lost count from.
 *  SCALE-2c M0 (REQ-BFG-098): the RETUNE-1 hearts swap (SCALE-2a's merge note), now that live-099 (HULL-ON) brings
 *  src/sim/hearts.ts: a run's cap on the scale it started on (livesCap: HEARTS_START 10 on a hearts run, else
 *  START_LIVES 5), or without a run the switch's start (startLives: 10 with HEARTS on). Nothing else changes: both
 *  callers already pass the run. */
export function startHearts(run?: { lives: number; hearts?: boolean }): number {
  return run ? livesCap(run) : startLives();
}

/** SCALE-2a (REQ-BFG-098): the hearts lost by a side holding `lives` (the run's Run.lives, or a ghost snapshot's `lives`,
 *  1..MAX_LIVES, against the same start), from startHearts(run); whole, never below 0. What the Battle's `lost` carries. */
export function heartsLost(lives: number, run?: { lives: number; hearts?: boolean }): number {
  return Math.max(0, startHearts(run) - Math.floor(lives));
}

/** SCALE-2a (REQ-BFG-098): does build b hold a piece whose reader line counts `count` at its stars (a rig's
 *  GateEffect.reads, a gun part's ModSpec.reads)? The battle record keeps `wins` and `lost` only then (replay.ts). */
export function buildReads(b: Build, count: ReadCount): boolean {
  const reads = (def: string, stars: number): boolean => {
    if (!ITEMS[def]) return false;
    const d = effectAt(def, stars);
    return d.gate?.reads?.count === count || d.mod?.reads?.count === count;
  };
  return b.items.some((p) => reads(p.def, starsOf(p))) || b.mods.some((m) => reads(m.def, starsOf(m)));
}

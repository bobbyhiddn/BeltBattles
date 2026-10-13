// SHAPES-1 (REQ-BFG-086, REQ-BFG-084, REQ-BFG-089; ref/pieces1/REPORT.md section 5.3, rule set B; BRIEF-SHAPES1 R4, S1):
// SHAPED RIGS AND FACTORIES, behind one switch.
//
// THE ENGINE is foot.ts (footprintCells, canonicalRot, footSlots) and deck.ts (rigArrowCells and the per-cell rigHits):
// it runs whatever the switch says. Every 0.9.9 def has a 1-cell or 2x2 foot, so with the switch off it gives 0.9.9's
// answers everywhere.
//
// THE PIECES (R4), on with the switch:
//  - three shaped plain stat rigs (REQ-BFG-084: a stat row and no ability line; a star raises only their numbers; they
//    merge like any rig and sell at sellValue): NAIL STRIP and EMBER TROUGH (common, 4 G, I2, one arrow forward) and
//    SPIKE RAIL (rare, 6 G, I3, two arrows left and right). SHAPES_ITEMS; they join ITEMS after every other def while the
//    switch is on, and are not in ITEMS while it is off (PLAIN-1's form, plain1-accepted src/sim/plainRigs.ts);
//  - GANTRY PRESS becomes 2x3 (its +1 belt slot from foot.ts footSlots: 4/5/6 at ★1/★2/★3; price and ability as before)
//    and ASSEMBLY LINE becomes I3, a SMALL factory that keeps its slots and costs 1 G less. SHAPE_DEFS, ladderFix.ts's
//    content swap: while the switch is on ITEMS[id] is the reshaped def (built from the base def), while it is off the
//    base def, untouched; stars.ts's star cache is cleared at each swap. The six signature factories stay 2x2.
//
// THE SWITCH: SHAPES (true since SHAPES-1's flip, step 8), in npcDay.ts's form: shapesRules(), setShapes(on) and
// withShapes(fn, on = true), which puts the switch back even on a throw. Off, no pool, shop, offer, drop, LAST CHANCE card,
// stand-in, captain, validator, text sheet or save sees the three rigs, GANTRY PRESS and ASSEMBLY LINE keep 2x2 and
// their price, no migration runs and TURRET INTAKE doesn't apply. The validator's shape rules also read
// rulesGate.ts SHAPES_RULES (a record under older rules is judged in 0.9.9's shapes).
//
// Shared, pure and dependency-light (no DOM): the client, the server and the tests read the same defs.

import { ITEMS, type ItemDef } from "./content";
import { clearStarCache } from "./stars";

/** THE switch (REQ-BFG-086): ON since SHAPES-1's flip (BRIEF-SHAPES1 S1 and step 8, as AZ-BUMP's def6e73 flipped NPC_DAY,
 *  HULL_SCALE and LADDER_FIX). Its setter, withShapes and the off path stay, for older records (a record under rules
 *  before SHAPES_RULES is judged with it off: validate.ts inShapesWorld) and the tests that measure the off world. */
export const SHAPES: boolean = true;

/** R4: the three shaped plain stat rigs (REQ-BFG-084). No desc, so no ability line: a stat row (faces.ts PLAIN_RIGS'
 *  path). Merchants and tags follow the base's plain rigs of their kind (WHETSTONE and TEMPER: alchemist, FORGE) and
 *  PLAIN-1's GRINDSTONE for the rare (tinker, FORGE and BURST). */
export const SHAPES_ITEMS: Readonly<Record<string, ItemDef>> = {
  nailstrip: {
    id: "nailstrip", name: "NAIL STRIP", kind: "gate", rarity: "common", price: 4, size: 1, foot: "I2", merchant: "alchemist",
    desc: [], tags: ["FORGE"],
    gate: { flat: 12 }, // one arrow, forward: laid along a belt it hits 2 tiles
    levels: { 2: { gate: { flat: 25 } }, 3: { gate: { flat: 40 } } },
  },
  embertrough: {
    // price 5 G (was the brief's 4): cap's ruling RUN5-SHAPES1 1.1 (on the swap read, REPORT section 9 b): it plays like two
    // TEMPERs on its cells, so it can't be cut per hit (BURN 1 at 1 star is the floor) and price is its lever; at 5 G it
    // costs one gold less than its two TEMPERs (6 G), a small discount for needing a straight run along a belt
    id: "embertrough", name: "EMBER TROUGH", kind: "gate", rarity: "common", price: 5, size: 1, foot: "I2", merchant: "alchemist",
    desc: [], tags: ["FORGE"],
    gate: { burn: 1 }, // NAIL STRIP's burn twin
    levels: { 2: { gate: { burn: 2 } }, 3: { gate: { burn: 3 } } },
  },
  spikerail: {
    id: "spikerail", name: "SPIKE RAIL", kind: "gate", rarity: "rare", price: 6, size: 1, foot: "I3", merchant: "tinker",
    desc: [], tags: ["FORGE", "BURST"],
    gate: { flat: 10 }, // two arrows, left and right (the rare's II): between two straight belts one cell apart, 3 hits on each
    levels: { 2: { gate: { flat: 20 } }, 3: { gate: { flat: 35 } } },
  },
};

/** R4: the three rigs' ids, in the order they join ITEMS. */
export const SHAPES_IDS: readonly string[] = Object.keys(SHAPES_ITEMS);

/** Is `id` one of the three shaped rigs (whatever the switch)? */
export function isShapesPiece(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(SHAPES_ITEMS, id);
}

/** R4: the reshaped factories, each built from its base def (the switch-off def, as content.ts writes it). */
export const SHAPE_DEFS: Readonly<Record<string, (base: ItemDef) => ItemDef>> = {
  // GANTRY PRESS: 2x3 (3 wide, 2 deep at rot 0); its lead stays, so footSlots' +1 makes 4/5/6; price and ability as before
  gantry: (b) => ({ ...b, foot: "2x3" }),
  // ASSEMBLY LINE: I3, a SMALL factory: its slots as before, 1 G less (5 -> 4)
  assembly: (b) => ({ ...b, foot: "I3", price: b.price - 1 }),
};

/** The ids SHAPE_DEFS reshapes, in its order. */
export const RESHAPED_IDS: readonly string[] = Object.keys(SHAPE_DEFS);

let shOn = false;
/** The base defs, kept at the first swap (so a swap back restores the very object content.ts made). */
const BASE = new Map<string, ItemDef>();
/** The reshaped defs, built once (so every swap on puts back the same object). */
const SHAPED = new Map<string, ItemDef>();

/** Are shaped rigs and factories in the game now (SHAPES, or a withShapes call)? */
export function shapesRules(): boolean {
  return shOn;
}

/** Turn shapes on or off: the three rigs join ITEMS (after every other def) or leave it, GANTRY PRESS and ASSEMBLY LINE
 *  swap to their reshaped or base def, and the star cache is cleared. Setting the state it already has does nothing. */
export function setShapes(on: boolean): void {
  if (on === shOn) return;
  const items = ITEMS as Record<string, ItemDef>;
  for (const id of SHAPES_IDS) {
    if (on) items[id] = SHAPES_ITEMS[id];
    else delete items[id];
  }
  for (const id of RESHAPED_IDS) {
    if (!BASE.has(id)) BASE.set(id, items[id]);
    if (!SHAPED.has(id)) SHAPED.set(id, SHAPE_DEFS[id](BASE.get(id)!));
    items[id] = on ? SHAPED.get(id)! : BASE.get(id)!;
  }
  clearStarCache();
  shOn = on;
}

/** Run `fn` with shapes on (or off), then put the switch back as it was, even if `fn` throws (withNpcDay's form). */
export function withShapes<T>(fn: () => T, on = true): T {
  const was = shOn;
  setShapes(on);
  try {
    return fn();
  } finally {
    setShapes(was);
  }
}

setShapes(SHAPES);

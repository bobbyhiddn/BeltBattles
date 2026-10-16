// SHAPES-2 (REQ-BFG-114, REQ-BFG-084; BRIEF-SHAPES2 S1, S2): SIX MORE SHAPED PLAIN STAT RIGS, behind one switch.
//
// The operator, after a full run of live 0.9.9: "So in an entire run, the only rig that wasn't just one square was nail
// press." 0.9.9 shipped SHAPES-1's engine (foot.ts: every footprint, the per-cell hit rule), but only three shaped rigs, all
// straight lines (shapes.ts: NAIL STRIP and EMBER TROUGH, I2; SPIKE RAIL, I3). REQ-BFG-114 wants at least eight, with L, T
// and 2x2 feet as well as lines, and shops that show them. These are the six more, the first rigs with L3, T4 and 2x2 feet:
//  - ELBOW GUARD  (common, 4 G, L3, I,  ironmonger):    + SHIELD on the slug (GateEffect.slugPlate), at a belt's corner;
//  - SAW BAR      (common, 5 G, I3, I,  gunsmith):      + DMG, along a straight run (3 hits);
//  - SPARK COMB   (common, 5 G, I2, I,  arcane dealer): + STUN seconds, along a belt (2 hits);
//  - CINDER HOOK  (rare,   6 G, L3, II, alchemist):     + BURN, round a bend (up to 4 hits);
//  - JAW CRUSHER  (rare,   6 G, 2x2, II, scrapper):     + DMG, between two belts two cells apart (4 hits);
//  - PICKAXE      (epic,   8 G, T4, T,  quartermaster): + DMG, belt on three sides (up to 7 hits).
// They are plain stat rigs (REQ-BFG-084): a stat row and no ability line; a star raises only their numbers; they merge like
// any rig and sell at sellValue. Their arrows follow rarity (content.ts RARITY_SHAPE: a common's I is forward, a rare's II
// left and right, an epic's T forward, left and right), and each arrow shines from every cell edge that faces out of the
// shape (BRIEF-SHAPES1 rule set B, R2: deck.ts rigArrowCells). The numbers are the brief's starting values; the bench
// (tools/shapes2) and the presence guard set the shipped ones.
//
// THE SWITCH: SHAPES2 (false), in plainRigs.ts' form (a content patch): shapes2Rules(), setShapes2(on) and
// withShapes2(fn, on = true), which puts the switch back even on a throw. While it is on, the six are in ITEMS, after every
// other def (so the catalogue's order and every older def are as before), and stars.ts's star cache is cleared at each
// swap; while it is off they are not in ITEMS at all, so nothing sees them: no pool, shop, offer, drop, LAST CHANCE card,
// stand-in, captain, validator acceptance (rulesGate.ts shapes2GateProblem: SHAPES2_RULES), text sheet or save. With it off
// (and PLAIN_RIGS off) the game plays byte for byte (fp.sh IDENTICAL, parBench 4eab334f). BUMP-1D turns it on with 1D's rules
// bump. It works with PLAIN_RIGS off, and with both on (1D ships both). It is meant to run with SHAPES on (the footprint
// rules, TURRET INTAKE and the shaped faces' lines read SHAPES); the validator turns both off for a record under older rules.
//
// Shared, pure and dependency-light (no DOM): the client, the server and the tests read the same defs.

import { ITEMS, type ItemDef } from "./content";
import { clearStarCache } from "./stars";

/** THE switch (REQ-BFG-114), off in this rules version (bb-0.10.0). */
export const SHAPES2: boolean = false;

/** The six shaped plain stat rigs (BRIEF-SHAPES2's table; the numbers are the bench's starting values). No `shape`: the
 *  arrows follow the rarity (RARITY_SHAPE: common I, rare II, epic T), as SHAPES_ITEMS' do. No desc: a stat row (faces.ts). */
export const SHAPES2_DEFS: Readonly<Record<string, ItemDef>> = {
  elbowguard: {
    id: "elbowguard", name: "ELBOW GUARD", kind: "gate", rarity: "common", price: 4, size: 1, foot: "L3", merchant: "ironmonger",
    desc: [], tags: ["PLATE"],
    gate: { slugPlate: 2 }, // one arrow, forward, from two cells of the L: at a belt's corner it hits 2 tiles
    levels: { 2: { gate: { slugPlate: 4 } }, 3: { gate: { slugPlate: 7 } } },
  },
  sawbar: {
    id: "sawbar", name: "SAW BAR", kind: "gate", rarity: "common", price: 5, size: 1, foot: "I3", merchant: "gunsmith",
    desc: [], tags: ["FORGE"],
    gate: { flat: 8 }, // one arrow, forward: laid along a straight run it hits 3 tiles
    levels: { 2: { gate: { flat: 16 } }, 3: { gate: { flat: 28 } } },
  },
  sparkcomb: {
    id: "sparkcomb", name: "SPARK COMB", kind: "gate", rarity: "common", price: 5, size: 1, foot: "I2", merchant: "arcane",
    desc: [], tags: ["HARASS"],
    gate: { stun: 1 }, // one arrow, forward: laid along a belt it hits 2 tiles
    levels: { 2: { gate: { stun: 2 } }, 3: { gate: { stun: 3 } } },
  },
  cinderhook: {
    id: "cinderhook", name: "CINDER HOOK", kind: "gate", rarity: "rare", price: 6, size: 1, foot: "L3", merchant: "alchemist",
    desc: [], tags: ["FORGE"],
    gate: { burn: 1 }, // two arrows, left and right, from the L's outside edges: round a bend it hits up to 4 tiles
    levels: { 2: { gate: { burn: 2 } }, 3: { gate: { burn: 3 } } },
  },
  jawcrusher: {
    id: "jawcrusher", name: "JAW CRUSHER", kind: "gate", rarity: "rare", price: 6, size: 1, foot: "2x2", merchant: "scrapper",
    desc: [], tags: ["FORGE", "BURST"],
    gate: { flat: 12 }, // two arrows, left and right, from both cells of each side: between two belts two cells apart, 4 hits
    levels: { 2: { gate: { flat: 25 } }, 3: { gate: { flat: 42 } } },
  },
  pickaxe: {
    id: "pickaxe", name: "PICKAXE", kind: "gate", rarity: "epic", price: 8, size: 1, foot: "T4", merchant: "quartermaster",
    desc: [], tags: ["FORGE", "BURST"],
    gate: { flat: 14 }, // three arrows (forward, left, right), from the T's outside edges: belt on three sides, up to 7 hits
    levels: { 2: { gate: { flat: 28 } }, 3: { gate: { flat: 48 } } },
  },
};

/** The six ids, in the order they join ITEMS. */
export const SHAPES2_IDS: readonly string[] = Object.keys(SHAPES2_DEFS);

/**
 * THE OFFER LEVER (BRIEF-SHAPES2 S3; REQ-BFG-114 (2): a typical run sees at least 5 shaped-rig offers across its shops, bar:
 * the median run at least 6 and at least 75% of runs at least 5, on every hero). Lever (b), the per-run draw (wares.ts
 * holdShaped): while SHAPES2 is on, the run's wares always hold at least `minStock` of the shaped rigs (the nine). The bench
 * (tools/shapes2/offers.ts; REPORT section 5): with none, the median run sees 5 and 57-61% see 5 or more; 6 holds the median
 * but only 71% see 5 or more (seeds 1-3000); 7 is the least that passes (median 6, 80.5%). Off, or at 0, the draw is exactly
 * as it was. The bench sets it for its trials (--k); the shipped value is the one below.
 */
export const SHAPES2_ODDS: { minStock: number } = { minStock: 7 };

/** Is `d` a shaped rig: a rig whose foot is more than one cell (a rig has the foot "1" unless a def says otherwise)? */
export function isShapedRig(d: ItemDef | undefined): boolean {
  return !!d && d.kind === "gate" && !!d.foot && d.foot !== "1";
}

let s2On = false;

/** Are the six more shaped rigs in the game now (SHAPES2, or a withShapes2 call)? */
export function shapes2Rules(): boolean {
  return s2On;
}

/** Is `id` one of the six (whatever the switch says)? */
export function isShapes2Piece(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(SHAPES2_DEFS, id);
}

/** Turn the six on or off: add their defs to ITEMS (after every other def) or delete them, and clear the star cache.
 *  Setting the state it already has does nothing. */
export function setShapes2(on: boolean): void {
  if (on === s2On) return;
  const items = ITEMS as Record<string, ItemDef>;
  for (const id of SHAPES2_IDS) {
    if (on) items[id] = SHAPES2_DEFS[id];
    else delete items[id];
  }
  clearStarCache();
  s2On = on;
}

/** Run `fn` with the six on (or off), then put the switch back as it was, even if `fn` throws (withPlainRigs' form). */
export function withShapes2<T>(fn: () => T, on = true): T {
  const was = s2On;
  setShapes2(on);
  try {
    return fn();
  } finally {
    setShapes2(was);
  }
}

setShapes2(SHAPES2);

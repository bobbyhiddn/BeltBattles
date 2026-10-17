// SHAPES-2 (REQ-BFG-114, REQ-BFG-084; BRIEF-SHAPES2 S1, S2): SIX MORE SHAPED PLAIN STAT RIGS, behind one switch.
//
// The operator, after a full run of live 0.9.9: "So in an entire run, the only rig that wasn't just one square was nail
// press." 0.9.9 shipped SHAPES-1's engine (foot.ts: every footprint, the per-cell hit rule), but only three shaped rigs, all
// straight lines (shapes.ts: NAIL STRIP and EMBER TROUGH, I2; SPIKE RAIL, I3). REQ-BFG-114 wants at least eight, with L, T
// and 2x2 feet as well as lines, and shops that show them. These are the six more, the first rigs with L3, T4 and 2x2 feet:
//  - ELBOW GUARD  (common, 4 G, L3, I,  ironmonger):    + SHIELD on the slug (GateEffect.slugPlate; 8/16/28 since step 6), at a belt's corner;
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
import { SHAPES_ITEMS } from "./shapes"; // run 2: NAIL STRIP's number patch (SHAPES2_PATCHES); shapes.ts imports nothing of this file
import { clearStarCache } from "./stars";

/** THE switch (REQ-BFG-114), off in this rules version (bb-0.10.0). */
export const SHAPES2: boolean = false;

/** The six shaped plain stat rigs (BRIEF-SHAPES2's table; the numbers are the bench's starting values). No `shape`: the
 *  arrows follow the rarity (RARITY_SHAPE: common I, rare II, epic T), as SHAPES_ITEMS' do. No desc: a stat row (faces.ts). */
export const SHAPES2_DEFS: Readonly<Record<string, ItemDef>> = {
  elbowguard: {
    id: "elbowguard", name: "ELBOW GUARD", kind: "gate", rarity: "common", price: 4, size: 1, foot: "L3", merchant: "ironmonger",
    desc: [], tags: ["PLATE"],
    // step 6 (S6c): SHIELD 8/16/28, four times the brief's starting 2/4/7: at 2 the rig lifted a deck by +0.4 points on day 6 (+2.7 d3,
    // -0.9 d10; k 32 par decks a hero, O/bench/presence-both32.md) and still +1.7 / +2.2 / +1.2 inserted, against SCALE GUARD's +3.7 and
    // PLATE ROLLER's +5.1 on day 6; at 9 (O/bench/presence-sweepB.md) it reads +2.5 / +2.7 on days 6 and 10 (inserted +3.7 / +3.7) beside
    // PLATE ROLLER's +3.9 / +3.2. One arrow forward, from two cells of the L: at a belt's corner it hits 2 tiles
    gate: { slugPlate: 8 },
    levels: { 2: { gate: { slugPlate: 16 } }, 3: { gate: { slugPlate: 28 } } },
  },
  sawbar: {
    id: "sawbar", name: "SAW BAR", kind: "gate", rarity: "common", price: 5, size: 1, foot: "I3", merchant: "gunsmith",
    desc: [], tags: ["FORGE"],
    // run 2 (S6c, then S6b): DMG 9/18/31, an eighth above the brief's starting 8/16/28. At its best spot on a fitting deck (FURNACE,
    // WEAVER, FOUNDRY) 8 was worth 0.89x (d6) and 0.69x (d10) of a WHETSTONE at its best spot (the target 1.0-1.2x, a raise under
    // 0.8x); 10 would meet it (1.11x / 0.86x) but read +19.3 points on day 3 (22 decks, k 64) against TEMPER's +18.4, so 9 (1.0x /
    // 0.78x). One arrow, forward: laid along a straight run it hits 3 tiles
    gate: { flat: 9 },
    levels: { 2: { gate: { flat: 18 } }, 3: { gate: { flat: 31 } } },
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
    // run 2 (S6b): the BURN comes with the first merge, BRANDING IRON's form (FIRSTDAY-1 ruling F7: REVIEW-PLAIN1 D1, REQ-BFG-084.5).
    // The brief's starting ★1 BURN 1 is the floor of a burn and lifted a deck +23.6 (d3, 25 decks) / +12.0 (d6, 54) / +7.1 (d10, 75)
    // points at k 64 (O/bench/presence-k64a.md), over TEMPER's +18.4 and the 10-point line on days 3 and 6: two hits a deck make it
    // two TEMPERs in one slot, and neither a price (7 G: +22.3 / +12.5 / +7.7, sweep B) nor a smaller number can move a burn of 1.
    // So ★1 is DMG 10 (cut from the burn), ★2 DMG 20 + BURN 1, ★3 DMG 35 + BURN 2. Two arrows, left and right, from the L's
    // outside edges: round a bend it hits up to 4 tiles
    gate: { flat: 10 },
    levels: { 2: { gate: { flat: 20, burn: 1 } }, 3: { gate: { flat: 35, burn: 2 } } },
  },
  jawcrusher: {
    id: "jawcrusher", name: "JAW CRUSHER", kind: "gate", rarity: "rare", price: 6, size: 1, foot: "2x2", merchant: "scrapper",
    desc: [], tags: ["FORGE", "BURST"],
    // run 2 (S6c): DMG 20/42/70, two thirds above the brief's starting 12/25/42 (12 was worth 0.69x / 0.59x of a GRINDSTONE at its
    // best spot on a fitting deck on days 6 / 10; at 20, 1.15x / 0.99x). The guard's room is wide (at 15: +11.3 / +5.7 / +3.3 points
    // on days 3 / 6 / 10 against 18.4 / 10 / 10, k 64): a slug on one belt meets only that belt's hits, so its hits a deck are
    // worth less than the other shapes'. Two arrows, left and right, from both cells of each side: between two belts two cells
    // apart, 4 hits
    gate: { flat: 20 },
    levels: { 2: { gate: { flat: 42 } }, 3: { gate: { flat: 70 } } },
  },
  pickaxe: {
    id: "pickaxe", name: "PICKAXE", kind: "gate", rarity: "epic", price: 8, size: 1, foot: "T4", merchant: "quartermaster",
    desc: [], tags: ["FORGE", "BURST"],
    // run 2 (S6c, then S6b): DMG 15/30/51, a fourteenth above the brief's starting 14/28/48 (14 was worth 0.72x / 0.64x of a GRINDSTONE at
    // its best spot on a fitting deck on days 6 / 10). 17 would have met 0.8x but a free copy lifted a deck +20.9 points on day 3 (32
    // decks, the holders being 7, k 64) against TEMPER's +18.4 (inserted +15.3), so 15: held short of 0.8x by the guard's day 3.
    // Three arrows (forward, left, right), from the T's outside edges: belt on three sides, up to 7 hits
    gate: { flat: 15 },
    levels: { 2: { gate: { flat: 30 } }, 3: { gate: { flat: 51 } } },
  },
};

/**
 * SHAPES2's number patches on LIVE pieces (run 2; BRIEF-SHAPES2 S6b, PLAIN-1F's REPORT section 10 call "buff NAIL STRIP if it is weak
 * per gold, within the guard"). NAIL STRIP is SHAPES-1's, live since 0.9.9 (shapes.ts SHAPES_ITEMS: DMG 12/25/40), so its new
 * numbers live behind this switch: while SHAPES2 is on its stars read DMG 16/33/53 (a third more; per gold it lifted a deck less than
 * WHETSTONE and TEMPER on every day), and with SHAPES2 off its own numbers stand byte for byte (the pins). The patch is written on
 * the very def object SHAPES_ITEMS holds (shapes.ts setShapes puts that object in ITEMS and takes it out), so a SHAPES toggle that
 * leaves SHAPES2 as it is never loses the patch.
 */
export const SHAPES2_PATCHES: Readonly<Record<string, Pick<ItemDef, "gate" | "levels">>> = {
  nailstrip: { gate: { flat: 16 }, levels: { 2: { gate: { flat: 33 } }, 3: { gate: { flat: 53 } } } },
  // S6b: SPIKE RAIL (SHAPES-1, DMG 10/20/35, 6 G) lifted a deck +21.2 (16 decks) / +9.2 (29) / +6.5 (38) points on days 3 / 6 / 10 at
  // k 64 (O/bench/presence-k64a.md), over TEMPER's +18.4 on day 3 and at the edge of 10 on day 6; its three hits a deck make it
  // three WHETSTONEs of 10, and a price does not move a lift. ★1 cut a fifth, the ladder with it: 8/16/28 (off, 10/20/35 byte for byte)
  spikerail: { gate: { flat: 8 }, levels: { 2: { gate: { flat: 16 } }, 3: { gate: { flat: 28 } } } },
};
/** Each patched def's own numbers, kept at the first swap, so a swap back puts exactly them back. */
const PATCH_BASE = new Map<string, Pick<ItemDef, "gate" | "levels">>();

/** The patches to the state `on` says: SHAPES2_PATCHES' numbers or the def's own, on the def object SHAPES_ITEMS holds. */
function swapPatches(on: boolean): void {
  for (const [id, p] of Object.entries(SHAPES2_PATCHES)) {
    const d = SHAPES_ITEMS[id] as ItemDef;
    if (!PATCH_BASE.has(id)) PATCH_BASE.set(id, { gate: d.gate, levels: d.levels });
    const to = on ? p : PATCH_BASE.get(id)!;
    d.gate = to.gate;
    d.levels = to.levels;
  }
}

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

/** Turn the six on or off: add their defs to ITEMS (after every other def) or delete them, swap the patched numbers of the live
 *  piece (NAIL STRIP, SHAPES2_PATCHES) and clear the star cache. Setting the state it already has does nothing. */
export function setShapes2(on: boolean): void {
  if (on === s2On) return;
  const items = ITEMS as Record<string, ItemDef>;
  for (const id of SHAPES2_IDS) {
    if (on) items[id] = SHAPES2_DEFS[id];
    else delete items[id];
  }
  swapPatches(on);
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

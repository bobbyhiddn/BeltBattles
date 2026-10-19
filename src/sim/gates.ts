// GATES-1 (REQ-BFG-052, REQ-BFG-057; BRIEF-GATES1 G1, G2): THE GATES' RETURN, behind one switch.
//
// The operator, 2026-10-04: "I think gates should make a come back. Something a belt can attach to and it can have its own
// belt path. Basically a converter module that can add powerful effects at the cost of processing speed." Since 0.6.2
// (BELTSIDE) every gate stands BESIDE the belt as a RIG; nothing stands ON a belt. These are the three that do, the first
// pieces of kind "converter" (player-facing family GATE, type line RARE GATE; not kind "gate": beltside.ts
// migrateInlineGates moves every kind "gate" off a belt tile at every load). Each is 1x1, stands on one tile of a belt,
// takes slugs in and puts slugs out, and spends 1 whole second a conversion (the cost of its power):
//  - FUSER        (rare,   6 G, tinker):    2 slugs in, 1 out that deals both, + 50% / 75% / 150% (the fused slug rides on as two; ★3 raised from the brief's +100% by the day-10 read, G7 a);
//  - SCATTER MILL (common, 4 G, tinker):    1 slug in, 3 pellets out, each at 50% / 60% of its DMG (4 pellets at 50% at ★3);
//  - SMELTER      (rare,   5 G, alchemist): 1 in, 1 out, the slug gains +2 / +5 / +8 BURN (★1 cut from the brief's +3 by the presence guard, G7).
// The numbers are the brief's starting values; the bench (tools/gates1) and the presence guard set the shipped ones. They
// merge like any module and sell at sellValue (stars.ts fusible; content.ts sellValue). What a conversion does is
// src/sim/convert.ts (the engine, one function per payload rule); where a gate may stand, and drop-to-split, is G3's.
//
// THE SWITCH: GATES (false), in SHAPES2's form (shapes2.ts): gatesRules(), setGates(on) and withGates(fn, on = true), which
// puts the switch back even on a throw. While it is on, the three are in ITEMS, after every other def (so the catalogue's
// order and every older def are as before), and stars.ts's star cache is cleared at each swap; while it is off they are
// not in ITEMS at all, so nothing sees them: no pool, shop, offer, drop, LAST CHANCE card, stand-in, captain, validator
// acceptance (rulesGate.ts gatesGateProblem: GATES_RULES), text sheet, save or render path. With it off the game plays byte
// for byte (fp.sh IDENTICAL, parBench 145416d1). The release's bump (the rules release after BUMP-1E) turns it on.
//
// Shared, pure and dependency-light (no DOM, and no deck.ts: deck.ts loads this file): the client, the server and the
// tests read the same defs.

import { ITEMS, type ItemDef } from "./content";
import { clearStarCache } from "./stars";

/** THE switch (REQ-BFG-052): on since BUMP-1F (rules bb-0.13.0, src/net/rulesGate.ts GATES_RULES); it was off until the release's bump. */
export const GATES: boolean = true; // BUMP-1F: was false

/** The three gates (BRIEF-GATES1's table; the numbers are the bench's starting values). No `shape`: a converter has no
 *  arrows. No desc: the faces build the gate's own line from these numbers (faces.ts, G4). */
export const GATES_DEFS: Readonly<Record<string, ItemDef>> = {
  fuser: {
    id: "fuser", name: "FUSER", kind: "converter", rarity: "rare", price: 6, size: 1, merchant: "tinker",
    desc: [], tags: ["FORGE", "BURST"],
    // 2 slugs in, 1 out: it carries both slugs' DMG and rides on as two (convert.ts fusePayload), x1.5 / 1.75 / 2.5 of that
    converter: { how: "fuse", in: 2, out: 1, secs: 1, bonus: 50 },
    levels: { 2: { converter: { bonus: 75 } }, 3: { converter: { bonus: 150 } } }, // ★3 +150%: at +100% the FUSER read -2.1 (±2.7) on BASTION on day 10 at its best spot (k 96, O/bench/spots-fuser-d10-k96-*), under the 0 the brief asks
  },
  scattermill: {
    id: "scattermill", name: "SCATTER MILL", kind: "converter", rarity: "common", price: 4, size: 1, merchant: "tinker", // G5 lever (a): the TINKER rides most caravans and sells few commons (bench O/bench/offers-lever-*)
    desc: [], tags: ["SWARM"],
    // 1 slug in, 3 pellets out at half its DMG each (SPLITTER's copy rule: convert.ts pelletPayloads); ★3 four pellets
    converter: { how: "pellet", in: 1, out: 3, secs: 1, share: 50 },
    levels: { 2: { converter: { share: 60 } }, 3: { converter: { out: 4, share: 50 } } },
  },
  smelter: {
    id: "smelter", name: "SMELTER", kind: "converter", rarity: "rare", price: 5, size: 1, merchant: "alchemist",
    desc: [], tags: ["FORGE"],
    // 1 in, 1 out: the slug gains BURN, the field a burn rig's hit adds (convert.ts smeltPayload)
    converter: { how: "smelt", in: 1, out: 1, secs: 1, burn: 2 }, // ★1 +2: the brief's +3 read +12 to +37 points on day 3 (presence bench, O/bench/presence-k96-*), over the guard of 10
    levels: { 2: { converter: { burn: 5 } }, 3: { converter: { burn: 8 } } },
  },
};

/** The three ids, in the order they join ITEMS. */
export const GATES_IDS: readonly string[] = Object.keys(GATES_DEFS);

/**
 * THE OFFER LEVER (BRIEF-GATES1 G5; REQ-BFG-052: the operator must actually meet gates in a run). The bar, on every hero: the
 * median run sees at least 3 gate cards across its shops, and at least 75% of runs see at least 1 by day 5. The draw alone is
 * under it (GATES on, minStock 0, seeds 1-3000: median 1, 47.7% by day 5). Lever (a), the merchants: the SCATTER MILL is the
 * TINKER's (the merchant that rides in most shops, and sells few commons); it alone is still under (median 1, 55.7% by day 5).
 * Lever (b), the per-run draw (src/game/wares.ts holdGates), in SHAPES2_ODDS' form: while GATES is on, the run's wares always
 * hold at least `minStock` of the three. At 2 it is under (median 2, 58.8% by day 5 with the SCATTER MILL at the tinker); at 3
 * it passes on every hero (seeds 1-300: median 3, 81.7% by day 5, 54.3% see 3 or more; seeds 1-3000: median 3, 83.3%, 57.4%;
 * O/bench/offers-lever-*). Off, or at 0, the draw is exactly as it was. The bench (tools/gates1/offers.ts) sets it for its
 * trials (--k); the shipped value is the one below.
 */
export const GATES_ODDS: { minStock: number } = { minStock: 3 };

let gatesOn = false;

/** Are the three gates in the game now (GATES, or a withGates call)? */
export function gatesRules(): boolean {
  return gatesOn;
}

/** Is `id` one of the three (whatever the switch says)? */
export function isGatesPiece(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(GATES_DEFS, id);
}

/** Turn the three on or off: add their defs to ITEMS (after every other def) or delete them, and clear the star cache.
 *  Setting the state it already has does nothing. */
export function setGates(on: boolean): void {
  if (on === gatesOn) return;
  const items = ITEMS as Record<string, ItemDef>;
  for (const id of GATES_IDS) {
    if (on) items[id] = GATES_DEFS[id];
    else delete items[id];
  }
  clearStarCache();
  gatesOn = on;
}

/** Run `fn` with the three on (or off), then put the switch back as it was, even if `fn` throws (withShapes2's form). */
export function withGates<T>(fn: () => T, on = true): T {
  const was = gatesOn;
  setGates(on);
  try {
    return fn();
  } finally {
    setGates(was);
  }
}

setGates(GATES);

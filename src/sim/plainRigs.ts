// PLAIN-1 (REQ-BFG-084; BRIEF-PLAIN1, cap's rulings P1-P3; PIECES-1 section 3, cap's go ~20:00Z 2026-10-10): THE PLAIN
// STAT RIGS, behind one switch.
//
// A plain stat rig is a rig whose whole card is its arrows and one stat row, with no ability line. A `+` stat on a rig is
// what each hit gives: each arrow that points at a belt tile gives its stats to every slug on that tile, one arrow one hit
// (deck.ts rigHits, Battle.applyHit), as WHETSTONE's and TEMPER's hits do. The first six are one cell (size 1) and turn
// like every rig; their arrows follow REQ-BFG-025 (common I; a rare II, or L as GALVANIC COIL takes it):
//  - RASP (common, 3 G, I): + DMG and + BURN on each slug it hits (WHETSTONE's flat, TEMPER's burn).
//  - SPARK GAP (common, 3 G, I): + STUN seconds on each slug it hits (GateEffect.stun). The slug's STUN is the shock rule
//    every STUN source keeps (Battle.impact: the enemy part it lands on stops that long; a bare-hull hit stops nothing;
//    TOLLBOOTH, MANTLET, BRACE FRAME and FLAK SCREEN treat it as any STUN). The seconds add up on the slug.
//  - SCALE GUARD (common, 3 G, I): + PLATE and + DMG on each slug it hits. The PLATE rides the slug (Payload.plate) and
//    your ship gains it when the slug reaches your gun, by BASTION's bulwark rule (P2: races/bastion.ts plateFor and
//    plateOnLoad: S(day), the cap, BULWARK OATH). PLATE ROLLER keeps its own rule.
//  - BALLAST (common, 3 G, I): a carrier stat (GateEffect.maxHullPct). While it works (at least one arrow on a belt tile:
//    the IDLE rule, read from the layout at the fight's start) your ship's max hull is x (1 + the working BALLASTs' %
//    summed), on top of the base's max hull, whatever the switches make it (P3: Battle.makeSide, after HULL_SCALE's line),
//    rounded down.
//  - GRINDSTONE (rare, 5 G, II): + DMG.
//  - BRANDING IRON (rare, 5 G, L): + DMG and + BURN (★1 DMG 10: the presence bench's first cut, kept; its def below).
// A star raises only the numbers (ItemDef.levels); they merge and sell as every rig does (stars.ts, content.ts sellValue).
//
// THE SWITCH: PLAIN_RIGS (false), in ladderFix.ts's form (a content patch): plainRigsRules(), setPlainRigs(on) and
// withPlainRigs(fn, on = true), which puts the switch back even on a throw. While it is on, the six are in ITEMS, after
// every base def (so the catalogue's order and every older def are as before), and stars.ts's star cache is cleared at each
// swap; while it is off they are not in ITEMS at all, so nothing sees them: no pool, shop, offer, drop, LAST CHANCE card,
// stand-in, captain, validator acceptance, text sheet or save (an upload or save naming one names an unknown piece). With
// it off bb-0.9.7 plays byte for byte (fp.sh IDENTICAL, parBench 8cde5ed0). BUMP-1D turns it on with 1D's rules bump.
//
// Shared, pure and dependency-light (no DOM): the client, the server and the tests read the same defs.

import { ITEMS, type ItemDef } from "./content";
import { clearStarCache } from "./stars";

/** THE switch (REQ-BFG-084), off in this rules version (bb-0.9.7). */
export const PLAIN_RIGS: boolean = false;

/** The six plain stat rigs (BRIEF-PLAIN1's table; the numbers are the bench's starting values). */
export const PLAIN_DEFS: Readonly<Record<string, ItemDef>> = {
  rasp: {
    id: "rasp", name: "RASP", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist", shape: "I",
    desc: [], tags: ["FORGE"],
    gate: { flat: 10, burn: 1 },
    levels: { 2: { gate: { flat: 20, burn: 2 } }, 3: { gate: { flat: 35, burn: 3 } } },
  },
  sparkgap: {
    id: "sparkgap", name: "SPARK GAP", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "scrapper", shape: "I",
    desc: [], tags: ["HARASS"],
    gate: { stun: 1 },
    levels: { 2: { gate: { stun: 2 } }, 3: { gate: { stun: 3 } } },
  },
  scaleguard: {
    id: "scaleguard", name: "SCALE GUARD", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "ironmonger", shape: "I",
    desc: [], tags: ["PLATE", "FORGE"],
    gate: { slugPlate: 3, flat: 10 },
    levels: { 2: { gate: { slugPlate: 7, flat: 20 } }, 3: { gate: { slugPlate: 11, flat: 35 } } },
  },
  ballast: {
    id: "ballast", name: "BALLAST", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "quartermaster", shape: "I",
    desc: [], tags: ["PLATE"],
    gate: { maxHullPct: 8 },
    levels: { 2: { gate: { maxHullPct: 16 } }, 3: { gate: { maxHullPct: 25 } } },
  },
  grindstone: {
    id: "grindstone", name: "GRINDSTONE", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "tinker", shape: "II",
    desc: [], tags: ["FORGE", "BURST"],
    gate: { flat: 25 },
    levels: { 2: { gate: { flat: 55 } }, 3: { gate: { flat: 90 } } },
  },
  brandingiron: {
    id: "brandingiron", name: "BRANDING IRON", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "alchemist", shape: "L",
    desc: [], tags: ["FORGE"],
    // ★1 DMG 15 -> 10 by the presence bench's guard (REQ-BFG-084.5; the Prime's oracle 0ef955b79d105092: a rig breaks it
    // on a day when its pooled holder lift is over 10 points AND over the strongest base rig's on the same bench and day,
    // TEMPER's d3 +24.2 / d6 +10.9). At 15 it lifted d3 +37.9, d6 +12.6; at 10, d3 +28.4, d6 +10.6. A second cut to 5
    // (d3 +30.2, d6 +10.6) bought nothing, so cap's run-2 ruling R2-1 put ★1 back to 10 (its 2 BURN at a bend drive d3;
    // cap decides any next cut in the review). BURN 1, ★2/★3 and the 5 G price as the brief's table (output-plain1/bench,
    // REPORT.md section 5)
    gate: { flat: 10, burn: 1 },
    levels: { 2: { gate: { flat: 30, burn: 2 } }, 3: { gate: { flat: 50, burn: 3 } } },
  },
};

/** The six ids, in the order they join ITEMS. */
export const PLAIN_RIG_IDS: readonly string[] = Object.keys(PLAIN_DEFS);

let prOn = false;

/** Are the plain stat rigs in the game now (PLAIN_RIGS, or a withPlainRigs call)? */
export function plainRigsRules(): boolean {
  return prOn;
}

/** Is `id` one of the six plain stat rigs (whatever the switch says)? */
export function isPlainRig(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PLAIN_DEFS, id);
}

/** Turn the plain stat rigs on or off: add the six defs to ITEMS (after every base def) or delete them, and clear the star
 *  cache. Setting the state it already has does nothing. */
export function setPlainRigs(on: boolean): void {
  if (on === prOn) return;
  for (const id of PLAIN_RIG_IDS) {
    if (on) ITEMS[id] = PLAIN_DEFS[id];
    else delete ITEMS[id];
  }
  clearStarCache();
  prOn = on;
}

/** Run `fn` with the plain stat rigs on (or off), then put the switch back as it was, even if `fn` throws. */
export function withPlainRigs<T>(fn: () => T, on = true): T {
  const was = prOn;
  setPlainRigs(on);
  try {
    return fn();
  } finally {
    setPlainRigs(was);
  }
}

setPlainRigs(PLAIN_RIGS);

// 0.8.0 A1 (REQ-BFG-022): P1's 15 wave-3 ITEMS entries, copied as they stand in P1's src/sim/content.ts at its M1 commit
// 9fa6fcf (WAVE3_ITEMS; ref/p1-content-9fa6fcf.ts.txt), for the dev pages and tests that need a def to draw a wave-3 part
// through the game's deck and gun entry points (machinery.ts and cruiser.ts read ITEMS). Never in src: on this branch the
// game has no wave-3 def, and I1 brings P1's own. installWave3Defs() adds them to ITEMS in memory the way P1's switch keeps
// them while dormant (own properties, not enumerable, so no listing of the catalogue sees them); removeWave3Defs() takes
// them out again. Their effect fields (plate, gauge, pincer, ...) are P1's; nothing here reads them.

import { ITEMS, type ItemDef } from "../src/sim/content";

type Def = Record<string, unknown> & { id: string };

export const P1_WAVE3_ITEMS: Record<string, Def> = {
  plateroller: {
    id: "plateroller", name: "PLATE ROLLER", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "ironmonger", shape: "I",
    desc: ["ROLLS PLATING ONTO", "YOUR HULL FOR EACH", "PAYLOAD IT HITS."], tags: ["PLATE", "SWARM"],
    gate: { plate: 5 },
    levels: { 2: { gate: { plate: 11 } }, 3: { gate: { plate: 17 } } },
  },
  twingauge: {
    id: "twingauge", name: "TWIN GAUGE", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "tinker", shape: "I",
    desc: ["ADDS DAMAGE, MORE", "ON A BELT MATCHED", "TO ITS TWIN."], tags: ["TWIN", "FORGE"],
    gate: { gauge: { flat: 10, matched: 30 } },
    levels: { 2: { gate: { gauge: { flat: 22, matched: 66 } } }, 3: { gate: { gauge: { flat: 35, matched: 105 } } } },
  },
  pincer: {
    id: "pincer", name: "PINCER", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist", shape: "I",
    desc: ["ADDS DAMAGE, MORE", "FOR EACH RIG ON", "ITS TILE."], tags: ["FORGE"],
    gate: { pincer: { flat: 10, each: 20, max: 3 } },
    levels: { 2: { gate: { pincer: { flat: 22, each: 44, max: 3 } } }, 3: { gate: { pincer: { flat: 35, each: 70, max: 3 } } } },
  },
  braceframe: { // NUM-4 (REQ-BFG-047, NUM-3 F2): STUNS in the game's desc (was STALLS); the copy follows the desc
    id: "braceframe", name: "BRACE FRAME", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "ironmonger", shape: "L",
    // TXT-AZ (REQ-BFG-070; REVIEW-TXT096 Q2): the copy follows the game's rewritten desc (was "... SOONER STILL PLATED.")
    desc: ["ENEMY STUNS ON THE", "BELT TILES IT HITS", "END SOONER."], tags: ["PLATE", "HARASS"],
    gate: { brace: { mul: 0.5, plated: 0.25 } },
    levels: { 2: { gate: { brace: { mul: 0.3, plated: 0.15 } } }, 3: { gate: { brace: { mul: 0.15, plated: 0.05 } } } },
  },
  twinlatch: {
    id: "twinlatch", name: "TWIN LATCH", kind: "gate", rarity: "rare", price: 6, size: 1, merchant: "tinker", shape: "II",
    desc: ["HOLDS A PAYLOAD FOR", "ITS OTHER BELT, THEN", "LETS BOTH GO."], tags: ["TWIN", "TEMPO"],
    gate: { latch: { hold: 1, flat: 10 } },
    levels: { 2: { gate: { latch: { hold: 1, flat: 22 } } }, 3: { gate: { latch: { hold: 1, flat: 35 } } } },
  },
  stoker: {
    id: "stoker", name: "STOKER", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "scrapper", shape: "II",
    desc: ["FACTORIES ITS ARROWS", "POINT AT WORK", "FASTER."], tags: ["TEMPO", "SWARM"],
    gate: { stoke: 0.2 },
    levels: { 2: { gate: { stoke: 0.44 } }, 3: { gate: { stoke: 0.7 } } },
  },
  platebreaker: {
    id: "platebreaker", name: "PLATE BREAKER", kind: "gate", rarity: "epic", price: 7, size: 1, merchant: "scrapper", shape: "T",
    desc: ["TURNS YOUR HULL'S", "PLATING INTO", "PAYLOAD DAMAGE."], tags: ["PLATE", "FORGE"],
    gate: { breaker: { flat: 40, floor: 10 } },
    levels: { 2: { gate: { breaker: { flat: 88, floor: 22 } } }, 3: { gate: { breaker: { flat: 140, floor: 35 } } } },
  },
  shieldwall: { // SUS-B (cap's answer 3 to SUSTAIN-1): IRON WALL in the game (the id stays); the copy follows the name
    id: "shieldwall", name: "IRON WALL", kind: "gate", rarity: "legendary", price: 10, size: 1, merchant: "ironmonger", shape: "X",
    desc: ["PLATES YOUR HULL,", "AND HITS HARDER", "WHILE WELL PLATED."], tags: ["PLATE", "FORGE"],
    gate: { plate: 10, plated: { min: 120, flat: 30 } },
    levels: { 2: { gate: { plate: 22, plated: { min: 120, flat: 66 } } }, 3: { gate: { plate: 35, plated: { min: 120, flat: 105 } } } },
  },
  twinmould: {
    id: "twinmould", name: "TWIN MOULD", kind: "factory", rarity: "rare", price: 7, size: 2, merchant: "tinker",
    desc: ["CASTS PLAIN SLUGS", "SEVERAL AT A TIME,", "ONE BELT EACH."], tags: ["TWIN", "SWARM"], // bb-0.8.3 (M4), as content.ts
    // bb-0.8.3 (REQ-BFG-042): belt slots by stars (no outputs), its pour 2 / 2 / 3 (P1 wrote outputs 2 / 2 / 3)
    factory: { ammo: "plain", speed: 17, twin: true, pour: 2 }, // base 3: the plain slug's
    levels: { 2: { factory: { speed: 19, base: 50 } }, 3: { factory: { speed: 21, base: 60, pour: 3 }, perk: "THIRD SPRUE" } },
  },
  armorpress: {
    id: "armorpress", name: "ARMOR PRESS", kind: "factory", rarity: "epic", price: 8, size: 2, merchant: "ironmonger",
    desc: ["PRESSES PLATING ONTO", "YOUR HULL AND STAMPS", "PLAIN SLUGS."], tags: ["PLATE", "SWARM"],
    // bb-0.8.3 (REQ-BFG-042): belt slots by stars (P1 wrote outputs 1)
    factory: { ammo: "plain", speed: 19, plate: { every: 3, amount: 30 } }, // base 3: the plain slug's
    levels: { 2: { factory: { speed: 21, plate: { every: 3, amount: 66 } } }, 3: { factory: { speed: 25, plate: { every: 3, amount: 105 } } } },
  },
  anvil: {
    id: "anvil", name: "ANVIL BREECH", kind: "core", rarity: "rare", price: 6, size: 1, merchant: "ironmonger",
    desc: ["SHOTS HIT HARDER", "THE MORE PLATING", "YOUR HULL HOLDS."], tags: ["PLATE", "BURST"],
    core: { routine: "anvil", anvilFlat: 25, perPlate: 1 },
    levels: { 2: { core: { anvilFlat: 55, perPlate: 2.2 } }, 3: { core: { anvilFlat: 88, perPlate: 3.5 } } },
  },
  steambreech: {
    id: "steambreech", name: "STEAM BREECH", kind: "core", rarity: "common", price: 4, size: 1, merchant: "gunsmith",
    desc: ["THE TURRET FIRES", "FASTER WHILE YOUR", "HULL IS PLATED."], tags: ["PLATE", "TEMPO"],
    core: { routine: "steam", steamPlated: 35, steamBare: 10 },
    levels: { 2: { core: { steamPlated: 70, steamBare: 20 } }, 3: { core: { steamPlated: 110, steamBare: 30 } } },
  },
  twintrigger: {
    id: "twintrigger", name: "TWIN TRIGGER", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "gunsmith",
    // TXT-AZ (REQ-BFG-070; REVIEW-TXT096 Q2): the copy follows the game's rewritten desc (was "... A SHORTER LOAD TIME.")
    desc: ["PAIRED LOADS IN", "THIS TURRET HIT", "HARDER."], tags: ["TWIN", "TEMPO"],
    mod: { pairBonus: 0.25, windowTime: -0.25 },
    levels: { 2: { mod: { pairBonus: 0.55, windowTime: -0.4 } }, 3: { mod: { pairBonus: 0.88, windowTime: -0.55 } } },
  },
  spallcatcher: {
    id: "spallcatcher", name: "SPALL CATCHER", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "quartermaster",
    desc: ["HITS YOUR SHIP TAKES", "CHARGE THIS TURRET'S", "NEXT SHOT."], tags: ["PLATE", "BURST"],
    mod: { spall: { every: 40, add: 10, max: 80 } },
    levels: { 2: { mod: { spall: { every: 40, add: 22, max: 176 } } }, 3: { mod: { spall: { every: 40, add: 35, max: 280 } } } },
  },
  seamwelder: {
    id: "seamwelder", name: "SEAM WELDER", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "arcane",
    desc: ["PAIRS THIS TURRET", "TAKES PLATE YOUR", "HULL."], tags: ["TWIN", "PLATE"],
    mod: { seam: { pair: 10, lone: 2 } },
    levels: { 2: { mod: { seam: { pair: 22, lone: 4 } } }, 3: { mod: { seam: { pair: 35, lone: 7 } } } },
  },
};

/** P1's wave-3 ids, in DESIGN-wave3 3.1's order. */
export const P1_WAVE3_IDS: readonly string[] = Object.keys(P1_WAVE3_ITEMS);

/** Put P1's 15 defs into ITEMS in memory (own properties, not enumerable: P1's dormant switch). Dev pages and tests only. */
export function installWave3Defs(): void {
  for (const id of P1_WAVE3_IDS) {
    Object.defineProperty(ITEMS, id, { value: P1_WAVE3_ITEMS[id] as unknown as ItemDef, enumerable: false, writable: true, configurable: true });
  }
}

/** Take them out again. */
export function removeWave3Defs(): void {
  for (const id of P1_WAVE3_IDS) delete (ITEMS as Record<string, ItemDef>)[id];
}

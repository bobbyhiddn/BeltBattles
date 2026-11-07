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
import { WAVE3_ITEMS, onSetWave3, type ReadSpec } from "./content"; // SCALE-2c (REQ-BFG-098): the reworks' wave-3 hook, the reader lines
import type { Build } from "./deck";
import { clearStarCache, effectAt, starsOf } from "./stars";
import { ITEM_RANK, addRanked, registerRanked } from "./itemsKeep"; // BUMP-1F P2 (F1): the canonical order of the ids a switch adds
import { livesCap, startLives } from "./hearts"; // SCALE-2c M0 (REQ-BFG-098): the RETUNE-1 hearts swap (startHearts)
// SCALE-2c (REQ-BFG-098): ladderFix.ts swaps QUENCH TANK's def too (its ★1 40 a BURN) and builds its fixed def from what
// ITEMS holds when it loads; loading it first means the switch (on at this module's load once BUMP-1E flips it) always
// builds KINDLING from the ladder-fixed def and never the reverse (a ladder patch on KINDLING). ladderFix.ts imports only
// content.ts and stars.ts: no cycle
import "./ladderFix";

/** THE switch (REQ-BFG-098, REQ-BFG-110): on from bb-0.12.0 (BUMP-1E turned it on; SCALE_RULES in rulesGate.ts is the first rules
 *  version with the twelve; older records keep the base's pieces whatever the switch). Was off in bb-0.10.0 and bb-0.11.0. */
export const SCALE_RIGS: boolean = true;

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
  // SCALE-2c (REQ-BFG-098; BRIEF-SCALE2c section 2; REPORT-SCALE1 3.1-3.2): the five reworks, VENOM DRIP's form: id, rarity,
  // price, merchant, size, foot, shape (the arrows) and tags kept; the old effect goes and the reader line comes; the desc
  // (the old effect's catalogue words, drawn by no face) goes with it. Star numbers are REPORT-SCALE1 3.1's (SCALE-2e tunes).
  // KINDLING (was QUENCH TANK): +3 / +5 / +8 DMG for each BURN on the foe at the hit; QUENCH TANK's spend goes
  quench: (b) => ({ ...b, name: "KINDLING", desc: [], ...reader("foeBurn", "dmg", [3, 5, 8]) }),
  // PRESSURE BREECH: MAX 5 dropped: its own perQueued term, uncapped (cores.ts pressureBonus reads no maxCount as no cap),
  // not a `reads` line: the term is the fire event's C11 `add` already (Battle.fireCore queuedAdd), the turret class
  // factor k still scales it (cores.ts scaleCore, "today's numbers" on a heavy gun), and it joins the shot before step 5's
  // % (TWIN TRIGGER, FINISHER RAM, the runes), outside p.flat, so DRAKE NOZZLE (step 3, another core) never converts it.
  // NEVER JAMS (noJam) stays: the brief names only MAX 5 as going (REPORT Findings)
  // SCALE-2e E4 (REQ-BFG-098 098.3): ★2's perQueued 26 -> 14 ("today's numbers" 12 / 26 / 42 -> 12 / 14 / 42). The pairs bench (pool 150, 41 decks with
  // SPLITTER) read the reader's lift +17.2 (SE 2.1) on day 6 against TEMPER's +6.5 (G1); see REPORT-SCALE2e section 6
  // SCALE-2e run 2, second step (REQ-BFG-098 098.3; G1 and G2): 12 / 14 / 42 -> 8 / 13 / 42. The larger reads at 12 / 14 / 42 (pool 150) were
  // +12.3 (SE 1.9) on day 3 against TEMPER's +9.5, +10.7 (1.4) on day 6 against +6.5 and +11.0 (2.1) on day 9: over the G1 line on both days
  // and strongest on day 3 (G2: "a reader strongest on day 3 has its 1-star cut"); the same decks read +9.4 (1.6) at ★1 8 and +9.8 (1.3) at ★2 13
  // BUMP-1E C4 (carry-over 2: "a lower 1-star"): ★1 8 -> 5. In the merged world (PLAIN_RIGS, SHAPES2, LONG_RUN, the flip) the day-3 pairs bench
  // (tools/scale2e/pairs.ts, pool 150, 103 decks with SPLITTER) read the reader's lift +11.6 (SE 1.4) at ★1 8 against TEMPER's +9.4: G1 broken
  // (over 10 and over TEMPER's + 1.5); the candidates on the same decks: ★1 6 +10.0 (1.3), 5 +9.1 (1.2), 4 +7.8 (1.1)
  pressure: (b) => {
    const { maxCount: _cap, ...core } = b.core!;
    void _cap;
    const lv2 = b.levels![2]!;
    return { ...b, desc: [], core: { ...core, perQueued: 5 }, levels: { ...b.levels, 2: { ...lv2, core: { ...lv2.core, perQueued: 13 } } } };
  },
  // IRON WALL: +5 / +11 / +17 DMG for each whole 10 PLATE you have (day-1 units: Battle.readCount ownPlate); its own
  // plating and the 120 step go
  // SCALE-2e E4 (REQ-BFG-098 098.3; the pairs bench, tools/scale2e/pairs.ts): ★1 / ★2 were 5 / 11, now 3 / 6 (★3 17 kept). With the
  // final GUARD's RIVET HOARD (180 SHIELD at the start) the reader's lift over the same deck was +13.2 / +13.1 / +13.2 points on
  // days 3 / 6 / 9 (G1: over 10 and over TEMPER's +9.2 / +6.5, and G2: strongest on day 3); at 3 / 6 / 17 it is +7.6 / +8.4 / +13.2
  // (with 2 PLATE ROLLER also: +7.9 / +9.2 / +11.8), every bar held (REPORT-SCALE2e section 6)
  shieldwall: (b) => ({ ...b, desc: [], ...reader("ownPlate", "dmg", [3, 6, 17], 10) }),
  // SPALL CATCHER (a gun part, read at its gun's SHOT): +3 / +7 / +11 DMG for each enemy hit on your ship this fight; the
  // charge (every 40 DMG taken) goes
  // SCALE-2e E4 (REQ-BFG-098 098.3): 3 / 7 / 11 -> 2 / 3 / 7. The reader's lift over the same deck was +12.8 / +18.6 / +15.8 points on
  // days 3 / 6 / 9 against TEMPER's +9.9 / +7.0 (G1 broken on days 3 and 6, the J5 captains' fall notwithstanding); at 2 / 3 / 7 it is
  // +9.3 / +10.2 / +13.1 (REPORT-SCALE2e section 6)
  // SCALE-2e run 2 (REQ-BFG-098 098.3; cap's answer 2): 2 / 3 / 7 -> 1 / 2 / 7. The larger day-6 read (pool 150, 158 decks) was +10.8 (SE 0.9)
  // against TEMPER's +7.3 (over 10 and over TEMPER's: G1); the strict step 1 / 2 / 7 reads +7.5 (0.8) on the same decks
  spallcatcher: (b) => ({ ...b, desc: [], ...readerMod("hitsTaken", "dmg", [1, 2, 7]) }),
  // POWDER KEG: +3 / +7 / +11 DMG for each of its own hits this fight, this one included; the 12 s fuse (kegTick) goes
  // SCALE-2e E4 (REQ-BFG-098 098.3): 3 / 7 / 11 -> 2 / 5 / 11. +12.8 points on day 6 against TEMPER's +6.9 broke G1; at 2 / 5 / 11 the
  // reader's lift is +6.2 / +9.8 / +9.8 on days 3 / 6 / 9
  keg: (b) => ({ ...b, desc: [], ...reader("ownHits", "dmg", [2, 5, 11]) }),
};

/** SCALE-2c (REQ-BFG-098): a rig's reader line at its three stars: `gate.reads` at ★1 and `levels` 2 and 3, each the whole
 *  `reads` object (stars.ts effectAt merges a level's gate fields one by one, so a level writes every field). */
function reader(count: ReadCount, give: ReadSpec["give"], each: readonly [number, number, number], per?: number): Pick<ItemDef, "gate" | "levels"> {
  const r = (n: number): ReadSpec => ({ count, each: n, ...(per ? { per } : {}), give });
  return { gate: { reads: r(each[0]) }, levels: { 2: { gate: { reads: r(each[1]) } }, 3: { gate: { reads: r(each[2]) } } } };
}

/** SCALE-2c (REQ-BFG-098): a gun part's reader line at its three stars (`mod.reads`, read at its gun's SHOT). */
function readerMod(count: ReadCount, give: ReadSpec["give"], each: readonly [number, number, number]): Pick<ItemDef, "mod" | "levels"> {
  const r = (n: number): ReadSpec => ({ count, each: n, give });
  return { mod: { reads: r(each[0]) }, levels: { 2: { mod: { reads: r(each[1]) } }, 3: { mod: { reads: r(each[2]) } } } };
}

/**
 * SCALE-2c (REQ-BFG-098, REQ-BFG-106 (GRUDGE ROD), REQ-BFG-108 (ROT GAUGE, LEECH COIL); BRIEF-SCALE2c section 2;
 * REPORT-SCALE1 3.1): the seven new scaling rigs, each one cell, arrows by rarity (content.ts RARITY_SHAPE: common I, rare
 * II, epic T), no desc (the face's ability line says it all). They join ITEMS after every other def while the switch is on
 * and leave it while it is off (shapes.ts SHAPES_ITEMS' form), so with SCALE_RIGS off no listing, pool, shop, save path or
 * test sees them. cap's F4: LEECH COIL is a new id (RIVETER stays as it is). Tags (the shop's family hint): each one's
 * nearest live piece's (CINDER MAIL PLATE ROLLER's PLATE and TEMPER's FORGE, ROT GAUGE VENOM DRIP's, LEECH COIL RIVETER's,
 * AEGIS SPIKE the SHIELD pieces' PLATE).
 */
export const SCALE_ITEMS: Readonly<Record<string, ItemDef>> = {
  cindermail: {
    id: "cindermail", name: "CINDER MAIL", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "ironmonger", desc: [], tags: ["FORGE", "PLATE"],
    ...reader("foeBurn", "plate", [2, 3, 5]), // +2 / +3 / +5 PLATE for each BURN on the foe (addPlate: PLATE_CAP)
  },
  rotgauge: {
    id: "rotgauge", name: "ROT GAUGE", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "alchemist", desc: [], tags: ["SWARM", "FORGE"],
    ...reader("foePoison", "dmg", [3, 5, 8]), // +3 / +5 / +8 DMG for each POISON on the foe
  },
  leechcoil: {
    id: "leechcoil", name: "LEECH COIL", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "ironmonger", desc: [], tags: ["SWARM", "PLATE"],
    // HEAL 3 / 4 / 6 times the foe's POISON (heal(): BURN halves it). SCALE-2e run 2 (REQ-BFG-098 098.3; cap's answer 2): was 4 / 5 / 6; the
    // larger day-6 read (pool 150, 160 decks) was +10.3 (SE 0.8) against TEMPER's +6.4 (G1); 3 / 4 / 6 reads +8.7 (0.7) on the same decks
    ...reader("foePoison", "heal", [3, 4, 6]),
  },
  crowdpress: {
    id: "crowdpress", name: "CROWD PRESS", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "tinker", desc: [], tags: ["SWARM", "FORGE"],
    ...reader("beltSlugs", "dmg", [3, 7, 11]), // +3 / +7 / +11 DMG for each slug on its belt (the hit one too)
  },
  aegisspike: {
    id: "aegisspike", name: "AEGIS SPIKE", kind: "gate", rarity: "rare", price: 5, size: 1, merchant: "tinker", desc: [], tags: ["PLATE", "FORGE"],
    ...reader("ownShield", "dmg", [40, 88, 140]), // +40 / +88 / +140 DMG for each SHIELD (the game's WARD) you have
  },
  grudgerod: {
    id: "grudgerod", name: "GRUDGE ROD", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "scrapper", desc: [], tags: ["FORGE"],
    ...reader("heartsLost", "dmg", [6, 13, 21]), // +6 / +13 / +21 DMG for each heart lost this run
  },
  trophychain: {
    id: "trophychain", name: "TROPHY CHAIN", kind: "gate", rarity: "epic", price: 7, size: 1, merchant: "quartermaster", desc: [], tags: ["FORGE", "BURST"],
    // +8 / +12 / +28 DMG for each win this run. SCALE-2e E4 (REQ-BFG-098 098.3): ★2 was 18: +13.9 points on day 6 against TEMPER's +7.8
    // (G1); at 8 / 12 / 28 the reader's lift is +5.2 / +9.4 / +16.8 on days 3 / 6 / 9
    ...reader("wins", "dmg", [8, 12, 28]),
  },
};

/** SCALE-2c: the seven new ids, in the order they join ITEMS. */
export const SCALE_IDS: readonly string[] = Object.keys(SCALE_ITEMS);
registerRanked(ITEM_RANK.scale, SCALE_IDS); // BUMP-1F P2 (F1)

/** SCALE-2c: is `id` one of the seven new scaling rigs (whatever the switch)? */
export function isScalePiece(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(SCALE_ITEMS, id);
}

/** SCALE-2c (REQ-BFG-098): the twelve scaling pieces (BRIEF-SCALE2c section 2's table order): the five reworks, then the
 *  seven new ids. Tests, the text sheet and the screen read it. */
export const SCALE_PIECES: readonly string[] = [
  "quench", "pressure", "shieldwall", "spallcatcher", "keg", "cindermail", "rotgauge", "leechcoil", "crowdpress", "aegisspike", "grudgerod", "trophychain",
];

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
  // SCALE-2c (REQ-BFG-098): the seven new ids join ITEMS after every other def, or leave it (shapes.ts setShapes's form)
  if (on) addRanked(ITEM_RANK.scale, SCALE_ITEMS, SCALE_IDS); // BUMP-1F P2 (F1): at its rank (after SHAPES2's six, before GATES' three), not at the end
  else for (const id of SCALE_IDS) delete items[id];
  clearStarCache();
  scOn = on;
  for (const fn of afterScale) fn(on);
}

// SCALE-2c (REQ-BFG-098): content.ts setWave3 writes WAVE3_ITEMS[id] back into ITEMS for every wave-3 id, IRON WALL and
// SPALL CATCHER among them, so with the switch on a wave-3 toggle (tools/luckReport.ts, tools/wave3.ts) would leave their
// base defs in ITEMS. While the switch is on, put back the switch-on def wherever setWave3 just wrote the base def
// (ladderFix.ts's hook's form). Switch off: nothing.
onSetWave3(() => {
  if (!scOn) return;
  const items = ITEMS as Record<string, ItemDef>;
  let moved = false;
  for (const [id, onDef] of SC_ON) {
    if (items[id] === SC_BASE.get(id) || (WAVE3_ITEMS as Record<string, ItemDef>)[id] === items[id]) {
      items[id] = onDef;
      moved = true;
    }
  }
  if (moved) clearStarCache();
});

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

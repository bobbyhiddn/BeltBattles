// NPC-1 (REQ-BFG-077, REQ-BFG-078): THE NPC DAY and THE DROPS, behind one switch.
//
// THE DAY (REQ-BFG-077): every day runs dawn caravan -> the fight pick (Easy, Medium or Hard, warlordOffer as today; the
// Matriarch holds Hard's slot on days 8-10 until beaten) -> the warlord fight -> the day's seeded event (eventFor, the
// same bag: a 10-day run meets all ten) -> REFIT (the build screen with the caravan parked: no buying, selling or
// rerolling) -> dusk. The fork has no "event only" stop (road.ts pickRoad refuses it). The rules live in road.ts and
// events.ts; the screens in fork/, battle.ts, warlordHud.ts and event/event.ts; save.ts keeps every stage.
//
// THE DROPS (REQ-BFG-078): every warlord win rolls once (rollDrop). The chance is DROP_CHANCE by tier; the part is one
// distinct part of the deck the warlord fought with (items, mods, cores and turrets; SABOTAGE's deck when it was
// sabotaged), drawn by class weight (DROP_WEIGHTS) and evenly within its class. Signature factories, supplies and
// legendary parts never drop (a legendary part is the Matriarch's alone: she keeps paying hers, always, road.ts). The
// roll is seeded from (run seed, day) on its own stream, hashSeed(seed, "warlord-drop", day): never the battle's, the
// shop's, the rune's or an event's, so nothing else a run draws moves, and a reload can't re-roll it. The drop goes to
// cargo at 1 star (road.ts finishWarlord, through gainModule) and replaces Hard's pick of 2.
//
// THE SWITCH: NPC_DAY (false), built as LC-1 built LAST_CHANCE (lc1-accepted src/sim/lastChance.ts): npcDayRules(),
// setNpcDay(on) and withNpcDay(fn, on = true), which puts the switch back even on a throw. While it is off nothing reads
// past it: the fork, the fight, the event, REFIT, the rewards, the save, the snapshot (its `road` field is refused) and
// roadCap are 0.9.7's, byte for byte. AZ-BUMP turns it on with the rules bump.
//
// Shared, pure and dependency-light (no DOM), like lastChance.ts: the client, the server and the tests read the same
// tables.

import { hashSeed, Rng } from "../core/rng";
import { HEROES, ITEMS, type ItemDef } from "./content";
import { turretList, type Build } from "./deck";
import type { Difficulty } from "./rivals";
import { valueOf } from "./stars";

/** THE switch (REQ-BFG-077, REQ-BFG-078), off in this rules version (bb-0.9.7). */
export const NPC_DAY: boolean = false;

let ndOn = false;

/** Is the NPC day in the game now (NPC_DAY, or a withNpcDay call)? */
export function npcDayRules(): boolean {
  return ndOn;
}

/** Turn the NPC day on or off (no content to swap: every rule reads the switch where it acts). */
export function setNpcDay(on: boolean): void {
  ndOn = on;
}

/** Run `fn` with the NPC day on (or off), then put the switch back as it was, even if `fn` throws (withLastChance's form). */
export function withNpcDay<T>(fn: () => T, on = true): T {
  const was = ndOn;
  setNpcDay(on);
  try {
    return fn();
  } finally {
    setNpcDay(was);
  }
}

setNpcDay(NPC_DAY);

// ------------------------------------------------------------------ the drop table (REQ-BFG-078)

/** The chance a warlord win drops a part, by tier (the operator's shape: higher tiers drop more often). */
export const DROP_CHANCE: Readonly<Record<Difficulty, number>> = { easy: 0.6, medium: 0.75, hard: 0.9 };

/** The drop classes, checked in this order (dropClass): turrets and non-signature factories, then epic parts, then rare
 *  rigs and common or rare gear, then common rigs. */
export type DropClass = "turret" | "epic" | "rare" | "common";
export const DROP_CLASSES: readonly DropClass[] = ["turret", "epic", "rare", "common"];
/** The player's words for each class (the inspect panel). */
export const DROP_CLASS_LABEL: Readonly<Record<DropClass, string>> = {
  turret: "TURRETS AND FACTORIES", epic: "EPIC PARTS", rare: "RARE RIGS AND GEAR", common: "COMMON RIGS",
};

/** The class weights by tier: common rigs often, turrets and factories rarely; Hard starts tilted toward the big parts
 *  (HULL-1's bench settles the numbers). Within a class each part has an equal share; a class with no part in the deck
 *  drops out of the draw. */
export const DROP_WEIGHTS: Readonly<Record<Difficulty, Readonly<Record<DropClass, number>>>> = {
  easy: { turret: 1, epic: 1, rare: 3, common: 6 },
  medium: { turret: 1, epic: 1, rare: 3, common: 6 },
  hard: { turret: 2, epic: 2, rare: 3, common: 3 },
};

const SIGNATURES = new Set(Object.values(HEROES).map((h) => h.factory));

/**
 * The class a part drops in, or null when it never drops. From ItemKind and Rarity (content.ts):
 *  - never: unknown ids, supplies (kind "supply"), every hero's signature factory, and legendary parts (the Matriarch's);
 *  - "turret": kind "turret" (any rarity) and kind "factory" (a non-signature factory);
 *  - "epic": rarity "epic" of kind "gate", "mod" or "core";
 *  - "rare": a rare "gate" (rig), and a common or rare "mod" or "core" (gear);
 *  - "common": a common "gate" (rig).
 */
export function dropClass(def: string): DropClass | null {
  const d: ItemDef | undefined = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!d || d.kind === "supply" || SIGNATURES.has(d.id) || d.rarity === "legendary") return null;
  if (d.kind === "turret" || d.kind === "factory") return "turret";
  if (d.rarity === "epic") return "epic";
  if (d.kind === "gate") return d.rarity === "rare" ? "rare" : "common";
  return "rare"; // gear: a common or rare mod or core
}

/** The distinct parts a deck can drop (its items, mods, cores and turrets, each def once), sorted by id. */
export function dropPool(deck: Pick<Build, "hero" | "items" | "mods" | "turrets">): string[] {
  const defs = new Set<string>();
  for (const p of deck.items) defs.add(p.def);
  for (const m of deck.mods) defs.add(m.def);
  for (const t of turretList(deck)) defs.add(t.def);
  return [...defs].filter((d) => dropClass(d) !== null).sort();
}

/** One droppable part and its odds: chance x its class's share of the weight / the parts in its class. "legendary": the
 *  Matriarch's own part (road.ts warlordDropTable), never in a drop pool. */
export interface DropLine {
  def: string;
  cls: DropClass | "legendary";
  odds: number;
}

/** A warlord's drop as the inspect panel shows it: the chance, then every part with its odds (the most likely first,
 *  ties by class order and id). The odds sum to `chance` (0 with an empty pool). */
export interface DropTable {
  chance: number;
  lines: DropLine[];
}

/** The deck's pool by class, the empty classes left out (DROP_CLASSES order). */
function byClass(deck: Pick<Build, "hero" | "items" | "mods" | "turrets">): { cls: DropClass; defs: string[] }[] {
  const pool = dropPool(deck);
  return DROP_CLASSES.map((cls) => ({ cls, defs: pool.filter((d) => dropClass(d) === cls) })).filter((c) => c.defs.length > 0);
}

/** The drop table of a `tier` warlord fighting with `deck`. */
export function dropTable(tier: Difficulty, deck: Pick<Build, "hero" | "items" | "mods" | "turrets">): DropTable {
  const classes = byClass(deck);
  const w = DROP_WEIGHTS[tier];
  const total = classes.reduce((s, c) => s + w[c.cls], 0);
  const chance = DROP_CHANCE[tier];
  const lines: DropLine[] = [];
  for (const c of classes) for (const def of c.defs) lines.push({ def, cls: c.cls, odds: (chance * w[c.cls]) / total / c.defs.length });
  const rank = (c: DropLine["cls"]) => (c === "legendary" ? -1 : DROP_CLASSES.indexOf(c));
  lines.sort((a, b) => b.odds - a.odds || rank(a.cls) - rank(b.cls) || (a.def < b.def ? -1 : a.def > b.def ? 1 : 0));
  return { chance: classes.length ? chance : 0, lines };
}

/**
 * THE ROLL: what a `tier` warlord's win on `day` of the run with `seed` drops, fighting with `deck`: a part id, or null.
 * One stream, hashSeed(seed, "warlord-drop", day): the first draw is the chance (next() < DROP_CHANCE[tier]); on a hit,
 * one weighted draw picks the class among the deck's non-empty classes (DROP_WEIGHTS[tier]), then one even draw the part
 * in it (dropPool's id order). Pure: the client, a reload and the server get the same answer.
 */
export function rollDrop(seed: number, day: number, tier: Difficulty, deck: Pick<Build, "hero" | "items" | "mods" | "turrets">): string | null {
  const rng = new Rng(hashSeed(seed >>> 0, "warlord-drop", day));
  if (!(rng.next() < DROP_CHANCE[tier])) return null;
  const classes = byClass(deck);
  if (!classes.length) return null;
  const w = DROP_WEIGHTS[tier];
  const c = rng.weighted(classes, (x) => w[x.cls]);
  return c.defs[rng.int(c.defs.length)];
}

/** The expected value of a drop table: the sum of odds x valueOf(def, 1) (the drop is a 1-star copy). */
export function expectedDropValue(t: DropTable): number {
  return t.lines.reduce((s, l) => s + l.odds * valueOf(l.def, 1), 0);
}

/** A share as the panel says it: "DROP 75%", "12%" (whole percent; under 1% reads "<1%"). */
export function pctText(p: number): string {
  const v = Math.round(p * 100);
  return p > 0 && v < 1 ? "<1%" : `${v}%`;
}

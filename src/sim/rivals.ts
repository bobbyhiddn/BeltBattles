// Rival captains (0.6.0 groundwork), fitted to the 10-day run (ROADMAP §1-2). The 13 captains
// have two jobs: the PvE warlord roster met at the road stop, at Easy, Medium or Hard (spec §19),
// and stand-in dusk ghosts whenever no player build exists for the day. This file holds the
// roster data, the daily warlord offer and the stand-in order; the decks live in rivalBuilds.ts.
// The offer and the stand-ins draw from their own hashSeed(runSeed, "warlords", ...) and
// hashSeed(runSeed, "standin") streams, so shop rolls and battle seeds never move.

import { hashSeed, Rng } from "../core/rng";
import { HEROES, ITEMS, START_GOLD, incomeFor, type Faction, type HeroId } from "./content";
import type { Build } from "./deck";
import { warlordBuild, warlordHull } from "./ai";
import { PLANS, planBuild, type RivalLoadout } from "./rivalBuilds";

export type RivalId =
  | "sootjaw" | "nettle" | "grubnose" | "mothqueen"
  | "sparkfang" | "lacewing" | "ratchet" | "emberlyn" | "bulwark"
  | "silkshade" | "longtooth" | "highspire" | "matriarch";

/** Regular, elite or boss. It drives the portrait frame: amber corners for elites, plum for the boss. */
export type RivalRank = "regular" | "elite" | "boss";
/** A captain's build tier, 1-3. difficultyOf() maps tier and rank to a warlord slot. */
export type RivalTier = 1 | 2 | 3;
/** A warlord slot at the road stop (spec §19): the player picks one of the three each day. */
export type Difficulty = "easy" | "medium" | "hard";

/** Days in a run: dawn caravan, the road stop, then the dusk ghost (ROADMAP §1). */
export const RUN_DAYS = 10;
/** The Iron Matriarch is the Hard warlord from this day to RUN_DAYS, and is never met before it. */
export const MATRIARCH_DAY = 8;
/** The three road-stop slots, easiest first. */
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

export interface Portrait {
  palette: string[]; // 3-4 names from src/render/palette.ts (C)
  feature: string; // the one visual feature the artist should build the face around
}

export interface RivalDef {
  id: RivalId;
  name: string; // all caps, at most 14 characters
  hero: HeroId;
  faction: Faction;
  tier: RivalTier;
  rank: RivalRank;
  trick: string; // NEXT BATTLE panel title
  blurb: string; // NEXT BATTLE panel line
  portrait: Portrait;
}

function rival(
  id: RivalId, name: string, hero: HeroId, tier: RivalTier, rank: RivalRank,
  trick: string, blurb: string, palette: string[], feature: string,
): RivalDef {
  return { id, name, hero, faction: HEROES[hero].faction, tier, rank, trick, blurb, portrait: { palette, feature } };
}

export const RIVALS: Record<RivalId, RivalDef> = {
  sootjaw: rival("sootjaw", "SOOTJAW", "furnace", 1, "regular", "SLOW COOKER",
    "ONE LONG WINDING BELT. LATE, HOT SLUGS.",
    ["rust2", "soil3", "fire3", "bone"], "soot-black jaw clamped on a glowing cinder pipe"),
  nettle: rival("nettle", "NETTLE", "weaver", 1, "regular", "SHORT STITCH",
    "LOOM PARKED UNDER THE GUNS. FIRES FIRST.",
    ["verd3", "verd1", "lime", "bone"], "crown of bent sewing needles"),
  grubnose: rival("grubnose", "GRUBNOSE", "furnace", 1, "regular", "PRESS GANG",
    "A STAMP PRESS FEEDS THE SECOND INTAKE.",
    ["rust3", "brass2", "steel1", "amber"], "nose ring shaped like a press die"),
  mothqueen: rival("mothqueen", "MOTH QUEEN", "weaver", 1, "elite", "FRAY STORM",
    "SPLIT BOLTS, TWO PLATES. FRAY PILES UP.",
    ["plum3", "plum4", "ice", "verd4"], "moth-wing mantle with frayed, glowing edges"),
  sparkfang: rival("sparkfang", "SPARKFANG", "furnace", 2, "regular", "SHOCK TROOPER",
    "GALVANIC COILS STALL YOUR MACHINES.",
    ["rust2", "cyan", "ice", "steel2"], "copper fang arcing a blue spark"),
  lacewing: rival("lacewing", "LACEWING", "weaver", 2, "regular", "SPLITTER SWARM",
    "SPLITTERS TURN EVERY BOLT INTO TWO.",
    ["verd2", "verd4", "white", "cyan"], "lace veil that splits into twin tails"),
  ratchet: rival("ratchet", "RATCHET", "furnace", 2, "regular", "OVERCLOCK",
    "OVERDRIVE BELT, CALIBRATED GUN.",
    ["brass3", "yellow", "rust1", "steel3"], "goggles with a spinning gear monocle"),
  emberlyn: rival("emberlyn", "EMBERLYN", "weaver", 2, "regular", "EMBER WEAVE",
    "A TEMPER ON EVERY BELT. EVERY HIT BURNS.",
    ["verd1", "fire2", "fire4", "maroon"], "braids tipped with smouldering embers"),
  bulwark: rival("bulwark", "OLD BULWARK", "furnace", 2, "elite", "IRONCLAD",
    "THREE ARMOR PLATES, A BRAKED COOKER.",
    ["steel1", "steel3", "rust2", "brass1"], "riveted iron plate bolted over one eye"),
  silkshade: rival("silkshade", "SILKSHADE", "weaver", 3, "regular", "STATIC WEB",
    "A COIL ON EVERY BELT. SHOCK AFTER SHOCK.",
    ["plum2", "verd3", "cyan", "ink"], "hooded face behind a crackling web"),
  longtooth: rival("longtooth", "LONGTOOTH", "furnace", 3, "regular", "GATE CHAIN",
    "SIX GATES, THEN A LONG HAUL. HUGE SLUGS.",
    ["rust3", "bone", "amber", "soil2"], "one long tusk hung with gate tags"),
  highspire: rival("highspire", "HIGHSPIRE", "weaver", 3, "regular", "TRIPLE THREAT",
    "BURN LEFT, SPLIT CENTRE, HAUL RIGHT.",
    ["verd2", "brass3", "white", "blue"], "tall spire helm flying three pennants"),
  matriarch: rival("matriarch", "IRON MATRIARCH", "furnace", 3, "boss", "GRAND FOUNDRY",
    "KILN AND PRESS, EVERY GATE, HEAVY ARMOR.",
    ["rust1", "fire2", "brass4", "ink"], "crown of kiln chimneys venting fire"),
};

export const RIVAL_IDS = Object.keys(RIVALS) as RivalId[];

const clampDay = (day: number): number => {
  const d = Math.floor(day);
  return d >= 1 ? Math.min(RUN_DAYS, d) : 1;
};

/**
 * A captain's warlord slot. Tier 1 is Easy and tier 2 is Medium. Tier 3, the two elites (MOTH
 * QUEEN, OLD BULWARK) and the IRON MATRIARCH are Hard; the Matriarch is met only on days 8-10.
 */
export function difficultyOf(id: RivalId): Difficulty {
  const d = RIVALS[id];
  if (d.rank !== "regular" || d.tier === 3) return "hard";
  return d.tier === 1 ? "easy" : "medium";
}

/** The days a captain can be met, as a warlord or a stand-in ghost: 1-10, the Matriarch 8-10. */
export function rivalDays(id: RivalId): number[] {
  const first = id === "matriarch" ? MATRIARCH_DAY : 1;
  return Array.from({ length: RUN_DAYS - first + 1 }, (_, i) => first + i);
}

/** The captains that fill a slot on days 1-7, in roster order (the Matriarch is never in a pool). */
export function warlordPool(slot: Difficulty): RivalId[] {
  return RIVAL_IDS.filter((id) => id !== "matriarch" && difficultyOf(id) === slot);
}

/** The three warlords a road stop offers, one per difficulty. */
export interface WarlordOffer {
  easy: RivalId;
  medium: RivalId;
  hard: RivalId;
}

/**
 * One slot's captains for days 1..n: its pool shuffled from hashSeed(runSeed, "warlords", slot,
 * cycle), reshuffled whenever it runs out. If a new cycle would open on yesterday's captain, its
 * first two swap. So every captain in a pool is offered once before any is offered twice.
 */
function slotOrder(runSeed: number, slot: Difficulty, n: number): RivalId[] {
  const pool = warlordPool(slot);
  const out: RivalId[] = [];
  for (let cycle = 0; out.length < n; cycle++) {
    const order = new Rng(hashSeed(runSeed, "warlords", slot, cycle)).shuffle([...pool]);
    if (order[0] === out[out.length - 1]) [order[0], order[1]] = [order[1], order[0]];
    out.push(...order);
  }
  return out.slice(0, n);
}

/**
 * The whole run's road-stop warlords (index 0 = day 1). On days 8-10 the Hard slot is always
 * the IRON MATRIARCH, so she is the one captain offered on consecutive days. Every other captain
 * is never offered two days running, in any slot.
 */
export function warlordOffers(runSeed: number): WarlordOffer[] {
  const easy = slotOrder(runSeed, "easy", RUN_DAYS);
  const medium = slotOrder(runSeed, "medium", RUN_DAYS);
  const hard = slotOrder(runSeed, "hard", MATRIARCH_DAY - 1);
  return easy.map((e, i) => ({
    easy: e,
    medium: medium[i],
    hard: i + 1 >= MATRIARCH_DAY ? "matriarch" : hard[i],
  }));
}

/**
 * The warlords offered at a day's road stop (day 1-10) in the run seeded runSeed. Beating one
 * pays supplies and a chance at a part from its build; losing never costs a life (ROADMAP §1).
 */
export function warlordOffer(runSeed: number, day: number): WarlordOffer {
  return warlordOffers(runSeed)[clampDay(day) - 1];
}

/**
 * The run's stand-in dusk ghosts, one per day (index 0 = day 1). They are used whenever no player
 * build exists for that day. The order is a shuffle of the 12 captains other than the Matriarch,
 * from hashSeed(runSeed, "standin"). No captain stands in twice in a run, and none stands in on a
 * day it is offered as a warlord: it waits for the next free day. Either faction may stand in, so
 * mirror matches happen. The game fights a stand-in with standInBuild(id, day), never with
 * rivalBuild: an honest deck a player could own on that day (R1).
 */
export function standInGhosts(runSeed: number): RivalId[] {
  const queue = new Rng(hashSeed(runSeed, "standin")).shuffle(RIVAL_IDS.filter((id) => id !== "matriarch"));
  return warlordOffers(runSeed).map((o) => {
    const offered = new Set<RivalId>([o.easy, o.medium, o.hard]);
    // Always found: day d has 13 - d captains queued and at most 3 of them offered.
    const i = queue.findIndex((id) => !offered.has(id));
    return queue.splice(i, 1)[0];
  });
}

/**
 * The stand-in dusk ghost for a day (1-10) of the run seeded runSeed. The game fights it with
 * standInBuild(id, day), the captain's honest deck for that day (R1), not rivalBuild.
 */
export function standInGhost(runSeed: number, day: number): RivalId {
  return standInGhosts(runSeed)[clampDay(day) - 1];
}

/** A captain's plan as it stands on a day (1-10): the warlord deck, its supplies and its value. */
export function rivalLoadout(id: RivalId, day: number): RivalLoadout {
  return planBuild(PLANS[id], day);
}

/**
 * The captain's road-warlord deck on a day (1-based): its plan plus the PvE hull ramp
 * warlordHull(day), as the 0.4.0 warlords have it. Warlords are PvE and never cost a life, so
 * this deck may exceed a player's budget and its hull need not be whole plating. The dusk
 * fight never uses it: stand-ins fight with standInBuild(id, day).
 */
export function rivalBuild(id: RivalId, day: number): Build {
  return rivalLoadout(id, day).build;
}

// ------------------------------------------------------------ honest decks (rulings R1, R2)

const PLATE_HULL = ITEMS.plating.supply!.hull!;
const CRATE_BELT = ITEMS.beltcrate.supply!.belt!;

/**
 * The warlord hull ramp as whole plating (R2): max(0, round(warlordHull(day) / 25)), so 0 on
 * days 1-4, 1 on days 5-6, 2 on days 7-9 and 3 on day 10. Stand-ins and the par player buy these
 * plates instead of the fractional ramp, and pay for them.
 */
export function rampPlates(day: number): number {
  return Math.max(0, Math.round(warlordHull(clampDay(day)) / PLATE_HULL));
}

/**
 * The most gold a player can have received before the dusk fight of a day (1-based). It mirrors
 * the async validator's maxGoldByDay: START_GOLD + incomeFor(d, true) for every d < day, so
 * 8, 17, 27, 38, 50, 63, 77, 91, 105 and 119 on days 1-10.
 */
export function maxGoldByDay(day: number): number {
  let gold = START_GOLD;
  for (let d = 1; d < day; d++) gold += incomeFor(d, true);
  return gold;
}

/** A deck's purchase value, broken down as the async validator's BuildCost. */
export interface DeckCost {
  items: number; // gold: every deck item (signature factories are free)
  mods: number; // gold: turret gear
  crates: number; // belt crates implied by beltCap above the hero's base (count)
  plates: number; // armor plating implied by hullBonus (count)
  total: number; // gold
}

const priceOf = (id: string): number =>
  Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id].price : 0;

/**
 * What a deck costs, mirroring the async validator's buildCost exactly: item and mod prices
 * (unknown ids cost 0), plus 2 g per belt crate implied by ceil((beltCap - hero belt) / 4) and
 * 5 g per plating implied by ceil(hullBonus / 25), neither below 0. R1: an honest dusk deck
 * costs at most maxGoldByDay(day).
 */
export function deckCost(b: Build): DeckCost {
  const items = b.items.reduce((s, p) => s + priceOf(p.def), 0);
  const mods = b.mods.reduce((s, m) => s + priceOf(m.def), 0);
  const crates = Math.max(0, Math.ceil((b.beltCap - HEROES[b.hero].belt) / CRATE_BELT));
  const plates = Math.max(0, Math.ceil(b.hullBonus / PLATE_HULL));
  return { items, mods, crates, plates, total: items + mods + crates * ITEMS.beltcrate.price + plates * ITEMS.plating.price };
}

/**
 * A captain's dusk-ghost deck on a day (R1, R2): the same plan as rivalBuild(id, day), but its
 * hull is whole, paid-for plating, hullBonus = 25 x (the plan's plates + rampPlates(day)). It is
 * a deck a player could own on that day: legal, every belt reaching a turret, and costing at
 * most maxGoldByDay(day) for every captain but the Matriarch, who never stands in.
 */
export function standInBuild(id: RivalId, day: number): Build {
  const l = rivalLoadout(id, day);
  return { ...l.build, hullBonus: PLATE_HULL * (l.plating + rampPlates(day)) };
}

/**
 * The par player of a day, the difficulty ladder's reference (R2): warlordBuild(hero, day) with
 * its hull ramp converted to rampPlates(day) whole plates, so it is an honest deck too.
 */
export function honestReference(hero: HeroId, day: number): Build {
  const d = clampDay(day);
  return { ...warlordBuild(hero, d), hullBonus: PLATE_HULL * rampPlates(d) };
}

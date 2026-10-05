// Rival captains (0.6.0 groundwork), fitted to the 10-day run (ROADMAP §1-2). The 13 captains
// have two jobs: the PvE warlord roster met at the road stop, at Easy, Medium or Hard (spec §19),
// and stand-in dusk ghosts whenever no player build exists for the day. This file holds the
// roster data, the daily warlord offer and the stand-in order; the decks live in rivalBuilds.ts.
// The offer and the stand-ins draw from their own hashSeed(runSeed, "warlords", ...) and
// hashSeed(runSeed, "standin") streams, so shop rolls and battle seeds never move.
// 0.8.0 N1 (REQ-BFG-011, REQ-BFG-024; DESIGN-wave3 section 5, VERIFIED-D1 Q9 and Q12): six wave-3 captains join, so the
// roster is 19. Four race warlords (BRASSWICK and MASTER VOSS on FOUNDRY's human hull, GRIMHOLD and THANE KARSK on
// BASTION's dwarf hull) take both jobs; LOCKJAW (FURNACE) and THISTLEMAIL (WEAVER) are dusk stand-ins only
// (RivalDef.standInOnly: never in a road pool). The road pools are 4 Easy, 5 Medium and 7 Hard, plus the Iron
// Matriarch on days 8-10, and the stand-in order draws from the 18 captains other than her.

import { hashSeed, Rng } from "../core/rng";
import { HEROES, ITEMS, RUN_DAYS, START_GOLD, incomeFor, type Faction, type HeroId } from "./content";
import { starsOf, upgradeGold, valueOf } from "./stars";
import { turretsCost, type Build } from "./deck";
import { warlordBuild, warlordHull } from "./ai";
import { CAPTAIN_RUNES, PLANS, captainRunesOn, planBuild, type Luck, type RivalLoadout } from "./rivalBuilds";

export type RivalId =
  | "sootjaw" | "nettle" | "grubnose" | "mothqueen"
  | "sparkfang" | "lacewing" | "ratchet" | "emberlyn" | "bulwark"
  | "silkshade" | "longtooth" | "highspire" | "matriarch"
  // 0.8.0 N1: the six wave-3 captains (D1's ids; A1 drew their portraits)
  | "brasswick" | "voss" | "grimhold" | "karsk" | "lockjaw" | "thistlemail";

/** Regular, elite or boss. It drives the portrait frame: amber corners for elites, plum for the boss. */
export type RivalRank = "regular" | "elite" | "boss";
/** A captain's build tier, 1-3. difficultyOf() maps tier and rank to a warlord slot. */
export type RivalTier = 1 | 2 | 3;
/** A warlord slot at the road stop (spec §19): the player picks one of the three each day. */
export type Difficulty = "easy" | "medium" | "hard";

/** Days in a run (ROADMAP §1): declared once in content.ts, re-exported for the roster's callers. */
export { RUN_DAYS };
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
  /** 0.8.0 N1 (VERIFIED-D1 Q9): a dusk stand-in only, never a warlord: no road slot (difficultyOf is null), so no
   *  warlordPool holds it and its decks are always assembled at ordinary luck (luckOf). Absent on every road captain. */
  standInOnly?: true;
}

function rival(
  id: RivalId, name: string, hero: HeroId, tier: RivalTier, rank: RivalRank,
  trick: string, blurb: string, palette: string[], feature: string, opts: { standInOnly?: true } = {},
): RivalDef {
  return {
    id, name, hero, faction: HEROES[hero].faction, tier, rank, trick, blurb, portrait: { palette, feature },
    ...(opts.standInOnly ? { standInOnly: true as const } : {}),
  };
}

export const RIVALS: Record<RivalId, RivalDef> = {
  sootjaw: rival("sootjaw", "SOOTJAW", "furnace", 2, "regular", "SLOW COOKER",
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
  ratchet: rival("ratchet", "RATCHET", "furnace", 1, "regular", "OVERCLOCK",
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
  longtooth: rival("longtooth", "LONGTOOTH", "furnace", 3, "regular", "RIG CHAIN",
    "SIX RIGS, THEN A LONG HAUL. HUGE SLUGS.",
    ["rust3", "bone", "amber", "soil2"], "one long tusk hung with gate tags"),
  highspire: rival("highspire", "HIGHSPIRE", "weaver", 3, "regular", "TRIPLE THREAT",
    "BURN LEFT, SPLIT CENTRE, HAUL RIGHT.",
    ["verd2", "brass3", "white", "blue"], "tall spire helm flying three pennants"),
  matriarch: rival("matriarch", "IRON MATRIARCH", "furnace", 3, "boss", "GRAND FOUNDRY",
    "KILN AND PRESS, EVERY RIG, HEAVY ARMOR.",
    ["rust1", "fire2", "brass4", "ink"], "crown of kiln chimneys venting fire"),
  // 0.8.0 N1: the six wave-3 captains (DESIGN-wave3 5.1). Names and tricks are D1's; the blurbs are the brief's (37-41
  // characters, the road stop's card and the phone's inspect panel fit them like today's); the palettes are A1's
  // (render/portraits.ts WAVE3_NPC_PORTRAIT) and the features D1's portrait lines. Every one is a regular, so no rank
  // frame: BRASSWICK tier 1 (Easy), GRIMHOLD tier 2 (Medium), MASTER VOSS and THANE KARSK tier 3 (Hard); LOCKJAW and
  // THISTLEMAIL stand in at dusk only (their tier 2 is only the band their dusk decks are grown to).
  brasswick: rival("brasswick", "BRASSWICK", "foundry", 1, "regular", "MATCHED POUR",
    "MIRRORED BELTS, GAUGED. EVERY POUR FUSES.",
    ["brass2", "steel2", "bone", "lime"], "a young guild gauger with a brass twin-dial gauge strapped over both eyes like goggles"),
  voss: rival("voss", "MASTER VOSS", "foundry", 3, "regular", "LOCKSTEP",
    "LATCHED IN STEP. EVERY PAIR HITS HARDER.",
    ["brass3", "ink", "steel1", "amber"], "a stern guildmaster wearing a twin-chained pocket watch as a medal, its two lids snapping shut together"),
  grimhold: rival("grimhold", "GRIMHOLD", "bastion", 2, "regular", "ANVIL WALL",
    "THICK PLATE MAKES EVERY SHOT HIT HARDER.",
    ["steel3", "rust2", "fire3", "bone"], "a broad dwarf in an anvil-shaped iron helm, his beard braided through hot rivets"),
  karsk: rival("karsk", "THANE KARSK", "bastion", 3, "regular", "IRON WALL", // SUS-B (cap's answer 3): was SHIELD WALL
    "A WALL OF PLATE. HE BREAKS IT ON YOU.",
    ["steel1", "steel3", "brass1", "rust3"], "a grey-bearded thane behind a riveted tower shield, a plate-breaking hammer on one shoulder"),
  lockjaw: rival("lockjaw", "LOCKJAW", "furnace", 2, "regular", "TWIN BITE",
    "LATCHED BELTS. HIS SLUGS LAND IN PAIRS.",
    ["rust2", "steel2", "brass2", "fire2"], "an orc whose iron jaw-brace locks shut with a twin latch, two slugs clenched in his teeth",
    { standInOnly: true }),
  thistlemail: rival("thistlemail", "THISTLEMAIL", "weaver", 2, "regular", "LEAF MAIL",
    "THREADS PLATE HER. PLATED, HER GUNS SPIN.",
    ["verd2", "steel2", "white", "verd4"], "an elf in a coat of overlapping silver leaves like scale mail, wearing a thistle crown of steel pins",
    { standInOnly: true }),
};

export const RIVAL_IDS = Object.keys(RIVALS) as RivalId[];

const clampDay = (day: number): number => {
  const d = Math.floor(day);
  return d >= 1 ? Math.min(RUN_DAYS, d) : 1;
};

/**
 * A captain's warlord slot. Tier 1 is Easy and tier 2 is Medium. Tier 3, the two elites (MOTH
 * QUEEN, OLD BULWARK) and the IRON MATRIARCH are Hard; the Matriarch is met only on days 8-10.
 * Part 4 moved SOOTJAW up to Medium (its 13-tile cooker out-hits every Easy deck from day 1) and
 * RATCHET down to Easy, so the per-day ladder holds with 3 Easy, 4 Medium and 5 Hard captains.
 * 0.8.0 N1: BRASSWICK (tier 1) is Easy, GRIMHOLD (tier 2) Medium, MASTER VOSS and THANE KARSK (tier 3) Hard, so 4 Easy,
 * 5 Medium and 7 Hard. A stand-in-only captain (LOCKJAW, THISTLEMAIL) has no slot: null, so warlordPool never holds it,
 * luckOf gives it ordinary luck and every slot reading (the ladder, the bench) leaves it out.
 */
export function difficultyOf(id: RivalId): Difficulty | null {
  const d = RIVALS[id];
  if (d.standInOnly) return null;
  if (d.rank !== "regular" || d.tier === 3) return "hard";
  return d.tier === 1 ? "easy" : "medium";
}

/** The days a captain can be met, as a warlord or a stand-in ghost: 1-10, the Matriarch 8-10. */
export function rivalDays(id: RivalId): number[] {
  const first = id === "matriarch" ? MATRIARCH_DAY : 1;
  return Array.from({ length: RUN_DAYS - first + 1 }, (_, i) => first + i);
}

/** The captains that fill a slot on days 1-7, in roster order (the Matriarch is never in a pool; 0.8.0 N1: nor is a
 *  stand-in-only captain). Easy 4, Medium 5, Hard 7. */
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
 * The whole run's road-stop warlords (index 0 = day 1), for a run in which the IRON MATRIARCH is
 * never beaten: on days 8-10 the Hard slot is always her, so she is the one captain offered on
 * consecutive days (R3). Every other captain is never offered two days running, in any slot.
 * Once she is beaten, warlordOffer(runSeed, day, matriarchBeatenOn) replaces her; this unbeaten
 * schedule is what standInGhosts() avoids, so stand-ins never depend on the fight's outcome.
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
 *
 * R3, the Matriarch rule: the IRON MATRIARCH holds the Hard slot on days 8-10 until the player
 * beats her. Pass the day she was beaten as matriarchBeatenOn (8-10; omitted, or below 8, means
 * unbeaten). From the next day the Hard slot shows a regular Hard captain instead, so her
 * legendary reward can be won only once per run. The replacement is deterministic from
 * (runSeed, day, matriarchBeatenOn), drawn from its own hashSeed(runSeed, "warlords", "hard",
 * "after", day) stream; it is never that day's standInGhost and never yesterday's Hard captain.
 * The Easy and Medium slots, and every day up to the one she is beaten, match warlordOffers().
 */
export function warlordOffer(runSeed: number, day: number, matriarchBeatenOn?: number): WarlordOffer {
  const d = clampDay(day);
  const offer = warlordOffers(runSeed)[d - 1];
  const beaten = matriarchBeatenOn === undefined ? NaN : Math.floor(matriarchBeatenOn);
  if (!(beaten >= MATRIARCH_DAY) || d <= beaten) return offer;
  let hard: RivalId = "matriarch";
  for (let day2 = beaten + 1; day2 <= d; day2++) {
    const standIn: RivalId = standInGhost(runSeed, day2), yesterday: RivalId = hard;
    const order = new Rng(hashSeed(runSeed, "warlords", "hard", "after", day2)).shuffle(warlordPool("hard"));
    // Always found: the Hard pool has 7 captains (0.8.0 N1; 5 before) and at most 2 are excluded.
    hard = order.find((id) => id !== standIn && id !== yesterday)!;
  }
  return { ...offer, hard };
}

/**
 * The run's stand-in dusk ghosts, one per day (index 0 = day 1). They are used whenever no player
 * build exists for that day. The order is a shuffle of the captains other than the Matriarch (0.8.0 N1: 18, the two
 * stand-in-only captains among them; 12 before), from hashSeed(runSeed, "standin"). No captain stands in twice in a
 * run, and none stands in on a
 * day it is offered as a warlord: it waits for the next free day. Either faction may stand in, so
 * mirror matches happen. The game fights a stand-in with standInBuild(id, day), never with
 * rivalBuild: an honest deck a player could own on that day (R1).
 */
export function standInGhosts(runSeed: number): RivalId[] {
  const queue = new Rng(hashSeed(runSeed, "standin")).shuffle(RIVAL_IDS.filter((id) => id !== "matriarch"));
  return warlordOffers(runSeed).map((o) => {
    const offered = new Set<RivalId>([o.easy, o.medium, o.hard]);
    // Always found: day d has 19 - d captains queued (18 on day 1, one fewer each day) and at most 3 of them offered.
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

/**
 * 0.6.2 TUNE-C (REQ-BFG-033): the shop luck a captain's warlord deck is assembled at, from its warlord slot: Easy and
 * Medium ordinary, Hard good, the Iron Matriarch stars-aligned. Its stand-in deck is always ordinary (standInBuild).
 * 0.8.0 N1: a stand-in-only captain has no warlord slot, so ordinary.
 */
export function luckOf(id: RivalId): Luck {
  if (id === "matriarch") return "stars";
  return difficultyOf(id) === "hard" ? "good" : "ordinary";
}

/** A captain's plan as it stands on a day (1-10) at a luck tier (default: its warlord slot's, luckOf): the deck, its
 *  supplies and its value. */
export function rivalLoadout(id: RivalId, day: number, luck: Luck = luckOf(id)): RivalLoadout {
  return planBuild(PLANS[id], day, luck);
}

/**
 * The captain's road-warlord deck on a day (1-based): its plan plus the PvE hull ramp
 * warlordHull(day), as the 0.4.0 warlords have it. Warlords are PvE and never cost a life, so
 * this deck may exceed a player's budget and its hull need not be whole plating. The dusk
 * fight never uses it: stand-ins fight with standInBuild(id, day).
 */
export function rivalBuild(id: RivalId, day: number): Build {
  return captainRunesOn(rivalLoadout(id, day).build, CAPTAIN_RUNES[id], day); // BOTS-X: its runes up to `day` (none while CAPTAIN_RUNES is empty)
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
  turrets?: number; // gold: installed turrets (deck.ts turretsCost); present only when the layout differs from the start
  upgrades?: number; // bb-0.8.3 (REQ-BFG-043 D10): the upgrade gold paid (stars.ts upgradeGold); present only with levels
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
  // 0.6.1a: items and mods sum valueOf(def, stars) = price x 2^(stars - 1) (a merged module costs exactly its copies)
  const items = b.items.reduce((s, p) => s + valueOf(p.def, starsOf(p)), 0);
  const mods = b.mods.reduce((s, m) => s + valueOf(m.def, starsOf(m)), 0);
  const crates = Math.max(0, Math.ceil((b.beltCap - HEROES[b.hero].belt) / CRATE_BELT));
  const plates = Math.max(0, Math.ceil(b.hullBonus / PLATE_HULL));
  const total = items + mods + crates * ITEMS.beltcrate.price + plates * ITEMS.plating.price;
  // bb-0.8.3 (REQ-BFG-043 D10): the upgrade gold paid, as the validator's buildCost counts it (stars.ts upgradeGold)
  const up = b.upgrades ? { upgrades: upgradeGold(b) } : {};
  const paid = up.upgrades ?? 0;
  // 0.6.2 TUNE-C: the installed turrets' value, as the validator's buildCost counts it since 0.6.2s (S7)
  if (!b.turrets) return { items, mods, crates, plates, ...up, total: total + paid };
  const turrets = turretsCost(b);
  return { items, mods, crates, plates, turrets, ...up, total: total + turrets + paid };
}

/**
 * A captain's dusk-ghost deck on a day (R1, R2): the same plan as rivalBuild(id, day), but its
 * hull is whole, paid-for plating, hullBonus = 25 x (the plan's plates + rampPlates(day)). It is
 * a deck a player could own on that day: legal, every belt reaching a turret, and costing at
 * most maxGoldByDay(day) for every captain but the Matriarch, who never stands in.
 */
export function standInBuild(id: RivalId, day: number): Build {
  // TUNE-C (REQ-BFG-033): a stand-in is assembled at ordinary luck, whatever its warlord slot
  const l = rivalLoadout(id, day, "ordinary");
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

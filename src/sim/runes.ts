// RUNES-1 (REQ-BFG-058): the rune system. One rune at every dawn, before the shop: pick 1 of 3 on days 1-4 and 1 of 2
// from day 5, free, no skip, no rerolls (the operator's cadence; R1b-2 calls 2 and 3). All cards of a dawn share one
// tier, drawn from TIER_ODDS by day; inside the tier a weighted draw without replacement (own hero's style x3, generic
// themes x2, other heroes' styles x1), never a held rune, never two cards of one theme (relaxed deterministically when it
// can't be met), and at least one card that fits the hero (FIX-10). A run keeps every rune it takes, in pick order:
// Build.runes[i] was taken at the dawn of day i + 1.
//
// UNITS: every amount below is typed by unit (RuneAmount.unit: dmg, hull, plate, gold, belt, pct, count) and written in
// TODAY's units (bb-0.8.6/0.8.7, before N1's NUMBERS job). The NUMBERS job (N1's NUM-1: damage-family values x10) scales
// this file by script with everything else: multiply every amount whose unit is dmg, hull or plate by 10; gold, belt,
// pct and count stay. No rune text holds a literal number: src/ui/runeText.ts fills {N} from the typed amount through
// one formatter per unit, and tests/runes.system.test.ts asserts every number in every rune text is whole.
//
// DETERMINISM: offers draw on their own stream, hashSeed(seed, "rune", day), never the shop's; the battle seed is
// unchanged; rune effects (runeMods, read by src/sim/battle.ts) use no RNG. The server re-derives every offer from the
// snapshot's seed (runeProblem), so this file is shared, pure and dependency-light (no DOM).

import { hashSeed, Rng } from "../core/rng";
import { HEROES, RARITIES, type HeroId, type Rarity } from "./content";
import { sustainLive } from "./content"; // SUS-D (REQ-BFG-069): the sustain switch gates the sustain runes' offer
import { SUSTAIN_FIRST_DAY } from "./content"; // BOTS-X (REQ-BFG-069): the day-3 hold (runeOffer, runeProblem)

/** SUS-D: "sec" is a whole number of seconds (TICK GUARD's timer; runeText.ts writes it with the SEC icon, as `8{SEC}`). */
export type RuneUnit = "dmg" | "hull" | "plate" | "gold" | "belt" | "pct" | "count" | "sec";
/** One typed amount. NUM-1 multiplies `n` by 10 where `unit` is dmg, hull or plate (see the header). */
export interface RuneAmount {
  unit: RuneUnit;
  n: number;
}

/** R1b-2 1.3's themes: the four hero styles, then the generic ones. RUNES-2a adds R1b's "stars and merging" (stars): a
 *  generic theme, since every board merges. */
export type RuneTheme = "furnace" | "weaver" | "foundry" | "bastion" | "belts" | "factories" | "turrets" | "gold" | "armor" | "stars";
export const STYLE_THEMES: readonly RuneTheme[] = ["furnace", "weaver", "foundry", "bastion"];
export const GENERIC_THEMES: readonly RuneTheme[] = ["belts", "factories", "turrets", "gold", "armor", "stars"];
/** A playable hero's own style theme (the NPC races have none: every style weighs 1 for them). */
export const HERO_STYLE: Partial<Record<HeroId, RuneTheme>> = { furnace: "furnace", weaver: "weaver", foundry: "foundry", bastion: "bastion" };

/**
 * What a rune does (one stat each; runeMods and runeGrants read it):
 * - hull, belt: added to Build.hullBonus / Build.beltCap when taken (R1b's "text-only": the existing fields do the work,
 *   so the battle, the editor and the hull read-outs need nothing new); validate.ts takes them back out of the budget.
 * - dawnGold: gold at the dawn it is taken and at every later dawn (validate.ts adds it to the gold budget).
 * - shotDmg: every shot your turrets fire. firstShotDmg: each turret's first shot of a battle. pairDmg: a PAIR shot (a
 *   fused FOUNDRY load).
 * - turretRate, factoryRate: a whole % faster (the interval / (1 + pct/100); a factory's pace x (1 + pct/100)).
 * - startPlate: PLATE on your hull at the battle's start (PLATE_CAP holds). heatPct: HEAT your slugs gain, +pct%.
 * - startFray: FRAY on the FOE's hull at the battle's start. frayHit: +count FRAY on each of your hits that adds FRAY.
 * RUNES-2a (each a new idea on a new hook; battle.ts reads them through runeMods, run.ts the gold ones):
 * - allRate: turrets AND factories a whole % faster (HAIR TRIGGER's new form, Q6).
 * - the run: runeTithe: at every dawn from the one it is taken, n gold per rune held; victorGold: n gold at a dawn that
 *   follows a won dusk (both through dawnGold; validate.ts's budget reads runeGrants).
 * - the battle's start: startBurn: n BURN stacks on the foe's hull; perTurretHull, mergedHull: n HULL per turret / per
 *   merged piece (a ★2 or ★3 rig, factory, gear, core or turret) on your hull's max and hp.
 * - a shot of yours: pairTwice: a PAIR shot fires n times at its one target (no new draw); pairPct: a PAIR shot +n% DMG
 *   (RUNES-087F: TWIN SUNS' epic form, in the same % sum as the other % runes; it replaced RUNES-2a's pairMul, x n);
 *   mergedPct: +n% DMG per merged piece; frayShotPct: +n% DMG per FRAY on the foe's hull; platedDmg: +n DMG while you
 *   hold PLATE; frayHitDmg: +n DMG on a load that adds FRAY; priorPct: +n% DMG
 *   per rig the load passed; finisherDmg: +n DMG on the shot that empties a volley (the turret's window); volleyFirst:
 *   +n% DMG on the first shot of each volley; volleyBurn: that first shot adds n BURN; rideMul: a load's ride bonus x n;
 *   winDmgPct: +n% DMG per win (WARLORD'S DUE, from the battle's wins).
 * - a hit of yours: machineDmg: +n DMG when it lands on a machine; fullFrayDmg: +n DMG on a hull at its FRAY cap;
 *   otherFray: a hit that adds no FRAY adds n; frayMul: your FRAY bonus x n; pairBurn: a PAIR shot adds n BURN; burnTime:
 *   your BURN lasts n% longer; burnPct: your BURN on their hull deals n% more.
 * - your PLATE: plateMul: every PLATE gain x n (PLATE_CAP holds).
 * - your hull: hitCut: each hit on you deals n less (never below 0); startShield: n SHIELD at the battle's start (SUS-A;
 *   SHIELD_CAP holds; each stops one whole hit: WARD STONE's old blockHits);
 *   plateOnHit: n PLATE each time you are hit; halfPlate: n PLATE once, when your hull first drops below half; burnCut:
 *   BURN on your hull deals n% less.
 * - your machines: lastStand: below half hull your turrets and factories n% faster; perTurretRate: your turrets n% faster
 *   per turret you have; stampPlate: n PLATE each time a factory stamps; pairPlate: n PLATE each time you PAIR;
 *   stallCut: a STALL on your machines lasts n% less; rigSoon: your rigs come online n% sooner.
 * SUS-D (REQ-BFG-069; SUSTAIN-1 4.6): the sustain runes. Every heal goes through Battle.heal (never past max hull, nothing
 * from the dark wind, half under BURN) and every SHIELD through Battle.gainShield (SHIELD_CAP holds); no RNG:
 * - startShield (above) is BULWARK WARD's too: its SHIELD adds to WARD STONE's at the start (the cap holds).
 * - shieldEvery: +1 SHIELD every n whole seconds, the first at t = n (TICK GUARD; the timer carries its remainder).
 * - pairHeal: HEAL n each time a PAIR shot of yours lands (TWIN SALVE). halfHeal: HEAL n once, the first time your hull is
 *   below half (SCRAP MEDIC, where LAST WALL fires). hitHeal: HEAL n each time a shot of yours lands, a SHIELD-stopped one
 *   too (LEECH VOW). regen: REGEN n on your hull at each whole second, with the MENDING LOOMs' (GREEN THREAD).
 * - the rule runes (RULE_KINDS: no amount to show, n is 1): burnNoHeal: a foe with BURN on its hull heals nothing
 *   (SEARING); shieldPierce: your hit breaks one SHIELD and its damage still lands, on PLATE, then HULL (SHATTER SHOT).
 */
export type RuneKind =
  | "hull" | "belt" | "dawnGold" | "shotDmg" | "firstShotDmg" | "pairDmg" | "turretRate" | "factoryRate"
  | "startPlate" | "heatPct" | "startFray" | "frayHit"
  // RUNES-2a: HAIR TRIGGER's new form (turrets and factories), then the 40 new runes' kinds
  | "allRate"
  | "runeTithe" | "victorGold"
  | "startBurn" | "perTurretHull" | "mergedHull"
  | "pairTwice" | "pairPct" | "mergedPct" | "frayShotPct" | "plateMul" | "platedDmg" | "frayHitDmg"
  | "priorPct" | "finisherDmg" | "volleyFirst" | "rideMul" | "winDmgPct"
  | "machineDmg" | "fullFrayDmg" | "otherFray" | "frayMul" | "volleyBurn" | "pairBurn" | "burnTime" | "burnPct"
  | "hitCut" | "startShield" | "plateOnHit" | "halfPlate" | "burnCut"
  | "lastStand" | "perTurretRate" | "stampPlate" | "pairPlate" | "stallCut" | "rigSoon"
  // SUS-D (REQ-BFG-069): the sustain runes' kinds (BULWARK WARD shares WARD STONE's startShield)
  | "shieldEvery" | "pairHeal" | "halfHeal" | "hitHeal" | "regen" | "burnNoHeal" | "shieldPierce"
  // FURN-Y (release Y bench, never merged): the two counters with a baseline, one kind each. searBurn: n BURN on the foe's
  // hull at the start, and a foe with your BURN heals nothing (SEARING). shatterPct: your shots +n% DMG, and a hit breaks
  // one SHIELD and still lands (SHATTER SHOT)
  | "searBurn" | "shatterPct";

/** The unit each kind's amount carries (a test pins every rune to it). */
export const KIND_UNIT: Record<RuneKind, RuneUnit> = {
  hull: "hull", belt: "belt", dawnGold: "gold", shotDmg: "dmg", firstShotDmg: "dmg", pairDmg: "dmg", turretRate: "pct",
  factoryRate: "pct", startPlate: "plate", heatPct: "pct", startFray: "count", frayHit: "count",
  allRate: "pct",
  runeTithe: "gold", victorGold: "gold",
  startBurn: "count", perTurretHull: "hull", mergedHull: "hull",
  pairTwice: "count", pairPct: "pct", mergedPct: "pct", frayShotPct: "pct", plateMul: "count", platedDmg: "dmg",
  frayHitDmg: "dmg", priorPct: "pct", finisherDmg: "dmg", volleyFirst: "pct", rideMul: "count",
  winDmgPct: "pct",
  machineDmg: "dmg", fullFrayDmg: "dmg", otherFray: "count", frayMul: "count", volleyBurn: "count", pairBurn: "count",
  burnTime: "pct", burnPct: "pct",
  hitCut: "dmg", startShield: "count", plateOnHit: "plate", halfPlate: "plate", burnCut: "pct",
  lastStand: "pct", perTurretRate: "pct", stampPlate: "plate", pairPlate: "plate",
  stallCut: "pct", rigSoon: "pct",
  // SUS-D: HEAL and REGEN are the HULL family (x10 on the N1 scale, as RIVETER's); the rule runes' n is a flag (1)
  shieldEvery: "sec", pairHeal: "hull", halfHeal: "hull", hitHeal: "hull", regen: "hull", burnNoHeal: "count", shieldPierce: "count",
  searBurn: "count", shatterPct: "pct", // FURN-Y
};

/** SUS-D: the rule runes' kinds. They have no amount to show (SUSTAIN-1 4.6's N "none"): no {N} in the text, and n is 1. */
export const RULE_KINDS: readonly RuneKind[] = ["burnNoHeal", "shieldPierce"];

/** The kinds the run applies (run.ts takeRune, runeDawn), not the battle. */
export const RUN_KINDS: readonly RuneKind[] = ["hull", "belt", "dawnGold", "runeTithe", "victorGold"];

export interface RuneDef {
  id: string; // DEF_PATTERN-safe (the snapshot carries it)
  name: string; // 14 characters at most (the card's name line)
  tier: Rarity;
  theme: RuneTheme;
  kind: RuneKind;
  amount: RuneAmount;
  /** The one-line effect with R1b's {NAME} tokens and {N} for the amount (runeText.ts renders it). Never a literal number. */
  text: string;
}

const r = (id: string, name: string, tier: Rarity, theme: RuneTheme, kind: RuneKind, n: number, text: string): RuneDef =>
  ({ id, name, tier, theme, kind, amount: { unit: KIND_UNIT[kind], n }, text });

/**
 * The catalogue in this rules version, in catalogue order (the offer draw walks it in this order, so an edit moves
 * offers: tests/runes.snapshot.test.ts pins a few). RUNES-1 ships the commons and simple rares of R1b-2's catalogue in
 * today's units (R1b-2 wrote N1's: DMG, HULL and PLATE divided by 10 here); RUNES-2 and RUNES-3 add the rest.
 */
export const RUNE_LIST: readonly RuneDef[] = [
  // ---- common
  r("iron_skin", "IRON SKIN", "common", "armor", "hull", 150, "+{N} {HULL}."),
  r("tar_barrel", "TAR BARREL", "common", "belts", "belt", 8, "+{N} {BELT}."),
  r("coin_purse", "COIN PURSE", "common", "gold", "dawnGold", 1, "AT DAWN: +{N} {GOLD}."),
  r("sharp_scrap", "SHARP SCRAP", "common", "turrets", "firstShotDmg", 50, "EACH TURRET'S FIRST SHOT: +{N} {DMG}."),
  r("gun_oil", "GUN OIL", "common", "turrets", "turretRate", 15, "YOUR TURRETS: +{N} {RATE}."), // M5 bench: +10% measured +2.9
  r("oiled_cogs", "OILED COGS", "common", "factories", "factoryRate", 5, "YOUR FACTORIES: +{N} {RATE}."), // M5: +10% measured +7.2 (rare)
  r("rivet_hoard", "RIVET HOARD", "common", "bastion", "startPlate", 60, "START: +{N} {*PLATE}."), // Y1: TEXT-STYLE 3.2's START: label (was "START EACH BATTLE WITH {N} {*PLATE}.")
  r("twin_nails", "TWIN NAILS", "common", "foundry", "pairDmg", 10, "YOUR {*PAIR} SHOTS: +{N} {DMG}."), // FLIP-X2 (TUNE-X line 7, REVIEW-TUNEX): 20 -> 10
  r("coal_chute", "COAL CHUTE", "common", "furnace", "heatPct", 20, "YOUR {*HEAT}: +{N}."), // FURN-Y: 25 -> 20 (reads the KILN's HEAT: FURNACE +4.4)
  r("loose_thread", "LOOSE THREAD", "common", "weaver", "startFray", 2, "START: THE FOE HAS {N} {*FRAY}."), // FLIP-X2 (TUNE-X line 9): 3 -> 2. Y1: the START: label (was "BATTLE START:")
  // ---- rare
  r("spare_hull", "SPARE HULL", "rare", "armor", "hull", 300, "+{N} {HULL}."),
  r("pitch_wagon", "PITCH WAGON", "rare", "belts", "belt", 16, "+{N} {BELT}."),
  r("fat_purse", "FAT PURSE", "rare", "gold", "dawnGold", 2, "AT DAWN: +{N} {GOLD}."),
  r("war_edge", "WAR EDGE", "rare", "turrets", "shotDmg", 10, "YOUR SHOTS: +{N} {DMG}."),
  // RUNES-2a (Q6, cap's call): turrets AND factories, so the turrets get the loads to fire faster (RUNES-1's +50% turret
  // RATE measured +5.6, under the rare band: supply-bound); N benched into the rare band (+6 to +10)
  r("hair_trigger", "HAIR TRIGGER", "rare", "turrets", "allRate", 8, "YOUR TURRETS AND FACTORIES: +{N} {RATE}."),
  r("stoked_fires", "STOKED FIRES", "rare", "factories", "factoryRate", 15, "YOUR FACTORIES: +{N} {RATE}."), // M5: R1b's +25% measured +13.2 (epic)
  // FLIP-X2 (TUNE-X line 10, REVIEW-TUNEX answer 4): theme bastion -> armor, 120 -> 240, judged on all heroes (+7.0, the
  // rare band), as MANY HANDS and THREAD STORM were
  r("grave_plates", "GRAVE PLATES", "rare", "armor", "startPlate", 240, "START: +{N} {*PLATE}."), // Y1: the START: label (was "START EACH BATTLE WITH {N} {*PLATE}.")
  r("molten_bond", "MOLTEN BOND", "rare", "foundry", "pairDmg", 20, "YOUR {*PAIR} SHOTS: +{N} {DMG}."), // FLIP-X2 (TUNE-X line 11): 40 -> 20
  r("heat_sink", "HEAT SINK", "rare", "furnace", "heatPct", 40, "YOUR {*HEAT}: +{N}."), // FURN-Y: 50 -> 40 (FURNACE +8.0)
  r("double_knot", "DOUBLE KNOT", "rare", "weaver", "frayHit", 1, "YOUR {*FRAY} HITS: +{N} {*FRAY}."),
  r("tangle_wire", "TANGLE WIRE", "rare", "weaver", "startFray", 5, "START: THE FOE HAS {N} {*FRAY}."), // FLIP-X2 (TUNE-X line 14): 6 -> 5. Y1: the START: label (was "BATTLE START:")
  // ---- RUNES-2a (REQ-BFG-058): 36 more, each a new idea on a new hook (no same-stat twin of a shipped rune), in today's
  // units. R1b's theme x tier grid: the epics and legendaries first (so epic and legendary dawns show their own tier),
  // then each hero style toward 3 common, 3 rare, 2 epic and 1 legendary, then the generic themes. 40 were built; the
  // M5 bench left out 4 that do almost nothing on par decks (HOT IRON, WIND VEIL, LOOSE MOLDS, SAINT'S OIL: the report)
  // ---- common
  r("ash_kindle", "ASH KINDLE", "common", "furnace", "startBurn", 4, "START: THE FOE HAS {N} {BURN}."), // Y1: the START: label (was "BATTLE START:"); {BURN} kept
  // M5: 3% +1.4, 12% +3.6. RUNES-087F (cap's Q2): judged on its own hero it was under its band (WEAVER +1.3; the other
  // three +4.4): like THREAD STORM it helps every hero but WEAVER, so it is a generic rune (turrets), judged on all heroes
  r("many_hands", "MANY HANDS", "common", "turrets", "perTurretRate", 12, "YOUR TURRETS: +{N} {RATE} PER TURRET."),
  r("seam_rivets", "SEAM RIVETS", "common", "foundry", "pairPlate", 10, "EACH {*PAIR}: +{N} {*PLATE}."), // M5: 2 FOUNDRY +6.6, 1 +3.4
  r("last_wall", "LAST WALL", "common", "bastion", "halfPlate", 80, "AT HALF {HULL}: +{N} {*PLATE}."),
  r("final_nail", "FINAL NAIL", "common", "turrets", "finisherDmg", 10, "EACH VOLLEY'S LAST SHOT: +{N} {DMG}."), // M5: +3 +12.4, +1 +4.7
  r("scrap_biter", "SCRAP BITER", "common", "turrets", "machineDmg", 10, "YOUR HITS ON MACHINES: +{N} {DMG}."),
  r("quick_latch", "QUICK LATCH", "common", "belts", "rigSoon", 50, "YOUR {BELT} RIGS: ONLINE {N} SOONER."),
  r("ash_cloak", "ASH CLOAK", "common", "armor", "burnCut", 40, "{*BURN} ON YOUR {HULL}: -{N}."), // M5: 50% +5.2, 40% +4.3
  r("bulkheads", "BULKHEADS", "common", "armor", "perTurretHull", 50, "+{N} {HULL} PER TURRET YOU HAVE."),
  r("scrap_halo", "SCRAP HALO", "common", "stars", "mergedHull", 60, "+{N} {HULL} PER MERGED PIECE."), // M5: 3 +2.0, 6 +3.5
  r("spoils_sack", "SPOILS SACK", "common", "gold", "victorGold", 2, "AFTER A WIN: +{N} {GOLD} AT DAWN."),
  // ---- rare (RUNES-087F: EMBER SHOT moved to the epics, below)
  r("slow_embers", "SLOW EMBERS", "rare", "furnace", "burnTime", 75, "YOUR {BURN} LASTS +{N} LONGER."), // M5: 50% FURNACE +5.6, 75% +7.4
  r("snare_knot", "SNARE KNOT", "rare", "weaver", "fullFrayDmg", 20, "ON FULL {*FRAY}: YOUR HITS +{N} {DMG}."),
  // M5: as a common, +1 measured WEAVER +7.7 (a rare's worth; 1 is the least flat amount)
  r("barbed_silk", "BARBED SILK", "rare", "weaver", "frayHitDmg", 10, "YOUR {*FRAY} HITS: +{N} {DMG}."),
  // M5: as a common, 2 BURN measured FOUNDRY +17.7 (every FOUNDRY load pairs): 1 BURN, a rare
  r("hot_seam", "HOT SEAM", "rare", "foundry", "pairBurn", 1, "YOUR {*PAIR} SHOTS: +{N} {BURN}."),
  r("iron_temper", "IRON TEMPER", "rare", "bastion", "platedDmg", 30, "WHILE {*PLATE} HOLDS: SHOTS +{N} {DMG}."), // M5: +1: BASTION +3.2; +3: +8.2
  // M5: +1 DMG per rig measured +18.0 (1 is the least flat amount): a whole % per rig instead (5% +11.1, 4% +9.1)
  r("toll_road", "TOLL ROAD", "rare", "belts", "priorPct", 4, "+{N} {DMG} PER RIG A LOAD PASSES."),
  // SUS-A (REQ-BFG-069): its kind is SHIELD's now (3 at the start: the foe's first 3 hits, as before, unless something else
  // adds SHIELD). SUS-D: its SHIELD line is here now (SUS-B drew it from runeText.ts RUNE_TEXT; was "THE FOE'S FIRST {N}
  // HITS: NO {DMG}.", the same rule)
  r("ward_stone", "WARD STONE", "rare", "armor", "startShield", 3, "START: +{N} {*SHIELD}."),
  r("steady_iron", "STEADY IRON", "rare", "factories", "stallCut", 100, "{*STUN}S ON YOUR MACHINES: -{N}."), // M5: 50% +4.3, 93% +6.6; FLIP-X2 (N4-d): the token is STUN (was {*STALL}, which drew STUN)
  // M5: an epic at -1 measured +8.8 and -2 +17.3: no whole amount lands in the epic band, +8.8 is a rare's
  r("iron_hide", "IRON HIDE", "rare", "armor", "hitCut", 10, "HITS ON YOU: -{N} {DMG}."),
  // ---- epic (R1b 1.3: an epic changes a rule or scales)
  // RUNES-087F (cap's Q1): RUNES-2a's legendary "x2 DMG" measured FOUNDRY +28.4 (every FOUNDRY load pairs; x2 is the
  // least multiplier), so TWIN SUNS is FOUNDRY's epic as a whole % on a PAIR shot, benched into the epic band on FOUNDRY.
  // It takes MOLTEN VOWS' place in the catalogue order, and MOLTEN VOWS takes its place among the legendaries
  r("twin_suns", "TWIN SUNS", "epic", "foundry", "pairPct", 33, "YOUR {*PAIR} SHOTS: +{N} {DMG}."), // FOUNDRY: 30% +12.0, 33% +12.9, 40% +15.2, 50% +17.9
  r("scrap_saint", "SCRAP SAINT", "epic", "stars", "mergedPct", 11, "+{N} {DMG} PER MERGED PIECE."), // M5: 5% +6.1, 11% +11.7
  r("scab_iron", "SCAB IRON", "epic", "bastion", "plateOnHit", 10, "EACH HIT YOU TAKE: +{N} {*PLATE}."),
  r("widows_web", "WIDOW'S WEB", "epic", "weaver", "frayShotPct", 2, "+{N} {DMG} PER {*FRAY} ON THE FOE."),
  // M5: a generic theme (turrets): it is worth +3.3 to WEAVER (whose hits already fray) and +8.8 to +16.8 to the others
  r("thread_storm", "THREAD STORM", "epic", "turrets", "otherFray", 1, "HITS WITHOUT {*FRAY} ADD {N} {*FRAY}."),
  r("pyre_heart", "PYRE HEART", "epic", "furnace", "burnPct", 100, "YOUR {*BURN}: +{N} {DMG}."), // M5: 50% FURNACE +7.1, 92% +10.7
  // M5: turrets only measured +4.3 at 50% and +6.4 at 151% (supply-bound, it levels off): turrets AND factories
  r("last_stand", "LAST STAND", "epic", "turrets", "lastStand", 50, "BELOW HALF {HULL}: +{N} {RATE}."),
  r("rune_tithe", "RUNE TITHE", "epic", "gold", "runeTithe", 1, "AT DAWN: +{N} {GOLD} PER RUNE HELD."),
  r("forge_ward", "FORGE WARD", "epic", "factories", "stampPlate", 10, "EACH STAMP: +{N} {*PLATE}."),
  // R1b #25: reads the wins the side carried into the fight (the snapshot's `wins`, which the server checks; the run's
  // own), passed to the battle and kept in its record, so ghosts and replays stay exact (battle.ts Battle, replay.ts)
  r("warlords_due", "WARLORD'S DUE", "epic", "turrets", "winDmgPct", 8, "+{N} {DMG} PER WIN."), // M5: 5% +8.0, 8% +12.1
  // M5: "YOUR HEAT LOADS: +1 BURN A HIT" measured +0.3 (par decks carry almost no HEAT loads): the volley's opener burns.
  // RUNES-087F (cap's Q2 guard): a FURNACE rare measured FURNACE +6.7 but the other three heroes +14.6 (WEAVER +16.8,
  // FOUNDRY +17.6, BASTION +9.3), over the rare band's top: a generic rune (turrets: a turret's volley, as FIRST BLOOD),
  // judged on all heroes, +12.6 (10.2-15.1): the epic band. 1 BURN is the least amount
  r("ember_shot", "EMBER SHOT", "epic", "turrets", "volleyBurn", 1, "EACH VOLLEY'S FIRST SHOT: +{N} {*BURN}."),
  // ---- legendary (R1b 1.3: a legendary redefines the run)
  // RUNES-087F (cap's Q1): firing twice is a rule that defines the run, so MOLTEN VOWS is FOUNDRY's legendary (R1b's
  // legendary clause covers its FOUNDRY +32.0), text and amount unchanged
  r("molten_vows", "MOLTEN VOWS", "legendary", "foundry", "pairTwice", 2, "YOUR {*PAIR} SHOTS FIRE {N} TIMES."),
  // M5: "+2% DMG PER PLATE YOU HOLD" measured +0.5 (BASTION +1.8): plate held is low when the guns fire. Every PLATE gain
  // multiplied instead (PLATE_CAP holds; BASTION's bulwark slugs, the wave-3 parts and the PLATE runes alike): x2 BASTION
  // +12.1, x3 +21.2
  r("bulwark_oath", "BULWARK OATH", "legendary", "bastion", "plateMul", 3, "YOUR {*PLATE} GAINS: x{N}."),
  r("loom_of_woe", "LOOM OF WOE", "legendary", "weaver", "frayMul", 2, "YOUR {*FRAY} BONUS: x{N}."),
  // M5: x2 measured +28.2 (x2 is the least whole multiplier): a whole % instead
  r("first_blood", "FIRST BLOOD", "legendary", "turrets", "volleyFirst", 70, "EACH VOLLEY'S FIRST SHOT: +{N} {DMG}."),
  r("long_road", "THE LONG ROAD", "legendary", "furnace", "rideMul", 2, "YOUR {*RIDE} BONUS: x{N}."),
];

/**
 * SUS-D (REQ-BFG-069; SUSTAIN-1 4.6): the 8 sustain runes, N in N1 units. THE SWITCH: they are offered only while the
 * sustain pieces are in the game (content.ts SUSTAIN_LIVE, or a withSustain call), so RUNE_LIST above stays the runes in
 * play while it is off: every offer, pool, captain list and pin is as before. RUNES (below) resolves them at any time, so
 * the battle, the cards and the bench read them, as ITEMS resolves SUS-A's pieces; runeProblem refuses one while the
 * switch is off (both sides, as validate.ts refuses the pieces). RUNES-2b turns them on with SUSTAIN_LIVE (runeList).
 * No rune lets sustain work in the dark wind, raises MAX 3 SHIELD or heals past max hull (battle.ts heal, gainShield).
 */
export const SUSTAIN_RUNE_LIST: readonly RuneDef[] = [
  // The M5 bench (tools/runevalue.ts, RUNES-2a's method, the switch on; a style rune read on its own hero, a generic one on
  // all four; NEW/output-susd/REPORT.md section 4). SHIELD (BASTION): a start SHIELD, with WARD STONE's (one kind:
  // startShield; SHIELD_CAP holds), and a SHIELD timer.
  // M5: the design's 1 measured BASTION +2.8 (par decks) and +1.8 (the design's bench: typ2 BASTION from day 5); 2 measured
  // +5.2 (par) and +4.0 (typ2 from day 5, in the common band)
  r("bulwark_ward", "BULWARK WARD", "common", "bastion", "startShield", 2, "START: +{N} {*SHIELD}."),
  // WARD BELL ★1's timer (the design's 6 s) as a rune; "+1" can't stand in a rune text (no literal number), so the design's
  // "A SHIELD" form. M5: BASTION +9.2 (par), +8.9 (typ2)
  r("tick_guard", "TICK GUARD", "rare", "bastion", "shieldEvery", 6, "EVERY {N}: A {*SHIELD}."),
  // HEAL (FOUNDRY, and any hero): on each PAIR shot that lands (HOT SEAM's hook), once below half (LAST WALL's), per shot.
  // M5: TWIN SALVE 10 FOUNDRY +2.0, 20 +3.6, 30 +5.8; SCRAP MEDIC 150 +3.7 (a common's worth), 250 +6.1, 300 +7.1; LEECH
  // VOW 5 +3.1 (the design's: LEECH NEEDLE ★1's number, a common's worth), 10 +6.2, 15 +8.6, 20 +11.6
  r("twin_salve", "TWIN SALVE", "common", "foundry", "pairHeal", 20, "{PAIR}: {*HEAL} {N}."),
  r("scrap_medic", "SCRAP MEDIC", "rare", "armor", "halfHeal", 300, "FIRST TIME BELOW HALF {HULL}: {*HEAL} {N}."),
  // FLIP-X2 (TUNE-X line 4, REVIEW-TUNEX): epic -> rare, 20 -> 15 (+8.1 on all heroes, the rare band; WEAVER +14.1)
  r("leech_vow", "LEECH VOW", "rare", "turrets", "hitHeal", 15, "EACH SHOT THAT LANDS: {*HEAL} {N}."),
  // REGEN (WEAVER): MENDING LOOM ★1's line, no label (YOUR HULL says whose, not when). M5: WEAVER +4.2 (par), +4.5 (typ2)
  r("green_thread", "GREEN THREAD", "common", "weaver", "regen", 10, "YOUR HULL: {*REGEN} {N}."),
  // the counters (FURNACE): BURN's rule taken to none; round B's PIERCE as a rune (each shot breaks a SHIELD and hits on).
  // Rule runes: no amount to move. M5 (FURNACE): SEARING +0.1 (par), +0.4 (typ2), +0.8 against the typ2 decks that heal;
  // SHATTER SHOT +0.0 (par: no SHIELD), +1.3 (typ2), +5.3 against the typ2 decks that hold SHIELD (BASTION's WARD BELL)
  // FURN-Y (release Y bench, never merged): each counter keeps its rule and gains a baseline (one new kind each); the
  // amounts are the bench's (T/output-furny/REPORT.md)
  r("searing", "SEARING", "rare", "furnace", "searBurn", 6, "START: THE FOE HAS {N} {*BURN}. FOE WITH YOUR {*BURN}: NO {*HEAL}."),
  r("shatter_shot", "SHATTER SHOT", "rare", "furnace", "shatterPct", 15,"YOUR SHOTS: +{N} {DMG}. A {*SHIELD} THEY BREAK STILL TAKES THE HIT."),
];

/** SUS-D: every rune of this rules version, the sustain runes last (RUNES' order). */
const ALL_RUNES: readonly RuneDef[] = [...RUNE_LIST, ...SUSTAIN_RUNE_LIST];

export const RUNES: Readonly<Record<string, RuneDef>> = Object.fromEntries(ALL_RUNES.map((d) => [d.id, d]));

/** A rune is in this rules version's catalogue. */
export const isRune = (id: unknown): id is string => typeof id === "string" && Object.prototype.hasOwnProperty.call(RUNES, id);

/** SUS-D: is `id` one of the sustain runes (whatever the switch)? */
export const isSustainRune = (id: string): boolean => SUSTAIN_RUNE_LIST.some((d) => d.id === id);

/**
 * FLIP-X2 (REQ-BFG-058; TUNE-X lines 5, 6, 8 and 12, REVIEW-TUNEX answers 2-4): the runes out of the offer pool for release
 * X, as DORMANT_ITEMS does for pieces. SEARING and SHATTER SHOT (FURNACE's counters: under their band on the field
 * players meet; the base rules keep both counters, BURN halves a heal and goes past SHIELD), COAL CHUTE and HEAT SINK (no
 * effect at any amount on par FURNACE decks). runeOffer never offers one, runeList() leaves them out, runeProblem refuses
 * one taken at a dawn; their defs stay in RUNES, so an old snapshot decodes. Release Y's FURNACE rune pass gives them
 * baselines.
 */
// FURN-Y (bench only, never merged): FURNY_POOL=full in the environment empties the set (the four back in the pool), for
// sustainBench's full-pool run; unset, release X's set
const FURNY_FULL = typeof process !== "undefined" && process.env?.FURNY_POOL === "full";
export const DORMANT_RUNES: ReadonlySet<string> = new Set(FURNY_FULL ? [] : ["searing", "shatter_shot", "coal_chute", "heat_sink"]);

/** SUS-D: the runes the dawn offers now: RUNE_LIST, and the sustain runes after it while the sustain switch is on.
 *  FLIP-X2: never a dormant one (DORMANT_RUNES). */
export const runeList = (): readonly RuneDef[] => (sustainLive() ? ALL_RUNES : RUNE_LIST).filter((d) => !DORMANT_RUNES.has(d.id));

/** One held rune as the build carries it (snapshot v3 Build.runes[i]): its id. R1b-2's counter `n` belongs to GROW-1. */
export interface RuneHeld {
  id: string;
}

// ---- the offer -------------------------------------------------------------------------------------------------------

/** R1b-2 1.1: the tier of a dawn, by day (percent; each row sums to 100). Day 14 and later (and ENDLESS) use the last row. */
export const TIER_ODDS: readonly (readonly [number, number, number, number])[] = [
  [100, 0, 0, 0], [75, 25, 0, 0], [55, 40, 5, 0], [40, 45, 15, 0], [30, 45, 22, 3], [20, 45, 30, 5], [15, 40, 37, 8],
  [10, 38, 42, 10], [5, 35, 48, 12], [0, 33, 52, 15], [0, 28, 54, 18], [0, 24, 56, 20], [0, 20, 58, 22], [0, 15, 60, 25],
];

export function tierOdds(day: number): Record<Rarity, number> {
  const row = TIER_ODDS[Math.max(0, Math.min(TIER_ODDS.length - 1, Math.floor(day) - 1))];
  return { common: row[0], rare: row[1], epic: row[2], legendary: row[3] };
}

/** Cards in the dawn's offer: 3 on days 1-4, 2 from day 5 (the operator's). */
export const offerSize = (day: number): number => (day <= 4 ? 3 : 2);

/** The draw's weight: the hero's own style x3, a generic theme x2, another hero's style x1. */
export function runeWeight(d: RuneDef, hero: HeroId): number {
  if (GENERIC_THEMES.includes(d.theme)) return 2;
  return HERO_STYLE[hero] === d.theme ? 3 : 1;
}

/** FIX-10: a card fits the hero when its theme is the hero's style or a generic one (every board has turrets, factories,
 *  belts, a hull and gold). The server can't see the board a past dawn saw, so the offer reads no board. */
export const runeFits = (d: RuneDef, hero: HeroId): boolean => GENERIC_THEMES.includes(d.theme) || HERO_STYLE[hero] === d.theme;

export interface RuneOffer {
  day: number;
  /** The tier the dawn shows (after the fallback; `drawn` is the tier the odds gave). */
  tier: Rarity;
  drawn: Rarity;
  ids: string[];
}

/**
 * The offer at the dawn of `day` for a run with `seed` and `hero` that holds `held` (ids, in pick order). Pure and
 * deterministic: the same arguments give the same offer on the client, the server and in a test.
 * 1. The tier: one weighted draw on TIER_ODDS(day).
 * 2. The tier fallback (while the catalogue has no epic or legendary runes): the drawn tier, then each lower tier, then
 *    each higher one; the first with at least offerSize(day) runes not held. If none has enough, the tier with the most
 *    (the offer is then smaller); with none at all, an empty offer.
 * 3. The cards: weighted draws without replacement inside the tier (runeWeight), each among the runes whose theme no
 *    card has yet; when none is left, among all the tier's runes left (the theme rule relaxed, deterministically).
 * 4. FIX-10: if no card fits the hero (runeFits), the last card is redrawn among the fitting runes left whose theme no
 *    other card has (then among all fitting runes left); with none, the offer stands.
 */
export function runeOffer(seed: number, day: number, hero: HeroId, held: readonly string[]): RuneOffer {
  const rng = new Rng(hashSeed(seed >>> 0, "rune", day));
  const size = offerSize(day);
  const odds = tierOdds(day);
  const drawn = rng.weighted(RARITIES, (t) => odds[t]);
  // BOTS-X (REQ-BFG-069; cap's answer 4 in REVIEW-SUSD): before the first sustain day the dawn draws from RUNE_LIST alone,
  // so with the switch on the day 1-2 offers are exactly the switch-off offers (the same list, the same draws)
  // FLIP-X2: never a dormant rune (DORMANT_RUNES), on any day
  const list = day < SUSTAIN_FIRST_DAY ? RUNE_LIST.filter((d) => !DORMANT_RUNES.has(d.id)) : runeList();
  const left = (t: Rarity) => list.filter((d) => d.tier === t && !held.includes(d.id)); // SUS-D: the switch
  const at = RARITIES.indexOf(drawn);
  const order = [...RARITIES.slice(0, at + 1).reverse(), ...RARITIES.slice(at + 1)];
  let tier = order.find((t) => left(t).length >= size);
  if (!tier) {
    let most = 0;
    for (const t of order) if (left(t).length > most) { most = left(t).length; tier = t; }
  }
  if (!tier) return { day, tier: drawn, drawn, ids: [] };
  let pool = left(tier);
  const cards: RuneDef[] = [];
  while (cards.length < size && pool.length) {
    const fresh = pool.filter((d) => !cards.some((c) => c.theme === d.theme));
    const pick = rng.weighted(fresh.length ? fresh : pool, (d) => runeWeight(d, hero));
    cards.push(pick);
    pool = pool.filter((d) => d !== pick);
  }
  if (cards.length && !cards.some((c) => runeFits(c, hero))) {
    const others = cards.slice(0, -1);
    const fitting = pool.filter((d) => runeFits(d, hero));
    const fresh = fitting.filter((d) => !others.some((c) => c.theme === d.theme));
    if (fitting.length) cards[cards.length - 1] = rng.weighted(fresh.length ? fresh : fitting, (d) => runeWeight(d, hero));
  }
  return { day, tier, drawn, ids: cards.map((c) => c.id) };
}

// ---- the check (src/net/validate.ts validateBuild, both modes; src/game/ghostSnapshot.ts isSnapshot) ------------------

/** FLIP-X2 (REQ-BFG-058; cap's ruling 5d6d83ef57d1494c): how many runes a deck must hold on `day`. "exact": one a dawn,
 *  `runes.length === day`, an absent field counting as 0, so a client can't skip a pick by leaving the field out; only
 *  uploads (validateUpload's player mode, on the server and the client). "atMost": at most `day`, an absent field allowed:
 *  the strict content checks (stand-ins, the bundled pools, captains, generators, hand-built decks) and the device's local
 *  ghost pool (isSnapshot, where an exact rule would delete every pre-rune ghost). */
export type RuneCount = "exact" | "atMost";

/**
 * Why a build's runes are illegal at `day` for `hero`, or null. One rule for the client's checks and the server's
 * validateBuild (R1b-2 4.2); `count` says how many it takes (RuneCount):
 * - exact for uploads (validateUpload, on both client and server): one rune a dawn, `day` runes, none missing (FLIP-X2;
 *   was "at most `day`" everywhere until the pools were regenerated with runes);
 * - at most `day` for strict content checks and the local pool;
 * - each entry is exactly { id } (GROW-1's counter `n` is not in this rules version yet), each id is in the catalogue,
 *   and no id appears twice;
 * - when `seed` is known (the uploader's snapshot; served ghosts carry none, FIX-6): runes[i] was in
 *   runeOffer(seed, i + 1, hero, the runes before it).
 */
export function runeProblem(runes: unknown, day: number, hero: HeroId, seed?: number, count: RuneCount = "atMost", keepDormant = false): string | null {
  if (runes === undefined) return count === "exact" ? `runes: 0 held on day ${day}, one a dawn (${day})` : null;
  if (!Array.isArray(runes)) return "runes: expected a list";
  if (runes.length > day) return `runes: ${runes.length} held on day ${day}, at most one a dawn`;
  if (count === "exact" && runes.length !== day) return `runes: ${runes.length} held on day ${day}, one a dawn (${day})`;
  const held: string[] = [];
  for (let i = 0; i < runes.length; i++) {
    const q = runes[i] as Record<string, unknown> | null;
    if (!q || typeof q !== "object" || Array.isArray(q)) return `runes[${i}]: expected { id }`;
    const extra = Object.keys(q).find((k) => k !== "id");
    if (extra !== undefined) return `runes[${i}].${extra}: not in this rules version`;
    if (!isRune(q.id)) return `runes[${i}]: unknown rune ${JSON.stringify(q.id)}`;
    // FLIP-X2 (REVIEW-TUNEX answers 2-4): no dawn offers a dormant rune, seed or none; the device's local pool keeps an old
    // ghost that holds one (`keepDormant`, ghostSnapshot.ts isSnapshot, as it keeps a short rune list)
    if (DORMANT_RUNES.has(q.id) && !keepDormant) return `runes[${i}]: ${RUNES[q.id].name} is dormant: no dawn offers it`;
    // SUS-D (REQ-BFG-069): a sustain rune only while the sustain switch is on (no dawn offers one before), seed or none
    if (isSustainRune(q.id) && !sustainLive()) return `runes[${i}]: ${RUNES[q.id].name} is not in the game while sustain is off`;
    // BOTS-X (REQ-BFG-069): no dawn before the first sustain day offers one; with the seed the offer check below refuses it
    if (seed === undefined && isSustainRune(q.id) && i + 1 < SUSTAIN_FIRST_DAY) return `runes[${i}]: ${RUNES[q.id].name} is not offered before the dawn of day ${SUSTAIN_FIRST_DAY}`;
    if (held.includes(q.id)) return `runes[${i}]: ${RUNES[q.id].name} is held twice`;
    if (seed !== undefined && !runeOffer(seed, i + 1, hero, held).ids.includes(q.id)) {
      return `runes[${i}]: ${RUNES[q.id].name} was not offered at the dawn of day ${i + 1}`;
    }
    held.push(q.id);
  }
  return null;
}

/** HEROES' ids, for the tests and the bench. */
export const RUNE_HEROES = Object.keys(HEROES) as HeroId[];

// ---- what runes give: the run (grants) and the battle (mods) ---------------------------------------------------------

const held = (runes: readonly RuneHeld[] | undefined): RuneDef[] =>
  (runes ?? []).map((q) => (q && isRune(q.id) ? RUNES[q.id] : undefined)).filter((d): d is RuneDef => !!d);

export interface RuneGrants {
  hull: number; // in Build.hullBonus (validate.ts takes it out of the bought hull)
  belt: number; // in Build.beltCap (validate.ts takes it out of the bought belt)
  gold: number; // the dawn gold received by `day`'s dusk (validate.ts adds it to the budget)
}

/** What `runes` (in pick order: rune i taken at the dawn of day i + 1) have put on the build and into the purse by the
 *  dusk of `day`. A dawn-gold rune pays at the dawn it is taken and at every later dawn: (day - i) times. RUNES-2a:
 *  RUNE TITHE pays at its own dawn for the runes held then (i + 1, itself included) and at each later dawn j for the
 *  runes held before that dawn's pick (j - 1, at most the list's length): exact for a run that took every pick. SPOILS
 *  SACK pays at a dawn after a won dusk (never day 1's): the budget counts every such dawn from its pick (an upper bound;
 *  the server sees no day-by-day results). */
export function runeGrants(runes: readonly RuneHeld[] | undefined, day: number): RuneGrants {
  const g: RuneGrants = { hull: 0, belt: 0, gold: 0 };
  const count = runes?.length ?? 0;
  (runes ?? []).forEach((q, i) => {
    const d = q && isRune(q.id) ? RUNES[q.id] : undefined;
    if (!d) return;
    if (d.kind === "hull") g.hull += d.amount.n;
    else if (d.kind === "belt") g.belt += d.amount.n;
    else if (d.kind === "dawnGold") g.gold += d.amount.n * Math.max(0, day - i);
    else if (d.kind === "runeTithe" && day >= i + 1) {
      g.gold += d.amount.n * (i + 1);
      for (let j = i + 2; j <= day; j++) g.gold += d.amount.n * Math.min(j - 1, count);
    } else if (d.kind === "victorGold") g.gold += d.amount.n * Math.max(0, day - Math.max(1, i));
  });
  return g;
}

/**
 * FLIP-X2 (cap's ruling 97e639e5813acb37, item 4): the most dawn gold a legal one-rune-a-dawn list can have paid by the dusk
 * of `day` (runeGrants' gold; every dusk won, SPOILS SACK's bound): the offerable gold runes (dawn gold, RUNE TITHE, SPOILS
 * SACK) taken at the first dawns in their best order, every other dawn a rune that pays nothing. The most gold a run can
 * hold at that dusk is maxGoldByDay(day) + this (the luck caps' value bound, tests/captains.luck). Pure; no regeneration.
 */
export function maxDawnGold(day: number): number {
  const pays = (d: RuneDef) => d.kind === "dawnGold" || d.kind === "runeTithe" || d.kind === "victorGold";
  const gold = RUNE_LIST.filter((d) => pays(d) && !DORMANT_RUNES.has(d.id));
  const filler = RUNE_LIST.filter((d) => !pays(d) && !DORMANT_RUNES.has(d.id)).map((d) => ({ id: d.id }));
  let best = 0;
  const walk = (picked: readonly RuneDef[], rest: readonly RuneDef[]): void => {
    if (picked.length > day) return;
    const list = [...picked.map((d) => ({ id: d.id })), ...filler.slice(0, day - picked.length)];
    best = Math.max(best, runeGrants(list, day).gold);
    for (const d of rest) walk([...picked, d], rest.filter((x) => x !== d));
  };
  walk([], gold);
  return best;
}

/** The gold the held runes pay at one dawn (before that dawn's pick): each dawn-gold rune its amount; RUNES-2a: RUNE
 *  TITHE its amount per rune held; SPOILS SACK its amount when the dusk before this dawn was won (`won`). */
export const dawnGold = (runes: readonly RuneHeld[] | undefined, won = false): number =>
  held(runes).reduce((s, d) => s + (d.kind === "dawnGold" ? d.amount.n
    : d.kind === "runeTithe" ? d.amount.n * (runes?.length ?? 0)
    : d.kind === "victorGold" && won ? d.amount.n : 0), 0);

/** The gold a rune pays at once when it is taken at a dawn (run.ts takeRune: the pick is part of the dawn): a dawn-gold
 *  rune its amount; RUNE TITHE its amount per rune held with it; SPOILS SACK its amount after a won dusk. */
export function pickGold(d: RuneDef, heldWith: number, won: boolean): number {
  if (d.kind === "dawnGold") return d.amount.n;
  if (d.kind === "runeTithe") return d.amount.n * heldWith;
  if (d.kind === "victorGold") return won ? d.amount.n : 0;
  return 0;
}

/** The kinds a battle reads (every kind but the run's). */
export type BattleKind = Exclude<RuneKind, "hull" | "belt" | "dawnGold" | "runeTithe" | "victorGold">;

/** What one side's runes do in a battle (src/sim/battle.ts): the sum of each battle kind's amounts (a run holds a rune
 *  once, so a "x n" kind is n). Absent for a build without runes, so a rune-less battle runs exactly as before
 *  (tests/runes.parity.test.ts). Units: KIND_UNIT (pct a whole %, dmg/hull/plate today's units, count a count). */
export type RuneMods = Record<BattleKind, number>;

const BATTLE_KINDS = (Object.keys(KIND_UNIT) as RuneKind[]).filter((k): k is BattleKind => !RUN_KINDS.includes(k));

export function runeMods(runes: readonly RuneHeld[] | undefined): RuneMods | undefined {
  const list = held(runes);
  if (!list.length) return undefined;
  const m = Object.fromEntries(BATTLE_KINDS.map((k) => [k, 0])) as RuneMods;
  for (const d of list) {
    if (RUN_KINDS.includes(d.kind)) continue; // the run's, not the battle's
    m[d.kind as BattleKind] += d.amount.n;
  }
  return m;
}

/** RUNES-2a: the merged pieces of a build (SCRAP SAINT, SCRAP HALO): its rigs, factories, gear, cores and turrets at ★2
 *  or ★3, each once (a signature factory's FACTORY level is not a merge). */
export function mergedPieces(b: Pick<Build, "items" | "mods" | "turrets">): number {
  const merged = (p: { stars?: number }) => (p.stars ?? 1) >= 2;
  return b.items.filter(merged).length + b.mods.filter(merged).length + (b.turrets ?? []).filter(merged).length;
}

// ---- RUNES-2a (REQ-BFG-058, R1b-2 1.6): the bots' rune picker --------------------------------------------------------
// The bots (the par player, and through it the caravan stand-ins and the seed pool's race ghosts; the captains' pinned
// lists, tools/genCaptainRunes.ts) take a rune at every dawn as a player does: the offer is runeOffer on the run's own
// seed, so a bot only ever holds offered runes and passes runeProblem with that seed by construction. The pick reads the
// bot's board, never an RNG. Behind ONE switch, BOT_RUNES, off in this rules version: every pinned pool, stand-in and
// golden stays byte-identical; RUNES-2b turns it on and regenerates. This section's imports sit here, not at the head, so
// it and the catalogue above are edited apart (ES imports hoist; deck.ts never imports this file).

import { AMMO, ITEMS, type ItemLevel } from "./content";
import { turretList, type Build } from "./deck";

/** THE switch for the bots' runes (RUNES-2a decision 5). Every bot call site reads `opts.botRunes ?? BOT_RUNES`, so a
 *  test turns it on without editing it. Off: no bot takes a rune, and nothing a bot plays moves. FLIP-X2 (REQ-BFG-058,
 *  release X): ON, together with content.ts SUSTAIN_LIVE, before the one regeneration. */
export const BOT_RUNES: boolean = true;

type Spec = Pick<ItemLevel, "gate" | "factory" | "mod" | "core">;

/** A piece's specs at its stars: its 1-star spec, then its ★2 and ★3 levels (a keyword a star adds counts too). A
 *  signature factory has no stars (its levels are its FACTORY upgrade's), so it reads its 1-star spec. */
function specsAt(def: string, stars: number | undefined): Spec[] {
  const d = ITEMS[def];
  if (!d) return [];
  const s = stars ?? 1, l2 = d.levels?.[2], l3 = d.levels?.[3], out: Spec[] = [d];
  if (s >= 2 && l2) out.push(l2);
  if (s >= 3 && l3) out.push(l3);
  return out;
}

const ammoOf = (s: Spec) => (s.factory?.ammo ? AMMO[s.factory.ammo] : undefined);

/** Which specs read each hero style's keyword (the style runes' HEAT, FRAY, PAIR and PLATE). */
const STYLE_READS: Readonly<Record<"furnace" | "weaver" | "foundry" | "bastion", (s: Spec) => boolean>> = {
  // HEAT: a rig that heats what it hits (HEAT JACKET), or a factory whose slugs heat up as they ride (the KILN's cinder)
  furnace: (s) => !!s.gate?.heat || (ammoOf(s)?.rideScale ?? 0) > 0,
  // FRAY: a rig that adds FRAY, or a factory whose slugs fray (the LOOM's thread)
  weaver: (s) => !!s.gate?.fray || (ammoOf(s)?.fray ?? 0) > 0,
  // PAIR: a pour (the CRUCIBLE, TWIN MOULD), a matched or latched belt (TWIN GAUGE, TWIN LATCH), pair gear (TWIN TRIGGER, SEAM WELDER)
  foundry: (s) => !!(s.factory?.pour || s.factory?.twin || s.gate?.gauge || s.gate?.latch || s.mod?.pairBonus || s.mod?.seam),
  // PLATE: what makes or reads PLATING (PLATE ROLLER, SHIELD WALL, PLATE BREAKER, BRACE FRAME, ARMOR PRESS, SEAM WELDER,
  // ANVIL and STEAM BREECH), or the WARDWORKS' bulwark slug (it plates the hull as it loads)
  bastion: (s) => !!(s.gate?.plate || s.gate?.plated || s.gate?.breaker || s.gate?.brace || s.factory?.plate || s.mod?.seam
    || s.core?.perPlate || s.core?.steamPlated) || s.factory?.ammo === "bulwark",
};

/** The hull one ARMOR PACK adds (the smallest hull supply): "armor" counts the bought hull in packs. */
const HULL_PACK = Math.min(...Object.values(ITEMS).map((d) => ((d.supply?.hull ?? 0) > 0 ? d.supply!.hull! : Infinity)));

/**
 * How many pieces on `board` a rune theme matches (the bots' picker, step 2). Exactly:
 * - "factories": each factory on the deck (the signature factory included);
 * - "turrets": each installed turret (turretList: the starting copies included) and each gear and core on one;
 * - "belts": each rig and each belt (Build.routes);
 * - "armor": the bought hull in ARMOR PACKs: floor((hullBonus - the held runes' HULL) / HULL_PACK);
 * - "furnace", "weaver", "foundry", "bastion": each piece (rig, factory, gear, core, turret) whose spec at its stars reads
 *   the style's keyword (STYLE_READS: HEAT, FRAY, PAIR, PLATE). A piece may count for several themes (the KILN: factories
 *   and furnace);
 * - "stars" (should the catalogue grow that theme): each ★2 or ★3 piece;
 * - "gold", and any theme this switch doesn't know: 0.
 * Held runes never count (FIX-10's rule): only what is on the board.
 */
export function boardThemeCount(theme: RuneTheme, board: Build): number {
  const kind = (p: { def: string }) => ITEMS[p.def]?.kind;
  const pieces = (): { def: string; stars?: number }[] => [...board.items, ...board.mods, ...turretList(board)];
  switch (theme as string) {
    case "factories": return board.items.filter((p) => kind(p) === "factory").length;
    case "turrets": return turretList(board).length + board.mods.length;
    case "belts": return board.items.filter((p) => kind(p) === "gate").length + board.routes.length;
    case "armor": return Number.isFinite(HULL_PACK) ? Math.max(0, Math.floor((board.hullBonus - runeGrants(board.runes, 0).hull) / HULL_PACK)) : 0;
    case "furnace": case "weaver": case "foundry": case "bastion": {
      const reads = STYLE_READS[theme as keyof typeof STYLE_READS];
      return pieces().filter((p) => specsAt(p.def, p.stars).some(reads)).length;
    }
    case "stars": return pieces().filter((p) => (p.stars ?? 1) >= 2).length;
    default: return 0;
  }
}

/**
 * The bots' pick from a dawn's offer (R1b-2 1.6): the first of
 * 1. an offered rune of the hero's style (HERO_STYLE; the NPC races have none);
 * 2. else the offered rune whose theme matches the most pieces on `board` (boardThemeCount);
 * 3. else (no offered theme matches a piece) catalogue order.
 * Every tie goes by catalogue order (runeList(): RUNE_LIST, then the sustain runes while the sustain switch is on), so the
 * pick never depends on the offer's card order. No RNG. Null for an empty offer. Works for any catalogue: a theme
 * boardThemeCount doesn't know counts 0. BOTS-X (REVIEW-SUSD F-c, SUS-D finding 7): the cards are the offered runes of
 * runeList(), the list the dawn offers from, so with the switch on a bot sees an offered sustain rune and its style takes
 * BULWARK WARD and TICK GUARD for BASTION, TWIN SALVE for FOUNDRY, GREEN THREAD for WEAVER, SEARING and SHATTER SHOT for
 * FURNACE; with it off runeList() is RUNE_LIST itself, so every pick is as before.
 */
export function botRunePick(offer: RuneOffer | readonly string[], hero: HeroId, board: Build): string | null {
  const ids: readonly string[] = "ids" in offer ? offer.ids : offer;
  const cards = runeList().filter((d) => ids.includes(d.id));
  if (!cards.length) return null;
  const own = HERO_STYLE[hero];
  const mine = cards.find((d) => d.theme === own);
  if (mine) return mine.id;
  let best = cards[0], most = boardThemeCount(best.theme, board);
  for (const d of cards.slice(1)) {
    const n = boardThemeCount(d.theme, board);
    if (n > most) {
      best = d;
      most = n;
    }
  }
  return best.id;
}

/** A bot's dawn pick: the rune it took and the gold that rune pays at this dawn (the bot's purse). */
export interface BotRune {
  id: string;
  gold: number;
}

/**
 * A bot's rune at the dawn of `day` (only when `on`, default BOT_RUNES): botRunePick(runeOffer(seed, day, hero, held),
 * hero, build), applied as src/game/run.ts takeRune applies a player's pick: { id } joins build.runes (pick order), a HULL
 * rune adds to build.hullBonus and a BELT rune to build.beltCap at once (through runeGrants, the budget's own reading),
 * and a dawn-gold rune's gold for this dawn comes back in `gold` for the caller's purse. Held dawn-gold runes pay at every
 * later dawn as a run's do (day.ts finishDay's runeDawn, or dawnGold(build.runes) for a bot without a Run). `seed` is the
 * run seed (run.seed, the one a snapshot carries). Null, the build untouched, when off, when the build missed a dawn
 * (runes.length !== day - 1: one rune a dawn from day 1, as runeDawn owes a pick) or when the offer is empty.
 */
export function botTakeRune(build: Build, seed: number, day: number, hero: HeroId = build.hero, on: boolean = BOT_RUNES, won = false): BotRune | null {
  if (!on) return null;
  const ids = (build.runes ?? []).map((q) => q.id);
  if (ids.length !== day - 1) return null;
  const id = botRunePick(runeOffer(seed, day, hero, ids), hero, build);
  if (id === null) return null;
  const d = RUNES[id];
  build.runes = [...(build.runes ?? []), { id }];
  if (d.kind === "hull") build.hullBonus += d.amount.n;
  else if (d.kind === "belt") build.beltCap += d.amount.n;
  // cap_gamma (RUNES-2a): the pick's own gold exactly as run.ts takeRune pays it (pickGold: RUNE TITHE per rune held,
  // SPOILS SACK only after a won dusk, `won`), not runeGrants' budget bound
  return { id, gold: pickGold(d, build.runes.length, won) };
}

/**
 * The bots' picks at the dawns of days 1..days on a board by day, with no purse (R1b-2 1.6's captains: a named build by
 * day; tools/genCaptainRunes.ts). Day d reads boardOf(d) and runeOffer(seed, d, hero, the picks before it), so the list
 * passes runeProblem(list, days, hero, seed) by construction. It stops at an empty offer.
 */
export function botRuneList(seed: number, hero: HeroId, boardOf: (day: number) => Build, days: number): string[] {
  const picks: string[] = [];
  for (let day = 1; day <= days; day++) {
    const id = botRunePick(runeOffer(seed, day, hero, picks), hero, boardOf(day));
    if (id === null) break;
    picks.push(id);
  }
  return picks;
}

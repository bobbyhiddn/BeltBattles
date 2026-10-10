// Rival captain decks (0.6.0 groundwork). Every rival is a real production build under the
// same rules as the player and the warlords (spec §19): its hero's own signature factory
// plus shop items only, belts drawn to free turret intakes, rigs beside the belts they work
// (0.6.2 BELTSIDE: G(at, def, x, y, rot) is the rig's own cell and its turn; rigs stand
// beside the belt tile they work), one piece of turret gear per turret, and supplies
// (belt crates, armor plating) paid for like a player. G2/M2 are an additional ★1 purchase
// fused into an existing placed copy; the survivor keeps its cell, rotation or turret socket.
// A plan is a day-1 deck plus the upgrades the captain has bought by a given day (1-10), and it
// never shrinks. One plan feeds two decks (R2): the road warlord, planBuild() below with the PvE
// hull ramp warlordHull(day), and the stand-in dusk ghost, rivals.ts standInBuild(), whose hull is
// whole, paid-for plating. Part 4 re-timed every plan against the honest par player
// (rivals.ts honestReference) so the per-day ladder holds on days 1-10: kits spread over the
// days, a stamp press always bought with a gate for its belt, and every stand-in deck affordable.

// 0.6.2 TUNE-C (REQ-BFG-033, REQ-BFG-024): every plan is a named build around a synergy (RivalPlan.synergy names its
// parts), and its upgrades carry a shop-luck tier. An untagged upgrade is ORDINARY luck; `luck: "good"` needs good luck
// and `luck: "stars"` the stars aligning. Better luck can also bring an upgrade SOONER (`sooner: { good: 2 }`: a good-luck
// caravan offers it on day 2, an ordinary one on day `at`). planBuild(plan, day, luck) takes the upgrades that luck owns by
// that day (dayOwned); rivals.ts picks the luck from the captain's warlord slot (stand-ins and Easy/Medium warlords
// ordinary, Hard good, the Iron Matriarch stars). The caps each luck must fit are measured on the par field
// (src/sim/harness/luck.ts, tools/luckCaps.ts; tests/captains.luck.test.ts). Plans may also buy turrets (REQ-BFG-031):
// T() installs a bought turret in a slot (the extra slot, or replacing a starting turret) through deck.ts
// installTurret, the game's own operation, and T2() buys a matching copy for another star. Captain plans never join belts.

import {
  HEROES, ITEMS, START_GOLD, UPGRADE_PRICE, incomeFor, type HeroId, type Upgrades, type UpgradeTrack,
} from "./content";
import { sustainLive } from "./content"; // BOTS-X (SUS-C, REQ-BFG-069): RivalPlan.sustain, only while the switch is on
import { installTurret, key, rotField, setTurretList, turretList, turretsCost, type Build, type ModPlacement, type Placed } from "./deck";
import { warlordHull } from "./ai";
import { migrateDeck } from "./beltside";
import { FUSE_MAX, starsOf, upgradeGold, valueOf } from "./stars";
import type { RivalId } from "./rivals";
import { runeGrants } from "./runes"; // BOTS-X (REQ-BFG-058): a captain's HULL and BELT runes (captainRunesOn)
import { npcDayRules } from "./npcDay"; // REFIT-AZ (REQ-BFG-078, REQ-BFG-079): the road allowance, behind NPC_DAY

/** Belt cells from (x, y) following moves such as "L3U2" (U = toward the turrets, row 0). */
export function walk(x: number, y: number, moves = ""): number[] {
  const out = [key(x, y)];
  const re = /([UDLR])(\d*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(moves))) {
    const n = m[2] ? Number(m[2]) : 1;
    for (let i = 0; i < n; i++) {
      if (m[1] === "U") y--;
      else if (m[1] === "D") y++;
      else if (m[1] === "L") x--;
      else x++;
      out.push(key(x, y));
    }
  }
  return out;
}

type Belt = [x: number, y: number, moves: string];

export interface FactoryPlan {
  def: string;
  x: number;
  y: number;
  belts: Belt[];
  // 0.8.0 I1 M3 (VERIFIED-D1 Q8): a plan's base factory owned only from this day (absent: day 1). Before it the factory
  // and its belts are missing; from it the deck is exactly what it was with the factory owned from day 1 (the same uid,
  // place in the item list, cells and routes), so later days don't move.
  at?: number;
}

/** TUNE-C: the shop luck a captain's deck is assembled at (REQ-BFG-033). */
export type Luck = "ordinary" | "good" | "stars";
export const LUCKS: readonly Luck[] = ["ordinary", "good", "stars"];
const LUCK_RANK: Record<Luck, number> = { ordinary: 0, good: 1, stars: 2 };

export interface Upgrade {
  at: number; // first day (1-10) the captain owns it, at the least luck that owns it (`luck`, else ordinary)
  luck?: "good" | "stars"; // TUNE-C: the shop luck it needs (absent: ordinary)
  sooner?: { good?: number; stars?: number }; // TUNE-C: better luck brings it sooner: its first day at that luck (< at)
  gate?: [def: string, x: number, y: number, rot?: number]; // 0.6.2 BELTSIDE: a rig beside its belt, turned rot quarter turns
  mod?: [def: string, turret: number]; // gear or a core on the turret in that slot
  fuseGate?: [def: string, x: number, y: number]; // buy a matching copy; the named placed rig gains a star (★1 -> ★2 -> ★3)
  fuseMod?: [def: string, turret: number]; // same purchase for turret equipment
  turret?: [def: string, slot: number]; // TUNE-C: a turret bought and installed in the slot (an occupied slot: replaced)
  fuseTurret?: [slot: number]; // TUNE-C: a matching copy bought; the slot's turret gains a star
  factory?: FactoryPlan; // a factory bought that day, with the belt it feeds
  crates?: number; // belt crates bought (+4 belt each)
  plating?: number; // armor plating bought (+25 hull each)
  // REFIT-AZ (REQ-BFG-078, REQ-BFG-079; REVIEW-PARAZ ruling Q1): the road allowance's days, read only with the NPC day on
  // (npcDayRules(); off: never read, so every deck is exactly as before). `nd`: a plan upgrade owned sooner with the NPC
  // day: from nd[luck] at that luck and every better one ("dusk": the dusk deck alone), whenever that luck owns it at all
  // (ndDayOwned). `dusk`: a road-list entry (RivalPlan.road) the dusk deck alone owns (standInBuild; the road deck never)
  nd?: Partial<Record<Luck | "dusk", number>>;
  dusk?: true;
}

export interface RivalPlan {
  hero: HeroId;
  synergy?: string[]; // TUNE-C: the defs of the build's synergy parts (the ones its blurb promises; the synergy check swaps them)
  factories: FactoryPlan[]; // the day-1 deck: the signature factory and its belts
  crates: number; // belt crates the day-1 deck needs
  upgrades: Upgrade[];
  // BOTS-X (SUS-C, REQ-BFG-069; SUSTAIN-1 4.8 rule 7): the upgrades the plan adds while the sustain switch is on
  // (content.ts sustainLive), taken after `upgrades` (their uids follow it, so every other part keeps its uid). Off, planBuild
  // never reads them: every captain deck, and every test that walks `upgrades`, is exactly as before
  sustain?: Upgrade[];
  // FLIP-X2 (REVIEW-BOTSX answer 1): sustain's drop list. While the sustain switch is on, each listed rig (def at x, y) is
  // left out of `upgrades`, so a sustain piece replaces a part instead of adding to the deck (THANE KARSK: his WARD BELL
  // takes his GALVANIC COIL's place, keeping his rare count and value inside the luck caps). Skipped by index, so every
  // other part keeps its uid. Off: never read.
  sustainDrop?: readonly (readonly [def: string, x: number, y: number])[];
  // 0.8.9 (CATCHUP-089 fallback 2; cap's ruling Q1 e2ca295ce9dcd60a): PvE plates by day (day -> plates), armor the road
  // warlord carries free on that day, like the hull ramp (+250 hull each, the ARMOR PACK's), on the days a Hard captain
  // was still under 0.55 against the par fields after its packs and its gold ran short of the par field's pack count:
  // the count less its paid plates. In the road deck's hull only (good luck and better), never in its value, and never
  // in the stand-in deck (rivals.ts standInBuild builds its hull from the paid plating alone).
  pve?: Readonly<Partial<Record<number, number>>>;
  // REFIT-AZ (REQ-BFG-078, REQ-BFG-079; REVIEW-PARAZ ruling Q1): the road additions, the parts and packs a captain buys with
  // the road's value (NPC_ROAD), owned only with the NPC day on (npcDayRules()) and taken after `upgrades` (and `sustain`),
  // so every other part keeps its uid; each at its own day and luck (`luck`, `sooner`; `dusk`: the dusk deck alone). Off:
  // never read, so every deck is exactly as before
  road?: Upgrade[];
  // REFIT-AZ (BRIEF-REFIT-AZ "Targets" 1, the walls; "Levers": an NPC-day re-plan within the budget): the road-deck days on
  // which, with the NPC day on, the gold levels keep the room the deck has without its road additions (planBuild's levels
  // rule before round 3), so that day's levels come when the road-less plan bought them. Off: never read
  roadLevelsHeld?: readonly number[];
}

/**
 * REFIT-AZ (REQ-BFG-078, REQ-BFG-079; REVIEW-PARAZ ruling Q1, BRIEF-REFIT-AZ "The road allowance"): the moment a captain deck
 * is fought. A road (warlord) deck fights during day d, before that day's reward: the par player then holds the warlord gold
 * of days 1..d-1 (spent at dawn d) and the drops of days 1..d-1. A named stand-in fights at dusk d, after the day's drop is
 * placed (REFIT) and before the day's gold is spent (the next dawn): the gold of days 1..d-1 and the drops of days 1..d
 * (src/sim/harness/player.ts playerRun: shopDay, then parNpcDay, then the dusk deck; src/game/road.ts finishWarlord).
 */
export type RoadMoment = "warlord" | "dusk";

/**
 * REFIT-AZ (REQ-BFG-078, REQ-BFG-079; REVIEW-PARAZ ruling Q1): THE ROAD ALLOWANCE, ROAD(d, moment), in whole gold (index day
 * - 1): the par player's median road value (the warlord gold it received + the drops' value it holds, npcDay.ts
 * roadDropValue) at the moment the deck is fought (RoadMoment), rounded down. With the NPC day on, a captain-day may hold
 * maxGoldByDay(d) + its runes' dawn gold + ROAD(d, moment) (roadAllowance), and the captains' budget checks add it; a
 * ceiling, not a quota. Off: never read.
 * Provenance: the final table A (= A2; BRIEF-REFIT-AZ 2 and step 3c, BRIEF-REFIT-AZ-R1 restart 3): the median over runs
 * of each run's own road value at the moment, rounded down (kit-refitaz/roadtable.mjs), from the parday probe
 * (kit-refitaz/probes/parday.ts, 4 heroes x seeds 1-96 = 384 runs, every switch on) at refitaz 683cd5b, REFIT-AZ's round 3
 * (output-refitaz/probes/r3); warlord: gold by dusk d-1 + drops by dusk d-1; dusk: gold by dusk d-1 + drops by dusk d.
 * The last table-setting read. Before it: A0 (PAR-AZ's REPORT (c)1 per-run means at parAZ-accepted 5c57914: warlord 0 6 12
 * 17 22 28 34 40 47 53, dusk 2 8 14 19 24 31 37 43 49 56) and A1 (round 2's read: as A2 but dusk day 8 39).
 */
export const NPC_ROAD: Readonly<Record<RoadMoment, readonly number[]>> = {
  warlord: [0, 7, 14, 18, 22, 27, 33, 38, 42, 46],
  dusk: [3, 10, 15, 20, 24, 29, 35, 40, 44, 48],
};

/** REFIT-AZ: ROAD(day, moment) with the NPC day on (days past 10 read day 10's), 0 with it off: what a captain deck may hold
 *  beside maxGoldByDay(day) and its runes' dawn gold (the captains' checks add it). */
export function roadAllowance(day: number, moment: RoadMoment): number {
  if (!npcDayRules()) return 0;
  const d = Math.max(1, Math.min(NPC_ROAD[moment].length, Math.floor(day)));
  return NPC_ROAD[moment][d - 1];
}

/** REFIT-AZ: the luck caps' tiers a road count allowance reads (src/sim/harness/luck.ts: ordinary P50, good P90). */
export type RoadCountTier = "ordinary" | "good";
type RoadCountRow = Readonly<{ rare: readonly number[]; epic: readonly number[] }>;

/**
 * REFIT-AZ (REQ-BFG-078, REQ-BFG-024; REVIEW-PARAZ ruling Q1; rulings 388faa07f0f451d1 and b77171cd5288623a): THE ROAD COUNT
 * ALLOWANCE, ROADN(hero, day, tier) (index day - 1): how many more rare-or-better and epic-or-better parts (luck.ts
 * LuckMeasures rare / epic) the road-fed par field holds than the road-less one the luck caps were measured on. With the
 * NPC day on, the captains' luck-cap checks add it to the cap's `rare` and `epic` of the cell they already read
 * (capsOf(id, day, tier), the deck's hero): a Hard warlord deck `good`; an Easy warlord deck and every captain's stand-in
 * dusk deck `ordinary`; a Medium warlord deck none (388 item 4: par fights them, and table A is set); the Iron Matriarch has
 * no luck-caps check. Only the checks read it (tests/captains.luck's two overCaps lines, kit-refitaz capsearch check and
 * fill), never a deck; star2, star3, turrets, the value (that is ROAD's) and the ARMOR PACK count are not in it. Off: 0.
 * Provenance (ruling b77171cd5288623a item 1): for hero h, day d, tier t, measure m: own = max(0, the road-fed cap - the
 * committed cap); pooled = the median of own over the four heroes, rounded down; ROADN = min(pooled, own) (so cap + ROADN
 * never exceeds that hero's own road-fed cap). The road-fed caps: kit-refitaz/probes/roadcaps.ts (luckCapsTable(), seeds
 * 1-48 a hero, P50 / P90, every switch on: setHullScale, setLadderFix, setNpcDay) at refitaz 683cd5b, table A2's own par
 * state (output-refitaz/base/roadcaps-683cd5b.json; `bash kit-refitaz/probe1.sh roadcaps 683cd5b --json ...`), clamped by
 * `node kit-refitaz/roadncaps.mjs` on it; the committed caps: luckCapsData.ts, IDENTICAL to that commit's switch-off
 * `npm run luckcaps -- --check` (the subtraction holds only then). Pooled rows: ordinary rare 0 0 0 0 1 1 2 1 1 2, epic 0;
 * good rare 0 0 1 1 1 2 1 2 2 3, epic 0 0 0 0 1 0 0 0 0 0.
 */
export const NPC_ROAD_COUNT: Readonly<Record<"furnace" | "weaver" | "foundry" | "bastion", Readonly<Record<RoadCountTier, RoadCountRow>>>> = {
  furnace: { ordinary: { rare: [0, 0, 0, 0, 1, 1, 2, 1, 1, 1], epic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, good: { rare: [0, 0, 1, 1, 1, 2, 1, 2, 2, 1], epic: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0] } },
  weaver: { ordinary: { rare: [0, 0, 0, 0, 1, 1, 2, 1, 1, 2], epic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, good: { rare: [0, 0, 1, 0, 0, 1, 1, 2, 2, 3], epic: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0] } },
  foundry: { ordinary: { rare: [0, 0, 0, 0, 1, 1, 2, 1, 1, 2], epic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, good: { rare: [0, 0, 1, 1, 1, 2, 1, 2, 2, 3], epic: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0] } },
  bastion: { ordinary: { rare: [0, 0, 0, 0, 1, 1, 1, 1, 1, 2], epic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, good: { rare: [0, 0, 1, 1, 1, 2, 1, 2, 2, 3], epic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
};

/** REFIT-AZ: ROADN(hero, day, tier) with the NPC day on (days past 10 read day 10's; a hero outside the table 0), 0 with it
 *  off: what a captain deck's luck-cap check adds to the cap's rare and epic (the checks only; see NPC_ROAD_COUNT). */
export function roadCountAllowance(hero: string, day: number, tier: RoadCountTier): { rare: number; epic: number } {
  const t = (NPC_ROAD_COUNT as Record<string, Readonly<Record<RoadCountTier, RoadCountRow>> | undefined>)[hero]?.[tier];
  if (!npcDayRules() || !t) return { rare: 0, epic: 0 };
  const d = Math.max(1, Math.min(t.rare.length, Math.floor(day)));
  return { rare: t.rare[d - 1], epic: t.epic[d - 1] };
}

export interface RivalLoadout {
  build: Build;
  crates: number;
  plating: number; // paid plating (the ARMOR PACKs the plan bought)
  pvePlates: number; // 0.8.9 (CATCHUP-089 fallback 2): free PvE plates in the hull, not paid (0 at ordinary luck)
  value: number; // gold a player would pay for the same deck, gear and supplies
}

const F = (def: string, x: number, y: number, ...belts: Belt[]): FactoryPlan => ({ def, x, y, belts });
const G = (at: number, def: string, x: number, y: number, rot = 0): Upgrade => ({ at, gate: [def, x, y, rot] });
const M = (at: number, def: string, turret: number): Upgrade => ({ at, mod: [def, turret] });
const G2 = (at: number, def: string, x: number, y: number): Upgrade => ({ at, fuseGate: [def, x, y] });
const M2 = (at: number, def: string, turret: number): Upgrade => ({ at, fuseMod: [def, turret] });
const P = (at: number, n = 1): Upgrade => ({ at, plating: n });
/** A factory bought on day `at` with its belt, plus any belt crates the belt needs. */
const X = (at: number, f: FactoryPlan, crates = 0): Upgrade => ({ at, factory: f, crates });
/** TUNE-C: a turret bought on day `at` and installed in `slot`, and another star for the slot's turret. */
const T = (at: number, def: string, slot: number): Upgrade => ({ at, turret: [def, slot] });
const T2 = (at: number, slot: number): Upgrade => ({ at, fuseTurret: [slot] });
/** TUNE-C: upgrades that need good luck (Hard warlords) or the stars aligning (the Iron Matriarch). */
const good = (...us: Upgrade[]): Upgrade[] => us.map((u) => ({ ...u, luck: "good" }));
const stars = (...us: Upgrade[]): Upgrade[] => us.map((u) => ({ ...u, luck: "stars" }));
/** TUNE-C: good luck brings the upgrade on day `day` (before its ordinary day u.at). */
const soon = (day: number, u: Upgrade): Upgrade => ({ ...u, sooner: { ...u.sooner, good: day } });
void T2;

// 0.6.2 TUNE-C retime (ref/BRIEF-final-062-captains.md section 3; OUT/CAPTAINS-REPORT.md). Every plan was regrown day by
// day against the FURNACE par field (K 24; the calibration field) by OUT/tools/capsearch.ts, inside its luck tier's caps:
// Easy stand-ins about 30%, Medium about 50%, Hard stand-ins about 68% (ordinary luck), Hard warlords about 70% (good
// luck: the "good" upgrades), the Iron Matriarch about 80% on days 8-10 (stars-aligned). Each build keeps its blurb's
// parts (its `synergy`), bought early and grown on; the search filled around them. Values stay well under
// maxGoldByDay (R1) and under each tier's measured caps. A part's uid is its upgrade's index, so the order below is the
// order the decks were measured in (tests/rivals.test.ts: in day order).
// 0.8.9 (job CATCHUP-089, REQ-BFG-024, REQ-BFG-051; cap's ruling on PACKS Q10, oracle c6b7a0aae081a6a3, option 1): the
// par field buys ARMOR PACKs (0.8.6), so the captains buy them too: P() is an ARMOR PACK (5 g, +250 hull), bought up to
// the par field's mean count for the captain's hero and day (par players 1-24, rounded), with only the gold the plan
// leaves over: capsearch's packs mode added, day by day, the most packs that keep every deck within maxGoldByDay and its
// luck caps, the roadCap guard, and the stand-in deck's gold upgrades (captainLevels). Each P() sits at the end of its
// day, so earlier parts keep their uids. A Hard captain's packs are owned by its good-luck road deck too: where that deck
// can't afford them, its gold upgrades (FACTORY / TURRET SPEED level 2) come on the first later day its gold allows
// (captainLevels' own rule), or not at all when no day up to 10 holds them (cap's ruling Q1 e2ca295ce9dcd60a, (B)).
export const PLANS: Record<RivalId, RivalPlan> = {
  // ---------------------------------------------------------------- Easy (tier 1)
  // SHORT STITCH: the loom parked right under the guns on three short stitches. Synergy: a WHETSTONE on the centre
  // stitch from day 1 (2 stars from day 5) and a ROTARY core (fires the oldest load first) from day 2: short belts that
  // fire first. It grows with poison, burn (a temper, a keg, a drake core) and a sorting arm.
  nettle: {
    hero: "weaver", crates: 0, synergy: ["whetstone", "rotary"],
    factories: [F("loom", 4, 2, [4, 1, "U1"], [3, 2, "L2U2"], [6, 2, "R2U2"])],
    upgrades: [
      // bb-0.8.3 (job BELTS run 4): the sorting arm on day 7 (was 6): with the uniform rule's LOOM level on day 6 she sat
      // below HIGHSPIRE (Hard) on day 6 (rivals.difficulty)
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 4, the named stand-ins on days 4-6; REVIEW-CATCHUP097 ruling 4: one
      // ordinary-plan re-plan pass of her dusk deck): two ARMOR PACKs on day 4 (P(4, 2), at the end of the day) and one on
      // day 5 (was P(5, 2)), so she holds 2 / 3 / 3 packs on days 4-6 (the WEAVER par field's count 2 / 3 / 3; were 0 / 2 /
      // 2); the whetstone's second star on day 4 (was 5) and the sorting arm on day 6 (was 7; see below), each within her
      // ordinary caps (capsearch check). Her dusk deck (and her Easy road deck, the same deck) reads 1 / 5 / 5 -> 11 / 10 / 33%
      // on days 4-6 (kit098 tqprobe, K 24)
      G(1, "whetstone", 3, 0, 1), G(2, "venom", 5, 0), M(2, "rotary", 1), G(3, "temper", 0, 0, 1), G(3, "keg", 2, 1, 1), P(4, 2), G2(4, "whetstone", 3, 0),
      // bb-0.8.6 (job PACKS M4, the packs' regenerated caps): the quench tank on day 10 (was 9; WEAVER's day-9 ordinary
      // rare cap is 6)
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 0/0/2/2/2/2/2/3 on days 3-10, under the WEAVER par field's 1/1/2/3/4/5/5/7: with
      // the full count her Easy road deck beat par (47-67% on days 6-10) and stood above the Hard captains (the ladder);
      // the least trim that passes it (cap's ruling Q2 f77489ebe2e11698; capsearch lfix), and her day-3 pack on day 5
      // once SILKSHADE's day-3 pack left for the walls (the ladder on day 4)
      // FLIP-X2 step 4.4 (cap's ruling 97e639e5813acb37): at ordinary luck the drake on day 5 (was 4; WEAVER's ordinary
      // rare cap is 2 on day 4); soon() keeps the warlord's day 4
      soon(4, M(5, "drake", 0)), P(5), G(6, "sorting", 3, 1, 1), M(8, "flak", 0),
      // Y7b2 (the regenerated caps, bb-0.9.3): at ordinary luck the overclocker 8 -> 9 (WEAVER ordinary rare+ d8, cap 6 -> 5:
      // stand-in and warlord 6 > 5; of the two non-synergy rares that arrive on day 8, the flak and the overclocker, the later
      // bought); soon() keeps day 8 at good luck; right after M(8, flak), the last entry with an earlier day; re-placed in day
      // order (cap's ruling 1cfdc5fff106d58f)
      soon(8, G(9, "overclocker", 0, 1)), G(10, "quench", 2, 0), P(10),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [M(2, "mantlet", 1), M(3, "pressure", 2), G(3, "grease", 6, 1, 2), { ...G(5, "counterweight", 7, 0), dusk: true }, P(6), G2(6, "temper", 0, 0), { ...G(6, "temper", 5, 1, 3), dusk: true }, P(7), P(8, 2), P(9), { ...G2(9, "venom", 5, 0), dusk: true }, P(10), { ...G(10, "whetstone", 0, 2, 1), dusk: true }, { ...G(10, "staticbrush", 1, 3, 1), dusk: true }, { ...G(10, "tollbooth", 2, 3), dusk: true }],
  },
  // PRESS GANG: a DOUBLE STAMP (a rare stamp press) beside the kiln feeds the heavy turret's second intake from day 1.
  // Synergy: the DOUBLE STAMP and a WHETSTONE on its belt from day 2 (2 stars from day 7), with a temper beside it (2
  // stars from day 6). The kiln belt gets a brake; a keg, flak, a static brush, a drake core, a surge valve and a long
  // haul follow.
  grubnose: {
    hero: "furnace", crates: 0, synergy: ["doublestamp", "whetstone"],
    factories: [F("kiln", 3, 6, [4, 5, "U5"])],
    upgrades: [
      // bb-0.8.6 (job PACKS M4): the DOUBLE STAMP on day 2 (was 1; FURNACE's day-1 ordinary rare cap is 0)
      X(2, F("doublestamp", 8, 1, [9, 3, "L2ULULU"])), G(2, "whetstone", 6, 0, 2), G(2, "temper", 7, 1, 2),
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/2/2/2/3/4 on days 3-10, under the FURNACE par field's 1/1/2/3/4/5/6/7: the
      // gold allowed 1/1/2/3/3/3/5/6, and with it his Easy road deck stood above THANE KARSK (the ladder) on days 8-10; the
      // least trim that passes it (cap's ruling Q2 f77489ebe2e11698; capsearch lfix: days 8-10, and days 6-7 with day 8)
      // FLIP-X2 step 4.4 (cap's ruling 97e639e5813acb37): at ordinary luck the static brush on day 6 (was 5; FURNACE's
      // ordinary rare cap is 3 on day 5); soon() keeps the warlord's day 5
      // ... re-placed in day order (cap's ruling 1cfdc5fff106d58f): right after the last entry with an earlier day
      G(2, "brake", 3, 4, 1), G(3, "keg", 5, 2), P(3), M(4, "flak", 0), P(5), soon(5, G(6, "staticbrush", 6, 3)), G2(6, "temper", 7, 1),
      G2(7, "whetstone", 6, 0), M(8, "drake", 0), G(9, "surge", 9, 4, 1), P(9), G(10, "longhaul", 3, 0), P(10),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [P(4), { ...G(5, "heatjacket", 3, 5), dusk: true }, P(6), G(6, "temper", 7, 4), G(6, "tollbooth", 8, 4), P(7), P(8, 2), G2(9, "keg", 5, 2), P(10), G(10, "whetstone", 3, 1, 1), G(10, "grease", 5, 4, 3)],
  },
  // OVERCLOCK: a short kiln belt with a whetstone, a counterweight and a brake (2 stars from day 7). Synergy: a
  // CALIBRATE on the gun from day 3 (2 stars from day 7) and an OVERDRIVE on the kiln belt from day 6 (a legendary:
  // ordinary luck owns no epic or legendary before day 6). Then a temper, a gatling core, quench, venom, a tollbooth, a
  // surge valve and a long haul.
  ratchet: {
    hero: "furnace", crates: 0, synergy: ["overdrive", "calibrate"],
    factories: [F("kiln", 2, 6, [3, 5, "R1U5"])],
    upgrades: [
      // FINAL-MEASURE (the Prime's ladder fix, oracle e2d655e0): the whetstone comes on day 2 (was 1), the counterweight
      // and the brake on day 3 (were 2), and the tollbooth, surge valve and long haul on day 9 (were 8), so the Easy
      // OVERCLOCK stays easier than every Hard warlord on day 1 and than every Medium on days 2 and 8 (rivals.difficulty)
      // bb-0.8.3 (REQ-BFG-043 D7', job BELTS run 4): the luck caps regenerated with the par player buying its gold
      // upgrades fell (ordinary FURNACE: no epic or legendary before day 6, 4 rares on day 5, 5 on day 6, no bought turret
      // on any day), so the least change: the OVERDRIVE on day 6 (was 5), the venom on day 7 (was 6), no DART GUN (was 9)
      // bb-0.8.6 (job PACKS M4): under the packs' caps (ordinary FURNACE: no epic+ before day 7, rare+ 4/5/5/6/7 on days
      // 6-10) the OVERDRIVE on day 7 (was 6), a sifter (common) for the venom (day 7) and the long haul on day 10 (was 9)
      // FLIP-X2 (REVIEW-NUM3 answer 2; oracle 77e35129477cb4ca): SIFTER dormant, its sifter removed (value -3 g from day 7)
      G(2, "whetstone", 3, 2, 1), G(3, "counterweight", 3, 0), G(3, "brake", 5, 5, 3), M(3, "calibrate", 0),
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/1/1/1/2/3/4 on days 3-10 (the FURNACE par field's 1/1/2/3/4/5/6/7: his day-7
      // OVERDRIVE leaves no gold for more beside his gold upgrades)
      // FLIP-X2 step 4.4 (cap's ruling 97e639e5813acb37): at ordinary luck the quench on day 6 (was 5; FURNACE's ordinary
      // rare cap is 3 on day 5) and the OVERDRIVE (synergy; captains.synergy still passes) on day 8 (was 7; FURNACE's
      // ordinary epic+ cap is 0 on day 7); soon() keeps the warlord's days 5 and 7
      // ... re-placed in day order (cap's ruling 1cfdc5fff106d58f): right after the last entry with an earlier day
      G(3, "temper", 3, 3, 1), P(3), M(4, "gatling", 0), soon(5, G(6, "quench", 3, 1)),
      M2(7, "calibrate", 0), G2(7, "brake", 5, 5), soon(7, G(8, "overdrive", 5, 3)), P(8), G(9, "tollbooth", 5, 1, 3), G(9, "surge", 4, 6, 1), P(9),
      G(10, "longhaul", 5, 4), P(10),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [P(4), P(5), P(6), P(7), G(7, "brake", 3, 4, 1), P(8), G2(9, "temper", 3, 3), G(9, "temper", 5, 2, 3), G(9, "grease", 2, 5, 1), P(10)],
  },
  // HARD ELITE, FRAY STORM: a loom with a centre bolt and two long swept wings, two armor plates (days 2 and 3).
  // Synergy: a BARBED SPOOL from day 1 (every hit adds fray, later hits deal more per stack) and a SPLITTER on a wing
  // from day 5 (twice the hits, so the fray piles up), with a temper, a long haul and a quench tank. Good luck: the
  // temper's second star on day 10.
  mothqueen: {
    hero: "weaver", crates: 0, synergy: ["splitter", "barbed"],
    factories: [F("loom", 4, 4, [4, 3, "U3"], [3, 5, "L1D1L1U6"], [6, 5, "R1D1R1U6"])],
    upgrades: [
      // 0.8.0 B1 M3 (capsearch; output-B1/m3/O13-NOTES.md): the stand-in's long haul back to day 3, the static brush,
      // riveter and venom later at ordinary luck (soon() keeps the warlord's days): stand-in at most 76 on days 6-10, and
      // day 8 above the Iron Matriarch's margin (B1_EXCEPTIONS emptied)
      // bb-0.8.3 (job BELTS run 4): the SPLITTER on day 6 at ordinary luck (was 5; the stand-in's day-5 epic cap fell to
      // 0); soon() keeps the warlord's day 5
      // bb-0.8.6 (job PACKS M4): at ordinary luck the BARBED SPOOL on day 2 (was 1) and the venom on day 10 (was 9; WEAVER's
      // ordinary rare caps 0 on day 1 and 6 on day 9), soon() keeping the warlord's days 1 and 9; the static brush on day 7
      // at good luck too (was 6: the good rare cap is 5 on day 6)
      G(1, "temper", 3, 1, 1), soon(1, G(2, "barbed", 3, 0)), M(2, "scatter", 1), P(2), P(3), G(3, "longhaul", 5, 0),
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs on her two plates, 3/3/5/5/7 in all on
      // days 6-10 (the WEAVER par field's 3/4/5/5/7; a day-7 pack: her road deck's FACTORY level 2 would leave again)
      // FLIP-X2 step 4.4 (cap's ruling 97e639e5813acb37): at ordinary luck the flak on day 5 (was 4; WEAVER's ordinary rare
      // cap is 2 on day 4); soon() keeps the warlord's day 4
      soon(4, M(5, "flak", 0)), P(6),
      // REDO-X (cap's rulings 97e639e5813acb37, e778dc5d38efd5fd): at ordinary luck the SPLITTER (synergy; captains.synergy
      // still passes) on day 7 (was 6; WEAVER's ordinary epic+ cap is 0 on day 6); soon() keeps the warlord's day 5; right
      // after P(6), the last entry with an earlier day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 3, the Hard band on day 4; REVIEW-CATCHUP097 ruling 2, her good-luck road
      // deck first; cap's yes for roadCap, oracle bc842e7024551665): the SPLITTER at good luck on day 4 (was 5; ordinary day
      // 7 and her stand-in deck unchanged). Her day-4 road deck 24 -> 48% (walls F / W 100 / 100 -> 80 / 96); good value 31 ->
      // 38 of 38 (R1 42), epic 1 of 1. Her day-4 prize becomes the SPLITTER: the best Hard prize row 5 6 6 6 7 7 7 10 10 10 ->
      // 5 6 6 7 7 7 7 10 10 10, so roadCap moves (+1 g on day 4, +1-2 g on days 6-10; src/net/roadCap.ts reads the tables)
      // CATCHUP-091 (the walls; lever d, cap's ruling 3c58471c74bdc4ed Q2): the static brush on day 8 (was 7), at both
      // lucks (it has no good-luck day of its own). With it on day 7 the par field's top quartile beat her day-7 road deck
      // 21% of the time (FURNACE; 100% at 1210ee8); a day later 69%
      soon(4, G(7, "splitter", 2, 4, 2)), G(8, "staticbrush", 0, 1), P(8, 2),
      // Y7b2 (the regenerated caps, bb-0.9.3): at ordinary luck the riveter 8 -> 9 (WEAVER ordinary rare+ d8, cap 6 -> 5: stand-in
      // 6 > 5; of the two non-synergy rares that arrive on day 8, the static brush and the riveter, the later bought); soon()
      // keeps the warlord's day 6; right after P(8, 2), the last entry with an earlier day; re-placed in day order (cap's ruling
      // 1cfdc5fff106d58f)
      soon(6, G(9, "riveter", 5, 1)), ...good(G(9, "counterweight", 2, 0)), soon(9, G(10, "venom", 0, 0)), ...good(G2(10, "temper", 3, 1)), P(10, 2),
    ],
    // 0.8.9 (CATCHUP-089 fallback 2): her road deck read 46% on day 7 with 3 of the 4 packs: one PvE plate that day
    // CATCHUP-091 (the walls, cap's ruling Q2 f77489ebe2e11698 rule 4; Q1 e2ca295ce9dcd60a rule 5: fallback 2 is trimmed
    // first): the day-7 plate goes. With it the par field's top quartile beat her day-7 road deck 21% of the time
    // (FURNACE; 100% at 1210ee8); without it 26%
    // CATCHUP-093 fallback 2 (cap's ruling Q1 e2ca295ce9dcd60a rule 4 and HB 678fb328359e02f1: a Hard captain under 0.55 on
    // release Y's field, up to the par count): her road deck read 51% on day 7 and 50% on day 10 with 3 / 7 of the WEAVER
    // par field's 4 / 8 packs: one PvE plate each day (60% and 56%; walls day 7 71 / 98 -> 61 / 96, day 10 74 / 97 -> 70 / 92)
    pve: { 7: 1, 10: 1 },
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [{ ...M(1, "rotary", 0), dusk: true }, { ...M(2, "mantlet", 1), dusk: true }, { ...G(2, "grease", 3, 3, 1), dusk: true }, ...good(G2(2, "barbed", 3, 0)), ...good(G(2, "grease", 3, 3, 1)), { ...M(3, "pressure", 2), dusk: true }, ...good(M(3, "mantlet", 1)), ...good(M(3, "rotary", 0)), { ...G2(4, "temper", 3, 1), dusk: true }, ...good(G2(4, "grease", 3, 3)), { ...P(5), dusk: true }, { ...G(5, "heatjacket", 5, 3), dusk: true }, ...good(P(5)), ...good(G(5, "heatjacket", 3, 4, 1)), { ...G2(6, "barbed", 3, 0), dusk: true }, ...good(G2(6, "longhaul", 5, 0)), { ...P(7), dusk: true }, ...good(G(7, "whetstone", 3, 2, 1)), ...good(G(7, "tollbooth", 5, 2, 3)), ...good(G(7, "overclocker", 0, 4)), ...good(M(7, "pressure", 2)), ...good(P(8)), { ...P(9), dusk: true }, { ...G2(9, "staticbrush", 0, 1), dusk: true }, { ...G(9, "tollbooth", 3, 2, 1), dusk: true }, ...good(G(9, "grease", 5, 3, 3)), { ...G(10, "temper", 2, 0, 3), dusk: true }, { ...G(10, "bellows", 2, 1), dusk: true }, { ...G(10, "brake", 0, 3, 1), dusk: true }, { ...G(10, "whetstone", 0, 2, 1), dusk: true }, ...good(G(10, "temper", 2, 1, 3)), ...good(G(10, "bellows", 0, 2)), ...good(G(10, "longhaul", 2, 2)), ...good(G(10, "brake", 0, 5, 1))],
  },
  // ---------------------------------------------------------------- Medium (tier 2)
  // SLOW COOKER: the kiln at the back, one 13-tile serpentine so every slug cooks on the way. Synergy: the ride-time
  // rigs that pay off a long belt: a HEAT JACKET from day 3 (2 stars from day 6), BELLOWS from day 4 and a
  // COUNTERWEIGHT from day 6, with a quench tank, a temper, a whetstone, a long haul and venom.
  sootjaw: {
    hero: "furnace", crates: 0, synergy: ["counterweight", "heatjacket", "bellows"],
    factories: [F("kiln", 4, 7, [4, 6, "L3U2R2U2R1U2"])],
    upgrades: [
      // FINAL-MEASURE (the Prime's ladder fix, oracle e2d655e0): the quench tank comes on day 2 (was 1), so on day 1 the
      // Medium slot stays 0.05 easier than Hard (rivals.difficulty), whose decks sit at the day-1 good-luck cap
      G(2, "quench", 3, 0), G(2, "temper", 3, 1, 1), G(3, "heatjacket", 2, 5, 1), M(3, "scatter", 0), P(3),
      G(4, "bellows", 5, 2),
      // bb-0.8.3 (job BELTS run 4): no SPIKE GUN (was day 9): the regenerated caps' ordinary FURNACE turret cap is 0 on
      // every day
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/3/3/4/6/7 on days 3-10 (the FURNACE par field's 1/1/2/3/4/5/6/7)
      G(5, "whetstone", 5, 1, 3), P(5), G(6, "counterweight", 4, 3, 1), G2(6, "heatjacket", 2, 5), P(6),
      // Y7b2 (the regenerated caps, bb-0.9.3): at ordinary luck the long haul 7 -> 8 (FURNACE ordinary rare+ d7, cap 5 -> 4:
      // stand-in and warlord 5 > 4; the part that arrives on day 7, non-synergy); soon() keeps day 7 at good luck; right after
      // P(6), the last entry with an earlier day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 2; REVIEW-CATCHUP097 ruling 1: every captain re-fit to bb-0.9.7's FURNACE par
      // ARMOR PACK count, 0 0 1 1 2 2 3 4 6 6): no day-10 pack (was P(10)), so he holds 6 on day 10 (was 7, one over)
      soon(7, G(8, "longhaul", 2, 3)), P(8), G(9, "venom", 3, 5, 1), P(9, 2),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [M(2, "mantlet", 0), P(4), G2(4, "bellows", 5, 2), G(4, "grease", 2, 2, 1), G(5, "brake", 0, 5, 1), G(6, "tollbooth", 1, 3, 2), { ...G(6, "overclocker", 0, 4), dusk: true }, P(7), G2(9, "quench", 3, 0), P(10, 2), { ...G(10, "sorting", 4, 4), dusk: true }],
  },
  // SHOCK TROOPER: synergy: a GALVANIC COIL on the kiln belt from day 1 (2 stars from day 7) stalls the enemy
  // machinery, a LODESTONE from day 3 hits harder for every stalled machine, and a TESLA core from day 6 arcs to the
  // nearest machine. Filled with a temper, whetstone, tollbooth, long haul and surge valve.
  sparkfang: {
    hero: "furnace", crates: 0, synergy: ["coil", "lodestone", "tesla"],
    factories: [F("kiln", 4, 6, [4, 5, "L2U3R2U2"])],
    upgrades: [
      // bb-0.8.6 (job PACKS M4): the coil on day 2 (was 1) and the TESLA core on day 7 (was 6): FURNACE's ordinary rare
      // cap is 0 on day 1, its epic cap 0 until day 7
      // FLIP-X2 (REVIEW-NUM3 answer 2; oracle 77e35129477cb4ca): SIFTER dormant, its sifter removed (value -3 g from day 4)
      G(2, "coil", 3, 1, 1), G(2, "temper", 3, 0, 1), G(3, "lodestone", 5, 1), G(3, "whetstone", 1, 3, 1),
      // FLIP-X2 step 4.4 (cap's ruling 97e639e5813acb37): at ordinary luck the surge valve on day 6 (was 5; FURNACE's
      // ordinary rare cap is 3 on day 5); soon() keeps the warlord's day 5; right after P(5), the last entry with an
      // earlier day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      G(3, "tollbooth", 5, 2, 3), P(3), G(4, "longhaul", 4, 3, 1), P(5), soon(5, G(6, "surge", 1, 5)),
      // bb-0.8.3 (job BELTS run 4): no DART GUN (was day 9): no ordinary FURNACE turret on any day under the regenerated caps
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/2/2/2/5/7 on days 3-10 (the FURNACE par field's 1/1/2/3/4/5/6/7: his day-7
      // TESLA core leaves no gold for more beside his gold upgrades until day 9)
      // FLIP-X2 step 4.4 (cap's ruling 97e639e5813acb37): at ordinary luck the TESLA core (synergy; captains.synergy still
      // passes) on day 8 (was 7; FURNACE's ordinary epic+ cap is 0 on day 7); soon() keeps the warlord's day 7; right after
      // G2(7, coil), the last entry with an earlier day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 2; REVIEW-CATCHUP097 ruling 1: bb-0.9.7's FURNACE par count 6 on day 10): one
      // day-10 pack (was P(10, 2)), so he holds 6 on day 10 (was 7, one over)
      G2(7, "coil", 3, 1), soon(7, M(8, "tesla", 0)), G2(8, "temper", 3, 0), P(9, 3), P(10),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [M(2, "mantlet", 0), G(3, "grease", 4, 4, 2), P(4), { ...G(5, "counterweight", 3, 3, 1), dusk: true }, P(6), P(7), G(8, "temper", 2, 1, 2), G2(9, "longhaul", 4, 3), { ...G(9, "venom", 1, 2), dusk: true }, P(10), { ...G(10, "staticbrush", 1, 4), dusk: true }],
  },
  // SPLITTER SWARM: synergy: a WHETSTONE from day 1 ahead of the SPLITTER, so both copies gain it. Splitters are epics,
  // so at ordinary luck they come later: one on the centre belt on day 6 (2 stars on day 8), another on day 9. Until
  // then a scatter core, a temper, venom, a keg and a long haul hold the line.
  lacewing: {
    hero: "weaver", crates: 0, synergy: ["splitter", "whetstone"],
    factories: [F("loom", 4, 4, [4, 3, "U3"], [3, 4, "L2U4"], [6, 4, "R2U4"])],
    upgrades: [
      // 0.8.0 B1 M3: the keg before the venom (day 3, the venom day 4) and the first splitter on day 7, not 6: her day-3
      // and day-6 decks read 83 and 81 vs the FURNACE field (K 24), over the stand-ins' 80
      G(1, "whetstone", 3, 0, 1), M(1, "scatter", 1), G(2, "temper", 3, 1, 1), G(3, "keg", 7, 0), P(3), G(4, "venom", 3, 2),
      // bb-0.8.6 (job PACKS M4): no second splitter (was day 9): WEAVER's ordinary epic+ cap is 1 on days 9 and 10
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/3/3/5/5/7 on days 3-10 (the WEAVER par field's count, but day 7's pack
      // comes on day 8: with it the Medium slot came within 0.05 of the Hard one on day 7, the ladder; the least trim that
      // clears it, cap's ruling Q2 f77489ebe2e11698; capsearch lfix)
      G(5, "longhaul", 5, 2), P(5), P(6), G(7, "splitter", 5, 1), G2(8, "splitter", 5, 1), G(8, "grease", 3, 3, 2),
      G(8, "brake", 0, 0, 1), P(8, 2), P(10, 2),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [G(2, "tollbooth", 5, 0, 3), M(2, "mantlet", 1), M(3, "rotary", 2), P(4), G2(4, "temper", 3, 1), M(5, "pressure", 0), { ...M(5, "ram", 2), dusk: true }, { ...G(6, "bellows", 9, 0), dusk: true }, P(7), G(8, "temper", 5, 3, 3), P(9), G2(9, "venom", 3, 2), { ...G(9, "staticbrush", 7, 1), dusk: true }, { ...G(10, "barbed", 2, 0), dusk: true }, { ...G(10, "venom", 9, 1), dusk: true }],
  },
  // EMBER WEAVE: synergy: a TEMPER on the centre thread from day 1 (2 stars from day 4), a DRAKE core from day 3 (flat
  // damage turns to burn), BELLOWS on the right thread from day 5 and a second temper on the left from day 6: from
  // day 6 every belt burns. Venom, a whetstone, a pressure core, flak, a sorting arm and a long haul fill in.
  emberlyn: {
    hero: "weaver", crates: 0, synergy: ["temper", "bellows", "drake"],
    factories: [F("loom", 4, 5, [4, 4, "U4"], [3, 5, "L2U5"], [6, 5, "R2U5"])],
    upgrades: [
      // bb-0.8.6 (job PACKS M4): the static brush on day 7 (was 5) and the long haul on day 10 (was 9): WEAVER's ordinary
      // rare caps are 3, 4 and 6 on days 5, 6 and 9
      G(1, "temper", 3, 3, 1), G(2, "venom", 3, 0), M(3, "drake", 1), G(3, "whetstone", 5, 0, 3), M(3, "pressure", 0),
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/2/2/4/5/7 on days 3-10 (the WEAVER par field's 1/1/2/3/4/5/5/7: days 6-7
      // keep her gold upgrade)
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 4, the named stand-ins on days 4-6; REVIEW-CATCHUP097 ruling 4: one
      // ordinary-plan re-plan pass of her dusk deck): one of her day-8 pair of ARMOR PACKs on day 4 (P(4), at the end of the
      // day; P(8, 2) -> P(8)), so she holds 2 / 3 / 3 packs on days 4-6 (the WEAVER par field's count; were 1 / 2 / 2) and
      // the same from day 8; her flak on day 7 (was 6), so day 6 keeps its value cap (60 of 62) and FACTORY level. Her dusk
      // deck (and her Medium road deck, the same deck) reads 11 / 15 / 36 / 42 -> 19 / 19 / 33 / 54% on days 4-7 (kit098
      // tqprobe, K 24)
      P(3), G2(4, "temper", 3, 3), P(4), G(5, "bellows", 7, 2), P(5), G(6, "temper", 0, 1, 1),
      G2(7, "whetstone", 5, 0), M(7, "flak", 0), G(8, "sorting", 3, 4, 1), P(8),
      // Y7b2 (the regenerated caps, bb-0.9.3): at ordinary luck the static brush 7 -> 9 (WEAVER ordinary rare+ d7, cap 5 -> 4, and
      // d8, cap 6 -> 5: stand-in and warlord 5 > 4 and 6 > 5; the part that arrives on day 7, non-synergy; day 8 can't hold it
      // beside the sorting arm, so day 9, and day 8 fits without it); soon() keeps day 7 at good luck; right after P(8, 2), the
      // last entry with an earlier day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      soon(7, G(9, "staticbrush", 3, 2)), P(9), G(10, "longhaul", 3, 1), P(10, 2),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [M(2, "mantlet", 1), M(2, "rotary", 2), G(5, "brake", 6, 4, 2), G(5, "grease", 9, 2, 3), { ...G(5, "keg", 7, 0), dusk: true }, P(6), P(7), G(7, "tollbooth", 0, 0, 1), P(8), G2(9, "venom", 3, 0), G(10, "whetstone", 5, 1, 3), { ...G(10, "venom", 5, 2), dusk: true }],
  },
  // HARD ELITE, IRONCLAD: three armor plates (days 3, 4 and 5) and a braked cooker behind them. Synergy: a BRAKE SHOE
  // on the kiln belt from day 1 (slugs ride twice as long) and a HEAT JACKET from day 4 (damage per second ridden),
  // with a quench tank, a temper, venom, a long haul and a counterweight. Good luck: the brake's second star on day 2
  // (17 g, the day-2 good value cap).
  bulwark: {
    hero: "furnace", crates: 0, synergy: ["brake", "heatjacket"],
    factories: [F("kiln", 4, 6, [4, 5, "L2U3R2U2"])],
    upgrades: [
      // 0.8.0 B1 M3: the quench, venom and day-4 brake star later at ordinary luck (soon() keeps the warlord's days), so
      // the stand-in reads at most 80 (day 1 was 82, day 3 84); the warlord deck is unchanged
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 3, the Hard band on day 5; the brief's same-price swap for the day-5 captains,
      // REVIEW-CATCHUP097 ruling 2): a POWDER KEG (rare, 4 g) for his VENOM DRIP (rare, 4 g), same cell, day and luck (ordinary
      // 4, good 3). His road deck 40 / 52 / 55 / 53 -> 49 / 59 / 60 / 55% on days 4-7 (walls at least 57 / 98 there), his dusk
      // deck 41 / 23 / 10 -> 53 / 34 / 15% on days 4-6 (kit098 tqprobe, K 24); value, rare+ and every cap unchanged
      G(1, "brake", 4, 4, 2), soon(1, G(2, "quench", 3, 1)), G(2, "temper", 2, 1, 2), M(2, "scatter", 0), P(3),
      soon(3, G(4, "keg", 3, 0)), ...good(soon(2, G2(4, "brake", 4, 4))), P(4), G(4, "heatjacket", 3, 4, 1), P(5),
      // bb-0.8.6 (job PACKS M4): at ordinary luck the flak on day 7 (was 6) and the counterweight on day 9 (was 7):
      // FURNACE's ordinary rare caps are 4, 5 and 5 on days 6-8; soon() keeps the warlord's days. The ladder (the Hard mean
      // below 0 on day 7): the good-luck grease on day 7 (was 8)
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs on his three plates, 4/5/6/7 in all on
      // days 7-10 (the FURNACE par field's count), as his stand-in's gold allows; his good-luck road deck pays for them
      // with its TURRET SPEED level 2 (day 8 before; no later day's gold holds it)
      // Y7b2 (the regenerated caps, bb-0.9.3): at ordinary luck the flak 7 -> 8 (FURNACE ordinary rare+ d7, cap 5 -> 4: stand-in
      // 5 > 4; the part that arrives on day 7, non-synergy); right after P(7), the last entry with an earlier day; re-placed in
      // day order (cap's ruling 1cfdc5fff106d58f)
      // CATCHUP-093 (the Hard band on release Y's field; cap's ruling HB 678fb328359e02f1 (B): one part one day earlier at
      // good luck only; his paid packs already meet the par count, so fallback 2 has no room): the static brush (rare,
      // good luck only) on day 8 (was 9). His day-8 road deck 17 -> 25%, walls 97 / 100 -> 85 / 100; value 78 -> 73 g (his
      // levels give way, captainLevels' own room rule; FURNACE good cap 97, R1 97), rare+ 7 of 7
      // REDO-X (cap's ruling 97e639e5813acb37): at ordinary luck the grease on day 10 (was 9; FURNACE's ordinary value cap
      // is 103 on day 9, his stand-in 104 with it; the day's cheapest non-synergy part); right after P(9), the last entry
      // with an earlier day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      // CATCHUP-097 (BRIEF-CATCHUP-097 target 2: the re-plan of OLD BULWARK's good-luck road deck for release Z's field,
      // authorized by the brief; REVIEW-CATCHUP093 ruling 1, BULWARK first). His road deck read 40 / 29 / 17 / 21 / 24 / 42 /
      // 38% against the four par fields on days 4-10 at zbump-accepted, his paid packs over the par count. kit097 capsearch
      // grow (--tier good --from 5, rated against all four par fields, his prize held at or under today's best Hard prize)
      // regrew his good-luck parts from day 5; that overshot the walls on days 6-10, so the plan keeps the grow's day-5 and
      // day-6 buys and one of its later ones, each placement measured (kit097 tqprobe, K 24 on parBench's seeds), all good
      // luck only: the BELLOWS (rare) and the quench's second star on day 5, paid by the long haul's good day 5 -> 6 (its
      // ordinary day; day 5 holds value 50 of R1 50, rare+ 4 of 4); the grease 7 -> 6; the flak 6 -> 8 and the counterweight
      // 7 -> 9 (their ordinary days: the bellows holds a rare slot, FURNACE good rare+ 5 / 6 / 7 on days 6-8); the scatter's
      // second star on day 7 (ordinary 9); the static brush stays on day 8 at a new cell, (3,3) (the bellows holds (5,2));
      // and a SWIVEL GUN in his empty second slot with a DRAG CHAIN FOUNDRY feeding it on day 10 (good turrets 1 of 1). His
      // road deck reads 52 / 55 / 53 / 64 / 57 / 61% on days 5-10 (was 29 / 17 / 21 / 24 / 42 / 38), his walls (FURNACE /
      // WEAVER P75) at least 90 / 99, 57 / 100, 59 / 100, 44 / 90, 63 / 94, 61 / 82. capsearch: check ok, the pays column
      // unchanged (his prize 4-5 g). The ordinary plan (his stand-in deck) is unchanged: every untagged entry keeps its day
      // and its place, so the stand-in deck changes only its later uids
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 2; REVIEW-CATCHUP097 ruling 1: bb-0.9.7's FURNACE par count 4 on day 8 and 6
      // on day 10): his day-8 pack on day 9 (P(8) -> P(9), in place, so no uid moves) and no day-10 pack (was P(10)), so he
      // holds 4 / 6 / 6 packs on days 8-10 (were 5 / 6 / 7). His road deck 64 / 61 -> 59 / 57% on days 8 / 10 (walls 49 /
      // 95 and 67 / 87). His older overs (days 4-7, 2 / 3 / 3 / 4 against 1 / 2 / 2 / 3) stay (cap, bc842e7024551665)
      ...good(G(5, "bellows", 5, 2), G2(5, "quench", 3, 1)),
      G(6, "longhaul", 5, 1), P(7),
      M(8, "flak", 0), P(9), G(9, "counterweight", 1, 2),
      soon(7, M2(9, "scatter", 0)), P(9), ...good(soon(8, G(9, "staticbrush", 3, 3))),
      ...good(T(10, "swivel", 1), X(10, F("dragchain", 6, 1, [8, 1, "U"]))), soon(6, G(10, "grease", 1, 4, 1)),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [{ ...G2(4, "keg", 3, 0), dusk: true }, ...good(G(4, "brake", 3, 6)), { ...P(6), dusk: true }, { ...G2(6, "temper", 2, 1), dusk: true }, ...good(P(6)), ...good(G(6, "quench", 1, 3)), { ...P(8), dusk: true }, ...good(P(8)), ...good(G2(8, "temper", 2, 1)), { ...G(9, "temper", 5, 2, 3), dusk: true }, { ...G(9, "whetstone", 1, 3, 1), dusk: true }, { ...G(9, "tollbooth", 3, 3), dusk: true }, { ...G(9, "sorting", 4, 3), dusk: true }, ...good(G(9, "sorting", 4, 3)), ...good(G(9, "temper", 1, 5, 1)), ...good(G(9, "whetstone", 5, 5, 3)), ...good(G(9, "tollbooth", 2, 6)), { ...P(10, 2), dusk: true }, { ...G(10, "barbed", 1, 5), dusk: true }, ...good(P(10, 2)), ...good(M(10, "rotary", 1)), ...good(M(10, "mantlet", 1))],
  },
  // ---------------------------------------------------------------- Hard (tier 3)
  // STATIC WEB: an off-centre loom and a wide loop. Synergy: GALVANIC COILS, one from day 1 (2 stars from day 4) and a
  // second on another belt from day 5, a static brush from day 3 (2 stars from day 6) and a LODESTONE from day 6 that
  // hits harder for every stalled machine: shock after shock. Good luck: a long haul on day 3.
  silkshade: {
    hero: "weaver", crates: 0, synergy: ["coil", "lodestone"],
    factories: [F("loom", 2, 4, [2, 3, "L1U3"], [4, 4, "U4"], [3, 6, "R5U6"])],
    upgrades: [
      // 0.8.0 B1 M3: the whetstone, counterweight, second coil, bellows and drake later at ordinary luck (soon() keeps the
      // warlord's days): stand-in at most 69 on days 2-10 (was 79-93), and days 8-9 above the Iron Matriarch's margin
      // bb-0.8.6 (job PACKS M4): the packs' caps (WEAVER rare+: ordinary 0 on day 1 and 4 on day 6, good 4-7 on days
      // 5-8 and 9 on day 10): at ordinary luck the coil on day 2 (was 1) and the drake core on day 8 (was 7), soon()
      // keeping the warlord's days 1 and 7; a sifter (common) for the counterweight; the good-luck long haul on day 8 (was
      // 3); both coils kept (tests/presets.fusion); and (the ladder: the Hard mean below 0 on days 5-8) the static brush's
      // second star on day 5 at good luck (ordinary: day 9)
      // FLIP-X2 (REVIEW-NUM3 answer 2; oracle 77e35129477cb4ca): SIFTER dormant, its sifter removed (value -3 g from day 6;
      // day 4 at good luck)
      G(1, "temper", 5, 0, 3), soon(1, G(2, "coil", 3, 0)), M(2, "scatter", 1), soon(2, G(3, "whetstone", 3, 1, 1)),
      // bb-0.8.3 (job BELTS run 4): the bellows on day 7 at ordinary luck (was 6; the stand-in's day-6 rare cap is 5);
      // soon() keeps the warlord's day 5
      // CATCHUP-091 (the walls; lever d, cap's ruling 3c58471c74bdc4ed Q2): the static brush on day 4 (was 3), at both
      // lucks (it has no good-luck day of its own). With it on day 3 the par field's top quartile beat her day-3 road deck
      // 38% of the time (FURNACE; 95% at 1210ee8); a day later 95%
      G(4, "staticbrush", 3, 3), G2(4, "coil", 3, 0),
      soon(5, G(6, "coil", 0, 0)), G(6, "lodestone", 4, 5, 1),
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs 0/0/0/1/2/3/5/7 on days 3-10 (the WEAVER par
      // field's 1/1/2/3/4/5/5/7), as her stand-in's gold allows (days 5-6: the luck caps' value); her good-luck road deck
      // pays for them with its FACTORY level 2 (day 7 before; no later day's gold holds it). The walls (cap's ruling Q2
      // f77489ebe2e11698): her day-3 pack comes on day 6, so the par field's top quartile beats her day-5 road deck 44%
      // of the time again, as at 1210ee8
      // CATCHUP-091 (the walls; lever d, cap's ruling 3c58471c74bdc4ed Q2): the good-luck grease on day 7 (was 6), placed
      // in day order after the day-6 pack. With it on day 6 the par field's top quartile beat her day-6 road deck 34% of
      // the time (FURNACE, with fallback 2's day-6 plates gone; 70% at 1210ee8)
      P(6), ...good(G(7, "grease", 4, 7)), P(7), soon(7, M(8, "drake", 2)), ...good(G(8, "longhaul", 5, 1)), P(8),
      // Y7b2 (the regenerated caps, bb-0.9.3): at ordinary luck the bellows 7 -> 9 (WEAVER ordinary rare+ d7, cap 5 -> 4, and d8,
      // cap 6 -> 5: stand-in 5 > 4 and 6 > 5; the part that arrives on day 7 at ordinary luck, non-synergy; day 8 can't hold it
      // beside the drake core, so day 9, and day 8 fits without it); soon() keeps the warlord's day 5; right after P(8), the
      // last entry with an earlier day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      soon(5, G(9, "bellows", 7, 1)),
      // CATCHUP-091 (the walls; lever d, cap's ruling 3c58471c74bdc4ed Q1): the static brush's second star at good luck on
      // day 6 (was 5; ordinary day 9 unchanged). With it on day 5 the par field's top quartile beat her day-5 road deck 3%
      // of the time (FURNACE; 44% at 1210ee8); a day later 57%
      soon(6, G2(9, "staticbrush", 3, 3)), P(9, 2),
      ...good(G(10, "venom", 3, 2)), ...good(M2(10, "drake", 2)), ...good(M(10, "flak", 0)), P(10, 2),
    ],
    // 0.8.9 (CATCHUP-089 fallback 2): her road deck read 53/51/50% on days 6-8 with 1/2/3 of the 3/4/5 packs: two PvE
    // plates on each of those days
    // CATCHUP-091 (the walls, cap's ruling Q2 f77489ebe2e11698 rule 4; Q1 e2ca295ce9dcd60a rule 5: fallback 2 is trimmed
    // first): the day-6 and day-7 plates go. With them the par field's top quartile beat her road deck 29% (day 6) and
    // 13% (day 7) of the time (FURNACE; 70 and 64% at 1210ee8); without them 34 and 20%
    // CATCHUP-091 fallback 2 (Q1 rule 4; the brief's lever for Hard day 4 and ruling 3c58471c74bdc4ed Q1 and Q5 (2) for
    // day 5, each only while every wall holds): her road deck read 38% on day 4 and 31% on day 5 with none of the WEAVER
    // par field's 2 packs; one PvE plate each day (51% and 38%; day-4 FURNACE walls 59 -> 41, day 5 57 -> 43; two plates
    // read 31 and 28)
    // CATCHUP-097 (the walls on release Z's field, RULINGS-C089 rule 5 and cap's ruling Q2 f77489ebe2e11698 rule 4; Q1
    // e2ca295ce9dcd60a rule 5: fallback 2 is trimmed first): the day-5 plate goes (1 -> 0). With it the par field's top
    // quartile beat her day-5 road deck 38% of the time (FURNACE; 44% at 1210ee8, 44 at 0.9.4); without it 51%
    pve: { 4: 1, 8: 2 },
    // REFIT-AZ-R1 (the walls, BRIEF-REFIT-AZ target 1; kit tqprobe K 24, every switch on, on round 3's par field): the FURNACE
    // par field's top quartile beat her day-6 road deck 35% of the time (base 70, rule 40+); with her day-6 levels held
    // (roadLevelsHeld: the FACTORY level 2 on day 7 again, as the road-less plan) 55% (her road deck 69 -> 47% on day 6)
    roadLevelsHeld: [6],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [{ ...M(1, "rotary", 0), dusk: true }, { ...P(2), dusk: true }, ...good(P(2)), { ...M(3, "mantlet", 1), dusk: true }, ...good(G2(3, "temper", 5, 0)), ...good(M(3, "mantlet", 1)), { ...P(4), dusk: true }, { ...P(5), dusk: true }, ...good(P(5)), { ...G2(6, "temper", 5, 0), dusk: true }, { ...G(6, "temper", 5, 1, 3), dusk: true }, { ...G(7, "tollbooth", 3, 2, 1), dusk: true }, { ...G(7, "grease", 5, 4, 3), dusk: true }, ...good(M(7, "rotary", 0)), ...good(G(7, "brake", 7, 5, 2)), { ...G(8, "venom", 5, 2), dusk: true }, ...good(P(9)), { ...G(10, "splitter", 5, 3), dusk: true }, { ...G(10, "staticbrush", 2, 0), dusk: true }, ...good(G(10, "temper", 5, 2, 3)), ...good(G(10, "tollbooth", 5, 3, 3))],
  },
  // RIG CHAIN: one long cinder belt. Synergy: a WHETSTONE from day 1 (2 stars from day 7) heads a chain of rigs
  // (venom, a counterweight, a hullbreaker core) that a LONG HAUL cashes in from day 5 (+2 damage per hit already
  // taken), then a temper and an overdrive: six rigs by day 8. Good luck: a riveter on day 3, a mantlet on the gun on
  // day 7 and a RAILGUN for the starting gun on day 9.
  longtooth: {
    hero: "furnace", crates: 0, synergy: ["longhaul", "whetstone"],
    factories: [F("kiln", 6, 7, [6, 6, "U1L4U2R2U3"])],
    upgrades: [
      // 0.8.0 B1 M3: the whetstone, venom, counterweight and riveter a day later at ordinary luck (soon() keeps the
      // warlord's days): his day-2 stand-in read 96, over the stand-ins' 80; the warlord deck is unchanged
      // FLIP-X2 step 4.4 (cap's ruling 97e639e5813acb37): at ordinary luck the counterweight on day 6 (was 4; FURNACE's
      // ordinary rare cap is 3 on day 5); soon() keeps the warlord's day 3
      // ... re-placed in day order (cap's ruling 1cfdc5fff106d58f): right after the last entry with an earlier day
      soon(1, G(2, "whetstone", 2, 2, 2)), soon(2, G(3, "venom", 3, 4, 1)),
      // CATCHUP-093 (the Hard band on release Y's field; cap's ruling HB 678fb328359e02f1 (B): one part one day earlier at
      // good luck only, after fallback 2): the LONG HAUL (rare, synergy) on day 4 at good luck (ordinary day 5 unchanged).
      // His day-4 road deck 9 -> 24% (walls 100 / 100); value 17 -> 22 g (FURNACE good cap 39, R1 38), rare+ 4 of 4
      // CATCHUP-093 (the named stand-ins on release Y's field; cap's ruling Q1 e2ca295ce9dcd60a rule 1: an untagged ARMOR PACK
      // within the par count and the stand-in deck's gold): a pack on day 4 (P(4), at the end of the day; one of his day-6
      // pair), so his decks hold 1 / 2 packs on days 4 / 5 (were 0 / 1) and the same from day 6; fallback 2 gives way on days
      // 4-5 (paid + PvE within the count)
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 4, the named stand-ins on days 4-6; REVIEW-CATCHUP097 ruling 4: one
      // ordinary-plan re-plan pass of his dusk deck): the LONG HAUL (synergy) and the temper on day 4 and the whetstone's
      // second star on day 5 at ordinary luck (were 5, 6 and 6; FLIP-X2's and Y7b2's fits moved them for caps that now hold:
      // capsearch check), each at its good-luck day, so his road deck is unchanged; placed at the end of the new day. His
      // dusk deck 7 / 14 -> 52 / 51% on days 4 / 5 (kit098 tqprobe, K 24); ordinary value 25 of 37 and 38 of 49, rare+ 3 of 3
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 3, the Hard band on day 5; lever d, cap's yes, oracle 112bc3b7a16e38fa): a
      // BELLOWS (rare, 5 g, FURNACE's ride-time rig) takes the good-luck RIVETER's entry and cell (3,1), so good luck owns it
      // from day 3; the RIVETER (HEAL; SUSTAIN-1 4.8 rule 7: he keeps it) comes on day 10 at good luck, at (3,2), below; and
      // his day-6 ARMOR PACK comes on day 7 (below). His road deck 3 / 58 / 50 / 68 / 62 -> 62 / 75 / 72 / 76 / 75% on days 3-7
      // (walls at least 54 / 74; he has no wall on day 3) (kit098 tqprobe, K 24); good rare+ and value unchanged on days 3-9;
      // roadCap, the prize row and CAPTAIN_RUNES unchanged. His stand-in deck changes only by the pack
      ...good(soon(3, G(4, "bellows", 3, 1))), M(4, "hullbreaker", 0), P(4), G(4, "longhaul", 5, 3), G(4, "temper", 1, 4, 1), P(5),
      G2(5, "whetstone", 2, 2),
      // CATCHUP-091 (the Hard band on day 4, cap's ruling 3c58471c74bdc4ed Q5 (1); FLIP-X2's candidate move, REDO-X section 4
      // and BAL-2 section 7: it fits day 4 again): the counterweight back on day 4 at ordinary luck (was 6), re-placed in day
      // order right after the hullbreaker; soon() keeps the warlord's day 3
      // Y7b2 (the regenerated caps, bb-0.9.3): the counterweight 4 -> 6 at ordinary luck (FURNACE ordinary rare+ d5, cap 4 -> 3:
      // stand-in 4 > 3; the part that arrives on day 5, the LONG HAUL, is a synergy part, so the latest-bought non-synergy part)
      // and 3 -> 6 at good luck (FURNACE good rare+ d5, cap 5 -> 4: his road deck 5 > 4; at good luck only the fewest part-days,
      // the riveter's 3 -> 6 ties, and the counterweight is the later bought); right after P(5), the last entry with an earlier
      // day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      // CATCHUP-093 (cap's ruling HB 678fb328359e02f1 (B)): the temper (common) on day 5 at good luck (ordinary day 6
      // unchanged). His day-5 road deck 13 -> 42% (walls 100 / 100); value 27 -> 30 g (FURNACE good cap 51, R1 50), rare+ 4
      // of 4. The counterweight stays on day 6 (target 7): a day earlier at good luck its rare reads 5 over day 5's good
      // rare+ cap of 4, and no non-synergy rare of his can leave day 5 (the LONG HAUL there is a synergy part)
      // CATCHUP-097 (the Hard band on release Z's field; HB 678fb328359e02f1 (B), REVIEW-CATCHUP093 ruling 1: LONGTOOTH's
      // early days after BULWARK): the temper (common) on day 4 at good luck (was 5; ordinary day 6 unchanged). capsearch
      // bmoves: value 27 -> 30 g (FURNACE good cap 38, R1 38), rare+ 4 of 4, roadCap unchanged
      // CATCHUP-098 (target 4; ruling 4): the mantlet on day 6 (was 7), at both lucks: his dusk deck 43 -> 54% on day 6, his
      // road deck 65 -> 76% (walls 54 / 74)
      G(6, "counterweight", 4, 4, 1), M(6, "mantlet", 0),
      // bb-0.8.3 (job BELTS run 4): the RAILGUN at good luck only (the warlord's day 9 kept): the regenerated caps give the
      // stand-in no bought turret on any day and one epic+ on day 9 (its OVERDRIVE)
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs 0/0/1/3/3/3/3/5 on days 3-10 (the FURNACE
      // par field's 1/1/2/3/4/5/6/7; days 7-8: the luck caps' value; days 9-10: his road deck's TURRET SPEED level 2 would
      // leave again). The walls (cap's ruling Q2 f77489ebe2e11698): the gold allowed 1/1/2 on days 3-5, and with them the
      // par field's top quartile beat his road deck only 11-39% of the time (66-84% at 1210ee8): none before day 5 and
      // one on day 5 (61%), the other two on day 6
      // CATCHUP-093: one of the two day-6 packs is his day-4 pack (above), so days 6-10 hold what they held (a third pack
      // from day 4 on read his day-8 stand-in at 91 g, over the ordinary value cap of 90)
      // CATCHUP-097 (HB 678fb328359e02f1 (B), LONGTOOTH's early days): the whetstone's second star (common, synergy) on day 5
      // at good luck (ordinary day 6 unchanged). capsearch bmoves: value 35 -> 38 g (FURNACE good cap 52, R1 50), star2 1 of 2
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 2, every captain at bb-0.9.7's FURNACE par count, 2 on day 6; cap's yes,
      // 112bc3b7a16e38fa): his day-6 pack on day 7 (P(6) -> P(7)), so he holds 2 / 3 packs on days 6 / 7 (were 3 / 3; day 6
      // was one over). With the BELLOWS and the day-6 pack the par field's top quartile beat his day-6 road deck 38% of the
      // time (FURNACE); without it 54. His dusk deck reads 67 -> 54% on day 6
      // CATCHUP-098 (cap's yes, 112bc3b7a16e38fa): the RIVETER (good luck only, as before) on day 10, at (3,2): he keeps
      // exactly one riveter, held by his good-luck day-10 deck (tests/botsx.sustain); good rare+ 8 of 9 on day 10
      P(7), G(8, "overdrive", 7, 6), ...good(T(9, "railgun", 0)), P(10, 2), ...good(G(10, "riveter", 3, 2, 1)),
    ],
    // CATCHUP-093 fallback 2 (cap's ruling Q1 e2ca295ce9dcd60a rule 4 and HB 678fb328359e02f1: a Hard captain under 0.55 on
    // release Y's field, up to the FURNACE par field's count 1 / 2 / 6 / 7 less his paid packs 0 / 1 / 3 / 5): his road deck
    // read 5 / 9 / 38 / 32% on days 4 / 5 / 9 / 10; with the plates 9 / 13 / 54 / 45%, his walls 100 / 100, 100 / 100,
    // 75 / 95, 84 / 98. With his day-4 pack (the stand-ins, above) paid + PvE stays within the count: days 4-5 1 -> 0
    // CATCHUP-098 (BRIEF-CATCHUP-098 target 2; REVIEW-CATCHUP097 ruling 1: bb-0.9.7's FURNACE par count 6 on day 10): day
    // 10's plates 2 -> 1, so paid + PvE is 5 + 1 = 6 (was 7, one over). His day-10 road deck 45 -> 40% (walls 94 / 100); the
    // day-10 Hard band takes its lever from MASTER VOSS (below)
    pve: { 9: 3, 10: 1 },
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [{ ...G(1, "tollbooth", 3, 0, 1), dusk: true }, { ...P(2), dusk: true }, ...good(P(2)), { ...G(3, "grease", 1, 3, 1), dusk: true }, ...good(G2(3, "bellows", 3, 1)), ...good(G(3, "grease", 1, 3, 1)), ...good(G(4, "brake", 6, 4, 2)), { ...G(5, "whetstone", 3, 2, 2), dusk: true }, { ...G(5, "bellows", 3, 1), dusk: true }, { ...P(6), dusk: true }, { ...G2(6, "temper", 1, 4), dusk: true }, { ...G(6, "temper", 5, 4, 2), dusk: true }, ...good(P(6)), ...good(G2(6, "venom", 3, 4)), { ...P(8, 2), dusk: true }, { ...G(8, "brake", 5, 6, 1), dusk: true }, ...good(G2(8, "temper", 1, 4)), { ...P(9), dusk: true }, { ...G(9, "barbed", 6, 4, 1), dusk: true }, ...good(G(9, "sorting", 5, 6)), ...good(G(9, "bellows", 3, 0)), { ...G2(10, "venom", 3, 4), dusk: true }, { ...G(10, "venom", 1, 5), dusk: true }, ...good(P(10, 2)), ...good(G(10, "temper", 5, 4, 2)), ...good(G(10, "whetstone", 1, 5, 1)), ...good(G(10, "tollbooth", 7, 5, 3))],
  },
  // TRIPLE THREAT: synergy: burn left (a TEMPER on the left belt from day 1, 2 stars from day 6), a LONG HAUL on the
  // right from day 4 (2 stars the same day) and a SPLITTER in the centre from day 5 (an epic: ordinary luck owns none
  // before day 5), behind a centre whetstone. A mortar core, grease, venom, a tollbooth and a sorting arm
  // fill in. Good luck: a barbed spool on day 3, an overclocker on day 7 and the whetstone's second star on day 10.
  highspire: {
    hero: "weaver", crates: 0, synergy: ["temper", "splitter", "longhaul"],
    factories: [F("loom", 4, 6, [4, 5, "U5"], [3, 6, "L2U6"], [6, 6, "R2U6"])],
    upgrades: [
      // 0.8.0 B1 M3: the stand-in takes some good-luck parts sooner (its daily mean), the warlord deck is unchanged
      // bb-0.8.3 (job BELTS run 4): at ordinary luck the barbed spool on day 5 (was 4) and the SPLITTER on day 6 (was 5):
      // the stand-in's rare caps are 3 on day 4 and 4 on day 5, its epic cap 0 on day 5; soon() keeps the warlord's days
      G(1, "temper", 0, 2, 1), G(1, "whetstone", 3, 0, 1), M(2, "mortar", 0), G(2, "grease", 2, 5, 2),
      // bb-0.8.6 (job PACKS M4): the packs' WEAVER caps (rare+ ordinary 3/4/5 on days 5-7, epic+ ordinary 1, good 4 on day
      // 5): the barbed spool on day 7 at ordinary luck and day 6 at good luck (were 5 and 3), the overclocker on day 8 at
      // ordinary luck (was 7; soon() keeps the warlord's day 7) and the sorting arm at good luck only (still day 9)
      // FLIP-X2 (REVIEW-NUM3 answer 2; oracle 77e35129477cb4ca): SIFTER dormant, its sifter removed (value -3 g from day 6)
      // FLIP-X2 step 4.4 (cap's ruling 97e639e5813acb37): at ordinary luck the venom on day 5 (was 3; WEAVER's ordinary
      // rare cap is 2 on day 4); soon() keeps the warlord's day 3
      // ... re-placed in day order (cap's ruling 1cfdc5fff106d58f): right after the last entry with an earlier day
      G(4, "longhaul", 7, 3), G(4, "tollbooth", 9, 3, 3), G2(4, "longhaul", 7, 3), soon(3, G(5, "venom", 0, 0)),
      // CATCHUP-091 (the Hard band on day 5; cap's ruling 3c58471c74bdc4ed Q5 (3): one part one day earlier at good luck
      // only): the temper's second star at good luck on day 5 (ordinary day 6 unchanged). Her day-5 road deck 46 -> 61%,
      // its walls 99 / 100 -> 79 / 53
      // CATCHUP-093 (the Hard band on release Y's field; cap's ruling HB 678fb328359e02f1 (B): one part one day earlier at
      // good luck only, after fallback 2): the temper's second star (common, synergy) on day 4 at good luck (was 5; ordinary
      // day 6 unchanged). Her day-4 road deck 28 -> 60%, walls 100 / 100 -> 80 / 99; value 32 -> 35 g (WEAVER good cap 38,
      // R1 38), star2 2 of 2
      soon(4, G2(6, "temper", 0, 2)),
      // REDO-X (cap's rulings 97e639e5813acb37, e778dc5d38efd5fd): at ordinary luck the SPLITTER (synergy; captains.synergy
      // still passes) on day 7 (was 6; WEAVER's ordinary epic+ cap is 0 on day 6); soon() keeps the warlord's day 5; right
      // after G2(6, temper), the last entry with an earlier day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 4, the named stand-ins on days 4-6; REVIEW-CATCHUP097 ruling 4: one
      // ordinary-plan re-plan pass of her dusk deck): the SPLITTER on day 6 at ordinary luck (was 7; REDO-X's fit moved it for
      // WEAVER's ordinary epic+ cap 0 on day 6, which now reads 1: capsearch check), so her road deck is unchanged (good 5).
      // Her dusk deck 14 -> 29% on day 6 (kit098 tqprobe, K 24); ordinary value 57 of 62. Days 4-5 have no room (rare+ and 2-star
      // caps full; an ARMOR PACK lifts her road deck over its good value cap 38)
      soon(5, G(6, "splitter", 3, 4)), P(7),
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs 1/2/4/4 on days 7-10 (the WEAVER par field's
      // 4/5/5/7), as her stand-in's gold allows beside its gold upgrade; her good-luck road deck takes its FACTORY level 2
      // on day 8 (was 7) to pay for them
      soon(7, G(8, "overclocker", 6, 5, 1)), G(8, "temper", 5, 0, 3), P(8),
      // Y7b2 (the regenerated caps, bb-0.9.3): at ordinary luck the barbed spool 7 -> 9 (WEAVER ordinary rare+ d7, cap 5 -> 4, and
      // d8, cap 6 -> 5: stand-in 5 > 4 and 6 > 5; of the two rares that arrive on day 7, the SPLITTER (synergy) and the barbed
      // spool, the non-synergy one; day 8 can't hold it beside the overclocker, so day 9, and day 8 fits without it); soon()
      // keeps the warlord's day 6; right after P(8), the last entry with an earlier day; re-placed in day order (cap's ruling
      // 1cfdc5fff106d58f)
      // CATCHUP-093 (the walls on release Y's field, cap's ruling Q2 f77489ebe2e11698 rule 4; BRIEF-CATCHUP-093 lever c, its
      // floor 1210ee8's plan, which had no packs): her two day-9 ARMOR PACKs on day 10 instead (P(9, 2) -> P(10, 2), in place,
      // so no uid moves). With them on day 9 the par field's top quartile beat her day-9 road deck 31% of the time (FURNACE;
      // 85% at 1210ee8); without them 51%. One pack fewer read 37; skipping her day-9 PYRE HEART read 62 but cost days 9-10
      // (road 79 / 61 -> 58 / 54, stand-in 58 / 37 -> 25 / 17), the pack move day 9 alone (road 79 -> 63, stand-in 58 -> 37)
      soon(6, G(9, "barbed", 2, 0)), ...good(G(9, "sorting", 7, 5, 1)), P(10, 2),
      ...good(G(10, "quench", 9, 4)), ...good(G2(10, "whetstone", 3, 0)),
    ],
    // 0.8.9 (CATCHUP-089 fallback 2): her road deck read 40/30/29/30% on days 4-7 with 0/0/0/1 of the 1/2/3/4 packs: PvE
    // plates up to the count on those days
    // CATCHUP-091 fallback 2 (Q1 rule 4: a Hard captain still under 0.55, up to the par count; the brief's lever for Hard day
    // 4; the Hard band on day 8, which the walls' fixes took under 55): day 4 1 -> 2 plates (the WEAVER par field's count
    // 2 at 0.9.1; 33 -> 52%), day 8 0 -> 3 (count 5, 2 paid; 36 -> 67%); her walls hold (day 4 100 / 100, day 8 50 / 81)
    pve: { 4: 2, 5: 2, 6: 3, 7: 3, 8: 3 },
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [{ ...M(1, "rotary", 1), dusk: true }, { ...P(2), dusk: true }, ...good(M(2, "rotary", 1)), ...good(M(2, "mantlet", 0)), { ...M(3, "mantlet", 0), dusk: true }, ...good(M(3, "pressure", 2)), ...good(G(3, "coil", 3, 5, 1)), { ...P(4), dusk: true }, { ...P(5), dusk: true }, { ...G(5, "coil", 3, 5, 1), dusk: true }, ...good(P(5)), ...good(G2(5, "venom", 0, 0)), { ...P(6), dusk: true }, ...good(G(6, "bellows", 0, 1)), { ...G(7, "brake", 7, 4, 1), dusk: true }, { ...M(7, "pressure", 2), dusk: true }, { ...P(8), dusk: true }, ...good(P(8)), ...good(G(8, "venom", 2, 1)), { ...P(9), dusk: true }, ...good(P(9, 4)), { ...G2(10, "venom", 0, 0), dusk: true }, { ...G(10, "bellows", 0, 1), dusk: true }, { ...G(10, "venom", 2, 1), dusk: true }, ...good(G(10, "whetstone", 7, 4, 1)), ...good(G(10, "longhaul", 7, 0))],
  },
  // ---------------------------------------------------------------- Hard, days 8-10 only
  // GRAND FOUNDRY (the stars-aligned deck; she arrives on day 8): the kiln and a STAMP PRESS, heavy armor (three
  // plates on top of the PvE ramp). Synergy: a BRAKE SHOE and a LONG HAUL on the kiln's serpentine, the PRESS feeding
  // the second intake; a temper, a whetstone, a legendary LANCE core, and flak on day 9. Her value stays within
  // maxGoldByDay.
  matriarch: {
    hero: "furnace", crates: 1, synergy: ["press", "longhaul", "brake"],
    // 0.8.0 I1 M3 (VERIFIED-D1 Q8, DESIGN-wave3.md 8 Q8): the STAMP PRESS (epic) from day 2, when the per-run draw unlocks
    // epics; she is met on days 8-10 only, where her deck is exactly as tuned
    factories: [F("kiln", 2, 7, [2, 6, "L1U4R2U1R1U1"]), { ...F("press", 6, 6, [6, 5, "L1U5"]), at: 2 }],
    upgrades: [
      // bb-0.8.3 (REQ-BFG-043, job BELTS run 4): with the uniform rule's levels SILKSHADE and OLD BULWARK sat below her
      // margin on days 9 and 10 (rivals.difficulty); capsearch mgrow (the ladder's own measure) grew her day 9, the least
      // change, within maxGoldByDay: the temper's second star (value 74 -> 77; days 9 and 10 -0.439 -> -0.632 and
      // -0.402 -> -0.664, below SILKSHADE's -0.546 and -0.647; output-belts/measure/capsearch-r4)
      // bb-0.8.6 (job PACKS M4, the packs' caps and par field): the regrown SILKSHADE sat below her margin on day 8
      // (-0.220 vs -0.117) and 10 (-0.356 vs -0.318; rivals.difficulty); capsearch mgrow (the ladder's own measure), the
      // least change within maxGoldByDay: the temper's second star on day 8 (was 9; day 8 -0.369) and a second temper on
      // day 10 (value 77 -> 80; day 10 -0.437)
      // 0.8.9 (CATCHUP-089, cap's ruling Q2 f77489ebe2e11698, the walls): no ARMOR PACKs beside her three plates. With the
      // 1/3/4 more her gold allowed on days 8-10 the par field's top decile beat her day-10 deck 3% of the time (4% with
      // 3 more), against 18% at 1210ee8, the floor; her plan stays 1210ee8's
      // CATCHUP-097 (BRIEF-CATCHUP-097 target 5, the Iron Matriarch the hardest on days 8-10; her plates the brief's lever,
      // walls first, ruling 3c58471c74bdc4ed Q3): one ARMOR PACK more on each of days 8, 9 and 10 (P(8), P(9), P(10), each
      // at the end of its day), so she holds 4 / 5 / 6 plates on days 8-10, the FURNACE par field's count 4 / 6 / 6 at most.
      // Her ladder margins -0.478 / -0.345 / -0.336 -> -0.509 / -0.416 / -0.424; her walls (P90 FURNACE / WEAVER) day 8
      // 68 / 100 -> 48 / 100, day 9 85 / 100 -> 82 / 95, day 10 92 / 100 -> 78 / 96 (floor 18); value 72 / 77 / 80 ->
      // 77 / 87 / 95 g, within R1
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 6, the Iron Matriarch the hardest on days 8-10; her plates the lever, up to the
      // FURNACE par count 4 / 6 / 6): her day-10 plate on day 9 (P(9) -> P(9, 2); no P(10)), so she holds 4 / 6 / 6 plates
      // (were 4 / 5 / 6). Her day-9 ladder margin -0.416 -> -0.445 (THISTLEMAIL's -0.435 now above hers); her day-9 walls (P90
      // FURNACE / WEAVER) 82 / 95 -> 80 / 95; days 8 and 10 unchanged. Measured with a stars-tagged edit (kit097's catch)
      ...stars(
        P(8), P(8), P(8), G(8, "brake", 3, 0, 1), G(8, "longhaul", 6, 0), M(8, "lance", 0), G(8, "temper", 4, 2, 1),
        G(8, "whetstone", 6, 1, 3), G2(8, "temper", 4, 2), P(8), M(9, "flak", 0), P(9, 2), G(10, "temper", 6, 2, 3),
      ),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [...stars(P(8, 2)), ...stars(G(8, "grease", 6, 4, 2)), ...stars(G2(8, "whetstone", 6, 1)), ...stars(G2(8, "longhaul", 6, 0)), ...stars(G2(8, "grease", 6, 4)), ...stars(G(8, "grease", 7, 5, 3)), ...stars(G2(8, "brake", 3, 0)), ...stars(G(8, "brake", 0, 3, 1)), ...stars(G(8, "bellows", 2, 1)), ...stars(G(8, "keg", 1, 1, 1)), ...stars(G2(8, "keg", 1, 1)), ...stars(G(8, "keg", 0, 2)), ...stars(G(9, "heatjacket", 2, 5, 1)), ...stars(P(10, 2)), ...stars(G(10, "whetstone", 4, 3, 1)), ...stars(G(10, "venom", 6, 3)), ...stars(G2(10, "venom", 6, 3))],
  },
  // ---------------------------------------------------------------- 0.8.0 N1: the six wave-3 captains
  // 0.8.0 N1 (REQ-BFG-024, REQ-BFG-011, REQ-BFG-033; DESIGN-wave3 section 5, VERIFIED-D1 Q9-Q12): the six wave-3 captains.
  // D1's day-by-day purchases were placed (N1 M2), then each plan was regrown day by day by capsearch (output-N1/tools)
  // against the FURNACE par field (K 12) inside its own hero's luck caps (luckCapsData.ts: FOUNDRY and BASTION from N1
  // M1), the per-run draw's unlock days, R1 and the upload ceiling (a Hard captain's prize never beats today's best Hard
  // prize of the day, so src/net/roadCap.ts doesn't move: oracle 94b9559fbb7da299 (9)). Each keeps D1's synergy parts in
  // D1's order as its core; fills reach the slot's band (BRASSWICK's road deck about 30%, GRIMHOLD's about 50%, VOSS's and
  // KARSK's good-luck road decks 55-80%, LOCKJAW's and THISTLEMAIL's dusk decks about 55%) and the ladder
  // (tests/rivals.difficulty.test.ts). Every one fields a wave-3 TWIN or PLATE module from day 1 (oracle (8)).
  // ---------------------------------------------------------------- Easy (tier 1), FOUNDRY
  // MATCHED POUR: the Crucible's two mirrored belts into gun 1, so every pour fuses. Synergy: a TWIN GAUGE on a matched
  // belt from day 2 (3 damage a blank, not 1), a TWIN TRIGGER on gun 1 from day 3 (each fused alloy is a pair: 25% more,
  // 2 stars from day 7) and a TWIN MOULD from day 5 pouring two plain slugs into gun 2's two intakes (2 stars from day 9;
  // on day 4 it would lift him over HIGHSPIRE, the ladder). A STEAM BREECH on gun 1 from day 1 (his wave-3 part, weak
  // enough to keep an Easy deck under every Hard captain on day 1); 0.8.0 B1 M3 added a temper (day 2), a plate roller
  // (day 3) and venom (day 4), which lift his road deck toward the Easy band (about 30%, at most 40; output-B1/m3/
  // N6-NOTES.md).
  brasswick: {
    hero: "foundry", crates: 0, synergy: ["twingauge", "twinmould", "twintrigger"],
    factories: [F("crucible", 2, 6, [2, 5, "U5"], [3, 5, "U5"])],
    upgrades: [
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/2/2/5/6/7 on days 3-10 (the FOUNDRY par field's 1/1/2/2/3/5/6/7: day 7
      // keeps his gold upgrades)
      M(1, "steambreech", 0), G(2, "twingauge", 4, 0, 3), G(2, "temper", 1, 0, 1), M(3, "twintrigger", 0),
      G(3, "plateroller", 4, 2, 3), P(3), G(4, "venom", 4, 1), X(5, F("twinmould", 6, 2, [6, 1, "U"], [7, 1, "U"])), P(5),
      M2(7, "twintrigger", 0), P(8, 3), G2(9, "twinmould", 6, 2), P(9), P(10),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [G(2, "whetstone", 1, 1, 1), G(2, "grease", 1, 5, 1), P(4), G(4, "tollbooth", 1, 2, 1), M(5, "pressure", 1), M(5, "mantlet", 1), P(6), { ...G(7, "splitter", 1, 3), dusk: true }, { ...G(8, "staticbrush", 1, 4), dusk: true }, { ...G(9, "barbed", 5, 0), dusk: true }, P(10), { ...G(10, "coil", 8, 0, 2), dusk: true }],
  },
  // ---------------------------------------------------------------- Hard (tier 3), FOUNDRY
  // LOCKSTEP: the Crucible's belts run up columns 1 and 4 into gun 1, so a TWIN LATCH at (3,2) works both and lets each
  // pair of blanks go together. Synergy: the TWIN LATCH (day 2, 2 stars from day 9), a TWIN TRIGGER on gun 1 from day 2
  // (day 1 at good luck; each fused alloy a pair: 2 stars from day 4, 55% more) and a COMPOUND BREECH from day 5 packing
  // two alloys into one shell (2 stars from day 7); a TWIN GAUGE (day 1) and a counterweight (day 3) fill in. Gun 2 stays
  // dark: every gold buys gun 1's lockstep. Good luck (the road deck) adds a temper on day 2, flak on day 8 and a
  // whetstone on day 10. (0.8.0 B1 M3: regrown with capsearch after the FOUNDRY nerf, so he is a Hard captain again;
  // output-B1/m3/N6-NOTES.md.)
  voss: {
    hero: "foundry", crates: 0, synergy: ["twinlatch", "twintrigger", "compound"],
    factories: [F("crucible", 2, 6, [2, 5, "LU3RU2"], [4, 6, "U5LU"])],
    upgrades: [
      // bb-0.8.3 (job BELTS run 4): the TWIN LATCH on day 4 at ordinary luck (was 2; the stand-in's rare caps are 1 on day
      // 2 and 2 on day 3); soon() keeps the warlord's day 2
      G(1, "twingauge", 1, 0, 1), soon(1, M(2, "twintrigger", 0)), ...good(G(2, "temper", 1, 1, 1)),
      // bb-0.8.6 (job PACKS M4): at ordinary luck the COMPOUND BREECH on day 7 (was 5; FOUNDRY's ordinary epic cap is 0
      // until day 7) and the latch's second star on day 10 (was 9; its 2-star cap is 2 on day 9); soon() keeps the warlord's
      // days 5 and 9. The ladder (the Hard mean below 0 on day 7): the good-luck flak on day 7 (was 8)
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs 1/1/1/1/1/4/4/5 on days 3-10 (the FOUNDRY
      // par field's 1/1/2/2/3/5/6/7), as his stand-in's gold allows (days 5-7: the luck caps' value); his good-luck road
      // deck pays for them with its TURRET SPEED level 2 (day 7 before; no later day's gold holds it). The walls (cap's
      // ruling Q2 f77489ebe2e11698): with the 6/7 the gold allowed on days 9-10 the par field's top quartile beat his road
      // deck only 32-34% of the time (79-86% at 1210ee8); 4/5 packs read 41% on both days
      // CATCHUP-091 (the walls, cap's ruling Q2 f77489ebe2e11698 rule 4; BRIEF-CATCHUP-091 lever c): his day-3 ARMOR PACK
      // on day 8 instead (P(8, 3) -> P(8, 4); 1210ee8, the floor, had none on days 3-7). With it the par field's top
      // quartile beat his road deck only 31 / 23% (FURNACE / WEAVER) on day 3 and 36 / 27% on day 4; without it 69 / 43
      // and 49 / 68, and day 6 FURNACE 42 (with the rune rule's TWIN SUNS skip)
      // CATCHUP-093 (the named stand-ins on release Y's field; cap's ruling Q1 e2ca295ce9dcd60a rule 1: untagged ARMOR PACKs
      // within the FOUNDRY par field's count 2 and the stand-in deck's gold): two packs on day 4 (P(4, 2), at the end of the
      // day; two of his day-8 four), so his decks hold 2 packs on days 4-7 (were 0) and the same from day 8; fallback 2 gives
      // way below (paid + PvE within the count)
      soon(2, G(4, "twinlatch", 3, 2)), M2(4, "twintrigger", 0), P(4, 2),
      // BAL-2 step 6 (cap's ruling 97e639e5813acb37): the counterweight (rare, non-synergy) on day 5 at ordinary luck (was
      // 3; FOUNDRY's ordinary rare+ cap fell 3 -> 2 on day 4, where the TWIN LATCH and TWIN TRIGGER hold both); soon()
      // keeps the warlord's day 3; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      // Y7b2 (the regenerated caps, bb-0.9.3): at good luck the counterweight 3 -> 4 (FOUNDRY good rare+ d3, cap 3 -> 2: his
      // road deck 3 > 2; the part that arrives on day 3 at good luck, non-synergy; day 4's good cap of 3 holds it), at good luck
      soon(5, M(7, "compound", 0)),
      // FLIP-X2 step 4.4 (cap's ruling 97e639e5813acb37, item 2): the latch's second star at good luck only, day 9 (was
      // ordinary day 10; FOUNDRY's ordinary star2 cap is 2 on day 10 and no later day exists)
      // CATCHUP-091 (the walls; lever d, cap's ruling 3c58471c74bdc4ed Q1): the good-luck flak on day 8 (was 7, PACKS M4's
      // ladder move). With it on day 7 the par field's top quartile beat his day-7 road deck 19% of the time (FURNACE; 72%
      // at 1210ee8); a day later 49%
      // CATCHUP-093: two of the four day-8 packs are the day-4 pair (above), so days 8-10 hold what they held (with all six his
      // dusk deck's TURRET SPEED level 2 left day 8)
      M2(7, "compound", 0),
      // BAL-2 step 6 (cap's ruling 97e639e5813acb37): the counterweight (rare, non-synergy) on day 5 at ordinary luck (was
      // 3; FOUNDRY's ordinary rare+ cap fell 3 -> 2 on day 4, where the TWIN LATCH and TWIN TRIGGER hold both); soon()
      // keeps the warlord's day 3; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      // Y7b2 (the regenerated caps, bb-0.9.3): at good luck the counterweight 3 -> 4 (FOUNDRY good rare+ d3, cap 3 -> 2: his
      // road deck 3 > 2; the part that arrives on day 3 at good luck, non-synergy; day 4's good cap of 3 holds it), at good luck
      // only (its ordinary day 5 unchanged); right after M2(4, twintrigger), the last entry with an earlier day, as before;
      // re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      // Z-BUMP (REQ-BFG-073; the regenerated caps, bb-0.9.7, the overfeed's move): at ordinary luck the counterweight 5 -> 8
      // (FOUNDRY ordinary value d7, cap 77 -> 76: his stand-in deck 77 > 76; the non-synergy part with the fewest part-days
      // held on day 7 (3: days 5-7; the day-4 ARMOR PACKs 4 each, the TWIN GAUGE 7), cap's ruling 97e639e5813acb37 item 3;
      // day 8's ordinary caps hold it, its deck unchanged there), at ordinary luck only (soon() keeps the warlord's good-luck
      // day 4); right after M2(7, compound), the last entry with an earlier day; re-placed in day order (cap's ruling
      // 1cfdc5fff106d58f)
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 3, the Hard band on day 5; the brief's same-price swap for the day-5 captains,
      // REVIEW-CATCHUP097 ruling 2): a VENOM DRIP (rare, 4 g) for the COUNTERWEIGHT (rare, 4 g), same cell, days and luck
      // (ordinary 8, good 4). This replaces Z-BUMP's day-8 counterweight with a part of the same price and rarity on the same
      // day; the target needs it (no other day-5 swap of his reads higher). His road deck 66 / 48 / 64 -> 67 / 52 / 65% on
      // days 4-6 (walls at least 50 / 75); his dusk deck 24 -> 11% on day 8 (36+ there holds); value and every cap unchanged
      soon(4, G(8, "venom", 4, 0)),
      ...good(M(8, "flak", 1)), P(8, 2), ...good(G2(9, "twinlatch", 3, 2)),
      // CATCHUP-098 (BRIEF-CATCHUP-098 target 2's day-10 lever, REVIEW-CATCHUP097 rulings 1 and 5: Hard day 10 at 56 or more
      // once the FURNACE re-fit takes LONGTOOTH's and OLD BULWARK's day-10 plates): a LIMPET WORKS (epic factory, 8 g) at good
      // luck on day 10, at (7,1) on a one-tile belt into connector 6 (kit098 capsearch grow, rated on the four par fields).
      // His day-10 road deck 34 -> 61% (walls F / W 74 / 92 -> 68 / 83); his ladder margin -0.230 -> -0.390, above the Iron
      // Matriarch's -0.424 (a flak's second star read 61 too, at -0.487, below hers); his prize stays under day 10's best
      // Hard prize (capsearch pays); good value within the good cap 121 and R1 119
      ...good(G(10, "whetstone", 5, 2, 3)), P(10), ...good(X(10, F("limpet", 7, 1, [6, 1, "U"]))),
    ],
    // CATCHUP-091 fallback 2 (cap's ruling Q1 e2ca295ce9dcd60a rule 4; ruling 3c58471c74bdc4ed Q1: the Hard band on day 5,
    // which the walls' fixes took under 55): his road deck read 51% on day 5 with none of the FOUNDRY par field's 2 packs
    // (his day-3 pack is on day 8 now, the walls); one PvE plate (58%; the day-5 walls 69 / 68 -> 57 / 53; two read 39)
    // CATCHUP-093 fallback 2 (cap's ruling Q1 e2ca295ce9dcd60a rule 4 and HB 678fb328359e02f1: a Hard captain under 0.55 on
    // release Y's field, up to the FOUNDRY par field's count 2 / 2 / 3 / 4 / 6 / 7 / 8 less his paid packs 0 / 0 / 0 / 0 /
    // 4 / 4 / 5 on days 4-10): with his rune rule (TWIN NAILS from day 2) his road deck read 44 / 38 / 34 / 35 / 48 / 30 / 28%;
    // with the plates 64 / 49 / 64 / 60 / 56 / 46 / 37%, his walls (FURNACE / WEAVER) at least 48 / 71 (day 6)
    // With his day-4 packs (the stand-ins, above) paid + PvE stays within the count: days 4-7 2 / 2 / 3 / 4 -> 0 / 0 / 1 / 2
    pve: { 6: 1, 7: 2, 8: 2, 9: 3, 10: 3 },
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [{ ...G(1, "grease", 2, 4, 2), dusk: true }, ...good(G2(2, "twingauge", 1, 0)), ...good(G(2, "grease", 2, 4, 2)), ...good(G(3, "staticbrush", 3, 5)), ...good(G(4, "tollbooth", 5, 1, 3)), { ...P(5), dusk: true }, { ...G(5, "staticbrush", 3, 5), dusk: true }, { ...G(5, "heatjacket", 5, 6), dusk: true }, ...good(P(5)), { ...P(6), dusk: true }, ...good(G(6, "barbed", 0, 2)), { ...P(7), dusk: true }, { ...G(8, "temper", 5, 1, 3), dusk: true }, { ...G(8, "whetstone", 1, 1, 1), dusk: true }, { ...G(8, "tollbooth", 0, 2, 1), dusk: true }, ...good(G(8, "longhaul", 2, 3, 1)), { ...P(9), dusk: true }, { ...G(9, "longhaul", 2, 3, 1), dusk: true }, ...good(G(9, "coil", 0, 3)), { ...P(10), dusk: true }, { ...G(10, "barbed", 0, 3), dusk: true }, ...good(P(10)), ...good(M(10, "rotary", 1)), ...good(G(10, "lodestone", 0, 4))],
  },
  // ---------------------------------------------------------------- Medium (tier 2), BASTION
  // ANVIL WALL: the Wardworks' bulwark belt plates the hull as it fires, and plating makes every shot hit harder. Synergy:
  // a PLATE ROLLER on the bulwark belt (day 1), an ANVIL BREECH in the heavy gun's socket from day 2 (2.5 more damage, and
  // 1 more for each plating) and a SPALL CATCHER from day 3. A tollbooth (day 1), a whetstone (day 2, 2 stars on day 9), a
  // twin gauge, a sorting arm, grease, a pincer and a second whetstone (day 10) fill in. 0.8.0 B1 M3 regrew him from day 2
  // on B1's PLATE payoffs with capsearch (output-B1/m3/N6-NOTES.md; oracle 043ce6256cb5ccf9): no ARMOR PRESS, which lifted
  // him 40-60 points over his Medium band. His synergy check now pays on days 5 and 9.
  grimhold: {
    hero: "bastion", crates: 0, synergy: ["plateroller", "anvil", "spallcatcher"],
    factories: [F("wardworks", 4, 6, [4, 5, "U5"])],
    upgrades: [
      // bb-0.8.3 (job BELTS run 4): the sorting arm (epic) on day 6 (was 5): the regenerated caps give BASTION no
      // ordinary epic on day 5; the pincer on day 5 (was 7) keeps the day-5 Easy-Medium gap 0.05 (rivals.difficulty)
      G(1, "plateroller", 3, 0, 1), G(1, "tollbooth", 3, 1, 1), M(2, "anvil", 0), G(2, "whetstone", 5, 1, 3),
      // bb-0.8.6 (job PACKS M4): the sorting arm on day 8 (was 6): the packs' BASTION caps give no ordinary epic before day 8
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/3/3/4/6/7 on days 3-10 (the BASTION par field's 1/1/2/3/4/5/6/7)
      M(3, "spallcatcher", 0), P(3), G(4, "twingauge", 3, 4, 1), G(5, "pincer", 5, 2, 3), P(5), G(6, "grease", 3, 3, 1), P(6),
      G(8, "sorting", 3, 2), P(8), G2(9, "whetstone", 5, 1), P(9, 2), G(10, "whetstone", 5, 4, 3), P(10),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [P(4), M2(4, "anvil", 0), G2(6, "tollbooth", 3, 1), P(7), G(8, "temper", 5, 3, 3), P(10), G(10, "tollbooth", 3, 5, 1), { ...G(10, "staticbrush", 5, 5), dusk: true }],
  },
  // SHIELD WALL: a wall of plate on the bulwark belt, broken into damage. Synergy: a PLATE BREAKER on the bulwark belt
  // from day 5 (each payload takes a plating for 4 more damage); at good luck a SHIELD WALL on the bulwark belt from day 9
  // (oracle 94b9559fbb7da299 (10): his one good-luck-only synergy part); and the PLATE ROLLER (day 1) and SPALL CATCHER
  // (day 3) that build the plating. A BRACE FRAME (day 2) and a STEAM BREECH (day 3) work the plating; a twin gauge,
  // tempers, a brush, grease, a coil and venom fill in. Good luck: the temper's second star on day 2, a plate on day 6, a
  // pincer on day 7 (2 stars on day 8). The synergy list is D1's three in D1's order (less the ARMOR PRESS, below), then
  // the PLATE ROLLER and SPALL CATCHER (0.8.0 B1, oracles ae44c7db19da0dc0 and cf201b9918116576): D1 built his list from
  // his good-luck road deck, but the synergy check runs on his ordinary-luck stand-in. There BASTION's epic cap of 1 on
  // days 5-7 and the roadCap guard allow only the PLATE BREAKER by day 5, and the deck builds its plating with these two
  // parts, as GRIMHOLD's and THISTLEMAIL's lists name them. bb-0.8.6 (job PACKS run 2; oracle 47d683ef9b959301 (1)): no
  // ARMOR PRESS (was good luck, day 8, into connector 5): his day 9-10 road deck held three epic+ parts, all synergy parts
  // (PLATE BREAKER, ARMOR PRESS, SHIELD WALL), and BASTION's GOOD epic+ cap is 2 on days 9-10, while the ordinary cap
  // never holds it; no day can hold it, so it left his plan. The SHIELD WALL moved one cell west, (6,0) -> (5,0): it
  // worked the press's belt, and there it works the bulwark belt (capsearch check: idle at (6,0) without the press).
  karsk: {
    hero: "bastion", crates: 0, synergy: ["shieldwall", "platebreaker", "plateroller", "spallcatcher"],
    factories: [F("wardworks", 4, 6, [4, 5, "U5"])],
    upgrades: [
      // bb-0.8.3 (job BELTS run 4): the regenerated BASTION caps give the stand-in no epic on day 5 and one epic+ on days
      // 6-10, its value cap 75 on day 7 (the uniform rule's two levels are 20 gold), and the good-luck deck two epics+ on
      // day 8. So at ordinary luck the PLATE BREAKER on day 6 (was 5) and the temper's second star on day 8 (was 6),
      // soon() keeping the warlord's days 5 and 2; the ARMOR PRESS at good luck only (still day 8), and the SHIELD WALL
      // that works its belt on day 9 (was 8). tests/captains.synergy.test.ts pins SHIELD WALL as his only good-luck
      // synergy part: an open item for the lead (BASTION's ordinary epic+ cap of 1 can't hold both epics by day 9)
      // bb-0.8.6 (job PACKS run 2; oracle 47d683ef9b959301 (1)): the ARMOR PRESS left his plan (see above); the SHIELD
      // WALL on the bulwark belt at (5,0) (was (6,0), on the press's belt). The ladder (a Hard captain below the easiest
      // Easy one: day 8 +0.209 vs GRUBNOSE +0.152, day 9 +0.253 vs +0.251 without the press): the fill rule's least change
      // (capsearch kfill), the pincer's second star at good luck on day 8 (day 8 +0.101, day 9 +0.161, day 10 +0.193)
      G(1, "plateroller", 3, 0, 1), G(1, "twingauge", 3, 3, 1), G(2, "braceframe", 3, 1), G(2, "temper", 5, 3, 3),
      M(3, "steambreech", 0), M(3, "spallcatcher", 0), G(4, "grease", 3, 5, 1),
      // Y7b2 (the regenerated caps, bb-0.9.3): at ordinary luck the static brush 4 -> 6 (BASTION ordinary rare+ d5, cap 4 -> 3:
      // stand-in 4 > 3; the part that arrives on day 5 is the WARD BELL, which stays on day 5 (SUSTAIN-1 4.8 rule 7; cap's
      // ruling 97e639e5813acb37, item 3), so the latest-bought non-synergy part); soon() keeps the warlord's day 4; right after
      // G(4, grease), the last entry with an earlier day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      soon(4, G(6, "staticbrush", 3, 4)),
      // bb-0.8.6 (job PACKS M4): at ordinary luck the coil on day 6 (was 5) and the PLATE BREAKER on day 8 (was 6): the
      // packs' BASTION caps (ordinary rare+ 3 on day 5, epic+ 0 until day 8); soon() keeps the warlord's day 5
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs 2/2/2/2/4 on days 6-10 (the BASTION par
      // field's 3/4/5/6/7), as his stand-in's gold allows (days 3-5: R1 and the luck caps' value; days 7-9: the value cap
      // and his road deck's FACTORY level); his good-luck road deck takes its FACTORY level 2 on day 8 (was 7) and pays
      // with its TURRET SPEED level 2 (day 8 before; no later day's gold holds it)
      // FLIP-X2 step 4.4 (cap's ruling 97e639e5813acb37, item 3): his good-luck road deck after the drop list read value 52
      // on day 5 (good cap 50) and 67 on day 6 (good cap 63): at good luck the temper's second star on day 6 (was 2) and the
      // good-luck pack on day 7 (was 6), non-synergy first; the WARD BELL, its RAMPART star, the drop, the PvE plates and his
      // stand-in stay as they were
      // ... re-placed in day order (cap's ruling 1cfdc5fff106d58f): the pack right before the first entry with a later day
      soon(5, G(6, "coil", 5, 2, 2)), P(6, 2), ...good(G(7, "pincer", 5, 4, 3)), ...good(P(7)), soon(5, G(8, "platebreaker", 3, 2)),
      soon(6, G2(8, "temper", 5, 3)), ...good(G2(8, "pincer", 5, 4)), ...good(G(9, "shieldwall", 5, 0)),
      // Y7b2 (the regenerated caps, bb-0.9.3): at ordinary luck the venom 9 -> 10 (BASTION ordinary rare+ d9, cap 7 -> 5:
      // stand-in 6 > 5; the part that arrives on day 9 at ordinary luck, non-synergy); soon() keeps the warlord's day 9; right
      // after ...good(G(9, shieldwall)), the last entry with an earlier day; re-placed in day order (cap's ruling
      // 1cfdc5fff106d58f)
      soon(9, G(10, "venom", 5, 5)), P(10, 2),
    ],
    // BOTS-X (SUS-C; SUSTAIN-1 4.8 rule 7: "THANE KARSK adds WARD BELL on day 5"), only while the sustain switch is on:
    // BASTION's SHIELD beside his PLATE (PLATE eats the small hits, SHIELD the big ones). His one gun, the common RAMPART,
    // has one gear slot and holds the SPALL CATCHER (a synergy part) from day 3, so on day 5 it takes a second copy (★2: a
    // second gear slot) and the WARD BELL goes there (11 gold: day 5 is 47 of 50). No synergy part moves; the BOTS-X report
    // lists what this does to his ordinary luck caps (measured with the switch off; FLIP-X regenerates them)
    sustain: [T2(5, 0), M(5, "wardbell", 0)],
    // FLIP-X2 step 4.4 (REVIEW-BOTSX answer 1): over the regenerated caps with the bell (stand-in d6 rare 5 > 4, d7 value
    // 77 > 76, d8 rare 6 > 5, d9 rare 7 > 6), so while sustain is on the bell replaces his GALVANIC COIL (a non-synergy
    // rare, 5 g; warlord day 5, stand-in day 6)
    sustainDrop: [["coil", 5, 2]],
    // 0.8.9 (CATCHUP-089 fallback 2): his road deck read 51% on day 5 with none of the 2 packs (R1 holds them off) and 37%
    // on day 7 with 3 of the 4: PvE plates up to the count on those days
    // CATCHUP-091 (the walls, cap's ruling Q2 f77489ebe2e11698 rule 4; Q1 e2ca295ce9dcd60a rule 5: fallback 2 is trimmed
    // first): the day-5 plates go (2 -> 0). With them the par field's top quartile beat his day-5 road deck 25% of the time
    // (FURNACE; 91% at 1210ee8); without them 42%
    // CATCHUP-091 fallback 2 (Q1 rule 4; the brief's lever for Hard day 4; ruling 3c58471c74bdc4ed Q5 (2)): one PvE plate on
    // day 4 (the BASTION par field's count 1 at 0.9.1; none paid): 39 -> 49%, his day-4 walls 78 / 100 -> 71 / 99
    // CATCHUP-093 fallback 2 (cap's ruling Q1 e2ca295ce9dcd60a rule 4 and HB 678fb328359e02f1: a Hard captain under 0.55 on
    // release Y's field, up to the BASTION par field's count 2 / 2 / 6 / 7 / 8 less his paid packs 0 / 0 / 3 / 3 / 5 on days
    // 4 / 5 / 8 / 9 / 10; day 7's plate as before): his road deck read 44 / 32 / 35 / 45 / 38%; with the plates
    // 58 / 49 / 54 / 70 / 59%, his walls (FURNACE / WEAVER) 68 / 97, 45 / 92, 79 / 92, 73 / 76, 87 / 76
    // CATCHUP-097 (the walls on release Z's field, RULINGS-C089 rule 5 and cap's ruling Q2 f77489ebe2e11698 rule 4; Q1
    // e2ca295ce9dcd60a rule 5: fallback 2 is trimmed first): one day-5 plate goes (2 -> 1). With both the par field's top
    // quartile beat his day-5 road deck 38% of the time (FURNACE; 91% at 1210ee8, 45 at 0.9.4); with one 44%, with none 53
    pve: { 4: 2, 5: 1, 7: 1, 8: 3, 9: 4, 10: 3 },
    // REFIT-AZ-R1 (the walls, BRIEF-REFIT-AZ target 1; kit tqprobe K 24, every switch on, on round 3's par field): the WEAVER
    // par field's top quartile beat his day-6 / day-7 road deck 26 / 30% of the time (base 86 / 75, rule 40+). The good-luck
    // pack on day 8 (was 5, in the road list below) and his day-7 levels held (roadLevelsHeld: the FACTORY level 2 on day 8
    // again, as the road-less plan): 59 / 48% (his road deck 64 -> 54% on day 6, 70 -> 49% on day 7)
    roadLevelsHeld: [7],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [{ ...P(2), dusk: true }, { ...G(2, "whetstone", 5, 1, 3), dusk: true }, ...good(G(2, "whetstone", 5, 1, 3)), { ...P(4), dusk: true }, ...good(G(5, "tollbooth", 5, 2, 3)), { ...P(7), dusk: true }, { ...P(8, 2), dusk: true }, { ...G(8, "temper", 5, 2, 3), dusk: true }, { ...G(8, "tollbooth", 5, 4, 3), dusk: true }, ...good(P(8)), { ...P(9), dusk: true }, { ...G2(9, "staticbrush", 3, 4), dusk: true }, ...good(G2(9, "venom", 5, 5)), ...good(P(10))],
  },
  // ---------------------------------------------------------------- dusk stand-ins only (standInOnly), FURNACE and WEAVER
  // TWIN BITE: an 8-tile Kiln belt into connector 4 and a TWIN MOULD's 8-tile belt into connector 5 (day 2, 2 stars from
  // day 6), latched so their slugs land together. Synergy: the TWIN LATCH between them from day 3, the TWIN MOULD, and
  // TWIN GAUGES on the matched Kiln belt (day 1, 2 stars from day 3; a second gauge on day 6). The pairs pay a TWIN
  // TRIGGER from day 5; a whetstone, a temper (2 stars on day 9), bellows, a pincer, a counterweight (day 7), quench,
  // grease and a second temper (day 9) and a long haul (day 10) fill in. (No COMPOUND BREECH: from day 8 it lifted his
  // dusk deck over the stand-ins' 80% ceiling.)
  lockjaw: {
    hero: "furnace", crates: 0, synergy: ["twinlatch", "twinmould", "twingauge"],
    factories: [F("kiln", 2, 6, [2, 5, "RU4RU"])],
    upgrades: [
      G(1, "twingauge", 3, 0, 1), G(1, "whetstone", 2, 1, 1), X(2, F("twinmould", 6, 6, [7, 5, "L2U5"]), 1),
      // bb-0.8.6 (job PACKS M4): the gauge's second star on day 4 (was 3; FURNACE's ordinary 2-star cap is 0 on day 3)
      // CATCHUP-093 (the named stand-ins on release Y's field; cap's ruling Q1 e2ca295ce9dcd60a rule 1): an untagged ARMOR PACK
      // on day 4 (P(4), at the end of the day; the FURNACE par field's count 1; his day-8 pack, below), within his dusk deck's
      // gold
      G(3, "twinlatch", 4, 5), G2(4, "twingauge", 3, 0), G(4, "temper", 2, 2, 1), G(4, "bellows", 6, 0), P(4),
      // FLIP-X2 step 4.4 (cap's ruling 97e639e5813acb37): at ordinary luck the twin trigger on day 6 (was 5; FURNACE's
      // ordinary rare cap is 3 on day 5); soon() keeps day 5 at good luck
      // ... re-placed in day order (cap's ruling 1cfdc5fff106d58f): right after the last entry with an earlier day
      G(5, "pincer", 5, 6), soon(5, M(6, "twintrigger", 0)), G2(6, "twinmould", 6, 6), G(6, "twingauge", 2, 3, 1),
      // bb-0.8.3 (job BELTS run 4): under the regenerated FURNACE caps (value 88 on day 8, 100 on day 9, no bought turret;
      // the uniform rule's levels are 20 gold from day 8) the long haul on day 10 (was 8), and no RAMPART and DOUBLE STAMP
      // (were day 10: the stamp fed the rampart's slot)
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2 on days 8-10 (the FURNACE par field's 5/6/7: his deck spends the rest)
      // Y7b2 (the regenerated caps, bb-0.9.3): at ordinary luck the counterweight 7 -> 8 (FURNACE ordinary rare+ d7, cap 5 -> 4:
      // stand-in 5 > 4; the part that arrives on day 7, non-synergy); soon() keeps day 7 at good luck; right after
      // G(6, twingauge), the last entry with an earlier day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      // CATCHUP-093: his day-8 pack is the day-4 one now (above), so days 8-10 hold what they held (with both, his dusk deck's
      // TURRET SPEED level 2 left days 8 and 10)
      soon(7, G(8, "counterweight", 4, 3)), G(9, "quench", 4, 2), G(9, "grease", 2, 4, 2),
      // REDO-X (cap's rulings 97e639e5813acb37, e778dc5d38efd5fd): at ordinary luck the temper's second star on day 10 (was
      // 9; FURNACE's ordinary star2 cap is 2 on day 9; a non-synergy part); soon() keeps day 9 at good luck; right after
      // G(9, grease), the last entry with an earlier day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      soon(9, G2(10, "temper", 2, 2)),
      // REDO-X (cap's ruling e778dc5d38efd5fd): at ordinary luck the second temper on day 10 with the temper's second star
      // (was 9; alone on day 9 it would sit beside the first ★1 temper as an unfused pair); soon() keeps day 9 at good
      // luck; right after soon(9, G2(10, "temper", 2, 2)); re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      soon(9, G(10, "temper", 6, 4, 3)), G(10, "longhaul", 4, 4), P(10),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [{ ...M(1, "rotary", 0), dusk: true }, { ...P(2), dusk: true }, { ...P(5), dusk: true }, { ...P(6), dusk: true }, { ...P(7), dusk: true }, { ...P(8, 2), dusk: true }, { ...G(8, "brake", 6, 3, 3), dusk: true }, { ...P(9), dusk: true }, { ...P(10), dusk: true }, { ...G(10, "tollbooth", 1, 5, 1), dusk: true }],
  },
  // LEAF MAIL: a PLATE ROLLER on the loom's left belt plates her hull from day 1, and plated her guns fire faster.
  // Synergy: the PLATE ROLLER, a STEAM BREECH on gun 1 (day 1) and a SPALL CATCHER on gun 1 from day 4 (damage she takes
  // charges the next shot, soaked plating twice). A mortar on gun 3 (day 3, 2 stars from day 5), flak, venom, a temper,
  // a pincer, bellows and a splitter hold her near the dusk band. (Synergy check: a content miss for B1, oracle
  // 043ce6256cb5ccf9: WEAVER's light guns wait for loads, so the STEAM BREECH's faster fire adds almost nothing.)
  thistlemail: {
    hero: "weaver", crates: 0, synergy: ["plateroller", "steambreech", "spallcatcher"],
    factories: [F("loom", 4, 5, [4, 4, "U4"], [3, 5, "L2U5"], [6, 5, "R2U5"])],
    upgrades: [
      // bb-0.8.3 (job BELTS run 4): the flak on day 5 (was 3; the regenerated rare caps are 2 on day 3 and 3 on day 4)
      G(1, "plateroller", 0, 0, 1), M(1, "steambreech", 0), G(2, "venom", 3, 2), G(2, "temper", 3, 0, 1),
      // bb-0.8.6 (job PACKS M4): the flak on day 6 (was 5; WEAVER's ordinary rare cap is 3 on day 5)
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/1/1/2/5/5/7 on days 3-10 (the WEAVER par field's 1/1/2/3/4/5/5/7: days 5-7
      // keep her gold upgrade)
      // FLIP-X2 step 4.4 (cap's ruling 97e639e5813acb37): at ordinary luck the mortar core on day 5 (was 3; WEAVER's
      // ordinary rare cap is 2 on day 4); soon() keeps day 3 at good luck
      // ... re-placed in day order (cap's ruling 1cfdc5fff106d58f): right after the last entry with an earlier day
      P(3), M(4, "spallcatcher", 0), soon(3, M(5, "mortar", 2)), M2(5, "mortar", 2), M(6, "flak", 1), G(6, "pincer", 5, 2, 3),
      P(7),
      // Y7b2 (the regenerated caps, bb-0.9.3): at ordinary luck the bellows 7 -> 8 (WEAVER ordinary rare+ d7, cap 5 -> 4:
      // stand-in 5 > 4; the part that arrives on day 7, non-synergy); soon() keeps day 7 at good luck; right after P(7), the
      // last entry with an earlier day; re-placed in day order (cap's ruling 1cfdc5fff106d58f)
      soon(7, G(8, "bellows", 7, 0)), P(8, 3), G(9, "splitter", 3, 3), P(10, 2),
    ],
    // REFIT-AZ road: the road fill (kit-refitaz capsearch rfill, every switch on): the par player's rating's best gain per gold among common
    // parts, another star, an ARMOR PACK to FURNACE's par count, within the allowance (BRIEF-REFIT-AZ "The parts"); from round 4 also
    // rare and epic parts within the luck caps + ROADN (rulings 388faa07f0f451d1 and b77171cd5288623a)
    road: [{ ...M(1, "rotary", 1), dusk: true }, { ...G(2, "whetstone", 5, 0, 3), dusk: true }, { ...G(2, "tollbooth", 3, 1, 1), dusk: true }, { ...G(3, "grease", 3, 4, 1), dusk: true }, { ...P(4), dusk: true }, { ...P(5), dusk: true }, { ...G2(6, "temper", 3, 0), dusk: true }, { ...G(6, "temper", 5, 1, 3), dusk: true }, { ...M(7, "mantlet", 2), dusk: true }, { ...G(7, "braceframe", 7, 4, 1), dusk: true }, { ...G(8, "brake", 7, 3, 1), dusk: true }, { ...P(9), dusk: true }, { ...G2(9, "venom", 3, 2), dusk: true }, { ...G(10, "venom", 5, 3), dusk: true }],
  },
};

/**
 * TUNE-C: the first day a deck at `luck` owns upgrade `u` (Infinity: that luck never owns it). Ordinary luck owns the
 * untagged upgrades, good luck the untagged and "good" ones, the stars aligning every upgrade; from day `at`, or from the
 * upgrade's `sooner` day for that luck (a good-luck day also holds when the stars align).
 */
export function dayOwned(u: Upgrade, luck: Luck): number {
  if (LUCK_RANK[u.luck ?? "ordinary"] > LUCK_RANK[luck]) return Infinity;
  let d = u.at;
  if (LUCK_RANK[luck] >= LUCK_RANK.good && u.sooner?.good !== undefined) d = Math.min(d, u.sooner.good);
  if (luck === "stars" && u.sooner?.stars !== undefined) d = Math.min(d, u.sooner.stars);
  return d;
}

/**
 * REFIT-AZ (REQ-BFG-078; REVIEW-PARAZ ruling Q1): the first day a deck at `luck`, fought at `moment`, owns plan upgrade `u`
 * with the NPC day on: dayOwned, or sooner by the upgrade's NPC-day days (Upgrade.nd: its own luck's or a lesser luck's
 * day, and "dusk" for the dusk deck), only where that luck owns it at all (a luck never gains a part it doesn't own).
 */
export function ndDayOwned(u: Upgrade, luck: Luck, moment: RoadMoment): number {
  const d = dayOwned(u, luck);
  if (!u.nd || d === Infinity) return d;
  let best = d;
  for (const l of LUCKS) if (LUCK_RANK[l] <= LUCK_RANK[luck] && u.nd[l] !== undefined) best = Math.min(best, u.nd[l]!);
  if (moment === "dusk" && u.nd.dusk !== undefined) best = Math.min(best, u.nd.dusk);
  return best;
}

/** TUNE-C: does a deck at `luck` ever own upgrade `u`? */
export const ownsAt = (u: Upgrade, luck: Luck): boolean => dayOwned(u, luck) < Infinity;

/** TUNE-C: the earliest day any luck owns `u` (the day the caravan must first be able to offer its parts). */
export const firstDay = (u: Upgrade): number => Math.min(...LUCKS.map((l) => dayOwned(u, l)));

/** Bought turret uids (the hull's free starting copies are deck.ts TURRET_UID0 + slot). */
const TURRET_UID = 9500;

/**
 * Assemble a plan as it stands on a day (1-based) at a shop-luck tier (TUNE-C; default ordinary): the upgrades that luck
 * owns by that day (dayOwned), applied in plan order. Enemy uids start at 9000, like warlords; TUNE-C: a part's uid comes
 * from its upgrade's place in the plan (factories U+1.., rigs and turret equipment U+10+index, bought turrets 9500+index),
 * so a part keeps its uid on every day and at every luck. The hull is the PvE ramp warlordHull(day) plus the plan's
 * plating (rivals.ts standInBuild swaps the ramp for whole plates).
 * REFIT-AZ (REQ-BFG-078; REVIEW-PARAZ ruling Q1): `moment` is the deck's (the road deck "warlord", standInBuild's
 * "dusk"). With the NPC day on (npcDayRules(), read once here) the deck also owns its plan's road additions: the upgrades
 * an Upgrade.nd day brings sooner (ndDayOwned) and the RivalPlan.road list after every other upgrade (`dusk` entries in
 * the dusk deck alone). The gold levels keep the room the deck has without them (the allowance pays for the additions,
 * never the levels). Off, or a plan with neither: exactly as before.
 */
export function planBuild(plan: RivalPlan, day: number, luck: Luck = "ordinary", moment: RoadMoment = "warlord"): RivalLoadout {
  const nd = npcDayRules() && (!!plan.road?.length || plan.upgrades.some((u) => u.nd !== undefined));
  const a = assemble(plan, day, luck, moment, nd);
  const { build, crates, plating, pvePlates } = a;
  // bb-0.8.3 (REQ-BFG-043 D7', the uniform rule): the gold upgrades its hero's par player buys (captainLevels), where the
  // day's gold allows; the value counts their gold (stars.ts upgradeGold), as buildCost does
  // the stand-in (rivals.ts standInBuild) pays for the ramp hull in whole plates: the levels must fit beside those too
  const ramp = Math.max(0, Math.round(warlordHull(day) / ITEMS.plating.supply!.hull!)) * ITEMS.plating.price;
  // REFIT-AZ (ruling Q1, "The budget"): with the NPC day on, the levels are bought where the day's whole budget allows
  // (maxGoldByDay + ROAD(day, moment), after the road additions are paid), never below what the deck's own room without
  // them allowed (so no level leaves for a road part)
  const base = maxGold(day) - (nd ? assemble(plan, day, luck, moment, false).parts : a.parts) - ramp;
  // ... except on the plan's roadLevelsHeld days (the walls): there the road deck keeps the room without its road additions
  const held = moment === "warlord" && !!plan.roadLevelsHeld?.includes(day);
  const room = nd && !held ? Math.max(base, maxGold(day) + roadAllowance(day, moment) - a.parts - ramp) : base;
  const up = captainLevels(plan.hero, day, room);
  if (up) build.upgrades = up;
  const value = a.parts + upgradeGold(build);
  return { build, crates, plating, pvePlates, value };
}

/** planBuild's deck before the gold levels: the plan's upgrades owned by `day` at `luck` (with the NPC day's road
 *  additions when `nd`, REFIT-AZ), the hull and belt, and the parts' value (supplies included, levels not). */
function assemble(plan: RivalPlan, day: number, luck: Luck, moment: RoadMoment, nd: boolean): { build: Build; crates: number; plating: number; pvePlates: number; parts: number } {
  const U = 9000;
  const b: Build = { hero: plan.hero, items: [], routes: [], mods: [], beltCap: 0, hullBonus: 0 };
  const addFactory = (f: FactoryPlan, u: number) => {
    b.items.push({ uid: u, def: f.def, x: f.x, y: f.y });
    for (const [x, y, moves] of f.belts) b.routes.push({ factory: u, cells: walk(x, y, moves) });
  };
  plan.factories.forEach((f, i) => { if ((f.at ?? 1) <= day) addFactory(f, U + 1 + i); }); // 0.8.0 I1: FactoryPlan.at
  let crates = plan.crates, plating = 0, fu = U + 1 + plan.factories.length;
  // 0.8.9 (CATCHUP-089 fallback 2): the day's PvE plates, on a road deck at good luck or better only
  const pvePlates = luck === "ordinary" ? 0 : plan.pve?.[day] ?? 0;
  // BOTS-X (SUS-C): with the sustain switch on, the plan's sustain upgrades after its own (off: `upgrades` itself)
  const base = sustainLive() && plan.sustain?.length ? [...plan.upgrades, ...plan.sustain] : plan.upgrades;
  // REFIT-AZ: with the NPC day on, the road list after every other upgrade (so every other part keeps its uid)
  const ups = nd && plan.road?.length ? [...base, ...plan.road] : base;
  // REFIT-AZ: the day a deck owns an upgrade: dayOwned; with the NPC day, a plan upgrade's nd days (ndDayOwned) and a road
  // entry at its own day and luck, a `dusk` entry in the dusk deck alone
  const owned = (u: Upgrade, i: number): number => (!nd ? dayOwned(u, luck) : i >= base.length ? (u.dusk && moment !== "dusk" ? Infinity : dayOwned(u, luck)) : ndDayOwned(u, luck, moment));
  // FLIP-X2 (REVIEW-BOTSX answer 1): with the switch on, the plan's sustainDrop rigs are left out (their index still
  // counts, so every other uid stays)
  const drop = sustainLive() ? plan.sustainDrop ?? [] : [];
  const dropped = (u: Upgrade): boolean => !!u.gate && drop.some(([d, x, y]) => u.gate![0] === d && u.gate![1] === x && u.gate![2] === y);
  for (const [i, u] of ups.entries()) {
    const uid = U + 10 + i, tu = TURRET_UID + i;
    const f = u.factory ? fu++ : 0; // factory uids follow the plan's factory order whether or not this luck owns them yet
    if (owned(u, i) > day || dropped(u)) continue;
    if (u.factory) addFactory(u.factory, f);
    if (u.gate) b.items.push({ uid, def: u.gate[0], x: u.gate[1], y: u.gate[2], ...rotField(u.gate[0], u.gate[3] ?? 0) });
    if (u.mod) b.mods.push({ uid, def: u.mod[0], turret: u.mod[1] });
    if (u.fuseGate) {
      const [def, x, y] = u.fuseGate;
      const p: Placed | undefined = b.items.find((q) => q.def === def && q.x === x && q.y === y);
      if (!p || starsOf(p) >= FUSE_MAX) throw new Error(`invalid rig star purchase ${def}@${x},${y}`);
      p.stars = starsOf(p) + 1;
    }
    if (u.fuseMod) {
      const [def, turret] = u.fuseMod;
      const p: ModPlacement | undefined = b.mods.find((q) => q.def === def && q.turret === turret);
      if (!p || starsOf(p) >= FUSE_MAX) throw new Error(`invalid turret-gear star purchase ${def}@${turret}`);
      p.stars = starsOf(p) + 1;
    }
    if (u.turret) {
      const [def, slot] = u.turret;
      const r = installTurret(b, { uid: tu, def }, slot);
      if (!r.ok || r.mods.length) throw new Error(`invalid turret purchase ${def}@${slot}: ${r.reason ?? "gear left without a slot"}`);
    }
    if (u.fuseTurret) {
      const [slot] = u.fuseTurret;
      const list = turretList(b), t = list.find((x) => x.slot === slot);
      if (!t || starsOf(t) >= FUSE_MAX) throw new Error(`invalid turret star purchase @${slot}`);
      t.stars = starsOf(t) + 1; // a merged starting copy stays `free` (deck.ts turretValue: worth the copies bought)
      setTurretList(b, list);
    }
    crates += u.crates ?? 0;
    plating += u.plating ?? 0;
  }
  b.beltCap = HEROES[plan.hero].belt + crates * ITEMS.beltcrate.supply!.belt!;
  // 0.8.9 (CATCHUP-089 fallback 2): the PvE plates add hull like plating, and nothing to the value below
  b.hullBonus = warlordHull(day) + (plating + pvePlates) * ITEMS.plating.supply!.hull!;
  // 0.6.2 BELTSIDE: a load boundary (D3). The plans place rigs natively (M4), so the migration is a no-op
  // here, kept as the safety net for a plan that writes a rig on a belt tile. The value counts the deck after it.
  const build: Build = migrateDeck(b, "preset:rival");
  const parts = [...build.items, ...build.mods].reduce((n, p) => n + valueOf(p.def, starsOf(p)), 0) + turretsCost(build)
    + crates * ITEMS.beltcrate.price + plating * ITEMS.plating.price;
  return { build, crates, plating, pvePlates, parts };
}

/**
 * bb-0.8.3 (REQ-BFG-043 D7'): the captains' and the wave-3 NPCs' gold upgrades, one uniform rule (rev 4 allows it in
 * place of per-captain plans): each buys the levels its hero's par player buys in most runs, on the par player's median
 * day (output-belts/measure/r4/upbuys-k24.md, seeds 1-24: level 2 of FACTORY for every hero, level 2 of TURRET SPEED for
 * FURNACE, FOUNDRY and BASTION; WEAVER's par player buys its TURRET SPEED in 11 runs of 24, not most), where the day's
 * gold allows: a level is skipped while the plan's value and the levels' gold would pass maxGoldByDay(day) (`room`).
 * Day of each level, by hero and track (index 0 = level 2).
 */
export const CAPTAIN_LEVELS: Readonly<Record<HeroId, Partial<Record<UpgradeTrack, readonly number[]>>>> = {
  furnace: { factory: [7], turret: [8] },
  weaver: { factory: [6] },
  foundry: { factory: [6], turret: [7] },
  bastion: { factory: [7], turret: [7] },
  metronome: {}, siphon: {},
};

/**
 * BOTS-X (REQ-BFG-058; RUNES-2a 3 step 5's code, R1b-2 1.6): each captain's runes in pick order (entry i taken at the dawn
 * of day i + 1), which rivals.ts rivalBuild holds up to its day (captainRunesOn). EMPTY until FLIP-X pins
 * tools/genCaptainRunes.ts's output here (captainRunesText: every captain's 10 picks on its seed hashSeed("captain-runes",
 * id), each prefix passing runeProblem with it) when it turns BOT_RUNES on: a captain with no list holds no runes, so
 * every captain build is exactly as before (tests/botsx.runes.test.ts).
 * FLIP-X2 step 4.3 (REQ-BFG-058): PINNED from tools/genCaptainRunes.ts run once on flipx2 (bb-0.9.0, BOT_RUNES and
 * SUSTAIN_LIVE on, 61 runes offered: DORMANT_RUNES out; the captains' plans with CATCHUP-089's packs and no SIFTER),
 * 2026-10-05 09:02:40Z, W/output-flipx2/captain-runes/captain-runes.ts.txt, pasted as written. rivalBuild and (FLIP-X2)
 * standInBuild hold the first `day` of each list. A re-run reads rivalBuild with these held and must give the same lists.
 * BAL-2 step 5 (REQ-BFG-058; the one regeneration of 0.9.1): RE-PINNED from tools/genCaptainRunes.ts run once on bal2
 * 1e55cb8 (bb-0.9.1, 65 runes offered: DORMANT_RUNES empty, so FURNACE's four runes are in every dawn's draw),
 * 2026-10-05 16:06:49Z, W/output-bal2/captain-runes/captain-runes.ts.txt, pasted as written. 16 of the 19 lists moved
 * (each offer draws from the larger catalogue); MOTH QUEEN's, VOSS's and GRIMHOLD's did not.
 * CATCHUP-091 (REQ-BFG-058, REQ-BFG-024): RE-PINNED from tools/genCaptainRunes.ts with its own two rules (its header:
 * runeInertFor, the dead rune, and CAPTAIN_RUNE_SKIP, the walls), each the picker's next-best card of the same offer,
 * pasted as written (W/output-c091/captain-runes/). Three lists moved: EMBERLYN (day 2 COAL CHUTE -> SEAM RIVETS: COAL
 * CHUTE reads the KILN's HEAT, which a WEAVER captain lacks), MASTER VOSS (day 6 TWIN SUNS -> SCRAP SAINT, day 10 MOLTEN
 * VOWS -> LOOM OF WOE) and LONGTOOTH (day 8 SCRAP SAINT -> RUNE TITHE, then FORGE WARD and PYRE HEART on days 9-10).
 * Y7b2 step 5 (REQ-BFG-070, REQ-BFG-046; release Y's one regeneration, bb-0.9.3): RE-PINNED from tools/genCaptainRunes.ts
 * run once on y7b2 ae494f5 (the flip, the fuse rule and the bump; 65 runes in the catalogue), 2026-10-06 03:21:20Z,
 * T/output-y7b2/captain-runes/captain-runes.ts.txt, pasted as written.
 * CATCHUP-093 (REQ-BFG-024, REQ-BFG-058; the walls on release Y's field): RE-PINNED from tools/genCaptainRunes.ts with two
 * more CAPTAIN_RUNE_SKIP rules (its header: MASTER VOSS's TWIN NAILS not before day 2, the Iron Matriarch's IRON SKIN never),
 * each the picker's next-best card of the same offer, pasted as written (W/output-c093/captain-runes/; a second run is
 * byte-identical). Two lists moved: MASTER VOSS (day 1 TWIN NAILS -> OILED COGS, day 2 SCRAP BITER -> TWIN NAILS, day 8
 * SEAM RIVETS -> IRON SKIN) and the Iron Matriarch (day 5 IRON SKIN -> BULWARK WARD, day 6 SCRAP BITER -> FINAL NAIL).
 */
export const CAPTAIN_RUNES: Readonly<Partial<Record<RivalId, readonly string[]>>> = {
  sootjaw: ["scrap_biter", "toll_road", "slow_embers", "war_edge", "searing", "heat_sink", "spare_hull", "pyre_heart", "scrap_medic", "last_stand"], // furnace: SCRAP BITER, TOLL ROAD, SLOW EMBERS, WAR EDGE, SEARING, HEAT SINK, SPARE HULL, PYRE HEART, SCRAP MEDIC, LAST STAND
  nettle: ["oiled_cogs", "loose_thread", "scrap_biter", "green_thread", "hair_trigger", "bulkheads", "ember_shot", "snare_knot", "tangle_wire", "double_knot"], // weaver: OILED COGS, LOOSE THREAD, SCRAP BITER, GREEN THREAD, HAIR TRIGGER, BULKHEADS, EMBER SHOT, SNARE KNOT, TANGLE WIRE, DOUBLE KNOT
  grubnose: ["quick_latch", "sharp_scrap", "ash_kindle", "toll_road", "pyre_heart", "bulkheads", "last_stand", "forge_ward", "long_road", "stoked_fires"], // furnace: QUICK LATCH, SHARP SCRAP, ASH KINDLE, TOLL ROAD, PYRE HEART, BULKHEADS, LAST STAND, FORGE WARD, THE LONG ROAD, STOKED FIRES
  mothqueen: ["coin_purse", "loose_thread", "tar_barrel", "sharp_scrap", "loom_of_woe", "thread_storm", "ember_shot", "last_stand", "widows_web", "warlords_due"], // weaver: COIN PURSE, LOOSE THREAD, TAR BARREL, SHARP SCRAP, LOOM OF WOE, THREAD STORM, EMBER SHOT, LAST STAND, WIDOW'S WEB, WARLORD'S DUE
  sparkfang: ["coal_chute", "ash_kindle", "slow_embers", "heat_sink", "iron_skin", "shatter_shot", "thread_storm", "gun_oil", "twin_suns", "scrap_saint"], // furnace: COAL CHUTE, ASH KINDLE, SLOW EMBERS, HEAT SINK, IRON SKIN, SHATTER SHOT, THREAD STORM, GUN OIL, TWIN SUNS, SCRAP SAINT
  lacewing: ["loose_thread", "quick_latch", "tar_barrel", "tangle_wire", "barbed_silk", "steady_iron", "warlords_due", "last_stand", "first_blood", "ward_stone"], // weaver: LOOSE THREAD, QUICK LATCH, TAR BARREL, TANGLE WIRE, BARBED SILK, STEADY IRON, WARLORD'S DUE, LAST STAND, FIRST BLOOD, WARD STONE
  ratchet: ["coal_chute", "slow_embers", "searing", "heat_sink", "pyre_heart", "steady_iron", "scrap_biter", "last_stand", "hair_trigger", "first_blood"], // furnace: COAL CHUTE, SLOW EMBERS, SEARING, HEAT SINK, PYRE HEART, STEADY IRON, SCRAP BITER, LAST STAND, HAIR TRIGGER, FIRST BLOOD
  emberlyn: ["final_nail", "seam_rivets", "loose_thread", "leech_vow", "scrap_biter", "last_stand", "ember_shot", "widows_web", "scrap_saint", "thread_storm"], // weaver: FINAL NAIL, SEAM RIVETS, LOOSE THREAD, LEECH VOW, SCRAP BITER, LAST STAND, EMBER SHOT, WIDOW'S WEB, SCRAP SAINT, THREAD STORM
  bulwark: ["coal_chute", "quick_latch", "tar_barrel", "heat_sink", "warlords_due", "fat_purse", "searing", "pyre_heart", "ward_stone", "shatter_shot"], // furnace: COAL CHUTE, QUICK LATCH, TAR BARREL, HEAT SINK, WARLORD'S DUE, FAT PURSE, SEARING, PYRE HEART, WARD STONE, SHATTER SHOT
  silkshade: ["final_nail", "loose_thread", "twin_nails", "quick_latch", "toll_road", "barbed_silk", "oiled_cogs", "forge_ward", "loom_of_woe", "ember_shot"], // weaver: FINAL NAIL, LOOSE THREAD, TWIN NAILS, QUICK LATCH, TOLL ROAD, BARBED SILK, OILED COGS, FORGE WARD, LOOM OF WOE, EMBER SHOT
  longtooth: ["quick_latch", "coal_chute", "many_hands", "war_edge", "heat_sink", "scrap_medic", "shatter_shot", "rune_tithe", "forge_ward", "pyre_heart"], // furnace: QUICK LATCH, COAL CHUTE, MANY HANDS, WAR EDGE, HEAT SINK, SCRAP MEDIC, SHATTER SHOT, RUNE TITHE, FORGE WARD, PYRE HEART
  highspire: ["many_hands", "loose_thread", "quick_latch", "tangle_wire", "war_edge", "thread_storm", "snare_knot", "spare_hull", "pyre_heart", "last_stand"], // weaver: MANY HANDS, LOOSE THREAD, QUICK LATCH, TANGLE WIRE, WAR EDGE, THREAD STORM, SNARE KNOT, SPARE HULL, PYRE HEART, LAST STAND
  matriarch: ["quick_latch", "stoked_fires", "heat_sink", "ash_kindle", "bulwark_ward", "final_nail", "ember_shot", "warlords_due", "pitch_wagon", "widows_web"], // furnace: QUICK LATCH, STOKED FIRES, HEAT SINK, ASH KINDLE, BULWARK WARD, FINAL NAIL, EMBER SHOT, WARLORD'S DUE, PITCH WAGON, WIDOW'S WEB
  brasswick: ["sharp_scrap", "final_nail", "steady_iron", "twin_suns", "hot_seam", "seam_rivets", "warlords_due", "war_edge", "thread_storm", "scrap_medic"], // foundry: SHARP SCRAP, FINAL NAIL, STEADY IRON, TWIN SUNS, HOT SEAM, SEAM RIVETS, WARLORD'S DUE, WAR EDGE, THREAD STORM, SCRAP MEDIC
  voss: ["oiled_cogs", "twin_nails", "twin_salve", "hot_seam", "grave_plates", "scrap_saint", "thread_storm", "iron_skin", "pitch_wagon", "loom_of_woe"], // foundry: OILED COGS, TWIN NAILS, TWIN SALVE, HOT SEAM, GRAVE PLATES, SCRAP SAINT, THREAD STORM, IRON SKIN, PITCH WAGON, LOOM OF WOE
  grimhold: ["last_wall", "gun_oil", "rivet_hoard", "tar_barrel", "quick_latch", "coin_purse", "hair_trigger", "ember_shot", "scab_iron", "war_edge"], // bastion: LAST WALL, GUN OIL, RIVET HOARD, TAR BARREL, QUICK LATCH, COIN PURSE, HAIR TRIGGER, EMBER SHOT, SCAB IRON, WAR EDGE
  karsk: ["last_wall", "rivet_hoard", "leech_vow", "iron_temper", "stoked_fires", "scab_iron", "scrap_medic", "last_stand", "steady_iron", "ember_shot"], // bastion: LAST WALL, RIVET HOARD, LEECH VOW, IRON TEMPER, STOKED FIRES, SCAB IRON, SCRAP MEDIC, LAST STAND, STEADY IRON, EMBER SHOT
  lockjaw: ["oiled_cogs", "slow_embers", "loose_thread", "coal_chute", "pyre_heart", "sharp_scrap", "heat_sink", "last_stand", "scrap_saint", "forge_ward"], // furnace: OILED COGS, SLOW EMBERS, LOOSE THREAD, COAL CHUTE, PYRE HEART, SHARP SCRAP, HEAT SINK, LAST STAND, SCRAP SAINT, FORGE WARD
  thistlemail: ["tar_barrel", "snare_knot", "double_knot", "gun_oil", "barbed_silk", "toll_road", "pitch_wagon", "first_blood", "thread_storm", "scrap_saint"], // weaver: TAR BARREL, SNARE KNOT, DOUBLE KNOT, GUN OIL, BARBED SILK, TOLL ROAD, PITCH WAGON, FIRST BLOOD, THREAD STORM, SCRAP SAINT
};

/**
 * BOTS-X: `build` holding a captain's runes up to `day`: Build.runes = the first `day` ids of `list` as { id } in pick
 * order (the last key), the HULL runes' hull added to hullBonus and the BELT runes' belt to beltCap (runes.ts runeGrants,
 * as botTakeRune and run.ts takeRune apply a pick). No list, an empty one or no rune by `day`: `build` itself, untouched.
 */
export function captainRunesOn(build: Build, list: readonly string[] | undefined, day: number): Build {
  const ids = (list ?? []).slice(0, Math.max(0, Math.floor(day)));
  if (!ids.length) return build;
  const runes = ids.map((id) => ({ id })), grant = runeGrants(runes, day);
  return { ...build, hullBonus: build.hullBonus + grant.hull, beltCap: build.beltCap + grant.belt, runes };
}

/** bb-0.8.3 (D7'): a captain's levels on `day` within `room` gold (FACTORY first, then TURRET SPEED); undefined: none. */
export function captainLevels(hero: HeroId, day: number, room: number): Upgrades | undefined {
  const out: Upgrades = {};
  let left = room;
  for (const track of ["factory", "turret"] as const) {
    const days = CAPTAIN_LEVELS[hero]?.[track] ?? [];
    let level = 1;
    for (const d of days) {
      if (d > day || UPGRADE_PRICE[level + 1] > left) break;
      left -= UPGRADE_PRICE[level + 1];
      level++;
    }
    if (level > 1) out[track] = level;
  }
  return out.turret || out.factory ? { ...(out.turret ? { turret: out.turret } : {}), ...(out.factory ? { factory: out.factory } : {}) } : undefined;
}

/** The most gold a run can have received before day `day`'s dusk (= net/validate.ts maxGoldByDay; sim-side, no net import). */
function maxGold(day: number): number {
  let g = START_GOLD;
  for (let d = 1; d < day; d++) g += incomeFor(d, true);
  return g;
}

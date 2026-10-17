// races: starting builds and reference builds for the four race heroes (FOUNDRY, BASTION,
// METRONOME, SIPHON). "Warlord" is the Easy/Medium/Hard captain roster (separate work), so these
// are reference decks: what tests, tables and async stand-ins field for a hero on a given day.
// Ruling 3: every reference build is a deck a player could own that day. Plating and belt come in
// whole purchases, every item is sold by a merchant (or is the hero's own signature factory),
// and the purchase cost is within maxGoldByDay(day). Day 1 is a real fight: it spends the start
// purse, with no handicap. Builds escalate every day through day 10 (the STEPS table has one entry a day); RUN-1: on a long
// run (no day limit) days 11-16 keep the day-10 layout and the hull ramp goes on, a later day is day 16's layout.
// Use src/sim/heroBuilds.ts as the entry point; it covers all six heroes.

import { fuseFrom } from "../../game/fuse";
import type { Run } from "../../game/run";
import { warlordHull } from "../ai";
import { migrateDeck } from "../beltside";
import { ITEMS } from "../content";
import { key as K, rotField, type Build, type Placed, type RouteDef } from "../deck";
import { RACE_HEROES, type RaceHeroId } from "./data";
import { LONG_RUN_GEN_DAYS, longRunRules } from "../longRun"; // RUN-1 (REQ-BFG-059): the long run's reference depth

/** The 10-day run's reference depth: the table the STEPS below are written for (one entry a day). */
export const REF_DAYS = 10;
/** RUN-1 (REQ-BFG-059, D5): the long run's reference depth, 16 (the deepest day a run reaches without a draw is 16, or 17 with
 *  an early PATCH UP, longRun.ts LONG_RUN_DEEPEST_DAY): with the long run in the game (longRunRules) the par and reference
 *  builds go to this day. Days 11-16 hold all 10 STEPS (the day-10 layout) with the day's own hull ramp (refHull); a later
 *  day is the day-16 layout with that day's hull (refHullDay). Days 1-10 are exactly as before, and with the switch off
 *  nothing past day 10 changes (refDay clamps to REF_DAYS). */
export const REF_DAYS_LONG = LONG_RUN_GEN_DAYS;
const U = 9000; // reference-build uid base (matches the ai.ts warlords)
const PRESS_AT: [number, number] = [6, 6];

/** Hull of one ARMOR PLATING purchase (+25): the step of every reference hull bonus. */
export const PLATE_STEP = ITEMS.plating.supply!.hull!;

/** A hull bonus rounded down to whole ARMOR PLATING steps (+25 each), never negative. */
export function wholePlating(bonus: number): number {
  return Math.max(0, Math.floor(bonus / PLATE_STEP) * PLATE_STEP);
}

/** Plates in the reference ramp on `day`: the ai.ts warlord curve rounded to the NEAREST plate,
 *  never negative. This is the honest-ghost rule the dusk stand-in (src/game/honest.ts) and the
 *  rival captains (src/sim/rivals.ts) use too, so all three agree. Days 1-10: 0,0,0,0,1,1,2,2,2,3. */
export function rampPlates(day: number): number {
  return Math.max(0, Math.round(warlordHull(day) / PLATE_STEP));
}

/** Reference hull bonus: PLATE_STEP x rampPlates(day) (0 to day 4, +25 days 5-6, +50 days 7-9, +75 day 10). */
export function refHull(day: number): number {
  return PLATE_STEP * rampPlates(day);
}

/** RUN-1: the last day the reference builds answer for: REF_DAYS_LONG with the long run in the game, else REF_DAYS. */
export const refDepth = (): number => (longRunRules() ? REF_DAYS_LONG : REF_DAYS);

/** Clamp a day into 1..refDepth() (1..REF_DAYS, 10, with the long run off: exactly as before). */
export function refDay(day: number): number {
  return Number.isFinite(day) ? Math.max(1, Math.min(refDepth(), Math.floor(day))) : 1;
}

/** RUN-1 (REQ-BFG-059, D5): the day whose hull a reference build holds: with the long run in the game, the day itself past
 *  REF_DAYS_LONG (the day-16 plan with that day's hull), else refDay (the switch off: day 10's, as before). */
export function refHullDay(day: number): number {
  return longRunRules() && Number.isFinite(day) && day > REF_DAYS_LONG ? Math.floor(day) : refDay(day);
}

/** Column x from row 5 straight up to the forward row. */
const colUp = (x: number): number[] => [5, 4, 3, 2, 1, 0].map((y) => K(x, y));

interface Layout {
  factory: string;
  at: [number, number];
  routes: number[][];
}

const SIPHON_LEFT = [K(4, 5), K(3, 5), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(2, 0)]; // 8 tiles, connector 2
const SIPHON_RIGHT = [K(5, 5), K(6, 5), K(7, 5), K(7, 4), K(7, 3), K(7, 2), K(7, 1), K(7, 0)]; // 8 tiles, connector 7
/** METRONOME's 10-tile route (ride 4.2 s: the pendulum peak). Drawing it costs nothing. */
const METRONOME_TEN = [K(4, 5), K(3, 5), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(3, 2), K(4, 2), K(4, 1), K(4, 0)];

/** Starting layouts (docs/RACES.md tables). */
const START: Record<RaceHeroId, Layout> = {
  foundry: { factory: "crucible", at: [2, 6], routes: [colUp(2), colUp(3)] }, // both into gun 1: fuses every pour
  bastion: { factory: "wardworks", at: [4, 6], routes: [colUp(4)] },
  metronome: { factory: "clockworks", at: [4, 6], routes: [colUp(4)] }, // 6 tiles: ride 2.6 s, 5.7 dmg
  siphon: { factory: "sump", at: [4, 6], routes: [SIPHON_LEFT, SIPHON_RIGHT] }, // DRAG left, ECHO right
};

/** Reference layouts before purchases: the start, except METRONOME redraws its route to 10 tiles. */
const REF_BASE: Record<RaceHeroId, Layout> = { ...START, metronome: { ...START.metronome, routes: [METRONOME_TEN] } };

/** A rig bought that day: its def, its own cell (beside the belt) and its rotation (0.6.2 BELTSIDE). */
type Rig = [def: string, x: number, y: number, rot?: number];
type Buy = { gates?: Rig[]; press?: number[]; mod?: [string, number] };

// One entry per day (1-10). Gold in comments is the running purchase cost including the
// reference plating (refHull, 5 g a plate: 1 plate on days 5-6, 2 on days 7-9, 3 on day 10).
// 0.6.2 BELTSIDE (M4): every rig stands beside the belt tile its 0.6.1 gate stood on and works exactly that
// tile ("-> (x,y)"), turned so no other arrow lands on a belt; where that tile has no free side, the nearest
// tile of the same belt that has one (noted).
// 0.8.0 B1 M1 (output-H1 REPORT section 6 finding, section 11 item 4): two 1-star copies merge (0.6.1a), so a "mirrored"
// rig bought twice became one ★2 on the first belt and left the other belt bare (FOUNDRY's second blank belt on every
// day, SIPHON's ECHO belt, BASTION's and METRONOME's press belt). Each mirror is now a different part of the same role
// and price class on its own belt (WHETSTONE <-> COUNTERWEIGHT, TEMPER <-> VENOM DRIP, LONG HAUL <-> QUENCH TANK), so
// every purchase works where its comment says; a repeat copy is bought only as a written ★2 upgrade. A CALIBRATION on a
// gun that waits for its loads (FOUNDRY's guns, SIPHON's: H1's "starved", VERIFIED-I1 call 2) fires no faster, so those
// purchases are rigs that work the belts instead. tests/races.refdecks.test.ts pins the rule.
const STEPS: Record<RaceHeroId, Buy[]> = {
  foundry: [ // mirror the processing on both fusing routes (A = (2,y), B = (3,y)); a Stamp Press lights gun 2
    // (B's blank fuses into A's, which keeps B's flat damage, Burn, VENOM DRIP seconds and Shock but not its Fray: that goes
    // on A; races/foundry.ts fuse. TXT-096: POISON left at Y6, VENOM DRIP's BURN seconds add up since Y7b2)
    { gates: [["whetstone", 1, 3, 1], ["counterweight", 4, 1]] }, // d1  7 g: A +2 -> (2,3); B +2 (4 tiles ridden) -> (3,1)
    { gates: [["temper", 4, 4, 3]] }, // d2 10 g: B 1 Burn -> (3,4)
    { gates: [["venom", 1, 4]] }, // d3 14 g: A, its Burn lasts +3 s (VENOM DRIP; TXT-096: was "2 Poison") -> (2,4)
    { gates: [["longhaul", 1, 2]] }, // d4 19 g: A +1 a prior hit -> (2,2)
    { gates: [["quench", 4, 2]] }, // d5 28 g: B +1, and its Burn into +3 -> (3,2)
    { gates: [["barbed", 1, 5]] }, // d6 32 g: A Fray -> (2,5) (no CALIBRATION: gun 1 waits for its fused loads)
    { press: colUp(6) }, // d7 45 g: gun 2 fires plain slugs
    { gates: [["heatjacket", 5, 5]] }, // d8 50 g: the press belt -> (6,5)
    { gates: [["keg", 5, 4]] }, // d9 54 g: the press belt -> (6,4)
    { gates: [["whetstone", 1, 1, 1]] }, // d10 62 g: a second WHETSTONE, ★2 on A at (1,3)
  ],
  bastion: [ // harden the bulwark line, then a Stamp Press into the heavy gun's second connector
    { gates: [["whetstone", 3, 3, 1], ["temper", 3, 4, 1]] }, // d1  6 g -> (4,3), (4,4)
    { gates: [["grease", 3, 5, 1]] }, // d2  9 g: plating starts sooner -> (4,5)
    { gates: [["longhaul", 3, 2]] }, // d3 14 g -> (4,2)
    { mod: ["calibrate", 0] }, // d4 19 g
    { press: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] }, // d5 32 g (13/14 belt)
    { gates: [["counterweight", 6, 2]] }, // d6 36 g: the press belt +2 (4 tiles ridden) -> (5,2)
    { gates: [["venom", 6, 4]] }, // d7 45 g: the press belt, its Burn lasts +3 s (VENOM DRIP; TXT-096: was "2 Poison") -> (5,4)
    { gates: [["coil", 3, 1, 1]] }, // d8 50 g -> (4,1)
    { gates: [["quench", 7, 5]] }, // d9 54 g: the press belt's first tile ((5,5) has no free side) -> (6,5)
    { gates: [["heatjacket", 6, 3]] }, // d10 64 g: the press belt -> (5,3)
  ],
  metronome: [ // 10-tile beat route; speed rigs preserve tempo and add locked-belt damage
    { gates: [["whetstone", 1, 4, 1], ["temper", 1, 3, 1]] }, // d1  6 g: 10 + 2 dmg, 2 Burn -> (2,4), (2,3)
    { gates: [["longhaul", 1, 2]] }, // d2 11 g -> (2,2)
    { mod: ["calibrate", 0] }, // d3 16 g
    { gates: [["coil", 3, 1]] }, // d4 21 g -> (4,1)
    { press: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] }, // d5 34 g (17/20 belt)
    { gates: [["counterweight", 6, 3]] }, // d6 38 g: the press belt +1.5 -> (5,3), from the right
    { gates: [["venom", 4, 4]] }, // d7 47 g: the press belt -> (5,4)
    { gates: [["splitter", 3, 3, 1]] }, // d8 54 g: copies keep the parent's ride time -> (3,2)
    { gates: [["quench", 6, 2]] }, // d9 58 g: the press belt -> (5,2)
    { gates: [["heatjacket", 4, 3, 1]] }, // d10 68 g -> (4,2), after the splitter
  ],
  siphon: [ // process both leech lines; ECHO borrows the enemy's processing for free
    { gates: [["whetstone", 1, 3, 1], ["counterweight", 6, 3]] }, // d1  7 g -> (2,3); ECHO +2 -> (7,3)
    { gates: [["temper", 1, 4, 1]] }, // d2 10 g -> (2,4)
    { gates: [["coil", 1, 2, 1]] }, // d3 15 g: a non-hull DRAG hit disrupts and drags -> (2,2)
    { gates: [["venom", 6, 4]] }, // d4 19 g: ECHO -> (7,4) (no CALIBRATION: both guns wait for their loads)
    { gates: [["longhaul", 6, 2]] }, // d5 29 g -> (7,2)
    { gates: [["quench", 1, 1]] }, // d6 33 g: DRAG -> (2,1)
    { gates: [["heatjacket", 8, 5]] }, // d7 43 g: ECHO -> (7,5) (no CALIBRATION)
    { gates: [["barbed", 1, 5]] }, // d8 47 g: DRAG -> (2,5)
    { gates: [["keg", 8, 4]] }, // d9 51 g: ECHO -> (7,4)
    { gates: [["whetstone", 2, 6]] }, // d10 59 g: a second WHETSTONE, ★2 on DRAG at (1,3)
  ],
};

function layoutBuild(hero: RaceHeroId, l: Layout, uid0: number): Build {
  const items: Placed[] = [{ uid: uid0, def: l.factory, x: l.at[0], y: l.at[1] }];
  const routes: RouteDef[] = l.routes.map((cells) => ({ factory: uid0, cells: [...cells] }));
  return { hero, items, routes, mods: [], beltCap: RACE_HEROES[hero].belt, hullBonus: 0 };
}

/** The deck a race hero starts a run with. */
export function raceStartBuild(hero: RaceHeroId, uid0: number): Build {
  return migrateDeck(layoutBuild(hero, START[hero], uid0), "preset:race");
}

/** Reference build for a day (1-10; other days clamp; RUN-1: with the long run in the game, 1-16, and a later day is day
 *  16's layout with that day's hull). Legal, escalating and honestly priced. */
export function raceRefBuild(hero: RaceHeroId, day: number): Build {
  const d = refDay(day), hd = refHullDay(day); // RUN-1: past REF_DAYS, the day's own hull
  const b = layoutBuild(hero, REF_BASE[hero], U);
  let uid = U + 10;
  // Preset purchases use the same merge chain as live shop gains. The arriving copy
  // disappears when it meets a placed twin; the survivor keeps its cell and rotation.
  const fusion = { build: b, inventory: [] } as unknown as Run;
  for (const buy of STEPS[hero].slice(0, d)) {
    for (const [def, x, y, rot] of buy.gates ?? []) {
      const placed = { uid: uid++, def, x, y, ...rotField(def, rot ?? 0) };
      b.items.push(placed);
      fuseFrom(fusion, placed.uid);
    }
    if (buy.press) {
      b.items.push({ uid: U + 1, def: "press", x: PRESS_AT[0], y: PRESS_AT[1] });
      b.routes.push({ factory: U + 1, cells: [...buy.press] });
    }
    if (buy.mod) {
      const placed = { uid: uid++, def: buy.mod[0], turret: buy.mod[1] };
      b.mods.push(placed);
      fuseFrom(fusion, placed.uid);
    }
  }
  b.hullBonus = refHull(hd);
  return migrateDeck(b, "preset:race"); // 0.6.2 BELTSIDE: a load boundary (D3); a no-op for the native STEPS
}

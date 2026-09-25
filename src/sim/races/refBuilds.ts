// races: starting builds and reference builds for the four race heroes (FOUNDRY, BASTION,
// METRONOME, SIPHON). "Warlord" is the Easy/Medium/Hard captain roster (separate work), so these
// are reference decks: what tests, tables and async stand-ins field for a hero on a given day.
// Ruling 3: every reference build is a deck a player could own that day. Plating and belt come in
// whole purchases, every item is sold by a merchant (or is the hero's own signature factory),
// and the purchase cost is within maxGoldByDay(day). Day 1 is a real fight: it spends the start
// purse, with no handicap. Builds escalate every day through day 10 (a run is 10 days).
// Use src/sim/heroBuilds.ts as the entry point; it covers all six heroes.

import { fuseFrom } from "../../game/fuse";
import type { Run } from "../../game/run";
import { warlordHull } from "../ai";
import { migrateDeck } from "../beltside";
import { ITEMS } from "../content";
import { key as K, rotField, type Build, type Placed, type RouteDef } from "../deck";
import { RACE_HEROES, type RaceHeroId } from "./data";

export const REF_DAYS = 10;
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

/** Clamp a day into 1..REF_DAYS. */
export function refDay(day: number): number {
  return Number.isFinite(day) ? Math.max(1, Math.min(REF_DAYS, Math.floor(day))) : 1;
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
const STEPS: Record<RaceHeroId, Buy[]> = {
  foundry: [ // mirror the processing on both fusing routes; a Stamp Press lights gun 2
    { gates: [["whetstone", 1, 3, 1], ["whetstone", 4, 3, 3]] }, // d1  6 g: fused 1.5 x (5 + 5) = 15; -> (2,3), (3,3)
    { gates: [["temper", 1, 4, 1]] }, // d2  9 g -> (2,4)
    { gates: [["temper", 4, 4, 3]] }, // d3 12 g -> (3,4)
    { gates: [["longhaul", 1, 2]] }, // d4 17 g -> (2,2)
    { gates: [["longhaul", 4, 2, 2]] }, // d5 27 g -> (3,2)
    { mod: ["calibrate", 0] }, // d6 32 g
    { press: colUp(6) }, // d7 45 g: gun 2 fires plain slugs
    { gates: [["whetstone", 5, 3, 1]] }, // d8 48 g -> (6,3)
    { gates: [["temper", 5, 4, 1]] }, // d9 51 g -> (6,4)
    { mod: ["calibrate", 1] }, // d10 61 g
  ],
  bastion: [ // harden the bulwark line, then a Stamp Press into the heavy gun's second connector
    { gates: [["whetstone", 3, 3, 1], ["temper", 3, 4, 1]] }, // d1  6 g -> (4,3), (4,4)
    { gates: [["grease", 3, 5, 1]] }, // d2  9 g: plating starts sooner -> (4,5)
    { gates: [["longhaul", 3, 2]] }, // d3 14 g -> (4,2)
    { mod: ["calibrate", 0] }, // d4 19 g
    { press: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] }, // d5 32 g (13/14 belt)
    { gates: [["whetstone", 6, 3, 3]] }, // d6 35 g -> (5,3)
    { gates: [["temper", 6, 4, 3]] }, // d7 43 g -> (5,4)
    { gates: [["coil", 3, 1, 1]] }, // d8 48 g -> (4,1)
    { gates: [["grease", 7, 5, 3]] }, // d9 51 g -> (6,5): the press belt's first tile ((5,5) has no free side)
    { gates: [["longhaul", 6, 2, 2]] }, // d10 61 g -> (5,2)
  ],
  metronome: [ // 10-tile beat route (no speed rigs: they are inert and excluded from its shop)
    { gates: [["whetstone", 1, 4, 1], ["temper", 1, 3, 1]] }, // d1  6 g: 10 + 2 dmg, 2 Burn -> (2,4), (2,3)
    { gates: [["longhaul", 1, 2]] }, // d2 11 g -> (2,2)
    { mod: ["calibrate", 0] }, // d3 16 g
    { gates: [["coil", 3, 1]] }, // d4 21 g -> (4,1)
    { press: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] }, // d5 34 g (17/20 belt)
    { gates: [["whetstone", 6, 3, 3]] }, // d6 37 g -> (5,3), from the right: (4,3) is the day-10 whetstone's way in
    { gates: [["temper", 4, 4, 1]] }, // d7 45 g -> (5,4)
    { gates: [["splitter", 3, 3, 1]] }, // d8 52 g: copies keep the parent's ride time -> (3,2)
    { gates: [["longhaul", 6, 2, 2]] }, // d9 57 g -> (5,2)
    { gates: [["whetstone", 4, 3]] }, // d10 65 g -> (4,2), after the splitter
  ],
  siphon: [ // process both leech lines; ECHO borrows the enemy's processing for free
    { gates: [["whetstone", 1, 3, 1], ["whetstone", 6, 3, 1]] }, // d1  6 g -> (2,3), (7,3)
    { gates: [["temper", 1, 4, 1]] }, // d2  9 g -> (2,4)
    { gates: [["coil", 1, 2, 1]] }, // d3 14 g: a non-hull DRAG hit disrupts and drags -> (2,2)
    { mod: ["calibrate", 0] }, // d4 19 g
    { gates: [["longhaul", 6, 2]] }, // d5 29 g -> (7,2)
    { gates: [["temper", 6, 4, 1]] }, // d6 32 g -> (7,4)
    { mod: ["calibrate", 1] }, // d7 42 g
    { gates: [["longhaul", 1, 1]] }, // d8 47 g -> (2,1)
    { gates: [["whetstone", 2, 6]] }, // d9 50 g -> (2,5)
    { gates: [["whetstone", 7, 6]] }, // d10 58 g -> (7,5)
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

/** Reference build for a day (1-10; other days clamp). Legal, escalating and honestly priced. */
export function raceRefBuild(hero: RaceHeroId, day: number): Build {
  const d = refDay(day);
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
  b.hullBonus = refHull(d);
  return migrateDeck(b, "preset:race"); // 0.6.2 BELTSIDE: a load boundary (D3); a no-op for the native STEPS
}

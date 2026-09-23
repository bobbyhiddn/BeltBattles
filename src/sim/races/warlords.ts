// races: starting builds and PvE warlords for FOUNDRY and BASTION, authored like ai.ts
// warlordBuild: real production builds under the same sim rules, escalating by round (1-12).
// Gold per round tracks the Furnace/Weaver warlords (r5 ~14 g, r10 ~33 g); hull uses warlordHull.

import { warlordHull } from "../ai";
import { key as K, type Build, type Placed, type RouteDef } from "../deck";
import { RACE_HEROES, type RaceHeroId } from "./data";

const U = 9000; // warlord uid base (matches ai.ts)

interface Layout {
  items: Placed[];
  routes: RouteDef[];
}

/** FOUNDRY start: Crucible at (2,6), two mirrored 6-tile routes into gun 1 (connectors 2, 3). */
function foundryStart(uid0: number): Layout {
  return {
    items: [{ uid: uid0, def: "crucible", x: 2, y: 6 }],
    routes: [
      { factory: uid0, cells: [K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(2, 0)] },
      { factory: uid0, cells: [K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(3, 0)] },
    ],
  };
}

/** BASTION start: Wardworks at (4,6), straight 6-tile route into connector 4. */
function bastionStart(uid0: number): Layout {
  return {
    items: [{ uid: uid0, def: "wardworks", x: 4, y: 6 }],
    routes: [{ factory: uid0, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
  };
}

export function startingRaceBuild(hero: RaceHeroId, uid0: number): Build {
  const l = hero === "foundry" ? foundryStart(uid0) : bastionStart(uid0);
  return { hero, items: l.items, routes: l.routes, mods: [], beltCap: RACE_HEROES[hero].belt, hullBonus: 0 };
}

type Step = { gate?: [string, number, number]; press?: { at: [number, number]; cells: number[] }; mod?: [string, number] };

// FOUNDRY: mirror the processing on both fusing routes; a Stamp Press lights gun 2 at r7.
const FOUNDRY_STEPS: Step[] = [
  { gate: ["whetstone", 2, 3] }, // r2  3 g: route A blank +2 -> fused (5+3)x1.5
  { gate: ["whetstone", 3, 3] }, // r3  6 g
  { gate: ["temper", 2, 4] }, // r4  9 g
  { gate: ["longhaul", 2, 2] }, // r5 14 g
  { gate: ["temper", 3, 4] }, // r6 17 g
  { press: { at: [6, 6], cells: [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(6, 0)] } }, // r7 25 g
  { gate: ["longhaul", 3, 2] }, // r8 30 g
  { gate: ["whetstone", 6, 3] }, // r9 33 g
  {}, // r10 33 g (hull keeps rising)
  { mod: ["calibrate", 0] }, // r11 38 g
  { gate: ["temper", 6, 4] }, // r12 41 g
];

// BASTION: harden the bulwark line, then a Stamp Press into the heavy gun's second connector.
const BASTION_STEPS: Step[] = [
  { gate: ["whetstone", 4, 3] }, // r2  3 g
  { gate: ["temper", 4, 4] }, // r3  6 g
  { gate: ["longhaul", 4, 2] }, // r4 11 g
  { gate: ["grease", 4, 5] }, // r5 14 g: plating starts sooner
  { press: { at: [6, 6], cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] } }, // r6 22 g
  { gate: ["whetstone", 5, 3] }, // r7 25 g
  { mod: ["calibrate", 0] }, // r8 30 g
  { gate: ["temper", 5, 4] }, // r9 33 g
  {}, // r10 33 g
  { gate: ["coil", 4, 1] }, // r11 38 g
  { gate: ["grease", 5, 5] }, // r12 41 g
];

/** Warlord build for a round (1-based, 1-12; later rounds reuse round 12 content). */
export function raceWarlordBuild(hero: RaceHeroId, round: number): Build {
  const l = hero === "foundry" ? foundryStart(U) : bastionStart(U);
  const items = [...l.items];
  const routes = [...l.routes];
  const mods: Build["mods"] = [];
  let uid = U + 10;
  const steps = hero === "foundry" ? FOUNDRY_STEPS : BASTION_STEPS;
  for (let i = 0; i < Math.min(steps.length, round - 1); i++) {
    const st = steps[i];
    if (st.gate) items.push({ uid: uid++, def: st.gate[0], x: st.gate[1], y: st.gate[2] });
    if (st.press) {
      const press = U + 1;
      items.push({ uid: press, def: "press", x: st.press.at[0], y: st.press.at[1] });
      routes.push({ factory: press, cells: [...st.press.cells] });
    }
    if (st.mod) mods.push({ uid: uid++, def: st.mod[0], turret: st.mod[1] });
  }
  return { hero, items, routes, mods, beltCap: RACE_HEROES[hero].belt, hullBonus: warlordHull(round) };
}

export function raceWarlordName(hero: RaceHeroId, round: number): string {
  const foundry = ["TIN APPRENTICE", "TWIN POUR", "GUILD CASTER", "BRASS WARDEN", "THE ASSAYER", "ALLOY LORD", "GRANDMASTER SMITH", "THE GREAT CRUCIBLE"];
  const bastion = ["STONE CUB", "SHIELD WARDEN", "RIVET KING", "DEEP GATE", "IRONBEARD", "THE BULWARK", "HOLD MARSHAL", "THE LAST BASTION"];
  const list = hero === "foundry" ? foundry : bastion;
  return list[Math.min(list.length - 1, Math.max(0, round - 1))];
}

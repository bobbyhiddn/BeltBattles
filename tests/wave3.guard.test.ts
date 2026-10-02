// 0.8.0 P1 (BRIEF-wave3-P1 M2: "Each piece gets unit tests, including a battle that shows its guard: a deck without the
// part replays bit for bit"). Decks with no wave-3 part, each built to run right beside one engine piece's code, fight
// full battles; every battle must replay exactly as it did on v070-rc: winner, time, ticks, both hulls, every SideStats
// field, the race state the sim keeps (plating; FOUNDRY fusions) and the tally of sim events by type.
//   E1 (plating on every hull): every hero's start deck (BASTION plates), poison and limpets on a plated BASTION
//   E2 (pairs): FOUNDRY's fusions, HOPPER stores (dropStore) on BASTION and FOUNDRY, two presses arriving together
//   E3 (stokers): a WHETSTONE whose arrow points into the Kiln (stays IDLE)
//   E4 (holds): a LONG HAUL (shape II) standing between two belts, as a TWIN LATCH would
//   E5 (crossfire): two rigs on one tile; E6 (matched belts): two equal belts into one gun; and a joining belt
// The fixture was written by this file, unchanged, in a git-archive export of v070-rc (6d87f5d):
//   BB_WAVE3_GUARD_WRITE=1 npx vitest run tests/wave3.guard.test.ts   (output-P1/kit/guard.sh)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import type { HeroId } from "../src/sim/content";
import { key as K, rigHits, rotField, type Build, type Dir } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";

const FIXTURE = fileURLToPath(new URL("./fixtures/wave3-guard/v070rc.json", import.meta.url));
const WRITE = !!process.env.BB_WAVE3_GUARD_WRITE;
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];
const SEEDS = [3, 77];
const clone = (b: Build): Build => JSON.parse(JSON.stringify(b)) as Build;
const sorted = (o: unknown): unknown[] => Object.keys(o as object).sort().map((k) => [k, (o as Record<string, unknown>)[k]]);
/** A rig at (x, y) whose first arrow faces absolute direction `face` (0 up, 1 east, 2 down, 3 west). */
const rig = (uid: number, def: string, x: number, y: number, face: Dir = 1, stars = 1) =>
  ({ uid, def, x, y, ...rotField(def, rotFacing(def, face)), ...(stars > 1 ? { stars } : {}) });

/** The Kiln bench: FURNACE, the Kiln at (4,6) on a straight 6-tile belt up column 4. */
const bench = (): Build => ({
  hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }],
  routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }], mods: [], beltCap: 30, hullBonus: 100,
});

function decks(): [string, Build, Build][] {
  const out: [string, Build, Build][] = [];
  HEROES.forEach((h, i) => {
    const next = HEROES[(i + 1) % HEROES.length], prev = HEROES[(i + HEROES.length - 1) % HEROES.length];
    out.push([`start ${h} v ${next}`, heroStartBuild(h, 1), heroStartBuild(next, 101)]);
    for (const d of [4, 9]) out.push([`ref ${h} v ${prev} day ${d}`, heroRefBuild(h, d), heroRefBuild(prev, d)]);
  });
  // E3: a rig whose arrow points into a factory (the Kiln at (4,6)) stays IDLE; a TEMPER works the belt
  const e3 = bench();
  e3.items.push(rig(10, "whetstone", 3, 6, 1), rig(11, "temper", 3, 3, 1));
  out.push(["E3 whetstone aimed at the kiln", e3, heroStartBuild("weaver", 101)]);
  // E5: two rigs on one tile (4,3): a TEMPER from the west, a WHETSTONE from the east; a LONG HAUL counts them
  const e5 = bench();
  e5.items.push(rig(10, "temper", 3, 3, 1), rig(11, "whetstone", 5, 3, 3), rig(12, "longhaul", 3, 1, 1));
  out.push(["E5 two rigs on one tile", e5, heroStartBuild("weaver", 101)]);
  // E2 and E6: two STAMP PRESSes on equal 7-tile belts into the heavy gun's two intakes (they arrive together)
  const two: Build = {
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 0, y: 8 }, { uid: 2, def: "press", x: 2, y: 6 }, { uid: 3, def: "press", x: 6, y: 6 }, rig(10, "whetstone", 3, 3, 1)],
    routes: [
      { factory: 2, cells: [K(3, 5), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      { factory: 3, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
    ], mods: [], beltCap: 30, hullBonus: 100,
  };
  out.push(["E2 E6 two equal belts into one gun", two, heroStartBuild("foundry", 101)]);
  // E4: a LONG HAUL (shape II) at (4,3) between two belts, where a TWIN LATCH would hold
  const e4: Build = {
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 0, y: 8 }, { uid: 2, def: "press", x: 2, y: 6 }, { uid: 3, def: "press", x: 6, y: 6 }, rig(10, "longhaul", 4, 3, 1)],
    routes: [
      { factory: 2, cells: [K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] },
      { factory: 3, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
    ], mods: [], beltCap: 30, hullBonus: 100,
  };
  out.push(["E4 a II rig between two belts", e4, heroStartBuild("bastion", 101)]);
  // E2: HOPPER ★3 stores on a BASTION (bulwark plating on dropped loads) and HOPPER ★2 on FOUNDRY's gun 1 (blank fusions)
  const bh = heroStartBuild("bastion", 1);
  bh.items.push({ uid: 50, def: "press", x: 6, y: 6 });
  bh.routes.push({ factory: 50, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
  bh.mods.push({ uid: 51, def: "hopper", turret: 0, stars: 3 });
  bh.beltCap = 30;
  out.push(["E2 bastion hopper store", bh, heroStartBuild("weaver", 101)]);
  const fh = heroStartBuild("foundry", 1);
  fh.mods.push({ uid: 51, def: "hopper", turret: 0, stars: 2 });
  out.push(["E2 foundry hopper store", fh, heroStartBuild("furnace", 101)]);
  // E1: poison and limpet blasts on a plated BASTION
  const pois: Build = {
    hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 6 }, rig(10, "venom", 3, 3, 1), { uid: 11, def: "limpet", x: 0, y: 6 }],
    routes: [
      { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      { factory: 11, cells: [K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)] },
    ], mods: [], beltCap: 30, hullBonus: 0,
  };
  out.push(["E1 poison and limpets on bastion", pois, heroStartBuild("bastion", 101)]);
  // RULE JOIN PACE: a STAMP PRESS belt joining the Kiln belt (the factory runs at JOIN_PACE)
  const join = bench();
  join.items.push({ uid: 7, def: "press", x: 6, y: 6 }, rig(10, "temper", 3, 3, 1));
  join.routes.push({ factory: 7, cells: [K(6, 5), K(5, 5)], join: K(4, 5) });
  out.push(["join pace", join, heroStartBuild("weaver", 101)]);
  return out;
}

function fight(a: Build, b: Build, seed: number): unknown[] {
  const bt = new Battle(clone(a), clone(b), seed);
  const tally: Record<string, number> = {};
  while (!bt.over && bt.ticks < 60 * 200) {
    bt.step();
    for (const e of bt.events) tally[e.type] = (tally[e.type] ?? 0) + 1;
    bt.events.length = 0;
  }
  const race = (s: Battle["sides"][number]) => (s.race ? [sorted(s.race.plating), s.race.foundry.fusions, s.race.foundry.blanksLoaded] : null);
  return [bt.winner, bt.t, bt.ticks, bt.sides[0].hull.hp, bt.sides[1].hull.hp, sorted(bt.sides[0].stats), sorted(bt.sides[1].stats),
    race(bt.sides[0]), race(bt.sides[1]), Object.keys(tally).sort().map((k) => [k, tally[k]])];
}

function record(): Record<string, unknown[]> {
  const rec: Record<string, unknown[]> = {};
  for (const [name, a, b] of decks()) rec[name] = SEEDS.map((s) => fight(a, b, s));
  return rec;
}

/** Every rig of the guard decks (heroes' own decks aside) lands the hits its comment says: the uids with a belt hit. */
function working(name: string): number[] {
  const deck = decks().find(([n]) => n === name)![1];
  return [...new Set(rigHits(deck).flat(2).map((h) => h.uid))].sort((x, y) => x - y);
}

describe("wave-3 guards: decks without a wave-3 part replay v070-rc's battles bit for bit", () => {
  if (WRITE) {
    it("writes the fixture (run in a v070-rc export)", () => {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, JSON.stringify({ source: "v070-rc", seeds: SEEDS, battles: record() }) + "\n");
    });
    return;
  }
  const want = JSON.parse(readFileSync(FIXTURE, "utf8")) as { source: string; seeds: number[]; battles: Record<string, unknown[]> };
  const got = record();
  it("the fixture is v070-rc's and covers every guard deck; each guard rig works the tile it was put beside", () => {
    expect(want.source).toBe("v070-rc");
    expect(want.seeds).toEqual(SEEDS);
    expect(Object.keys(got)).toEqual(Object.keys(want.battles));
    expect(Object.keys(got)).toHaveLength(18 + 8); // 6 heroes x (start, day 4, day 9), and the 8 guard decks
    expect(working("E3 whetstone aimed at the kiln")).toEqual([11]); // the WHETSTONE (10) points into the Kiln: IDLE
    expect(working("E5 two rigs on one tile")).toEqual([10, 11, 12]);
    expect(working("E4 a II rig between two belts")).toEqual([10]);
    expect(working("E1 poison and limpets on bastion")).toEqual([10]);
  });
  for (const name of Object.keys(want.battles)) {
    it(`${name}: winner, time, hulls, stats, plating, fusions and events as on v070-rc`, () => {
      expect(JSON.parse(JSON.stringify(got[name]))).toEqual(want.battles[name]);
    });
  }
});

import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simulate } from "../src/sim/battle";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { ITEMS } from "../src/sim/content";
import type { Build } from "../src/sim/deck";

// E1 adds Furnace's long-belt gun cadence. The ff6914a fixture remains intact; this fixture freezes
// current rig-free Furnace/Weaver battles under the E1 rule. Rig-bearing matchups use the native
// fixture in golden.beltside.test.ts. The unchanged Weaver mirror still matches ff6914a.
//   BB_E1_GOLDEN_WRITE=1 npx vitest run tests/races.golden.test.ts

const FIXTURE = fileURLToPath(new URL("./fixtures/beltside-062-e1/races.golden.json", import.meta.url));
const OLD_FIXTURE = fileURLToPath(new URL("./races.golden.json", import.meta.url));
const WRITE = !!process.env.BB_E1_GOLDEN_WRITE;
const SEEDS = Array.from({ length: 40 }, (_, i) => 1 + i * 7919);

// winner, end tick, player hull, enemy hull, player shots, enemy shots
type Row = [number, number, number, number, number, number];
interface Golden {
  generatedAt: string;
  seeds: number[];
  matchups: Record<string, Row[]>;
}

function matchups(): [string, Build, Build][] {
  const F = startingBuild("furnace", 1);
  const W = startingBuild("weaver", 1);
  const out: [string, Build, Build][] = [
    ["start furnace v weaver", F, W],
    ["start weaver v furnace", W, F],
    ["start furnace v furnace", F, startingBuild("furnace", 101)],
    ["start weaver v weaver", W, startingBuild("weaver", 101)],
  ];
  for (const r of [1, 5, 10]) {
    out.push([`warlord r${r} furnace v weaver`, warlordBuild("furnace", r), warlordBuild("weaver", r)]);
    out.push([`warlord r${r} weaver v furnace`, warlordBuild("weaver", r), warlordBuild("furnace", r)]);
    out.push([`warlord r${r} furnace v furnace`, warlordBuild("furnace", r), warlordBuild("furnace", r)]);
    out.push([`warlord r${r} weaver v weaver`, warlordBuild("weaver", r), warlordBuild("weaver", r)]);
  }
  return out;
}

const z = (v: number) => (v === 0 ? 0 : v); // fold -0 into 0 so JSON round-trips exactly

function run(p: Build, e: Build, seed: number): Row {
  const b = simulate(p, e, seed);
  return [
    b.winner === null ? -2 : b.winner, b.ticks, z(b.sides[0].hull.hp), z(b.sides[1].hull.hp),
    b.sides[0].stats.shots, b.sides[1].stats.shots,
  ];
}

const rigFree = (b: Build) => !b.items.some((q) => ITEMS[q.def]?.kind === "gate");

describe("E1 golden: rig-free Furnace and Weaver battles under the long-belt cadence", () => {
  if (WRITE) {
    it("writes the golden fixture", () => {
      const g: Golden = { generatedAt: "beltside-062-e1", seeds: SEEDS, matchups: {} };
      for (const [name, p, e] of matchups().filter(([, p, e]) => rigFree(p) && rigFree(e))) g.matchups[name] = SEEDS.map((s) => run(p, e, s));
      writeFileSync(FIXTURE, JSON.stringify(g, null, 0).replace(/\],\[/g, "],\n[") + "\n");
    });
    return;
  }
  const golden = JSON.parse(readFileSync(FIXTURE, "utf8")) as Golden;
  const old = JSON.parse(readFileSync(OLD_FIXTURE, "utf8")) as Golden;
  it("fixture covers 40 seeds for every matchup", () => {
    expect(golden.seeds).toEqual(SEEDS);
    expect(Object.keys(golden.matchups).sort()).toEqual(matchups().filter(([, p, e]) => rigFree(p) && rigFree(e)).map((m) => m[0]).sort());
  });
  it("0.6.2 BELTSIDE: the start and round-1 matchups have no rig on either side; r5 and r10 do", () => {
    expect(matchups().filter(([, p, e]) => rigFree(p) && rigFree(e)).map(([n]) => n)).toEqual(matchups().map(([n]) => n).filter((n) => !/r5|r10/.test(n)));
  });
  for (const [name, p, e] of matchups()) {
    if (!rigFree(p) || !rigFree(e)) continue; // 0.6.2 BELTSIDE: frozen in golden.beltside.test.ts
    it(`${name}: winner, end tick, hulls and shots match E1 for 40 seeds`, () => {
      const want = golden.matchups[name];
      expect(want).toHaveLength(SEEDS.length);
      SEEDS.forEach((seed, i) => {
        const got = run(p, e, seed);
        expect({ seed, got }).toEqual({ seed, got: want[i] });
        for (let k = 0; k < got.length; k++) expect(Object.is(got[k], want[i][k])).toBe(true);
      });
    });
  }
  // NUM-1 (REQ-BFG-047): hulls are x10 and whole, so no row can equal ff6914a's float hulls any more. The equivalent, row
  // by row against the original fixture: every rig-free battle fires exactly the shots it fired there (NUM-1 changes
  // damage, not the guns), and keeps its winner, except that a MIRROR battle may now end in a draw: two identical decks that
  // reach the dark wind both die on the same whole-second wind tick with the same whole hull, where the continuous wind's
  // float timing used to pick a winner (46 of the 320 rows: start FURNACE and WEAVER mirrors 4 + 2, warlord r1 FURNACE 40).
  it("all rig-free matchups fire the original fixture's shots and keep its winners (NUM-1: a mirror may tie)", () => {
    for (const name of Object.keys(golden.matchups)) {
      golden.matchups[name].forEach((row, i) => {
        const was = old.matchups[name][i];
        expect([row[4], row[5]], `${name} #${i}: shots`).toEqual([was[4], was[5]]);
        if (row[0] === -1 && was[0] !== -1) expect(name, `${name} #${i}: only a mirror battle may newly tie`).toMatch(/(furnace v furnace|weaver v weaver)$/);
        else expect(row[0], `${name} #${i}: winner`).toBe(was[0]);
      });
    }
  });
});

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
  it("all rig-free matchups stay identical to the original fixture", () => {
    for (const name of Object.keys(golden.matchups))
      expect(golden.matchups[name], name).toEqual(old.matchups[name]);
  });
});

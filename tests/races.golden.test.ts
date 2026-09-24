import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simulate } from "../src/sim/battle";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import type { Build } from "../src/sim/deck";

// races: HARD RULE for the races work. Furnace and Weaver battles stay bit-for-bit identical.
// The fixture was generated at ff6914a (0.4.1) BEFORE any sim edit:
//   BB_GOLDEN_WRITE=1 npx vitest run tests/races.golden.test.ts
// Never regenerate it to make a failing run pass: a failure means Furnace/Weaver changed.

const FIXTURE = fileURLToPath(new URL("./races.golden.json", import.meta.url));
const WRITE = !!process.env.BB_GOLDEN_WRITE;
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

describe("races golden: Furnace and Weaver battles are bit-for-bit unchanged", () => {
  if (WRITE) {
    it("writes the golden fixture", () => {
      const g: Golden = { generatedAt: "ff6914a", seeds: SEEDS, matchups: {} };
      for (const [name, p, e] of matchups()) g.matchups[name] = SEEDS.map((s) => run(p, e, s));
      writeFileSync(FIXTURE, JSON.stringify(g, null, 0).replace(/\],\[/g, "],\n[") + "\n");
    });
    return;
  }
  const golden = JSON.parse(readFileSync(FIXTURE, "utf8")) as Golden;
  it("fixture covers 40 seeds for every matchup", () => {
    expect(golden.seeds).toEqual(SEEDS);
    expect(Object.keys(golden.matchups).sort()).toEqual(matchups().map((m) => m[0]).sort());
  });
  for (const [name, p, e] of matchups()) {
    it(`${name}: winner, end tick, hulls and shots match ff6914a for 40 seeds`, () => {
      const want = golden.matchups[name];
      expect(want).toHaveLength(SEEDS.length);
      SEEDS.forEach((seed, i) => {
        const got = run(p, e, seed);
        expect({ seed, got }).toEqual({ seed, got: want[i] });
        for (let k = 0; k < got.length; k++) expect(Object.is(got[k], want[i][k])).toBe(true);
      });
    });
  }
});

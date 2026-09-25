// 0.6.1a M1: the identity golden test (ARSENAL.md §10 item 5). Every deck frozen from c908f92 by
// tools/freezeGolden.ts (rival captains days 1-10, both starting decks, the par decks and 20 stand-in
// picks) replays its fixed battle with exactly the same winner, time, ticks and final hulls. It must
// pass at every commit of wave 1: 1-star decks fight exactly as in 0.6.0. Never edit the fixtures.
// 0.6.2 BELTSIDE makes gate decks native; E1 adds Furnace's long-belt cadence. The 0.6.0 decks and
// results stay frozen as historical inputs. Current battle results use the separate E1 fixture.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { ITEMS } from "../src/sim/content";
import type { Build } from "../src/sim/deck";

interface Entry {
  key: string;
  deck: Build;
  opp: string;
  seed: number;
  winner: number | null;
  t: number;
  ticks: number;
  hulls: [number, number];
}

const dir = fileURLToPath(new URL("./fixtures/golden-060/", import.meta.url));
const load = <T>(name: string): T => JSON.parse(readFileSync(resolve(dir, name), "utf8")) as T;
const par = load<{ decks: Record<string, Build>; entries: Entry[] }>("par.json");
const groups: [string, Entry[]][] = [
  ["rival captains (planBuild, days 1-10)", load<{ entries: Entry[] }>("rivals.json").entries],
  ["starting decks", load<{ entries: Entry[] }>("starts.json").entries],
  ["par decks (honestReference)", par.entries],
  ["stand-in picks (standInPick)", load<{ entries: Entry[] }>("standins.json").entries],
];

const rigFree = (b: Build) => !b.items.some((p) => ITEMS[p.def]?.kind === "gate");
const beltside = JSON.parse(readFileSync(resolve(fileURLToPath(new URL("./fixtures/beltside-062-e1/", import.meta.url)), "golden.json"), "utf8")) as { decks: Record<string, number[]> };

describe("golden-060 decks: current E1 battles match their separate fixture", () => {
  it("has every fixture (130 rival, 2 start, 20 par, 20 stand-in)", () => {
    expect(groups.map(([, e]) => e.length)).toEqual([130, 2, 20, 20]);
  });
  it("11 battles have no rig on either side; every deck is frozen in the E1 golden", () => {
    const free = groups.flatMap(([, es]) => es.filter((e) => rigFree(e.deck) && rigFree(par.decks[e.opp])));
    expect(free.map((e) => e.key)).toHaveLength(11);
    for (const [, es] of groups) for (const e of es) expect(beltside.decks[e.key], e.key).toBeTruthy();
  });
  for (const [name, entries] of groups) {
    it(`${name}: identical winner, ticks, hulls and shots (every battle with no rig on either side)`, () => {
      const diffs: string[] = [];
      for (const e of entries) {
        if (!rigFree(e.deck) || !rigFree(par.decks[e.opp])) continue; // 0.6.2 BELTSIDE: golden.beltside.test.ts
        const opp = par.decks[e.opp];
        expect(opp, e.opp).toBeTruthy();
        const b = simulate(JSON.parse(JSON.stringify(e.deck)) as Build, JSON.parse(JSON.stringify(opp)) as Build, e.seed);
        const got = [b.winner, b.ticks, b.sides[0].hull.hp, b.sides[1].hull.hp, b.sides[0].stats.shots, b.sides[1].stats.shots];
        const want = beltside.decks[e.key];
        if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`${e.key}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
      }
      expect(diffs).toEqual([]);
    });
  }
});

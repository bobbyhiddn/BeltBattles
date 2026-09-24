// 0.6.1a M1: the identity golden test (ARSENAL.md §10 item 5). Every deck frozen from c908f92 by
// tools/freezeGolden.ts (rival captains days 1-10, both starting decks, the par decks and 20 stand-in
// picks) replays its fixed battle with exactly the same winner, time, ticks and final hulls. It must
// pass at every commit of wave 1: 1-star decks fight exactly as in 0.6.0. Never edit the fixtures.
// 0.6.2 BELTSIDE (ref/DESIGN-beltside.md) changes every battle with a gate in it by design: gates became
// rigs beside the belt (the decks here are inline, so they no longer validate), a rig tile is now a belt
// target and a multi-arrow rig may reach a second tile. So the 0.6.0 identity is asserted for every battle
// with no rig on either side, which BELTSIDE must leave bit-for-bit alone; the others, migrated (D3), are
// frozen as BELTSIDE battles in fixtures/beltside-062/golden.json (tests/golden.beltside.test.ts).
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
const beltside = JSON.parse(readFileSync(resolve(fileURLToPath(new URL("./fixtures/beltside-062/", import.meta.url)), "golden.json"), "utf8")) as { decks: Record<string, unknown> };

describe("golden-060: 1-star decks fight exactly as in 0.6.0", () => {
  it("has every fixture (130 rival, 2 start, 20 par, 20 stand-in)", () => {
    expect(groups.map(([, e]) => e.length)).toEqual([130, 2, 20, 20]);
  });
  it("0.6.2 BELTSIDE: 11 battles have no rig on either side; every other one is frozen in the beltside golden", () => {
    const free = groups.flatMap(([, es]) => es.filter((e) => rigFree(e.deck) && rigFree(par.decks[e.opp])));
    expect(free.map((e) => e.key)).toHaveLength(11);
    for (const [, es] of groups) for (const e of es) expect(beltside.decks[e.key], e.key).toBeTruthy();
  });
  for (const [name, entries] of groups) {
    it(`${name}: identical winner, time, ticks and hulls (every battle with no rig on either side)`, () => {
      const diffs: string[] = [];
      for (const e of entries) {
        if (!rigFree(e.deck) || !rigFree(par.decks[e.opp])) continue; // 0.6.2 BELTSIDE: golden.beltside.test.ts
        const opp = par.decks[e.opp];
        expect(opp, e.opp).toBeTruthy();
        const b = simulate(JSON.parse(JSON.stringify(e.deck)) as Build, JSON.parse(JSON.stringify(opp)) as Build, e.seed);
        const got = { winner: b.winner, t: b.t, ticks: b.ticks, hulls: [b.sides[0].hull.hp, b.sides[1].hull.hp] };
        const want = { winner: e.winner, t: e.t, ticks: e.ticks, hulls: e.hulls };
        if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`${e.key}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
      }
      expect(diffs).toEqual([]);
    });
  }
});

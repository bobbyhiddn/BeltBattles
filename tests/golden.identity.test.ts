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
    it(`${name}: E1 fixture holds and historical rig-free drift is limited to Furnace cadence`, () => {
      const diffs: string[] = [];
      const historicalDrift: string[] = [];
      for (const e of entries) {
        if (!rigFree(e.deck) || !rigFree(par.decks[e.opp])) continue; // 0.6.2 BELTSIDE: golden.beltside.test.ts
        const opp = par.decks[e.opp];
        expect(opp, e.opp).toBeTruthy();
        // NUM-1 (cap's oracle bcc36c430b4f3a01): the frozen 0.6.0 decks are in pre-NUM-1 units; this test reads them x10
        const x10 = (d: Build): Build => ({ ...(JSON.parse(JSON.stringify(d)) as Build), hullBonus: d.hullBonus * 10 });
        const b = simulate(x10(e.deck), x10(opp), e.seed);
        const got = [b.winner, b.ticks, b.sides[0].hull.hp, b.sides[1].hull.hp, b.sides[0].stats.shots, b.sides[1].stats.shots];
        const want = beltside.decks[e.key];
        if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`${e.key}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
        // NUM-1: hulls are x10 and whole and the wind ticks once a second, so 0.6.0's float hulls and times can't recur; the
        // E1 fixture above pins them exactly. The historical check keeps what still holds exactly: the winner and the end
        // tick (with the decks x10, every rig-free battle keeps both but sootjaw's end tick, E1's cadence; sparkfang's E1
        // drift was in hull and time only)
        // NUM-2 (REQ-BFG-047, SPEED): whole speeds and the timers' carried remainder move every gun's and factory's cadence
        // a little (the exact 30 / speed, where the old reset ran each cycle up to whole ticks), so 0.6.0's end tick can't
        // recur exactly (it held for all but sootjaw on num1u). The equivalent, measured on the 11 rig-free battles: every
        // one keeps its 0.6.0 winner exactly, and ends within 60 ticks (1 s) of its 0.6.0 end tick (now -41 to +3 ticks)
        if (b.winner !== e.winner || Math.abs(b.ticks - e.ticks) > 60) historicalDrift.push(`${e.key}: ${e.winner}@${e.ticks} -> ${b.winner}@${b.ticks}`);
      }
      expect(diffs).toEqual([]);
      expect(historicalDrift).toEqual([]);
    });
  }
});

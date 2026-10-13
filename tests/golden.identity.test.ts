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
/** BAL-2 (REQ-BFG-069; cap's oracle d306b1b196dbab38): the historical drift each group shows, exactly (see the BAL-2
 *  paragraph in the test below); a group not named here shows none.
 *  HULL-ON (bb-0.10.0, FREE_JOINS; src/sim/freeJoins.ts FREE_JOINS_HULL, cap's ruling 84ad10254e1855c8 = RULING-HULLON-R9;
 *  restated by RULING-HULLON-R10 0bbcee55b6ba281a (b)): all 11 rig-free battles fight a WEAVER deck, so WEAVER's hull
 *  1700 -> 1500 with free joins on moves each one (its E1 row re-recorded with golden.beltside's BB_E1_GOLDEN_WRITE).
 *  Cause check: with FREE_JOINS_HULL = {} all 11 play as recorded. Measured at 1500: the rival captains' drift is BAL-2's
 *  five with the new end ticks (SOOTJAW, LACEWING and EMBERLYN 262-304 ticks sooner with their 0.6.0 winner; NETTLE's and
 *  SPARKFANG's winners flipped) plus RATCHET's winner flipped (1@1716 -> 0@1689); both starting decks and both day-1 par
 *  decks (FURNACE v WEAVER, 0.6.0's winner WEAVER) now go to FURNACE, 155 ticks sooner. BAL-2's list, at 1700, was:
 *  "rival/sootjaw/1: 0@1678 -> 0@1568", "rival/nettle/1: 0@1788 -> 1@1680", "rival/sparkfang/1: 1@1719 -> 0@1644",
 *  "rival/lacewing/1: 1@1819 -> 1@1680", "rival/emberlyn/1: 1@1813 -> 1@1680" (the other groups: none). */
const HISTORICAL_DRIFT: Record<string, string[]> = {
  "rival captains (planBuild, days 1-10)": [
    "rival/sootjaw/1: 0@1678 -> 0@1416",
    "rival/nettle/1: 0@1788 -> 1@1510",
    "rival/sparkfang/1: 1@1719 -> 0@1498",
    "rival/lacewing/1: 1@1819 -> 1@1515",
    "rival/ratchet/1: 1@1716 -> 0@1689",
    "rival/emberlyn/1: 1@1813 -> 1@1516",
  ],
  "starting decks": [
    "start/furnace: 1@1883 -> 0@1728",
    "start/weaver: 0@1883 -> 1@1728",
  ],
  "par decks (honestReference)": [
    "par/furnace/1: 1@1883 -> 0@1728",
    "par/weaver/1: 0@1883 -> 1@1728",
  ],
};
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
    it(`${name}: E1 fixture holds and the historical rig-free drift is exactly as measured (E1's Furnace cadence, BAL-2's hero lines)`, () => {
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
        // BAL-2 (REQ-BFG-069; cap's oracle d306b1b196dbab38): 0.9.1's hero lines (FURNACE's hull 2000 -> 2100, WEAVER's 1800
        // -> 1700, the KILN's HEAT 12 -> 13) move 5 of the 11 rig-free battles past that bound, all rival captains on day 1:
        // SOOTJAW, LACEWING and EMBERLYN end 110-139 ticks sooner with their 0.6.0 winner, NETTLE's and SPARKFANG's winners
        // flip. Cause check: with the three lines put back, all 11 keep their 0.6.0 winner within 60 ticks. So the check is
        // restated as what holds: the rival captains' drift is exactly those five (HISTORICAL_DRIFT), and every other group's
        // battles keep the 0.6.0 winner within 60 ticks, as NUM-2 wrote it. Any later move of these battles needs a ruling.
        if (b.winner !== e.winner || Math.abs(b.ticks - e.ticks) > 60) historicalDrift.push(`${e.key}: ${e.winner}@${e.ticks} -> ${b.winner}@${b.ticks}`);
      }
      expect(diffs).toEqual([]);
      expect(historicalDrift).toEqual(HISTORICAL_DRIFT[name] ?? []);
    });
  }
});

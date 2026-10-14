// SOFT-1 (REQ-BFG-092; BRIEF-SOFT1, RULING-SOFT1-R1's C2bw; B/output-soft1/bench/bands-soft1.md): the seed pool's softer
// picks. tools/samplePool.ts ships the rule's 80 picks as SOFT1_PICKS (the rule grades ~57,600 battles, ~7 minutes, too
// slow for every generateSamplePool()); these tests hold the table to the rule.
//  - always: the table's shape (4 heroes x 10 days x 2 distinct picks, each "s<i>" or "f<seed>" with an 8-hex hash), and every
//    pick resolves to its deck in the shipped world (softPicked throws on a stale hash);
//  - opt-in (BB_SOFT1_RULE=1, ~7-10 minutes): the rule itself (softDecks, the exact grading) gives SOFT1_PICKS, pick for pick.
//    Run it after a stand-in pool or par field change; on a red it prints the rule's table to paste into SOFT1_PICKS.
import { describe, expect, it } from "vitest";
import { MAX_DAY } from "../src/net/snapshot";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { SAMPLE_VARIANTS, SOFT1_PICKS, softDecks, softPickKey, softPicked, softStaleCheck, softWorld } from "../tools/samplePool";

describe("SOFT-1: the seed pool's picks (SOFT1_PICKS)", () => {
  // RULING-SOFT1-R2 R2.1 item 3: the softening never vanishes quietly. This process runs every switch as shipped, so its
  // worldKey() must be SOFT1_WORLD; a switch or rules change that moves it fails here with the stale message (re-run the
  // pick tool), never ships the old picks in silence.
  it("is read in the shipped world: worldKey() equals SOFT1_WORLD, the bots' runes on", () => {
    expect(() => softStaleCheck()).not.toThrow();
  });

  it("holds two distinct picks a day for every playable hero, each a stand-in entry or a par-field seed with its hash", () => {
    expect(Object.keys(SOFT1_PICKS).sort()).toEqual([...PLAYABLE_HEROES].sort());
    for (const hero of PLAYABLE_HEROES) {
      expect(SOFT1_PICKS[hero]).toHaveLength(MAX_DAY);
      for (const pair of SOFT1_PICKS[hero]) {
        expect(pair).toHaveLength(SAMPLE_VARIANTS);
        for (const p of pair) expect(p).toMatch(/^(s[0-5]|f([1-9]|1[0-2])):[0-9a-f]{8}$/);
        expect(pair[0]).not.toBe(pair[1]);
      }
    }
  });

  it("resolves every pick to its deck in the shipped world (no stale hash)", () => {
    expect(softWorld()).toBe(true);
    for (const hero of PLAYABLE_HEROES) {
      for (let day = 1; day <= MAX_DAY; day++) {
        const [a, b] = softPicked(hero, day)!;
        expect([softPickKey(hero, day, a), softPickKey(hero, day, b)]).toEqual([...SOFT1_PICKS[hero][day - 1]]);
      }
    }
  }, 600_000);

  it.skipIf(process.env.BB_SOFT1_RULE !== "1")("the rule (softDecks, graded as the seed step grades) gives SOFT1_PICKS", () => {
    const got: Record<string, [string, string][]> = {};
    for (const hero of PLAYABLE_HEROES) {
      got[hero] = [];
      for (let day = 1; day <= MAX_DAY; day++) {
        const [a, b] = softDecks(hero, day);
        got[hero].push([softPickKey(hero, day, a), softPickKey(hero, day, b)]);
      }
    }
    if (JSON.stringify(got) !== JSON.stringify(SOFT1_PICKS)) {
      console.log(Object.entries(got).map(([h, rows]) => `  ${h}: ${JSON.stringify(rows)},`).join("\n"));
    }
    expect(got).toEqual(SOFT1_PICKS);
  }, 1_800_000);
});

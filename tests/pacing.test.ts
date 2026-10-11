import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { startingBuild, warlordBuild, warlordHull } from "../src/sim/ai";
import { HEROES, RULES_VERSION, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";

// Pacing (0.4.0 brief): rounds 1-3 last 20-45 s of battle at 1x playback (one sim second
// per real second; the drive-in, countdown and KO outro add ~5 s of presentation).
// bb-0.4.0 raised hulls by a third to get there: 0.3.0 rounds 2-3 ended in 16-18 s.

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((s) => s * 7919);

function withGates(b: Build, gates: [string, number, number][]): Build {
  const c = JSON.parse(JSON.stringify(b)) as Build;
  gates.forEach(([def, x, y], i) => c.items.push({ uid: 500 + i, def, x, y }));
  return c;
}

function times(player: Build, foe: HeroId, round: number): number[] {
  return SEEDS.map((seed) => simulate(player, warlordBuild(foe, round), seed).t);
}

const F = startingBuild("furnace", 1), W = startingBuild("weaver", 1);
const CASES: [string, Build, HeroId, number][] = [
  ["furnace start", F, "weaver", 1],
  ["furnace start", F, "weaver", 2],
  ["furnace start", F, "weaver", 3],
  ["furnace + temper", withGates(F, [["temper", 4, 3]]), "weaver", 2],
  ["furnace + temper + whetstone", withGates(F, [["temper", 4, 3], ["whetstone", 4, 2]]), "weaver", 3],
  ["weaver start", W, "furnace", 1],
  ["weaver start", W, "furnace", 2],
  ["weaver start", W, "furnace", 3],
  ["weaver + grease", withGates(W, [["grease", 4, 3]]), "furnace", 2],
  ["weaver + grease + whetstone", withGates(W, [["grease", 4, 3], ["whetstone", 1, 3]]), "furnace", 3],
  // 0.5.0 road events: an accepted challenge in round 2 brings the warlord from round 4 (elite)
  ["ELITE: furnace + temper (r2 challenge)", withGates(F, [["temper", 4, 3]]), "weaver", 4],
  ["ELITE: weaver + grease (r2 challenge)", withGates(W, [["grease", 4, 3]]), "furnace", 4],
];

describe("pacing (rounds 1-3 at 1x)", () => {
  it("uses the bb-0.4.0 hull values (unchanged through bb-0.9.0; bb-0.9.1 moves FURNACE's and WEAVER's; bb-0.9.3, bb-0.9.7 and bb-0.10.0 keep them, bb-0.10.0's M scaling them by the day in battle)", () => {
    expect(RULES_VERSION).toBe("bb-0.10.0") /* AZ-BUMP: the bump (was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7) */;
    expect(HEROES.furnace.hull).toBe(2100); // BAL-2 (REVIEW-BAL1 row 8): 2000 -> 2100 (was 10 * 200; NUM-1: hull x10, was 200)
    expect(HEROES.weaver.hull).toBe(1700); // BAL-2 (REVIEW-BAL1 row 1): 1800 -> 1700 (was 10 * 180; NUM-1: hull x10, was 180)
    expect([1, 2, 3].map(warlordHull)).toEqual([-27, -16, -5].map((h) => 10 * h)); // NUM-1: the warlord hull ramp x10 (was -27, -16, -5)
  });

  for (const [label, build, foe, round] of CASES) {
    it(`${label} vs ${foe} round ${round}: mean battle length 20-45 s`, () => {
      const ts = times(build, foe, round);
      const mean = ts.reduce((a, b) => a + b, 0) / ts.length;
      // eslint-disable-next-line no-console
      console.log(`pacing ${label} r${round}: mean ${mean.toFixed(1)}s (min ${Math.min(...ts).toFixed(1)}, max ${Math.max(...ts).toFixed(1)})`);
      expect(mean).toBeGreaterThanOrEqual(20);
      expect(mean).toBeLessThanOrEqual(45);
      for (const t of ts) expect(t).toBeLessThan(60);
    });
  }
});

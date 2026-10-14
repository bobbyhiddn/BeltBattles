// HULL-ON (REQ-BFG-092; cap's ruling 9c114aab5ba18dfe): tools/samplePool.ts gradeSamplePool's per-process memo. With PICK
// on (the flip) every generateSamplePool() grades its pool, ~150 s for the 120 ghosts, so the grades are memoised per
// process under a key that holds k, seeds, the pool's ghost ids in order and the world (every switch the grades read).
// On a tiny pool (2 ghosts, k 1, 1 seed): (a) a warm call deep-equals the cold one; (b) a call with one switch flipped, the
// pool reordered, or one ghost's build changed grades afresh and equals the uncached grading of the same input; (c) a
// returned array is a copy: mutating it doesn't change the next call.
import { describe, expect, it } from "vitest";
import { gradeMemo, gradeSamplePool } from "../tools/samplePool";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { withGuard } from "../src/sim/guard";
import { withFreeJoins } from "../src/sim/freeJoins";
import type { GhostSnapshot } from "../src/net/snapshot";

const K = 1, SEEDS = 1;
const ghost = (hero: HeroId, day: number, n: number): GhostSnapshot => ({
  v: 2, rules: RULES_VERSION, hero, day, wins: 0, lives: 10, build: heroStartBuild(hero),
  runId: `grademem-${n}`, playerId: "seed-grademem", createdAt: 1_790_000_000_000 + n,
});
const POOL: GhostSnapshot[] = [ghost("furnace", 1, 0), ghost("weaver", 2, 1)];

/** The grading of `pool` with an empty memo (the uncached result), in the world `fn` runs in. */
const fresh = (pool: readonly GhostSnapshot[]): number[] => {
  gradeMemo(true);
  return gradeSamplePool(pool, K, SEEDS);
};

describe("HULL-ON: gradeSamplePool's memo (cap's ruling 9c114aab5ba18dfe)", () => {
  it("(a) a warm call deep-equals the cold one, and adds no entry", () => {
    const cold = fresh(POOL);
    expect(gradeMemo()).toBe(1);
    expect(cold).toHaveLength(2);
    for (const g of cold) expect(Number.isInteger(g)).toBe(true);
    const warm = gradeSamplePool(POOL, K, SEEDS);
    expect(warm).toEqual(cold);
    expect(gradeMemo()).toBe(1);
  }, 600_000);

  it("(b) one switch flipped (GUARD, FREE_JOINS), the pool reordered, one ghost's build changed: each grades afresh and equals the uncached grading", () => {
    const base = fresh(POOL);
    const cases: [string, () => number[]][] = [
      ["GUARD off", () => withGuard(() => gradeSamplePool(POOL, K, SEEDS), false)],
      ["FREE_JOINS off", () => withFreeJoins(() => gradeSamplePool(POOL, K, SEEDS), false)],
      ["the pool reordered", () => gradeSamplePool([POOL[1], POOL[0]], K, SEEDS)],
      ["one ghost's build changed", () => gradeSamplePool([POOL[0], { ...POOL[1], build: { ...POOL[1].build, hullBonus: POOL[1].build.hullBonus + 300 } }], K, SEEDS)],
    ];
    const first: number[][] = [];
    for (const [, call] of cases) {
      gradeMemo(true);
      gradeSamplePool(POOL, K, SEEDS); // the base key is in the memo
      const size = gradeMemo();
      first.push(call()); // a miss: a new entry
      expect(gradeMemo()).toBe(size + 1);
    }
    // each equals the same input graded with an empty memo
    cases.forEach(([, call], i) => {
      gradeMemo(true);
      expect(call()).toEqual(first[i]);
    });
    // the reordered pool: its grades are its own (the index seeds the battles), not the base's swapped
    expect(first[2]).toHaveLength(2);
    expect(base).toHaveLength(2);
  }, 600_000);

  it("(c) a returned array is a copy: mutating it doesn't change the next call", () => {
    const a = fresh(POOL);
    const keep = a.slice();
    a[0] = -1;
    a.push(99);
    expect(gradeSamplePool(POOL, K, SEEDS)).toEqual(keep);
    const b = gradeSamplePool(POOL, K, SEEDS);
    b.fill(7);
    expect(gradeSamplePool(POOL, K, SEEDS)).toEqual(keep);
  }, 600_000);
});

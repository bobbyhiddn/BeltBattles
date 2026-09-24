// 0.6.1a harness v2: tournament v2 (mirror K=4, star bench) and stand-in pool v2 (robust re-play).
// tests/harness.merge.test.ts covers the merge path itself; this file covers step 2/3's additions.
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { kx, ky, occupancy, type Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { randomBuild } from "../src/sim/harness/gen";
import { heroRefBuild, heroStartBuild } from "../src/sim/harness/heroes";
import {
  DEFAULT_OPTS, localRunner, mirrorSplits, starBench, starMixOf, type Runner,
} from "../src/sim/harness/tournament";
import {
  ROBUST_BAND, STANDIN_DEFAULTS, genStandIns, robustReplay, type Cand,
} from "../src/sim/harness/standins";

const freeCells = (b: Build): number[] => {
  const occ = occupancy(b);
  return b.routes.flatMap((r) => r.cells).filter((k) => occ[k].item < 0);
};

describe("harness v2: tournament (mirror K=4, star mix, star bench)", () => {
  it("mirrorSplits: 4 splits, each a well-formed rate, battle count matches the jobs actually played", async () => {
    const pop = Array.from({ length: 8 }, (_, i) => randomBuild("furnace", 5, new Rng(hashSeed("mirror-mini", i)), "on"));
    const o = { ...DEFAULT_OPTS, seed: 3, seeds: 1 };
    const { stats, battles } = await mirrorSplits(o, 5, "furnace", pop, localRunner, 4);
    expect(stats.splits).toHaveLength(4);
    for (const s of stats.splits) { expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1); }
    expect(stats.min).toBeLessThanOrEqual(stats.mean);
    expect(stats.max).toBeGreaterThanOrEqual(stats.mean);
    expect(battles).toBe(4 * 4 * 4 * 1 * 2); // 4 splits x (4 vs 4 pairs) x 1 seed x 2 sides
  });

  it("starMixOf: an all-1-star population (with fusible gates) reports p1=1; a hand-raised 2-star module shifts the share", () => {
    const a = heroStartBuild("furnace", 1);
    const cellA = freeCells(a)[0];
    a.items.push({ uid: 950, def: "temper", x: kx(cellA), y: ky(cellA) }); // 1-star: the Kiln signature alone isn't fusible (price 0)
    const mixAllOnes = starMixOf([a, a]);
    expect(mixAllOnes.n).toBeGreaterThan(0);
    expect(mixAllOnes.p1).toBe(1);
    expect(mixAllOnes.p2).toBe(0);
    expect(mixAllOnes.medianMerged).toBe(0);
    const b = heroStartBuild("weaver", 1);
    const cell = freeCells(b)[0];
    b.items.push({ uid: 900, def: "temper", x: kx(cell), y: ky(cell), stars: 2 });
    const mix = starMixOf([b]);
    expect(mix.p2).toBeGreaterThan(0);
    expect(mix.maxMerged).toBe(1);
  });

  it("star bench: NO EFFECT fires for coil at 2 and 3 stars (its values are pending, ARSENAL.md section 4.3)", async () => {
    const day = 5;
    const b = heroStartBuild("furnace", 1);
    const cell = freeCells(b)[0];
    b.items.push({ uid: 900, def: "coil", x: kx(cell), y: ky(cell) });
    expect(validateBuild(b, day).errors).toEqual([]);
    const gauntlet = [heroStartBuild("weaver", 1), heroRefBuild("weaver", day)];
    const o = { ...DEFAULT_OPTS, seed: 9, seeds: 1 };
    const { rows } = await starBench(o, day, gauntlet, [{ hero: "furnace", tag: "bench", build: b }], localRunner);
    const coil2 = rows.find((r) => r.def === "coil" && r.star === 2);
    const coil3 = rows.find((r) => r.def === "coil" && r.star === 3);
    expect(coil2?.flags).toContain("NO EFFECT");
    expect(coil3?.flags).toContain("NO EFFECT");
    expect(coil2?.delta).toBe(0);
  });

  it("star bench: chamber 2-star equals 1-star (perShot unchanged); splitter 3-star equals 2-star (level 3 is pending only)", async () => {
    const day = 7;
    const b = heroStartBuild("weaver", 1);
    const cells = freeCells(b);
    b.items.push({ uid: 900, def: "splitter", x: kx(cells[0]), y: ky(cells[0]) });
    b.mods.push({ uid: 901, def: "chamber", turret: 0 });
    expect(validateBuild(b, day).errors).toEqual([]);
    const gauntlet = [heroStartBuild("furnace", 1)];
    const o = { ...DEFAULT_OPTS, seed: 11, seeds: 1 };
    const { rows } = await starBench(o, day, gauntlet, [{ hero: "weaver", tag: "bench", build: b }], localRunner);
    expect(rows.find((r) => r.def === "chamber" && r.star === 2)?.flags).toContain("NO EFFECT");
    // splitter: 2-star changes the split (not NO EFFECT), but 3-star is pending-only relative to 2-star;
    // the bench compares every star against the 1-star baseline, so 3-star inherits the same (non-zero) delta as 2-star
    const s2 = rows.find((r) => r.def === "splitter" && r.star === 2)!, s3 = rows.find((r) => r.def === "splitter" && r.star === 3)!;
    expect(s2.wrN.p).toBeCloseTo(s3.wrN.p, 9);
  });
});

describe("harness v2: stand-in pool robust re-play", () => {
  const o = { ...STANDIN_DEFAULTS, parFloor: 0.5, refSeeds: 10, robust: 4, heroes: ["furnace", "weaver"] as const };
  const refs = [heroRefBuild("furnace", 5), heroRefBuild("weaver", 5)];
  const cand = (vsPar: number): Cand => ({
    idx: 0, build: heroStartBuild("furnace", 1), code: "", cost: 10, tries: 1, floorMet: true,
    score: 0.5, pct: 50, vsRef: { furnace: vsPar, weaver: vsPar + 0.05 }, vsPar,
  });

  it("a borderline candidate (within ROBUST_BAND of parFloor) whose fresh re-play loses every battle is removed", async () => {
    const pop = [cand(o.parFloor + 0.02)]; // inside the band, currently eligible
    const alwaysLose: Runner = async (_field, jobs) => jobs.map(() => 0);
    const { removed, battles } = await robustReplay(o, "furnace", 5, pop, refs, alwaysLose);
    expect(removed).toBe(1);
    expect(pop[0].vsPar).toBeLessThan(o.parFloor);
    expect(battles).toBe(o.heroes.length * (o.robust * o.refSeeds) * 2);
  });

  it("a candidate well clear of parFloor is not even re-played (0 battles, vsPar untouched)", async () => {
    const pop = [cand(o.parFloor + ROBUST_BAND + 0.05)];
    const before = pop[0].vsPar;
    const shouldNotRun: Runner = async () => { throw new Error("robustReplay must not battle a non-borderline candidate"); };
    const { removed, battles } = await robustReplay(o, "furnace", 5, pop, refs, shouldNotRun);
    expect(removed).toBe(0);
    expect(battles).toBe(0);
    expect(pop[0].vsPar).toBe(before);
  });

  it("a borderline candidate that wins every re-play battle stays eligible (vsPar recomputed, not removed)", async () => {
    const pop = [cand(o.parFloor - 0.02)]; // inside the band, currently just under the floor
    const alwaysWin: Runner = async (_field, jobs) => jobs.map(() => 2 * o.robust * o.refSeeds); // max points every job
    const { removed } = await robustReplay(o, "furnace", 5, pop, refs, alwaysWin);
    expect(removed).toBe(0);
    expect(pop[0].vsPar).toBeGreaterThan(o.parFloor - 0.02); // pulled up by the (winning) re-play
  });

  it("end to end (tiny population): every dry pick is legal - validateBuild ok, unfusedPairs empty, within budget", async () => {
    const tiny = {
      ...STANDIN_DEFAULTS, pop: 6, gauntlet: 2, seeds: 1, elites: 2, refSeeds: 2, per: 2, grow: [8], stars: "on" as const,
    };
    const res = await genStandIns(tiny, localRunner);
    expect(res.days.length).toBe(10 * tiny.heroes.length);
    for (const hd of res.days) {
      expect(hd.robustRemoved).toBeGreaterThanOrEqual(0);
      for (const p of hd.picks) {
        expect(validateBuild(p.build, hd.day).errors, `${hd.hero} d${hd.day} #${p.idx}`).toEqual([]);
        expect(unfusedPairs(p.build), `${hd.hero} d${hd.day} #${p.idx}`).toEqual([]);
        expect(buildCost(p.build).total).toBeLessThanOrEqual(maxGoldByDay(hd.day));
        expect(p.build.hero).toBe(hd.hero);
      }
    }
  }, 120_000);
});

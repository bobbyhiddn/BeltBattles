// Harness v2 fix pass, group 1 (F1, F5, F9; REQ-BFG-005): the star bench is paired (the 1-, 2- and
// 3-star variants of an instance play the same seeds), plays only decks the game can build, and
// flags WORSE by decks (D1), plus the SAME AS 2-star flag and the WORSE rows' deck lists.
import { describe, expect, it } from "vitest";
import { kx, ky, occupancy, type Build } from "../src/sim/deck";
import { unfusedPairs, validateBuild } from "../src/net/validate";
import { heroRefBuild, heroStartBuild } from "../src/sim/harness/heroes";
import { benchSection } from "../src/sim/harness/report";
import { meanCI, tCrit95 } from "../src/sim/harness/stats";
import {
  DEFAULT_OPTS, benchWorse, localDetail, localRunner, starBench, type BenchSource, type DetailRunner, type Job, type Runner,
} from "../src/sim/harness/tournament";
import { starsOf } from "../src/sim/stars";

const freeCells = (b: Build): number[] => {
  const occ = occupancy(b);
  return b.routes.flatMap((r) => r.cells).filter((k) => occ[k].item < 0);
};
const put = (b: Build, uid: number, def: string, i: number, stars?: number) => {
  const k = freeCells(b)[i];
  b.items.push({ uid, def, x: kx(k), y: ky(k), ...(stars ? { stars } : {}) });
};
/** Which variant a bench field deck is: "base", or "<uid>*<stars>" for the one raised module. */
const variantOf = (b: Build, base: Build): string => {
  const was = new Map([...base.items, ...base.mods].map((p) => [p.uid, starsOf(p)]));
  const up = [...b.items, ...b.mods].filter((p) => starsOf(p) !== was.get(p.uid));
  return up.length ? `${up[0].uid}*${starsOf(up[0])}` : "base";
};
const noDetail: DetailRunner = async (_f, jobs) => jobs.map(() => "same");

/**
 * c432bee (harness v2 part 2, step 1): 0.6.1p applied every pending star value, so no live module is a
 * content-level NO EFFECT or SAME AS 2-star case any more. The rewritten cases keep their claims on a
 * controlled premise: an injected runner (and detail runner) whose outcome depends only on the job's
 * seeds and on whether the deck holds `def` at 1 star or at 2+ stars (every other module is ignored).
 * Two decks that play the same seeds therefore score, and end, the same unless `def` crossed 1 star ->
 * 2+ stars; seeding the variants by field index again (verify10's m1seed) breaks every such equality.
 */
const seedPts = (seeds: number[]): number => seeds.reduce((t, s) => t + ((s >>> 0) % 5) * 0.5, 0); // 0..2 per seed
const raised = (b: Build, def: string): boolean => [...b.items, ...b.mods].some((p) => p.def === def && starsOf(p) >= 2);
function controlled(def: string): { run: Runner; detail: DetailRunner } {
  const run: Runner = async (field, jobs) => jobs.map((j) => (raised(field[j.a], def) ? Math.max(0, seedPts(j.seeds) - 1) : seedPts(j.seeds)));
  const detail: DetailRunner = async (field, jobs) => jobs.map((j) => `${j.seeds.join(",")}${raised(field[j.a], def) ? "|up" : ""}`);
  return { run, detail };
}

describe("star bench fix pass (F1, F5, F9)", () => {
  it("F1: an injected runner records the jobs - the 1-, 2- and 3-star variants of each instance carry identical seed lists against every gauntlet member", async () => {
    const day = 5;
    const src = heroStartBuild("furnace", 1);
    put(src, 900, "temper", 0);
    src.mods.push({ uid: 901, def: "calibrate", turret: 0 });
    const gauntlet = [heroStartBuild("weaver", 1), heroRefBuild("weaver", 3), heroRefBuild("furnace", 3)];
    const o = { ...DEFAULT_OPTS, seed: 4, seeds: 3 };
    let seen: { field: Build[]; jobs: Job[] } | undefined;
    const record: Runner = async (field, jobs) => {
      seen = { field, jobs };
      return jobs.map(() => 3);
    };
    await starBench(o, day, gauntlet, [{ hero: "furnace", tag: "t", build: src }], record, noDetail);
    const { field, jobs } = seen!;
    const G = gauntlet.length, first = field.length - G;
    const seeds = new Map<string, string>(); // "<variant>|<gauntlet member>" -> seeds
    for (const j of jobs) {
      expect(j.b).toBeGreaterThanOrEqual(first); // every job: a bench deck against a gauntlet member
      seeds.set(`${variantOf(field[j.a], src)}|${j.b - first}`, JSON.stringify(j.seeds));
    }
    expect([...seeds.keys()].map((k) => k.split("|")[0]).filter((v, i, a) => a.indexOf(v) === i).sort()).toEqual(["900*2", "900*3", "901*2", "901*3", "base"]);
    for (let g = 0; g < G; g++) {
      const base = seeds.get(`base|${g}`)!;
      expect(JSON.parse(base)).toHaveLength(3);
      for (const v of ["900*2", "900*3", "901*2", "901*3"]) expect(seeds.get(`${v}|${g}`), `${v} vs gauntlet ${g}`).toBe(base);
    }
    // different gauntlet members get different seeds (the stream is not collapsed)
    expect(seeds.get("base|0")).not.toBe(seeds.get("base|1"));
  });

  it("F1: NO EFFECT rows have points equal job for job and a delta of exactly 0, on a par deck with many battles (c432bee: controlled premise, outcomes depend only on the seeds and on temper at 1 star vs 2+; coil is never read)", async () => {
    const day = 5;
    const src = heroStartBuild("furnace", 1);
    put(src, 990, "coil", 0);
    put(src, 991, "temper", 1);
    expect(unfusedPairs(src)).toEqual([]);
    expect(validateBuild(src, 10).errors).toEqual([]);
    const gauntlet = [heroRefBuild("weaver", day), heroRefBuild("furnace", 3), heroStartBuild("weaver", 1), heroRefBuild("weaver", 7)];
    const o = { ...DEFAULT_OPTS, seed: 21, seeds: 3 };
    const { run, detail } = controlled("temper");
    const { rows } = await starBench(o, day, gauntlet, [{ hero: "furnace", tag: "furnace par", build: src, par: true }], run, detail);
    for (const star of [2, 3]) {
      const r = rows.find((x) => x.def === "coil" && x.star === star)!;
      expect(r.n).toBe(1);
      expect(r.flags).toContain("NO EFFECT");
      expect(r.delta).toBe(0);
      expect(r.wrN.pts).toBe(r.wr1.pts);
      expect(r.decks).toEqual([{ tag: "furnace par", par: true, delta: 0 }]);
      // the def the runner does read has an effect: no NO EFFECT flag, a delta below 0
      const t = rows.find((x) => x.def === "temper" && x.star === star)!;
      expect(t.flags).not.toContain("NO EFFECT");
      expect(t.delta).toBeLessThan(0);
    }
    // rows with an effect: the row delta is the mean of the decks' paired deltas
    for (const r of rows.filter((x) => x.n > 0)) expect(r.delta).toBeCloseTo(r.decks.reduce((s, d) => s + d.delta, 0) / r.n, 12);
  }, 60_000);

  it("SAME AS ★2 fires on a 3-star row whose every battle ends as at 2 stars (splitter), and chamber stays NO EFFECT at 2 stars (c432bee: controlled premise, outcomes depend only on the seeds and on splitter at 1 star vs 2+)", async () => {
    const day = 7;
    const b = heroStartBuild("weaver", 1);
    put(b, 900, "splitter", 0);
    b.mods.push({ uid: 901, def: "chamber", turret: 0 });
    const gauntlet = [heroStartBuild("furnace", 1), heroRefBuild("furnace", 5)];
    const o = { ...DEFAULT_OPTS, seed: 11, seeds: 2 };
    const { run, detail } = controlled("splitter");
    const { rows } = await starBench(o, day, gauntlet, [{ hero: "weaver", tag: "bench", build: b }], run, detail);
    const s3 = rows.find((r) => r.def === "splitter" && r.star === 3)!;
    expect(s3.flags).toContain("SAME AS ★2");
    expect(s3.flags).not.toContain("NO EFFECT");
    expect(s3.same2).toBe(1);
    expect(rows.find((r) => r.def === "splitter" && r.star === 2)!.flags).not.toContain("SAME AS ★2");
    expect(rows.find((r) => r.def === "chamber" && r.star === 2)!.flags).toContain("NO EFFECT");
  }, 60_000);

  it("F5: a variant with an unfused pair is skipped and counted; a 1-star deck with a pair skips all its instances (skippedBase)", async () => {
    const day = 10;
    const a = heroStartBuild("furnace", 1);
    put(a, 900, "temper", 0, 2); // a 2-star temper already on the deck
    put(a, 901, "temper", 1); // the benched 1-star temper: its 2-star variant would be an unfused 2-star pair
    expect(unfusedPairs(a)).toEqual([]);
    const p = heroStartBuild("weaver", 1);
    put(p, 910, "whetstone", 0);
    put(p, 911, "whetstone", 1); // a par-like deck holding an unfused 1-star pair: the game can't build it
    expect(unfusedPairs(p)).not.toEqual([]);
    let jobsSeen: Job[] = [], fieldSeen: Build[] = [];
    const record: Runner = async (field, jobs) => {
      fieldSeen = field;
      jobsSeen = jobs;
      return jobs.map(() => 1);
    };
    const sources: BenchSource[] = [{ hero: "furnace", tag: "a", build: a }, { hero: "weaver", tag: "p", build: p, par: true }];
    const { rows } = await starBench({ ...DEFAULT_OPTS, seeds: 1 }, day, [heroStartBuild("weaver", 1)], sources, record, noDetail);
    const t2 = rows.find((r) => r.def === "temper" && r.star === 2)!, t3 = rows.find((r) => r.def === "temper" && r.star === 3)!;
    expect([t2.n, t2.skipped, t2.skippedBase]).toEqual([0, 1, 0]);
    expect([t3.n, t3.skipped, t3.skippedBase]).toEqual([1, 0, 0]);
    expect(t3.same2).toBe(0);
    expect(t3.flags).not.toContain("SAME AS ★2");
    for (const star of [2, 3]) {
      const w = rows.find((r) => r.def === "whetstone" && r.star === star)!;
      expect([w.n, w.skipped, w.skippedBase]).toEqual([0, 2, 2]);
      expect(w.flags).toEqual([]);
    }
    // nothing the game can't build ever reached the runner
    for (const j of jobsSeen) expect(unfusedPairs(fieldSeen[j.a]), variantOf(fieldSeen[j.a], a)).toEqual([]);
    expect(jobsSeen.length).toBe(2); // the 1-star deck and the 3-star temper variant, one gauntlet member
  });
});

describe("star bench WORSE rule (D1, F9): the deck is the unit", () => {
  /** Five 1-temper decks (told apart by hullBonus); `pts(deck, stars, g)` scores each job. */
  async function toyBench(pts: (deck: number, stars: number, g: number) => number) {
    const sources: BenchSource[] = Array.from({ length: 5 }, (_, k) => {
      const b = heroStartBuild("furnace", 1);
      b.hullBonus = k;
      put(b, 900, "temper", 0);
      return { hero: "furnace", tag: `furnace elite ${k}`, build: b, par: k === 4 };
    });
    const G = 4;
    const gauntlet = Array.from({ length: G }, () => heroStartBuild("weaver", 1));
    const run: Runner = async (field, jobs) => jobs.map((j) => {
      const b = field[j.a];
      return pts(b.hullBonus, starsOf(b.items.find((p) => p.def === "temper")), j.b - (field.length - G));
    });
    const differ: DetailRunner = async (field, jobs) => jobs.map((j) => JSON.stringify(field[j.a]));
    return (await starBench({ ...DEFAULT_OPTS, seeds: 1 }, 5, gauntlet, sources, run, differ)).rows.find((r) => r.def === "temper" && r.star === 2)!;
  }

  it("one deck drops a lot and four don't: NOT WORSE (although the pooled Wilson intervals don't overlap)", async () => {
    const r = await toyBench((deck, stars) => (stars > 1 && deck === 0 ? 0 : 2));
    expect(r.n).toBe(5);
    expect(r.worse).toBe(1);
    expect(r.decks.map((d) => d.delta)).toEqual([-1, 0, 0, 0, 0]);
    expect(r.delta).toBeCloseTo(-0.2, 12);
    expect(r.wrN.hi).toBeLessThan(r.wr1.lo); // the old pooled rule would have flagged it
    expect(r.ci![1]).toBeGreaterThan(0);
    expect(r.flags).not.toContain("WORSE");
  });

  it("all five decks drop: WORSE, with the deck count, the worse count and the interval below 0", async () => {
    const r = await toyBench((deck, stars, g) => (stars > 1 ? (g <= deck % 2 ? 1 : 0.5) + 0.5 : 2)); // every deck loses 0.375-0.4375
    expect(r.n).toBe(5);
    expect(r.worse).toBe(5);
    expect(r.ci![1]).toBeLessThan(0);
    expect(r.flags).toContain("WORSE");
    const md = benchSection([{ day: 5, bench: [r] }]).join("\n");
    expect(md).toContain("WORSE rows: every deck with its paired delta");
    expect(md).toContain("furnace elite 4 (PAR)");
    expect(md).toContain("5/5");
  });

  it("benchWorse: fewer than 3 decks never flag; the 95% t-interval matches the textbook values", () => {
    expect(benchWorse([-0.5, -0.5])).toBe(false);
    expect(benchWorse([-0.5, -0.5, -0.5])).toBe(true);
    expect(benchWorse([-1, 0, 0, 0, 0])).toBe(false);
    expect(benchWorse([0.1, -0.1, -0.2])).toBe(false);
    expect(tCrit95(4)).toBeCloseTo(2.7764, 4);
    expect(tCrit95(30)).toBeCloseTo(2.0423, 4);
    expect(tCrit95(60)).toBeCloseTo(2.0003, 3);
    const { mean, ci } = meanCI([-1, 0, 0, 0, 0]);
    expect(mean).toBeCloseTo(-0.2, 12);
    expect(ci![1]).toBeCloseTo(-0.2 + 2.7764 * Math.sqrt(0.2 / 5), 3);
  });
});

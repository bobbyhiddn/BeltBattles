import { describe, expect, it } from "vitest";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { HARNESS_HEROES, heroRefBuild } from "../src/sim/harness/heroes";
import { balanceMarkdown } from "../src/sim/harness/report";
import { bandFlag, wilson } from "../src/sim/harness/stats";
import { DEFAULT_OPTS, playJob, runTournament, type Runner, type TourneyOpts } from "../src/sim/harness/tournament";

// Balance harness tournament: a tiny end-to-end run, determinism, and the statistics.

// All six heroes on day 1 (short battles); the determinism check uses three heroes on day 3.
const TINY: TourneyOpts = { ...DEFAULT_OPTS, days: [1], pop: 4, gauntlet: 2, seeds: 1, elites: 2, calibrationDays: [1] };

describe("harness tournament", () => {
  it("a tiny end-to-end run finishes in under 120 s with a well-formed matrix", async () => {
    const t0 = performance.now();
    const res = await runTournament(TINY);
    // G9: the old 30 s budget failed under machine load (30.6 s at load ~30 on the flip tree); the
    // budget guards against a pathological slowdown, not raw speed
    expect(performance.now() - t0).toBeLessThan(120_000);
    expect(res.days.map((d) => d.day)).toEqual([1]);
    for (const d of res.days) {
      expect(d.budget).toBe(maxGoldByDay(d.day));
      for (const a of HARNESS_HEROES) {
        expect(d.elites[a]).toHaveLength(2);
        expect(d.popScores[a]).toHaveLength(4);
        for (const e of d.elites[a]) expect(validateBuild(e.build, d.day).errors).toEqual([]);
        for (const b of HARNESS_HEROES) {
          if (a === b) continue;
          for (const t of [d.pop, d.elite]) {
            const r = t[`${a}|${b}`], s = t[`${b}|${a}`];
            expect(r.n).toBeGreaterThan(0);
            expect(r.n % 2).toBe(0); // both sides of every seed
            expect(r.lo).toBeLessThanOrEqual(r.p);
            expect(r.hi).toBeGreaterThanOrEqual(r.p);
            expect(r.n).toBe(s.n);
            expect(r.p + s.p).toBeCloseTo(1, 9);
          }
        }
      }
      // pop matrix: A-pop x B-gauntlet + B-pop x A-gauntlet - overlap, x2 battles per pairing
      expect(d.pop["furnace|weaver"].n).toBe((4 * 2 + 4 * 2 - 2 * 2) * 2);
      expect(d.elite["furnace|weaver"].n).toBe(2 * 2 * 2);
      for (const a of HARNESS_HEROES) {
        // mirror: the 2 builds outside the gauntlet x the hero's 2 gauntlet builds x 2 battles
        expect(d.pop[`${a}|${a}`].n).toBe(2 * 2 * 2);
        expect(d.elite[`${a}|${a}`]).toBeUndefined();
        expect(d.spend[a].min).toBeLessThanOrEqual(d.spend[a].median);
        expect(d.spend[a].max).toBeLessThanOrEqual(d.budget);
      }
    }
    const cal = res.days[0].calibration!.furnace;
    expect(cal.of).toBe(5);
    expect(cal.cost).toBe(buildCost(heroRefBuild("furnace", 1)).total);
    expect(cal.popCost).toEqual(res.days[0].spend.furnace);
    // 0.6.2 BELTSIDE H1: every population rig is counted with its landed arrows (one per arrow at most)
    const rigs = Object.values(res.days[0].rigs);
    expect(rigs.reduce((n, v) => n + v.n, 0)).toBeGreaterThan(0);
    for (const v of rigs) {
      expect(v.hits).toBeGreaterThanOrEqual(v.n); // no idle rig in a harness build
      expect(v.hits).toBeLessThanOrEqual(v.n * v.arrows);
    }
    const md = balanceMarkdown(res, { runtimeMs: 1, workers: 1, command: "test", perDayMs: {} });
    expect(md).toContain("## Day 1");
    expect(md).toContain("Calibration");
    expect(md).toContain("## Mirror cells");
    expect(md).toContain("## Lever traits");
    expect(md).toContain("## Rig arrows (H1: value per arrow that hits)");
  }, 60_000);

  it("results do not depend on the order jobs are played in (any worker split)", async () => {
    const o: TourneyOpts = { ...TINY, heroes: ["weaver", "bastion"], pop: 3, gauntlet: 2 };
    const backwards: Runner = async (field, jobs) => {
      const out = new Array<number>(jobs.length);
      for (let i = jobs.length - 1; i >= 0; i--) out[i] = playJob(field, jobs[i]);
      return out;
    };
    expect(JSON.stringify(await runTournament(o, backwards))).toBe(JSON.stringify(await runTournament(o)));
  }, 30_000);

  it("the same seed gives identical tournament results", async () => {
    const o: TourneyOpts = { ...TINY, heroes: ["furnace", "metronome", "siphon"], days: [3], pop: 4, gauntlet: 2 };
    const a = await runTournament(o);
    const b = await runTournament(o);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = await runTournament({ ...o, seed: 2 });
    expect(JSON.stringify(c.days[0].elites)).not.toBe(JSON.stringify(a.days[0].elites));
  }, 60_000);

  it("Wilson intervals and band flags", () => {
    const r = wilson(50, 100);
    expect(r.p).toBe(0.5);
    expect(r.lo).toBeCloseTo(0.4038, 3);
    expect(r.hi).toBeCloseTo(0.5962, 3);
    expect(wilson(0, 10).lo).toBe(0);
    expect(wilson(10, 10).hi).toBeCloseTo(1, 9);
    expect(bandFlag(wilson(500, 1000))).toBe("ok");
    expect(bandFlag(wilson(60, 100))).toBe("edge");
    expect(bandFlag(wilson(90, 100))).toBe("out");
  });
});

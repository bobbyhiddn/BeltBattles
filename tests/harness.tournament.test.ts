import { describe, expect, it } from "vitest";
import { maxGoldByDay, validateBuild } from "../src/net/validate";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { balanceMarkdown } from "../src/sim/harness/report";
import { bandFlag, wilson } from "../src/sim/harness/stats";
import { DEFAULT_OPTS, runTournament, type TourneyOpts } from "../src/sim/harness/tournament";

// Balance harness tournament: a tiny end-to-end run, determinism, and the statistics.

const TINY: TourneyOpts = { ...DEFAULT_OPTS, days: [1, 5], pop: 6, gauntlet: 3, seeds: 1, elites: 2, calibrationDays: [1] };

describe("harness tournament", () => {
  it("a tiny end-to-end run finishes in under 30 s with a well-formed matrix", async () => {
    const t0 = performance.now();
    const res = await runTournament(TINY);
    expect(performance.now() - t0).toBeLessThan(30_000);
    expect(res.days.map((d) => d.day)).toEqual([1, 5]);
    for (const d of res.days) {
      expect(d.budget).toBe(maxGoldByDay(d.day));
      for (const a of HARNESS_HEROES) {
        expect(d.elites[a]).toHaveLength(2);
        expect(d.popScores[a]).toHaveLength(6);
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
      expect(d.pop["furnace|weaver"].n).toBe((6 * 3 + 6 * 3 - 3 * 3) * 2);
      expect(d.elite["furnace|weaver"].n).toBe(2 * 2 * 2);
    }
    expect(res.days[0].calibration!.furnace.of).toBe(7);
    expect(res.days[1].calibration).toBeUndefined();
    const md = balanceMarkdown(res, { runtimeMs: 1, workers: 1, command: "test", perDayMs: {} });
    expect(md).toContain("## Day 5");
    expect(md).toContain("Calibration");
  }, 60_000);

  it("the same seed gives identical tournament results", async () => {
    const o: TourneyOpts = { ...TINY, days: [3], pop: 4, gauntlet: 2 };
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

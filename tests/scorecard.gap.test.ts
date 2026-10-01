// SC-TOOL --output-gap (REQ-BFG-026 item 5, job S1): the 2x flag on synthetic tables (1.99 is not flagged, 2.0 is),
// the served weighting, the bootstrap interval, and the per-battle DPS against the sim's own fields. About 1 s.
import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { GAP_FLAG, bootRatio, gapBattles, gapFlagged, gapFlags, gapRatio, servedQuantile, widestGap, type GapRow } from "../tools/scorecard/gap";

describe("--output-gap: the flag on a synthetic table", () => {
  it("flags a day at 2.0x or more, never at 1.99x, whichever hero is ahead", () => {
    expect(GAP_FLAG).toBe(2);
    const table = [
      { day: 1, medians: { furnace: 1.99, weaver: 1 } },
      { day: 2, medians: { furnace: 2, weaver: 1 } },
      { day: 3, medians: { furnace: 5, weaver: 10 } },
      { day: 4, medians: { furnace: 0.7, weaver: 0.35 } }, // 2.0 up to float error
      { day: 5, medians: { furnace: 9.95, weaver: 5 } }, // 1.99
      { day: 6, medians: { furnace: 7, weaver: 7 } },
    ];
    const f = gapFlags(table, ["furnace", "weaver"]);
    expect(f.map((x) => x.flagged)).toEqual([false, true, true, true, false, false]);
    expect(f.map((x) => Number(x.ratio.toFixed(2)))).toEqual([1.99, 2, 2, 2, 1.99, 1]);
    expect([f[2].hi, f[2].lo]).toEqual(["weaver", "furnace"]);
  });

  it("reads the playable heroes only; a zero output is an infinite gap; one hero alone is no ratio", () => {
    const f = gapFlags([{ day: 1, medians: { furnace: 3, weaver: 2, foundry: 9 } }], ["furnace", "weaver"]);
    expect([f[0].ratio, f[0].flagged]).toEqual([1.5, false]);
    expect(gapRatio([4, 0])).toBe(Infinity);
    expect(gapFlagged(gapRatio([4, 0]))).toBe(true);
    expect(Number.isNaN(gapRatio([4]))).toBe(true);
    expect(gapFlagged(NaN)).toBe(false);
    expect(gapFlagged(1.999999)).toBe(false);
    expect(gapFlagged(1.9999999999)).toBe(true); // 2.0 up to float error
  });
});

describe("--output-gap: weighting and the interval", () => {
  it("weighs each opponent by how often it is served, split over its battles", () => {
    // opponent 0 served 3x as often as opponent 1; opponent 1 has more battles, which must not outweigh it
    const rows: GapRow[] = [
      { e: 0, o: 0, v: [1] }, { e: 0, o: 0, v: [1] },
      { e: 0, o: 1, v: [5] }, { e: 0, o: 1, v: [5] }, { e: 0, o: 1, v: [5] }, { e: 0, o: 1, v: [5] },
    ];
    expect(servedQuantile(rows, [3, 1], 0, 0.5)).toBe(1);
    expect(servedQuantile(rows, [1, 3], 0, 0.5)).toBe(5);
    expect(servedQuantile(rows, [1, 1], 0, 0.5)).toBe(1); // the step median at exactly half the weight
  });

  it("bootstraps the first field over the second, deterministically", () => {
    const field = (scale: number): GapRow[] => Array.from({ length: 8 }, (_, e) => ({ e, o: e % 2, v: [scale * (1 + e / 10)] }));
    const a = bootRatio([field(2), field(1)], [1, 1], 200, 7);
    expect(a).toEqual(bootRatio([field(2), field(1)], [1, 1], 200, 7));
    expect(a[0]).toBeLessThanOrEqual(2);
    expect(a[1]).toBeGreaterThanOrEqual(2);
    expect(widestGap([0.8, 1.1])).toBe(1.25);
    expect(widestGap([0.95, 1.3])).toBe(1.3);
    expect(bootRatio([field(1)], [1, 1], 200, 7).every(Number.isNaN)).toBe(true);
  });
});

describe("--output-gap: per-battle output from the sim's own fields", () => {
  it("DPS = SideStats.damage / Battle.t for the deck's side, from both sides of each seed", () => {
    const a = heroRefBuild("furnace", 5), b = heroRefBuild("weaver", 5);
    const out = gapBattles([a, b], { a: 0, b: 1, seeds: [11, 12] });
    expect(out.length).toBe(4);
    const x = simulate(a, b, 11), y = simulate(b, a, 11);
    expect(out[0][0]).toBeCloseTo(x.sides[0].stats.damage / x.t, 12);
    expect(out[1][0]).toBeCloseTo(y.sides[1].stats.damage / y.t, 12);
    expect(out[0][5]).toBeCloseTo(x.sides[1].stats.damage / x.t, 12); // the damage it took
    expect(out[0][2]).toBe(x.t);
    expect(out[0][4]).toBe(x.sides[0].hull.max);
    // the hull-aware view: the share of the opponent's hull.max its damage removed (overkill capped), per second
    expect(out[0][1]).toBeCloseTo(Math.min(x.sides[0].stats.damage, x.sides[1].hull.max) / x.sides[1].hull.max / x.t, 12);
    expect(out[0][6]).toBeCloseTo(Math.min(x.sides[1].stats.damage, x.sides[0].hull.max) / x.sides[0].hull.max / x.t, 12);
    for (const r of out) expect(r[1]).toBeLessThanOrEqual(1 / r[2] + 1e-12); // never more than the whole hull
  });
});

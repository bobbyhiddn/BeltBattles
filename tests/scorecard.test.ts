// SC-TOOL (0.6.2 scorecard, REQ-BFG-026, B12): the measuring tool's pure helpers (the PASS/MISS rule, the merge ratio
// math, the quantiles, the battle-detail parser) and one check against the game: --static's day-1 pool equals what
// run.ts rollShop can offer on day 1, sampled on seeds the tool never uses. Fast (no battles, no par runs).
import { describe, expect, it } from "vitest";
import { hashSeed } from "../src/core/rng";
import { AMMO, ITEMS, DISRUPT_TIME } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { newRun } from "../src/game/run";
import { cmpOf, effectRatio, judge, quantile, valueRatio, weightedQuantile } from "../tools/scorecard/targets";
import { offeredDefs, partsOf, sampledPools } from "../tools/scorecard/catalogue";
import { kindOf, specAt } from "../tools/scorecard/merge";
import { parseDetail } from "../tools/scorecard/fights";

describe("scorecard: the target's comparison comes from its value and unit", () => {
  it("reads bands, floors, ceilings and exact values", () => {
    expect(cmpOf({ value: [0.35, 0.65], unit: "probability ...; range [min, max]" })).toEqual({ kind: "band", lo: 0.35, hi: 0.65 });
    expect(cmpOf({ value: 17, unit: "min distinct parts in the day-1 caravan pool" })).toEqual({ kind: "min", v: 17 });
    expect(cmpOf({ value: 0.1, unit: "max net share of the starting life pool that one day-1 loss may cost" })).toEqual({ kind: "max", v: 0.1 });
    expect(cmpOf({ value: 3, unit: "flag any honest pairing whose median fight ends in under this many game seconds" })).toEqual({ kind: "min", v: 3 });
    expect(cmpOf({ value: 0, unit: "net lives lost for the first dusk loss on days 1-2" })).toEqual({ kind: "eq", v: 0 });
  });
  it("PASS only when every measured value meets it", () => {
    const band = { kind: "band", lo: 10, hi: 30 } as const;
    expect(judge(band, { min: 10, max: 30 })).toBe("PASS");
    expect(judge(band, { min: 9.9, max: 20 })).toBe("MISS");
    expect(judge({ kind: "min", v: 0.9 }, { min: 0.9, max: 1 })).toBe("PASS");
    expect(judge({ kind: "min", v: 0.9 }, 0.89)).toBe("MISS");
    expect(judge({ kind: "max", v: 2 }, { min: 1.1, max: 2.29 })).toBe("MISS");
    expect(judge({ kind: "eq", v: 2 }, { min: 2, max: 2 })).toBe("PASS");
    expect(judge({ kind: "eq", v: 5 }, 2)).toBe("MISS");
    expect(judge({ kind: "eq", v: 5 }, null)).toBe("N/A");
    expect(judge({ kind: "eq", v: 5 }, NaN)).toBe("N/A");
  });
});

describe("scorecard: merge ratio math", () => {
  it("reads each kind of number as its effect", () => {
    expect(effectRatio("amount", 2, 4)).toBeCloseTo(2);
    expect(effectRatio("rate", 4, 1.8)).toBeCloseTo(4 / 1.8); // a cooldown: its rate
    expect(effectRatio("mult", 1.3, 1.66)).toBeCloseTo(0.66 / 0.3); // a multiplier: its bonus above x1
    expect(effectRatio("imult", 0.75, 0.58)).toBeCloseTo((1 / 0.58 - 1) / (1 / 0.75 - 1)); // an interval multiplier
    expect(effectRatio("cut", 0.5, 0.25)).toBeCloseTo(1.5); // commission time saved
    expect(effectRatio("amount", 0, 1)).toBeNull(); // a new effect has no ratio
    expect(valueRatio("rate", 1.4, 1.1)).toBeCloseTo(1.4 / 1.1); // the brief's plain reading: a time as a rate
    expect(valueRatio("mult", 1.3, 1.66)).toBeCloseTo(1.66 / 1.3);
  });
  it("names the effect kind of the fields that need one", () => {
    expect(kindOf("factory.interval")).toBe("rate");
    expect(kindOf("turret.fireInterval")).toBe("rate");
    expect(kindOf("gate.overclockCooldown")).toBe("rate");
    expect(kindOf("mod.fireMul")).toBe("imult");
    expect(kindOf("gate.speed")).toBe("mult");
    expect(kindOf("factory.commission")).toBe("cut");
    expect(kindOf("gate.burn")).toBe("amount");
  });
  it("fills a 1-star spec's missing numbers with the sim's own defaults", () => {
    const press = specAt("press", 1);
    expect(press.get("factory.base")).toBe(AMMO[ITEMS.press.factory!.ammo].base);
    expect(press.get("factory.batch")).toBe(1);
    expect(specAt("coil", 1).get("gate.shockTime")).toBe(DISRUPT_TIME);
  });
});

describe("scorecard: statistics and the battle-detail parser", () => {
  it("quantiles", () => {
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
    expect(weightedQuantile([{ v: 1, w: 1 }, { v: 2, w: 3 }], 0.5)).toBe(2);
    expect(weightedQuantile([{ v: 1, w: 3 }, { v: 2, w: 1 }], 0.5)).toBe(1);
  });
  it("scores each battle for job side a (per seed: a as player, then a as enemy)", () => {
    expect(parseDetail("0,12.5,10,0;1,13,0,5;-1,120,1,1;0,9,4,0")).toEqual([
      { t: 12.5, a: 1 }, { t: 13, a: 1 }, { t: 120, a: 0.5 }, { t: 9, a: 0 },
    ]);
  });
});

describe("scorecard: --static's day-1 pool is what rollShop can offer on day 1", () => {
  it("matches an independent sample of day-1 caravans, for every playable hero", () => {
    const pools = PLAYABLE_HEROES.map((hero) => new Set(partsOf(sampledPools(hero, 1500, "sc-pool", 1)[0])));
    for (const [i, hero] of PLAYABLE_HEROES.entries()) {
      const seen = new Set<string>();
      for (let s = 0; s < 3000; s++) {
        for (const d of offeredDefs(newRun(hero, hashSeed("sc-test-day1", hero, s), `t-${s}`))) if (ITEMS[d].kind !== "supply") seen.add(d);
      }
      expect([...pools[i]].sort()).toEqual([...seen].sort());
    }
  });
});

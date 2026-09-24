// Harness v2 part 2 fix pass (REQ-BFG-005, REQ-BFG-019): the lever-by-lever budget scan. With stars on + cores on,
// deck + cargo stays within maxGoldByDay after EVERY lever of randomBuild's shopper (gen.ts LeverTrace), for all six
// heroes, days 1-10 and 60 seeds in each of two seed streams (7,200 builds: verify11's scan size; its "v11-on" stream
// holds the build that went over at 4dce097). The fullPurseBuild half of the scan is in tests/harness.budget.test.ts.
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { buildCost, maxGoldByDay } from "../src/net/validate";
import { FUSE_MAX } from "../src/sim/stars";
import { shopBuild, type LeverTrace } from "../src/sim/harness/gen";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { cargoValue } from "../src/sim/harness/merge";

const SCAN_SEEDS = Number(process.env.BUDGET_SCAN_SEEDS ?? 60);
const STREAMS = ["budget-scan", "v11-on"];

describe("harness budget (fix pass): the lever-by-lever scan", () => {
  it(`scan, stars on + cores on: all six heroes, days 1-10, ${SCAN_SEEDS} seeds x ${STREAMS.length} streams: deck + cargo within maxGoldByDay after EVERY lever`, () => {
    const over: string[] = [];
    let builds = 0, levers = 0, withCargo = 0, drops = 0;
    for (const hero of HARNESS_HEROES) {
      for (let day = 1; day <= 10; day++) {
        const gold = maxGoldByDay(day);
        for (const stream of STREAMS) {
          for (let i = 0; i < SCAN_SEEDS; i++) {
            const trace: LeverTrace = (s, l, ok) => {
              levers++;
              if (s.cargo.length && (l === "drop" || l === "press" || l === "route")) drops++;
              const deck = buildCost(s.b).total, cargo = cargoValue(s.cargo);
              if (deck + cargo > gold) over.push(`${stream} ${hero} d${day} #${i} after ${l} (${ok}): deck ${deck} + cargo ${cargo} > ${gold}`);
            };
            const r = shopBuild(hero, day, new Rng(hashSeed(stream, hero, day, i)), "on", FUSE_MAX, "on", trace);
            builds++;
            if (r.cargo.length) withCargo++;
          }
        }
      }
    }
    expect(over).toEqual([]);
    expect(builds).toBe(HARNESS_HEROES.length * 10 * STREAMS.length * SCAN_SEEDS);
    // the scan really covers cargo: many builds end with cores in cargo, and the levers whose after-the-fact check
    // was fixed (press, drop, route) run with cargo on board
    expect(levers).toBeGreaterThan(builds * 10);
    expect(withCargo).toBeGreaterThan(builds / 20);
    expect(drops).toBeGreaterThan(100);
  }, 600_000);
});

// FLOOR-1 (BUMP-1D, RULING-BUMP-R2 R2.1): the seed pool's casual floor runs are CHOSEN by a rule, not taken as the first qualifying seed.
// tools/samplePool.ts ships the rule's four picks as FLOOR_PICKS (the rule plays ~8,000 battles a candidate; about 40 test files build the
// pool and must stay as fast as they were); these tests hold the table to the rule.
//  - always: the rule's day count is the deepest dusk the floor record reaches without a draw; the table's shape (4 heroes, each
//    "<seed>:<8 hex>" with a seed casualFloorRun tries); the table applies in the long run's shipped world only (off: no pick, casualFloorRun's
//    loop as before); and every pick resolves to its casual run in the shipped world (casualFloorRun throws on a stale hash or a deck equal to a
//    variant 0 or 1 deck) and is the seed the generator hands the pool;
//  - opt-in (BB_FLOOR_RULE=1): the rule itself, as rows. One process or several:
//      BB_FLOOR_RULE=1 BB_FLOOR_OUT=<rows.json> [BB_FLOOR_UNITS=furnace:9001-9008,weaver:9001-9016] [BB_FLOOR_K=12] npx vitest run tests/floor.picks.test.ts -t "the rule"
//    BB_FLOOR_UNITS is a list of hero:from-to (default: every playable hero, 9001-9016). The rows file is written after every (hero, seed) and
//    read back first, so a killed run resumes where it stopped; kit-run1/floorjoin.mjs joins the files, prints the table and the picks.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { HeroId } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { reachableRecords } from "../src/net/records";
import { longRunRules, withLongRun } from "../src/sim/longRun";
import {
  CASUAL_FLOOR_SEED, CASUAL_FLOOR_TRIES, FLOOR_K, FLOOR_PICKS, FLOOR_RULE_DAYS, SOFT1_WORLD, casualFloorRun, floorField, floorPicked, floorRows, floorTaken, softWorld,
  type FloorRow,
} from "../tools/samplePool";

describe("FLOOR-1: the casual floor runs (FLOOR_PICKS)", () => {
  it("FLOOR_RULE_DAYS is the deepest dusk the floor record reaches without a draw (HEART_COSTS [1,2,2], LAST CHANCE)", () => {
    let deepest = 0;
    for (let day = 1; day <= 30; day++) {
      if (reachableRecords(day, { draws: false, patchUp: false }).some((r) => r.wins === 0)) deepest = day;
    }
    expect(deepest).toBe(FLOOR_RULE_DAYS);
  });

  it("holds one pick for every playable hero, \"<seed>:<8 hex>\", a seed casualFloorRun tries", () => {
    expect(Object.keys(FLOOR_PICKS).sort()).toEqual([...PLAYABLE_HEROES].sort());
    for (const hero of PLAYABLE_HEROES) {
      const m = /^(\d{4}):([0-9a-f]{8})$/.exec(FLOOR_PICKS[hero]);
      expect(m, hero).not.toBeNull();
      const seed = Number(m![1]);
      expect(seed, hero).toBeGreaterThanOrEqual(CASUAL_FLOOR_SEED);
      expect(seed, hero).toBeLessThan(CASUAL_FLOOR_SEED + CASUAL_FLOOR_TRIES);
    }
  });

  it("applies in the long run's shipped world only: the long run off has no pick (casualFloorRun's loop, as before BUMP-1D)", () => {
    expect(softWorld()).toBe(true);
    expect(longRunRules()).toBe(true);
    for (const hero of PLAYABLE_HEROES) {
      expect(floorPicked(hero), hero).not.toBeNull();
      expect(withLongRun(() => floorPicked(hero), false), `${hero}, long run off`).toBeNull();
    }
  });

  it("resolves every pick to its casual run in the shipped world (no stale hash, no deck equal to a variant 0 or 1 deck)", () => {
    for (const hero of PLAYABLE_HEROES) {
      const pick = floorPicked(hero)!;
      const cf = casualFloorRun(hero, floorTaken(hero));
      expect(cf.seed, hero).toBe(pick.seed);
      expect(cf.days, hero).toHaveLength(16);
    }
  }, 900_000);

  it.skipIf(process.env.BB_FLOOR_RULE !== "1")("the rule (floorRows) writes its rows to BB_FLOOR_OUT", () => {
    const out = process.env.BB_FLOOR_OUT;
    if (!out) throw new Error("BB_FLOOR_OUT names the rows file to write");
    expect(softWorld()).toBe(true); // the rule is read in SOFT1_PICKS' world, the long run on
    expect(longRunRules()).toBe(true);
    const k = Number(process.env.BB_FLOOR_K ?? FLOOR_K);
    const units = (process.env.BB_FLOOR_UNITS ?? PLAYABLE_HEROES.map((h) => `${h}:${CASUAL_FLOOR_SEED}-${CASUAL_FLOOR_SEED + CASUAL_FLOOR_TRIES - 1}`).join(","))
      .split(",").map((u) => { const [h, r] = u.split(":"); const [a, b] = r.split("-").map(Number); return { hero: h as HeroId, from: a, to: b ?? a }; });
    const rows: { world: string; k: number; rows: Record<string, Record<string, FloorRow>> } = existsSync(out)
      ? (JSON.parse(readFileSync(out, "utf8")) as typeof rows)
      : { world: SOFT1_WORLD, k, rows: {} };
    expect(rows.world).toBe(SOFT1_WORLD);
    expect(rows.k).toBe(k);
    let field: ReturnType<typeof floorField> | undefined;
    const getField = () => (field ??= floorField());
    for (const u of units) {
      for (let seed = u.from; seed <= u.to; seed++) {
        if (rows.rows[u.hero]?.[String(seed)]) { console.log(`FLOOR ${u.hero} ${seed}: already in ${out}`); continue; }
        const t0 = Date.now();
        const [row] = floorRows(u.hero, [seed], getField, k);
        (rows.rows[u.hero] ??= {})[String(seed)] = row;
        writeFileSync(out, JSON.stringify(rows) + "\n");
        console.log(`FLOOR ${u.hero} ${seed}: ${row.qualifies ? `mean ${(100 * row.mean!).toFixed(2)}% per day ${row.perDay!.map((x) => (100 * x).toFixed(1)).join(" ")}` : "does not qualify"} hash ${row.hash} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
    }
  }, 7_200_000);
});

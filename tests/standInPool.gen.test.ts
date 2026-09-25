import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hashSeed } from "../src/core/rng";
import { simulate } from "../src/sim/battle";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import {
  STAND_IN_POOL_HEROES, STAND_IN_POOL_RULES, decodeStandIn, decodeStarred, encodeStandIn, encodeStarred, standInPar, standInParIndex,
  standInPick, standInPickIndex, standInPool,
} from "../src/sim/standInPool";

// The bundled full-purse stand-in pool (0.6.0c dusk stand-ins) and its portable loader.

const DAYS = Array.from({ length: 10 }, (_, i) => i + 1);
const floor = (day: number) => Math.ceil(0.9 * maxGoldByDay(day));
const dayData = (hero: HeroId, day: number) => STAND_IN_DATA.pools[hero]![day - 1];
// hero/days that took their best-vsPar builds (relaxation "best"), listed with their vsPar values
const parShort = new Set(STAND_IN_DATA.short.filter((s) => s.vsPar).map((s) => `${s.hero}|${s.day}`));

/** A's win rate against B over `seeds`, each played from both sides (win 1, draw 0.5). */
function winRate(a: Build, b: Build, seeds: number[]): number {
  let pts = 0;
  for (const s of seeds) {
    const x = simulate(a, b, s).winner, y = simulate(b, a, s).winner;
    pts += (x === 0 ? 1 : x === -1 ? 0.5 : 0) + (y === 1 ? 1 : y === -1 ? 0.5 : 0);
  }
  return pts / (2 * seeds.length);
}

describe("stand-in pool", () => {
  it("covers FURNACE and WEAVER with 6 entries per day, days 1-10, under the current RULES_VERSION", () => {
    expect(STAND_IN_POOL_HEROES).toEqual(["furnace", "weaver"]);
    expect(STAND_IN_POOL_RULES).toBe(RULES_VERSION);
    expect(STAND_IN_DATA.band).toEqual([40, 60]);
    expect(STAND_IN_DATA.parFloor).toBe(0.5);
    for (const hero of STAND_IN_POOL_HEROES) for (const day of DAYS) expect(standInPool(hero, day), `${hero} d${day}`).toHaveLength(6);
  });

  it("every entry is legal for its day, the right hero, priced at buildCost, and meets the 90% floor", () => {
    const short = new Set(STAND_IN_DATA.short.filter((s) => !s.vsPar).map((s) => `${s.hero}|${s.day}|${s.cost}`));
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        for (const e of standInPool(hero, day)) {
          expect(validateBuild(e.build, day).errors, `${hero} d${day}`).toEqual([]);
          expect(e.hero).toBe(hero);
          expect(e.build.hero).toBe(hero);
          expect(e.day).toBe(day);
          expect(e.cost).toBe(buildCost(e.build).total);
          if (!short.has(`${hero}|${day}|${e.cost}`)) expect(e.cost, `${hero} d${day}`).toBeGreaterThanOrEqual(floor(day));
          expect(e.pct).toBeGreaterThanOrEqual(0);
          expect(e.pct).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it("entries are sorted by pct and lie inside their window, which starts at 40 or above and is 20 points wide unless widened", () => {
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        const p = standInPool(hero, day).map((e) => e.pct);
        const [, , [lo, hi], n, relax] = dayData(hero, day);
        expect(p).toEqual([...p].sort((a, b) => a - b));
        expect(lo, `${hero} d${day}`).toBeGreaterThanOrEqual(STAND_IN_DATA.band[0]);
        for (const x of p) expect(x >= lo && x <= hi, `${hero} d${day} pct ${x} outside ${lo}-${hi}`).toBe(true);
        if (relax === "none") expect(hi, `${hero} d${day}`).toBe(Math.min(100, Math.round((lo + 20) * 10) / 10));
        if (relax === "widen") expect(hi - lo, `${hero} d${day}`).toBeGreaterThan(20);
        expect(n, `${hero} d${day}`).toBe(relax === "none" || relax === "widen" ? STAND_IN_DATA.pop : n);
        expect([64, 128, 256]).toContain(n);
        if (lo === 40 && hi === 60) for (const x of p) expect(x >= 40 && x <= 60).toBe(true); // the old band, unmoved
      }
    }
  });

  it("days outside 1-10 clamp; a hero not in the pool gets [] and a clear error from pick and par", () => {
    expect(standInPool("furnace", 0)).toEqual(standInPool("furnace", 1));
    expect(standInPool("weaver", 14)).toEqual(standInPool("weaver", 10));
    expect(standInPool("weaver", NaN)).toEqual(standInPool("weaver", 1));
    expect(standInPool("siphon", 3)).toEqual([]);
    expect(() => standInPick("foundry", 3, 1)).toThrow(/no stand-in decks for hero "foundry"/);
    expect(() => standInPar("metronome", 3)).toThrow(/no stand-in decks for hero "metronome"/);
  });

  it("standInPick is deterministic, reaches several entries across seeds, and returns fresh copies", () => {
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of [1, 5, 10]) {
        const seen = new Set<number>();
        for (let seed = 0; seed < 60; seed++) {
          const i = standInPickIndex(hero, day, seed);
          seen.add(i);
          expect(standInPick(hero, day, seed)).toEqual(standInPool(hero, day)[i].build);
          expect(standInPick(hero, day, seed)).toEqual(standInPick(hero, day, seed));
        }
        expect(seen.size, `${hero} d${day}`).toBeGreaterThanOrEqual(4);
      }
    }
    const a = standInPick("furnace", 3, 7), before = JSON.stringify(standInPool("furnace", 3));
    a.items.push({ uid: 999, def: "temper", x: 0, y: 9 });
    a.hullBonus += 500;
    standInPool("furnace", 3)[0].build.routes.length = 0;
    standInPar("furnace", 3).mods.push({ uid: 998, def: "chamber", turret: 0 });
    expect(JSON.stringify(standInPool("furnace", 3))).toBe(before);
    expect(standInPick("furnace", 3, 7)).not.toBe(standInPick("furnace", 3, 7));
  });

  it("standInPar is the stored par index: the entry nearest the middle of its window (pct 50 for the old band)", () => {
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        const pool = standInPool(hero, day), par = standInParIndex(hero, day);
        const [stored, , [lo, hi]] = dayData(hero, day);
        const mid = (lo + hi) / 2, dist = pool.map((e) => Math.abs(e.pct - mid));
        expect(par, `${hero} d${day}`).toBe(stored);
        expect(par, `${hero} d${day}`).toBe(dist.indexOf(Math.min(...dist))); // the first on a tie
        expect(standInPar(hero, day)).toEqual(pool[par].build);
        if (lo === 40 && hi === 60) expect(Math.abs(pool[par].pct - 50)).toBe(Math.min(...pool.map((e) => Math.abs(e.pct - 50))));
      }
    }
  });

  it("every entry wins at least half its battles against both par decks (vsPar >= 0.5), unless its hero/day is listed in short", () => {
    for (const s of STAND_IN_DATA.short.filter((x) => x.vsPar)) {
      expect(s.vsPar, `${s.hero} d${s.day}`).toEqual(standInPool(s.hero, s.day).map((e) => e.vsPar));
    }
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        for (const e of standInPool(hero, day)) {
          expect(e.vsPar).toBeLessThanOrEqual(1);
          if (!parShort.has(`${hero}|${day}`)) expect(e.vsPar, `${hero} d${day} pct ${e.pct}`).toBeGreaterThanOrEqual(0.5);
        }
      }
    }
  });

  it("each par, re-simulated against heroRefBuild of both factions (10 seeds x both sides), wins at least 50%: its stored vsPar", () => {
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        const par = standInPar(hero, day);
        const rates = STAND_IN_POOL_HEROES.map((foe, r) =>
          winRate(par, heroRefBuild(foe, day), Array.from({ length: 10 }, (_, k) => hashSeed("standin-ref", STAND_IN_DATA.seed, hero, day, r, k))));
        const low = Math.min(...rates);
        expect(low, `${hero} d${day}`).toBeCloseTo(standInPool(hero, day)[standInParIndex(hero, day)].vsPar, 6);
        if (!parShort.has(`${hero}|${day}`)) expect(low, `${hero} d${day} vs refs ${rates.join(" / ")}`).toBeGreaterThanOrEqual(0.5);
      }
    }
  }, 180_000);

  it("each par against heroRefBuild: a quick battle finishes with no NaN", () => {
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        for (const foe of STAND_IN_POOL_HEROES) {
          const r = simulate(standInPar(hero, day), heroRefBuild(foe as HeroId, day), 1000 + day);
          expect(Number.isFinite(r.t) && r.t > 0).toBe(true);
          expect([0, 1, -1]).toContain(r.winner);
          for (const s of r.sides) expect(Number.isNaN(s.hull.hp)).toBe(false);
        }
      }
    }
  }, 30_000);

  it("build codes round-trip", () => {
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        // star-aware since the 0.6.1 flip (pool v2 decks carry merge stars)
        for (const e of standInPool(hero, day)) expect(decodeStarred(hero, encodeStarred(e.build))).toEqual(e.build);
      }
    }
    expect(() => decodeStandIn("furnace", "14 0/kiln6/1:54/")).toThrow(/bad item/);
  });

  it("the loader and its data module import only ./content and ./deck (and each other)", () => {
    const specs = (f: string) => [...readFileSync(f, "utf8").matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    const loader = specs("src/sim/standInPool.ts"), data = specs("src/sim/standInPoolData.ts");
    expect(loader.length).toBeGreaterThan(0);
    for (const s of loader) expect(["./content", "./deck", "./standInPoolData"]).toContain(s);
    for (const s of data) expect(["./content", "./deck"]).toContain(s);
    for (const f of ["src/sim/standInPool.ts", "src/sim/standInPoolData.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/\bimport\s*\(|\brequire\s*\(/);
  });
});

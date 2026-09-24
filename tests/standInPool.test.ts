// 0.6.0d D2: the dusk stand-ins bring full-purse decks from the stand-in pool v1.1
// (src/sim/standInPool.ts + standInPoolData.ts, copied as they are from the balance harness).
// standInFoe keeps the captain standInGhost(seed, day) and fights with standInPick(hero, day, seed).
import { describe, expect, it, vi } from "vitest";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { STAND_IN_POOL_DAYS, STAND_IN_POOL_HEROES, STAND_IN_POOL_RULES, standInPick, standInPool } from "../src/sim/standInPool";
import { RULES_VERSION, RUN_DAYS, type HeroId } from "../src/sim/content";
import { RIVALS, RIVAL_IDS, deckCost, maxGoldByDay, standInBuild, standInGhost } from "../src/sim/rivals";
import { inStandInPool, standInFoe } from "../src/game/ghosts";
import { chooseFoe, startDusk } from "../src/game/day";
import { migrateRun, newRun } from "../src/game/run";
import { routeProblems } from "../src/game/routeCheck";
import type { Build } from "../src/sim/deck";

const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const SEEDS = Array.from({ length: 200 }, (_, n) => 7 + n * 104729); // run seeds are 31-bit, >= 0
const PLATE = 25; // ARMOR PLATING's hull (standin.honest.test.ts pins it)
const J = (v: unknown): string => JSON.stringify(v);

describe("the stand-in pool v1.1 as the game uses it", () => {
  it("was generated under this RULES_VERSION (a stale pool fails here)", () => {
    expect(STAND_IN_POOL_RULES).toBe(RULES_VERSION);
    expect(STAND_IN_DATA.rules).toBe(RULES_VERSION);
    expect(STAND_IN_POOL_DAYS).toBe(RUN_DAYS);
  });

  it("covers the hero of every captain that can stand in (every one but the Matriarch): no fallback in 0.6", () => {
    const heroes = new Set<HeroId>();
    for (const id of RIVAL_IDS) {
      if (id === "matriarch") continue;
      heroes.add(RIVALS[id].hero);
      expect(STAND_IN_POOL_HEROES).toContain(RIVALS[id].hero);
      expect(inStandInPool(RIVALS[id].hero)).toBe(true);
    }
    expect([...heroes].sort()).toEqual(["furnace", "weaver"]);
  });

  it("prints the pool's recorded vsPar per hero and day (mean and minimum of standInPool(hero, day); no fights)", () => {
    const pc = (x: number) => `${Math.round(x * 100)}%`;
    const lines = ["stand-in pool v1.1 recorded vsPar (lower win rate vs both par decks), mean / min of 6:"];
    for (const day of DAYS) {
      const cols = STAND_IN_POOL_HEROES.map((hero) => {
        const v = standInPool(hero, day).map((e) => e.vsPar);
        const cost = standInPool(hero, day).map((e) => e.cost);
        return `${hero} ${pc(v.reduce((a, b) => a + b, 0) / v.length)} / ${pc(Math.min(...v))} (${Math.min(...cost)}-${Math.max(...cost)}g)`;
      });
      lines.push(`  day ${String(day).padStart(2)} (budget ${maxGoldByDay(day)}g): ${cols.join(" | ")}`);
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
    expect(lines.length).toBe(1 + RUN_DAYS);
  });

  it("every pool entry's vsPar is at least parFloor (0.5), and no hero/day is listed short", () => {
    expect(STAND_IN_DATA.parFloor).toBe(0.5);
    expect(STAND_IN_DATA.short).toEqual([]);
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        const es = standInPool(hero, day);
        expect(es.length).toBe(STAND_IN_DATA.per);
        for (const e of es) {
          expect(e.vsPar).toBeGreaterThanOrEqual(STAND_IN_DATA.parFloor);
          expect(deckCost(e.build).total).toBe(e.cost);
        }
      }
    }
  });
});

describe("standInFoe: the day's captain with its standInPick deck (200 seeds x days 1-10)", () => {
  it("keeps standInGhost's id, name and hero; its build deep-equals standInPick(hero, day, seed); never the Matriarch", () => {
    for (const seed of SEEDS) {
      const ids = new Set<string>();
      for (const day of DAYS) {
        const f = standInFoe(seed, day);
        const id = standInGhost(seed, day);
        expect(f.id).toBe(id);
        expect(f.id).not.toBe("matriarch");
        expect([f.name, f.hero, f.build.hero]).toEqual([RIVALS[id].name, RIVALS[id].hero, RIVALS[id].hero]);
        expect(f.build).toEqual(standInPick(f.hero, day, seed));
        ids.add(f.id);
      }
      expect(ids.size).toBe(RUN_DAYS); // still no captain twice in a run
    }
  });

  it("every one of those decks is honest: >= ceil(0.9 x maxGoldByDay), <= maxGoldByDay, whole plating, no belt FIGHT refuses", () => {
    let n = 0;
    const picked = new Map<string, Set<string>>();
    for (const seed of SEEDS) {
      for (const day of DAYS) {
        const b = standInFoe(seed, day).build;
        const cost = deckCost(b).total, budget = maxGoldByDay(day);
        expect(cost).toBeGreaterThanOrEqual(Math.ceil(0.9 * budget));
        expect(cost).toBeLessThanOrEqual(budget);
        expect(b.hullBonus).toBeGreaterThanOrEqual(0);
        expect(b.hullBonus % PLATE).toBe(0);
        expect(routeProblems(b)).toEqual([]);
        expect(b.routes.length).toBeGreaterThan(0);
        const k = `${b.hero}@${day}`;
        if (!picked.has(k)) picked.set(k, new Set());
        picked.get(k)!.add(J(b));
        n++;
      }
    }
    expect(n).toBe(2000);
    // both heroes stand in on every day, and the seed spreads the picks over the pool
    expect(picked.size).toBe(STAND_IN_POOL_HEROES.length * RUN_DAYS);
    for (const s of picked.values()) expect(s.size).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic, and returns copies: mutating a deck never changes the next call", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      for (const day of DAYS) {
        const a = standInFoe(seed, day), b = standInFoe(seed, day);
        expect(b).toEqual(a);
        const before = J(a);
        a.build.items.push({ uid: 999, def: "plating", x: 0, y: 0 });
        a.build.items[0].x = 9;
        a.build.routes[0].cells.push(0);
        a.build.mods.length = 0;
        a.build.hullBonus = 999;
        expect(J(standInFoe(seed, day))).toBe(before);
        const p = standInPick(a.hero, day, seed);
        const pj = J(p);
        p.routes.length = 0;
        p.beltCap = 0;
        expect(J(standInPick(a.hero, day, seed))).toBe(pj);
      }
    }
  });
});

describe("the dusk fights the stored deck", () => {
  it("chooseFoe with no ghost uses standInFoe; startDusk stores it; a reload fights the same deck", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (const day of DAYS) {
        const run = newRun("furnace", seed, "me");
        run.day = day;
        const s = standInFoe(seed, day);
        const f = startDusk(run, []);
        expect([f.kind, f.rival, f.name, f.hero]).toEqual(["standin", s.id, s.name, s.hero]);
        expect(f.build).toEqual(s.build);
        const back = migrateRun(JSON.parse(J(run)))!;
        expect(startDusk(back, []).build).toEqual(s.build);
      }
    }
  });

  it("a saved run whose stored foe has an old standInBuild deck keeps that deck (no save migration)", () => {
    const run = newRun("weaver", 555, "me");
    run.day = 6;
    const id = standInGhost(555, 6);
    const old: Build = standInBuild(id, 6);
    run.dusk = { day: 6, kind: "standin", name: RIVALS[id].name, hero: RIVALS[id].hero, build: old, rival: id };
    run.stage = "battle";
    const back = migrateRun(JSON.parse(J(run)))!;
    expect(back.dusk!.build).toEqual(old);
    const f = startDusk(back, []);
    expect(f.build).toEqual(old);
    expect(f.build).not.toEqual(standInFoe(555, 6).build);
    expect(chooseFoe({ ...back, dusk: null }, []).build).toEqual(standInFoe(555, 6).build); // a new pick is the pool's
  });
});

describe("the fallback (a captain whose hero has no pool decks)", () => {
  it("brings standInBuild(id, day), with the captain unchanged", async () => {
    vi.resetModules();
    vi.doMock("../src/sim/standInPool", async (importOriginal) => {
      const mod = await importOriginal<typeof import("../src/sim/standInPool")>();
      return { ...mod, STAND_IN_POOL_HEROES: ["weaver"] };
    });
    try {
      const g = await import("../src/game/ghosts");
      let furnace = 0, weaver = 0;
      for (const seed of SEEDS.slice(0, 20)) {
        for (const day of DAYS) {
          const f = g.standInFoe(seed, day);
          const id = standInGhost(seed, day);
          expect([f.id, f.name, f.hero]).toEqual([id, RIVALS[id].name, RIVALS[id].hero]);
          if (f.hero === "furnace") { furnace++; expect(f.build).toEqual(standInBuild(id, day)); }
          else { weaver++; expect(f.build).toEqual(standInPick("weaver", day, seed)); }
        }
      }
      expect(furnace).toBeGreaterThan(0);
      expect(weaver).toBeGreaterThan(0);
    } finally {
      vi.doUnmock("../src/sim/standInPool");
      vi.resetModules();
    }
  });
});

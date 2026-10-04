// Harness v2 fix pass: stand-in pool v2 (REQ-BFG-019). Group 3 (F3): the dry pool is played
// against the SHIPPED pool v1.1 with two getters, four pairings per day.
import { describe, expect, it } from "vitest";
import { hashSeed } from "../src/core/rng";
import type { Build } from "../src/sim/deck";
import type { HeroId } from "../src/sim/content";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { standInPool } from "../src/sim/standInPool";
import { fullPurseBuild, spendFloor } from "../src/sim/harness/gen";
import { heroStartBuild } from "../src/sim/harness/heroes";
import { encodeStarred } from "../src/sim/harness/standinCode";
import {
  STANDIN_DEFAULTS, STANDIN_MAX_STARS, dataModuleText, dryVersus, genStandIns, maxStarsOf, shippedPicks, standInCandidate, versus, writtenProblems, type HeroDay,
} from "../src/sim/harness/standins";
import { localRunner, type Job, type Runner } from "../src/sim/harness/tournament";
import { cpuMsSince, HARNESS_CPU_BUDGET_MS, HARNESS_HANG_TIMEOUT_MS } from "./harnessTiming";

const deck = (hero: HeroId, hull: number): Build => ({ ...heroStartBuild(hero, 1), hullBonus: hull });

describe("dry pool v2 against the shipped pool v1.1 (F3)", () => {
  it("versus with two getters plays A's decks (job side a) against B's decks (job side b), every pair, every day", async () => {
    const o = { ...STANDIN_DEFAULTS, seeds: 1 };
    const asked: string[] = [];
    const a = { hero: "furnace" as HeroId, picks: (h: HeroId, d: number) => { asked.push(`A ${h} ${d}`); return [deck(h, 101), deck(h, 102)]; } };
    const b = { hero: "furnace" as HeroId, picks: (h: HeroId, d: number) => { asked.push(`B ${h} ${d}`); return [deck(h, 201), deck(h, 202), deck(h, 203)]; } };
    const seen: { field: Build[]; jobs: Job[] }[] = [];
    const rec: Runner = async (field, jobs) => { seen.push({ field, jobs }); return jobs.map(() => 1); };
    const rows = await versus(o, a, b, rec);
    expect(rows.map((r) => r.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows.every((r) => r.rate === 0.5 && r.battles === 6 * 2)).toBe(true);
    expect(asked.filter((x) => x.startsWith("A"))).toHaveLength(10);
    expect(asked.filter((x) => x.startsWith("B"))).toHaveLength(10);
    for (const { field, jobs } of seen) {
      expect(jobs).toHaveLength(6);
      const pairs = new Set(jobs.map((j) => `${field[j.a].hullBonus}-${field[j.b].hullBonus}`));
      expect([...pairs].sort()).toEqual(["101-201", "101-202", "101-203", "102-201", "102-202", "102-203"]);
    }
  });

  it("dryVersus: the four v2 rows play the dry picks against the shipped v1.1 picks (same hero and cross hero); the reference row is v1.1 vs v1.1", async () => {
    const o = { ...STANDIN_DEFAULTS, seeds: 1 };
    const days = (["furnace", "weaver"] as HeroId[]).flatMap((hero) => Array.from({ length: 10 }, (_, k) => ({
      hero, day: k + 1, picks: [{ build: deck(hero, 500 + k) }, { build: deck(hero, 600 + k) }],
    }))) as unknown as HeroDay[];
    const seen: { field: Build[]; jobs: Job[] }[] = [];
    const rec: Runner = async (field, jobs) => { seen.push({ field, jobs }); return jobs.map(() => 0); };
    const { v2v2, tables } = await dryVersus(o, days, rec);
    expect(v2v2).toHaveLength(10);
    expect(tables.map((t) => `${t.a} ${t.aPool} vs ${t.b} ${t.bPool}`)).toEqual([
      "furnace v2 vs furnace v1.1", "weaver v2 vs weaver v1.1", "furnace v2 vs weaver v1.1", "weaver v2 vs furnace v1.1", "furnace v1.1 vs weaver v1.1",
    ]);
    const key = (b: Build) => JSON.stringify(b);
    const v2Of = (h: HeroId, d: number) => new Set(days.find((x) => x.hero === h && x.day === d)!.picks.map((p) => key(p.build)));
    const v11Of = (h: HeroId, d: number) => new Set(standInPool(h, d).map((e) => key(e.build)));
    expect(seen).toHaveLength(10 * 6);
    tables.forEach((t, ti) => {
      for (let d = 1; d <= 10; d++) {
        const { field, jobs } = seen[10 * (ti + 1) + d - 1];
        const A = t.aPool === "v2" ? v2Of(t.a, d) : v11Of(t.a, d), B = v11Of(t.b, d);
        // PACKS run 2 (oracle 2427be6ec928a286, ruling R3): versus() plays every pick, duplicates included, which is the
        // weight standInPickIndex gives them in the game. bb-0.8.6's WEAVER d1 holds two identical picks (77.8 and 78.4),
        // so the jobs count picks, not distinct decks
        const aPicks = t.aPool === "v2" ? days.find((x) => x.hero === t.a && x.day === d)!.picks.length : standInPool(t.a, d).length;
        const bPicks = standInPool(t.b, d).length;
        expect(jobs).toHaveLength(aPicks * bPicks);
        for (const j of jobs) {
          expect(A.has(key(field[j.a])), `${t.a} ${t.aPool} d${d}: side a`).toBe(true);
          expect(B.has(key(field[j.b])), `${t.b} v1.1 d${d}: side b is a shipped deck`).toBe(true);
        }
      }
    });
    // v2 vs v2: both sides are dry picks
    for (let d = 1; d <= 10; d++) {
      const { field, jobs } = seen[d - 1];
      for (const j of jobs) {
        expect(v2Of("furnace", d).has(key(field[j.a]))).toBe(true);
        expect(v2Of("weaver", d).has(key(field[j.b]))).toBe(true);
      }
    }
    expect(shippedPicks("weaver", 3).map(key)).toEqual(standInPool("weaver", 3).map((e) => key(e.build)));
  });
});

describe("no 3-star stand-ins (F8, decision D4)", () => {
  it("stars on: a stand-in candidate never holds a module above 2 stars, where the uncapped build of the same seed does; capped builds stay legal", () => {
    let capped3 = 0, free3 = 0, starred2 = 0;
    for (const hero of ["furnace", "weaver"] as const) {
      for (const day of [6, 8, 10]) {
        for (let i = 0; i < 12; i++) {
          const seed = hashSeed("cap-2", hero, day, i);
          const c = standInCandidate(hero, day, seed, "on");
          const free = fullPurseBuild(hero, day, seed, spendFloor(day), 60, "on").build;
          if (maxStarsOf(c.build) > STANDIN_MAX_STARS) capped3++;
          if (maxStarsOf(free) > STANDIN_MAX_STARS) free3++;
          if (maxStarsOf(c.build) === 2) starred2++;
          expect(validateBuild(c.build, day).errors, `${hero} d${day} #${i}`).toEqual([]);
          expect(unfusedPairs(c.build), `${hero} d${day} #${i}`).toEqual([]);
          expect(buildCost(c.build).total).toBeLessThanOrEqual(maxGoldByDay(day));
        }
      }
    }
    expect(capped3).toBe(0);
    expect(free3).toBeGreaterThan(0); // the cap really bites on these seeds
    expect(starred2).toBeGreaterThan(0); // and 2-star merges still happen
  }, 60_000);

  it("stars off: the candidate is exactly v1's fullPurseBuild (the cap never applies)", () => {
    for (const day of [3, 9]) {
      const seed = hashSeed("cap-off", day);
      expect(JSON.stringify(standInCandidate("weaver", day, seed, "off"))).toBe(JSON.stringify(fullPurseBuild("weaver", day, seed, spendFloor(day), 60, "off")));
    }
  });

  it("the tiny stars-on dry pool: no candidate or pick above 2 stars, the cap is reported, and a written 3-star pick is caught", async () => {
    const tiny = { ...STANDIN_DEFAULTS, pop: 6, gauntlet: 2, seeds: 1, elites: 2, refSeeds: 2, per: 2, grow: [8], stars: "on" as const };
    const cpu0 = process.cpuUsage();
    const res = await genStandIns(tiny, localRunner);
    expect(cpuMsSince(cpu0)).toBeLessThan(HARNESS_CPU_BUDGET_MS);
    for (const hd of res.days) {
      for (const c of hd.pop) expect(maxStarsOf(c.build), `${hd.hero} d${hd.day} #${c.idx}`).toBeLessThanOrEqual(STANDIN_MAX_STARS);
      expect(hd.capWould3).toBeLessThanOrEqual(hd.capAffected);
    }
    expect(res.days.reduce((s, hd) => s + hd.capAffected, 0)).toBeGreaterThan(0);
    expect(writtenProblems(tiny, res.days, dataModuleText(tiny, res.days))).toEqual([]);
    // doctor one pick into a 3-star module: the stars-on invariant on the written module reports it
    const hd = res.days.find((x) => x.picks.some((p) => [...p.build.items, ...p.build.mods].some((q) => (q.stars ?? 1) === 2)))!;
    const p = hd.picks.find((q) => [...q.build.items, ...q.build.mods].some((m) => (m.stars ?? 1) === 2))!;
    const three = JSON.parse(JSON.stringify(p.build)) as Build;
    const m = [...three.items, ...three.mods].find((q) => (q.stars ?? 1) === 2)!;
    m.stars = 3;
    const doctored = res.days.map((x) => (x !== hd ? x : { ...x, picks: x.picks.map((q) => (q !== p ? q : { ...q, build: three, code: encodeStarred(three), cost: buildCost(three).total })) }));
    const problems = writtenProblems(tiny, doctored, dataModuleText(tiny, doctored));
    expect(problems.some((x) => x.includes("3-star module"))).toBe(true);
  }, HARNESS_HANG_TIMEOUT_MS);
});

// Harness v2 fix pass: stand-in pool v2 (REQ-BFG-019). Group 3 (F3): the dry pool is played
// against the SHIPPED pool v1.1 with two getters, four pairings per day.
import { describe, expect, it } from "vitest";
import type { Build } from "../src/sim/deck";
import type { HeroId } from "../src/sim/content";
import { standInPool } from "../src/sim/standInPool";
import { heroStartBuild } from "../src/sim/harness/heroes";
import { STANDIN_DEFAULTS, dryVersus, shippedPicks, versus, type HeroDay } from "../src/sim/harness/standins";
import type { Job, Runner } from "../src/sim/harness/tournament";

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
        expect(jobs).toHaveLength(A.size * B.size);
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

// Harness v2 part 3, step 3 (REQ-BFG-005, REQ-BFG-019): the factory bench. Factories are benched defs of the star
// bench (a placed 1-star factory raised in place to 2 and 3 stars); the FACTORY table reads its rows (the same paired
// decks), split by hero and, for GANTRY PRESS, by routes fed; the PRESS-SLOT rows (report only) swap each deck's STAMP
// PRESS for every factory at 1-3 stars on shared seeds, with damage and jams per fight (jobStats).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { ITEMS, type HeroId, type ItemDef } from "../src/sim/content";
import { routesOf, type Build } from "../src/sim/deck";
import { unfusedPairs } from "../src/net/validate";
import { FUSE_MAX, starsOf } from "../src/sim/stars";
import { randomBuild } from "../src/sim/harness/gen";
import { heroRefBuild, heroStartBuild } from "../src/sim/harness/heroes";
import { applyLever } from "../src/sim/harness/levers";
import { Shopper } from "../src/sim/harness/shopper";
import {
  DEFAULT_OPTS, FACTORY_DEFS, PRESS_SLOT_KEY, arsenalPressSlot, benchSeeds, factoryRows, factoryUseOf, focusSeeds, jobStats, localDetail, localRunner, localStats,
  playJob, pressSlotBench, pressSlotSources, pressSwap, runDay, starBench, type BenchSource, type Job, type JobStats, type Runner, type StatsRunner, type TourneyOpts,
} from "../src/sim/harness/tournament";
import { factorySections } from "../src/sim/harness/report";

const O: TourneyOpts = { ...DEFAULT_OPTS, pop: 6, gauntlet: 3, elites: 2, seeds: 1, days: [7], calibrationDays: [7], stars: "on", cores: "on", factories: "on" };

/** A deck of `hero` with `def` placed by the press lever (the shop narrowed to it), plus some gates. */
function withFactory(hero: HeroId, def: string, seed: number): Build {
  for (let k = 0; k < 40; k++) {
    const s = new Shopper(heroStartBuild(hero, 1), 200, 7, new Rng(hashSeed("fb", hero, def, seed, k)), "on", FUSE_MAX, "off", "on");
    (s as unknown as { factories: ItemDef[] }).factories = [ITEMS[def]];
    if (!applyLever(s, "press")) continue;
    for (let i = 0; i < 3; i++) applyLever(s, "gate");
    if (s.b.items.some((p) => p.def === def) && !unfusedPairs(s.b).length) return s.b;
  }
  throw new Error(`no ${def} deck for ${hero}`);
}

describe("factory bench (0.6.1c)", () => {
  it("FACTORY_DEFS: STAMP PRESS first, then the six", () => {
    expect(FACTORY_DEFS[0]).toBe("press");
    expect([...FACTORY_DEFS].sort()).toEqual(["assembly", "doublestamp", "gantry", "hotswap", "press", "shottower", "slagpot"]);
  });

  it("factory rows are paired: every 2- and 3-star variant of a factory plays each gauntlet member on its 1-star deck's seeds, and the FACTORY table reads exactly those decks", async () => {
    const gauntlet = (["furnace", "weaver", "foundry"] as HeroId[]).map((h, i) => randomBuild(h, 7, new Rng(hashSeed("fb-g", i)), "on", FUSE_MAX, "on", "on"));
    const sources: BenchSource[] = [];
    FACTORY_DEFS.forEach((def, i) => sources.push({ hero: "foundry", tag: `foundry elite ${i}`, build: withFactory("foundry", def, i) }));
    sources.push({ hero: "furnace", tag: "furnace par", build: withFactory("furnace", "gantry", 9), par: true });
    const played: { deck: string; b: number; seeds: number[] }[] = [];
    const rec: Runner = async (field, jobs) => {
      for (const j of jobs) played.push({ deck: JSON.stringify(field[j.a]), b: j.b - (field.length - gauntlet.length), seeds: j.seeds });
      return localRunner(field, jobs);
    };
    const res = await starBench(O, 7, gauntlet, sources, rec, localDetail);
    sources.forEach((s, src) => {
      const f = s.build.items.find((p) => FACTORY_DEFS.includes(p.def) && starsOf(p) === 1)!;
      for (const star of [1, 2, 3]) {
        const v = JSON.parse(JSON.stringify(s.build)) as Build;
        const p = v.items.find((q) => q.uid === f.uid)!;
        if (star > 1) p.stars = star;
        const jobs = played.filter((x) => x.deck === JSON.stringify(v));
        expect(jobs.length, `${s.tag} ${f.def} ★${star}`).toBe(gauntlet.length);
        for (const j of jobs) expect(j.seeds, `${s.tag} ${f.def} ★${star} vs g${j.b}`).toEqual(benchSeeds(O, 7, src, j.b));
      }
    });
    const rows = factoryRows(res.rows, sources);
    for (const def of FACTORY_DEFS) {
      const r = rows.find((x) => x.def === def)!;
      const r2 = res.rows.find((x) => x.def === def && x.star === 2)!, r3 = res.rows.find((x) => x.def === def && x.star === 3)!;
      expect(r.all.decks).toEqual(r2.decks);
      expect(r.all.steps).toEqual(r3.step!.decks);
      expect(r.all.d12).toBeCloseTo(r2.decks.reduce((s, d) => s + d.delta, 0) / r2.decks.length, 12);
      expect(r.byHero.reduce((s, h) => s + h.n, 0)).toBe(r.all.n);
    }
    const g = rows.find((x) => x.def === "gantry")!;
    expect(g.byRoutes!.map((x) => x.key)).toEqual(["1 route", "2 routes", "3 routes"]);
    expect(g.byRoutes!.reduce((s, x) => s + x.n, 0)).toBe(g.all.n);
    const furnaceGantry = sources.find((s) => s.tag === "furnace par")!.build;
    expect(routesOf(furnaceGantry, furnaceGantry.items.find((p) => p.def === "gantry")!.uid).length).toBe(1); // FURNACE: one free connector
    expect(g.byRoutes![0].decks.some((d) => d.tag === "furnace par")).toBe(true);
  }, 120_000);

  it("PRESS-SLOT rows play the swapped decks (the Press replaced in place by each factory at 1-3 stars), every variant of a deck on the same seeds", async () => {
    const gauntlet = (["weaver", "bastion"] as HeroId[]).map((h, i) => randomBuild(h, 7, new Rng(hashSeed("ps-g", i)), "on", FUSE_MAX, "on", "on"));
    const field: BenchSource[] = [{ hero: "foundry", tag: "foundry elite 0", build: withFactory("foundry", "press", 1) }, { hero: "foundry", tag: "foundry elite 1", build: withFactory("foundry", "hotswap", 1) }];
    const sources = pressSlotSources(field);
    expect(sources.map((s) => s.tag)).toEqual(["par/furnace/6 (arsenal)", "foundry elite 0"]); // decks without a Press are left out
    const played: { deck: string; b: number; seeds: number[] }[] = [];
    const rec: StatsRunner = async (f, jobs) => {
      for (const j of jobs) played.push({ deck: JSON.stringify(f[j.a]), b: j.b - (f.length - gauntlet.length), seeds: j.seeds });
      return localStats(f, jobs);
    };
    const ps = await pressSlotBench(O, 7, gauntlet, sources, rec);
    expect(ps.decks.map((d) => d.tag)).toEqual(sources.map((s) => s.tag));
    sources.forEach((s, src) => {
      for (const def of FACTORY_DEFS) {
        for (const star of [1, 2, 3]) {
          const v = pressSwap(s.build, def, star);
          const p = v.items.find((q) => q.def === def && starsOf(q) === star && s.build.items.find((o) => o.uid === q.uid)?.def === "press");
          expect(p, `${s.tag} ${def} ★${star}: the Press's uid now holds ${def}`).toBeDefined();
          const jobs = played.filter((x) => x.deck === JSON.stringify(v));
          if (unfusedPairs(v).length) { expect(jobs.length).toBe(0); expect(ps.decks[src].cells[def][star - 1]).toBeNull(); continue; }
          expect(jobs.length, `${s.tag} ${def} ★${star}`).toBe(gauntlet.length);
          for (const j of jobs) expect(j.seeds).toEqual(focusSeeds(O, 7, src, j.b, PRESS_SLOT_KEY));
          const sum = jobs.reduce((t, j) => { const x = jobStats([...[JSON.parse(j.deck) as Build], ...gauntlet], { a: 0, b: 1 + j.b, seeds: j.seeds }); return { pts: t.pts + x.pts, dmg: t.dmg + x.dmg, jams: t.jams + x.jams }; }, { pts: 0, dmg: 0, jams: 0 } as JobStats);
          expect(ps.decks[src].cells[def][star - 1]).toEqual(sum);
        }
      }
    });
    // the swap keeps the Press's cell and route
    const b = sources[0].build, sw = pressSwap(b, "gantry", 2);
    const p0 = b.items.find((p) => p.def === "press")!, p1 = sw.items.find((p) => p.uid === p0.uid)!;
    expect([p1.def, p1.x, p1.y, starsOf(p1)]).toEqual(["gantry", p0.x, p0.y, 2]);
    expect(sw.routes).toEqual(b.routes);
  }, 120_000);

  it("jobStats: the same battles as playJob (its points are playJob's exactly); damage and jams are the deck's side", () => {
    const a = heroRefBuild("furnace", 6), b = heroRefBuild("weaver", 6);
    const j: Job = { a: 0, b: 1, seeds: [11, 12] };
    expect(jobStats([a, b], j).pts).toBe(playJob([a, b], j));
    expect(jobStats([a, b], j).dmg).toBeGreaterThan(0);
  });

  it("the arsenal's press-slot deck is the golden-060 fixture's par/furnace/6 (and par/weaver/6 its opponent); arsenalPressSlot is its report-only table", () => {
    const par = JSON.parse(readFileSync(new URL("./fixtures/golden-060/par.json", import.meta.url), "utf8")) as { decks: Record<string, Build> };
    expect(JSON.stringify(heroRefBuild("furnace", 6))).toBe(JSON.stringify(par.decks["par/furnace/6"]));
    expect(JSON.stringify(heroRefBuild("weaver", 6))).toBe(JSON.stringify(par.decks["par/weaver/6"]));
    const rows = arsenalPressSlot();
    expect(rows.map((r) => r.def)).toEqual([...FACTORY_DEFS]);
    for (const r of rows) for (const x of r.dmg) expect(x).toBeGreaterThan(0);
  });

  it("factoryUseOf: decks per factory, their stars, GANTRY routes, speed gates on a slag route", () => {
    const g = withFactory("foundry", "gantry", 3);
    const gu = g.items.find((p) => p.def === "gantry")!;
    gu.stars = 2;
    const u = factoryUseOf([g, heroStartBuild("furnace", 1)], [{ slag: { skipped: 1, steered: 2 }, thirdArm: 1 }, { slag: { skipped: 0, steered: 1 }, thirdArm: 0 }]);
    expect(u.builds).toBe(2);
    expect(u.byDef.gantry).toEqual({ decks: 1, stars: [0, 1, 0] });
    const n = routesOf(g, gu.uid).length;
    expect(u.gantryRoutes[n - 1]).toBe(1);
    expect(u.slag).toEqual({ skipped: 1, steered: 3 });
    expect(u.thirdArm).toBe(1);
    expect(u.slagSpeed).toBe(0);
  });

  it("a small day, factories on, carries the usage table, the FACTORY table and PRESS-SLOT; factories off carries none (part 2's day exactly)", async () => {
    // day 3 (not 7): the same assertions in about 9 s instead of 22 s (alone), so the suite's wall-clock check (part 1's
    // tiny run in tests/harness.tournament.test.ts, under 30 s) keeps more margin when this file runs beside it
    const small: TourneyOpts = { ...O, heroes: ["furnace", "foundry"], pop: 4, gauntlet: 2, elites: 1, days: [3], calibrationDays: [3] };
    const on = await runDay(small, 3, localRunner, localDetail, localStats);
    expect(on.factoryUse && on.pressSlot && on.factory).toBeTruthy();
    expect(Object.keys(on.factoryUse!).sort()).toEqual(["foundry", "furnace"]);
    expect(on.pressSlot!.decks[0].tag).toBe("par/furnace/6 (arsenal)");
    expect(factorySections([on], small.heroes).join("\n")).toContain("## FACTORY table");
    const offO: TourneyOpts = { ...small, factories: "off" };
    const off = await runDay(offO, 3, localRunner, localDetail, localStats);
    expect("factoryUse" in off || "factory" in off || "pressSlot" in off).toBe(false);
    const { factories: _f, ...o2 } = offO;
    expect(JSON.stringify(await runDay(o2 as TourneyOpts, 3, localRunner, localDetail))).toBe(JSON.stringify(off));
  }, 240_000);
});

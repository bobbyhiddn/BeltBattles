// 0.6.2 step 5 (REQ-BFG-033 clause 2; M2): the caravan-bound stand-in population. `standins --source caravan` draws
// its candidates and its gauntlet from par-player runs through the game's caravan (src/sim/harness/caravan.ts):
// a fixed policy mix, run seeds disjoint from the par field's, one run per candidate for every day. Every candidate is
// legal, fused, within budget and at most 2 stars; a deck's turrets and joins pass through selection and the stored code;
// the generation is deterministic and resumable; --par-band is off unless asked for.
// M5 (REQ-BFG-033: honesty is gold spent): a caravan pool's tuples carry each pick's gold spent as a sixth element,
// which the written-module guard checks and the loader returns (StandInEntry.spent); a full-purse pool is unchanged.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { hashSeed } from "../src/core/rng";
import { ITEMS, type HeroId } from "../src/sim/content";
import { footprint, hullSlots, installTurret, key as K, kx, ky, occupancy, routeInfo, setJoin, type Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { STAND_IN_POOL_HEROES, decodeStarred as loadStarred, standInPool } from "../src/sim/standInPool";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import {
  CARAVAN_MIX, CARAVAN_POLICY, caravanCandidate, caravanDeck, caravanGauntlet, caravanGauntletSeedOf, caravanPolicyOf, caravanSeedOf, deckStats,
} from "../src/sim/harness/caravan";
import { spendFloor } from "../src/sim/harness/gen";
import { parSeeds } from "../src/sim/harness/par";
import { PLAYER_DAYS, playerBuild, playerRun } from "../src/sim/harness/player";
import { decodeStarred, encodeStarred } from "../src/sim/harness/standinCode";
import {
  STANDIN_DEFAULTS, STANDIN_MAX_STARS, caravanCand, dataModuleText, eligibleOf, genStandIns, maxStarsOf, parBandGap, pickBest, pickWindow,
  spentOf, standInCommand, writtenPicks, writtenProblems, type Cand, type DayResult, type HeroDay, type StandInOpts,
} from "../src/sim/harness/standins";
import type { Runner } from "../src/sim/harness/tournament";
import { FUSE_MAX } from "../src/sim/stars";

const HEROES = ["furnace", "weaver"] as const;

describe("M2: the caravan population (src/sim/harness/caravan.ts)", () => {
  it("a fixed mix of 1/2 typical, 1/4 sharp, 1/4 loose at every population size; loose is typical with impulse 1", () => {
    for (const n of [64, 128, 256]) {
      const count = (p: string) => Array.from({ length: n }, (_, i) => caravanPolicyOf(i)).filter((x) => x === p).length;
      expect([count("typical"), count("sharp"), count("loose")], `pop ${n}`).toEqual([n / 2, n / 4, n / 4]);
    }
    expect(CARAVAN_MIX).toEqual(["typical", "typical", "sharp", "loose"]);
    expect(CARAVAN_POLICY.loose).toEqual({ policy: "typical", tune: { impulse: 1 } });
  });

  it("run seeds are disjoint from the par field's (1..12), from the gauntlet's and across generator seeds", () => {
    const par = new Set(parSeeds());
    const all = new Set<number>();
    for (const seed of [1, 2, 3]) {
      const pop = Array.from({ length: 256 }, (_, i) => caravanSeedOf(seed, i)), g = Array.from({ length: 20 }, (_, i) => caravanGauntletSeedOf(seed, i));
      for (const s of [...pop, ...g]) {
        expect(par.has(s), `seed ${s}`).toBe(false);
        expect(all.has(s), `seed ${s} used twice`).toBe(false);
        all.add(s);
      }
    }
    expect(caravanSeedOf(1, 0)).toBe(1000);
    expect(caravanGauntletSeedOf(1, 0)).toBe(5000);
    expect(() => caravanSeedOf(1, 4000)).toThrow(/out of range/);
  });

  it("one run per candidate serves every day: candidate idx's day-d deck is day d of its policy's run, capped at 2 stars", () => {
    for (const hero of HEROES) {
      for (const idx of [0, 1, 2, 3, 6, 7]) {
        const pol = caravanPolicyOf(idx), seed = caravanSeedOf(1, idx);
        const run = playerRun(hero, PLAYER_DAYS, seed, { ...CARAVAN_POLICY[pol], maxStars: STANDIN_MAX_STARS });
        for (const day of [1, 4, 10]) {
          const d = caravanCandidate(hero, day, 1, idx, STANDIN_MAX_STARS);
          expect(JSON.stringify(d.build), `${hero} #${idx} d${day}`).toBe(JSON.stringify(run[day - 1].build));
          expect([d.meta.policy, d.meta.seed]).toEqual([pol, seed]);
        }
      }
      // the gauntlet: typical, uncapped, its own seeds
      expect(JSON.stringify(caravanGauntlet(hero, 5, 1, 3))).toBe(JSON.stringify(playerBuild(hero, 5, caravanGauntletSeedOf(1, 3))));
    }
  });

  it("every candidate is legal, fused, within budget and at most 2 stars; its gold adds up; the spend floor counts rerolls and sale losses", () => {
    let n = 0, met = 0, withTurrets = 0;
    const policies = new Set<string>();
    for (const hero of HEROES) {
      for (let idx = 0; idx < 12; idx++) {
        for (let day = 1; day <= 10; day++) {
          const d = caravanCandidate(hero, day, 1, idx, STANDIN_MAX_STARS);
          const at = `${hero} #${idx} (${d.meta.policy} ${d.meta.seed}) d${day}`;
          expect(validateBuild(d.build, day).errors, at).toEqual([]);
          expect(unfusedPairs(d.build), at).toEqual([]);
          expect(d.value, at).toBe(buildCost(d.build).total);
          expect(d.value, at).toBeLessThanOrEqual(maxGoldByDay(day));
          expect(maxStarsOf(d.build), at).toBeLessThanOrEqual(STANDIN_MAX_STARS);
          expect(d.meta.cargoGold, at).toBe(0); // deck + rerolls + sale losses + unspent = maxGoldByDay
          expect(d.meta.spent, at).toBe(d.value + d.meta.rerollGold + d.meta.soldLoss);
          expect(d.meta.spent + d.meta.unspent, at).toBe(maxGoldByDay(day));
          expect(d.floorMet, at).toBe(d.meta.spent >= spendFloor(day));
          // the candidate as scored: normalised through the stored code, its value as the cost
          const c = caravanCand(idx, d);
          expect(c.cost, at).toBe(d.value);
          expect(c.code, at).toBe(encodeStarred(c.build));
          expect(JSON.stringify(decodeStarred(hero, c.code)), at).toBe(JSON.stringify(c.build));
          expect(c.caravan).toEqual(d.meta);
          n++;
          if (d.floorMet) met++;
          if (d.build.turrets) withTurrets++;
          policies.add(d.meta.policy);
        }
      }
    }
    expect(n).toBe(240);
    expect(policies).toEqual(new Set(["typical", "sharp", "loose"]));
    expect(met).toBeGreaterThan(n / 2);
    // at this base a turret offer that merges into the hull's starting turret is bought, so some decks carry
    // Build.turrets (a 2-star free starting copy); the code keeps it (standin.turrets.test.ts)
    expect(withTurrets).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- the pass-through (brief M2: a faked deck)

const CRATE = ITEMS.beltcrate.supply!.belt!;

/** Free cells (no machinery, no belt). */
function freeCells(b: Build): Set<number> {
  const occ = occupancy(b), out = new Set<number>();
  occ.forEach((o, k) => { if (o.item < 0 && o.route < 0) out.add(k); });
  return out;
}
const around = (k: number) => [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => [kx(k) + dx, ky(k) + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < 10 && y < 10).map(([x, y]) => K(x, y));

/**
 * A playerBuild deck of day `from` with the coming mechanics faked in: a DECK GUN bought into the hull's empty extra slot
 * (installTurret) and a new factory the deck doesn't hold, whose belt (the shortest from a free 2x2 spot off the forward
 * row) ends beside a tile of a connected belt and joins it there (setJoin); belt crates as needed. Legal on day `to`.
 */
function fakedDeck(hero: HeroId, from: number, seed: number, to: number): Build {
  const b = playerBuild(hero, from, seed);
  const extra = hullSlots(hero).findIndex((s) => !s.start);
  expect(installTurret(b, { uid: 900, def: "deckgun" }, extra).ok).toBe(true);
  const def = ["slagpot", "shottower", "doublestamp", "gantry", "assembly"].find((d) => !b.items.some((p) => p.def === d))!;
  const size = ITEMS[def].size;
  const connected = b.routes.map((_, i) => routeInfo(b, i).connected);
  for (let y = 1; y + size <= 10; y++) {
    for (let x = 0; x + size <= 10; x++) {
      const free = freeCells(b), fp = footprint(ITEMS[def], x, y);
      if (!fp.every((k) => free.has(k))) continue;
      for (const k of fp) free.delete(k);
      // BFS over free cells from the cells beside the footprint to a cell beside a connected belt's tile
      const occ = occupancy(b);
      const target = (k: number) => around(k).find((t) => occ[t].route >= 0 && connected[occ[t].route]);
      const prev = new Map<number, number>();
      let queue = [...new Set(fp.flatMap(around))].filter((k) => free.has(k));
      for (const k of queue) prev.set(k, -1);
      let end = -1;
      while (queue.length && end < 0) {
        const next: number[] = [];
        for (const k of queue) {
          if (target(k) !== undefined) { end = k; break; }
          for (const n of around(k)) if (free.has(n) && !prev.has(n)) { prev.set(n, k); next.push(n); }
        }
        queue = next;
      }
      if (end < 0) continue;
      const cells: number[] = [];
      for (let k = end; k >= 0; k = prev.get(k)!) cells.unshift(k);
      const trial = JSON.parse(JSON.stringify(b)) as Build;
      trial.items.push({ uid: 901, def, x, y });
      trial.routes.push({ factory: 901, cells });
      while (trial.routes.reduce((s, r) => s + r.cells.length, 0) > trial.beltCap) trial.beltCap += CRATE;
      if (setJoin(trial, trial.routes.length - 1, target(end)!) !== null) continue;
      if (validateBuild(trial, to).ok) return trial;
    }
  }
  throw new Error(`no faked join for ${hero} d${from} s${seed}`);
}

/**
 * 0.6.2 CAND-A: the par player draws joins and fills more of the grid, so the faked deck starts from the first seed from
 * `seed` on whose day-`from` deck holds no join and leaves room for the faked one (the assertions count exactly one join).
 */
function fakedDeckFrom(hero: HeroId, from: number, seed: number, to: number): Build {
  for (let s = seed; s < seed + 24; s++) {
    if (playerBuild(hero, from, s).routes.some((r) => r.join !== undefined)) continue;
    try {
      return fakedDeck(hero, from, s, to);
    } catch {
      // no room for the faked factory and its joining belt on this seed's deck: the next seed
    }
  }
  throw new Error(`no faked join for ${hero} d${from} from s${seed}`);
}

function hd(o: StandInOpts, hero: HeroId, day: number, pop: Cand[]): HeroDay {
  const sel = pickWindow(pop, eligibleOf(pop, o, false), o)!;
  return {
    hero, day, budget: maxGoldByDay(day), floor: spendFloor(day), pop, picks: sel.picks, par: sel.par, window: sel.window, relax: "none", widened: sel.widened,
    short: false, elites: [], parVsRef: {}, parVsElites: 0, robustRemoved: 0, robustReplayed: 0, capAffected: 0, capWould3: 0,
  };
}

describe("M2: turrets and joins pass through the generator (a faked playerBuild deck)", () => {
  it("a playerBuild deck with a turret installed and a belt joined goes through selection, the written module, decode and validateBuild", () => {
    const o: StandInOpts = { ...STANDIN_DEFAULTS, source: "caravan", par: "field", per: 2, band: [40, 60] };
    for (const hero of HEROES) {
      const day = 7;
      const faked = fakedDeckFrom(hero, 4, 3, day);
      expect(faked.turrets?.some((t) => t.def === "deckgun")).toBe(true);
      expect(faked.routes.filter((r) => r.join !== undefined)).toHaveLength(1);
      // the faked deck as a candidate: normalised through the stored code, like every caravan candidate
      const meta = { policy: "typical" as const, seed: 0, spent: buildCost(faked).total, rerollGold: 0, soldLoss: 0, unspent: maxGoldByDay(day) - buildCost(faked).total, cargoGold: 0 };
      const f = caravanCand(8, { build: faked, floorMet: true, meta });
      expect(f.code).toMatch(/>\d\d/);
      expect(f.code.split("/")).toHaveLength(5);
      expect(deckStats(f.build)).toMatchObject({ turretsField: true, beyondStart: 1, joins: 1 });
      // a population of eight: seven real caravan candidates around it; the faked one scores in the window's middle
      const pop = [...Array.from({ length: 7 }, (_, i) => caravanCand(i, caravanCandidate(hero, day, 1, i, STANDIN_MAX_STARS))), f];
      const pcts = [0, 14.3, 28.6, 42.9, 71.4, 85.7, 100, 57.1];
      pop.forEach((c, i) => Object.assign(c, { pct: pcts[i], score: pcts[i] / 100, vsPar: 0.7, vsRef: { furnace: 0.7, weaver: 0.7 }, floorMet: true }));
      const h = hd(o, hero, day, pop);
      expect(h.picks.map((p) => p.idx)).toContain(8);
      // the written module stores it and reads it back to exactly the scored deck, legal on its day
      const text = dataModuleText(o, [h]);
      expect(writtenProblems(o, [h], text)).toEqual([]);
      const w = writtenPicks(text).find((x) => x.code === f.code)!;
      expect(w).toBeDefined();
      const back = decodeStarred(hero, w.code), game = loadStarred(hero, w.code);
      expect(JSON.stringify(back)).toBe(JSON.stringify(f.build));
      expect(JSON.stringify(game)).toBe(JSON.stringify(f.build)); // the game's load boundary too
      expect(back.turrets).toEqual(f.build.turrets);
      expect(back.routes.map((r) => r.join)).toEqual(f.build.routes.map((r) => r.join));
      expect(validateBuild(back, day).errors).toEqual([]);
      expect(w.cost).toBe(buildCost(faked).total);
    }
  });
});

// ---------------------------------------------------------------- the generator

/** A deterministic fake runner: each job's points from a hash of the two decks' codes and the seeds (no battles). */
const fakeRun: Runner = async (field, jobs) => jobs.map((j) => hashSeed("fake", encodeStarred(field[j.a]), encodeStarred(field[j.b]), ...j.seeds) % (2 * j.seeds.length + 1));

describe("M2: genStandIns --source caravan", () => {
  const tiny: StandInOpts = { ...STANDIN_DEFAULTS, pop: 8, gauntlet: 1, seeds: 1, elites: 1, refSeeds: 1, per: 2, grow: [12], stars: "on", par: "field", source: "caravan" };

  it("is deterministic, stores only caravan candidates, every pick legal, fused and within budget; the header replays it", async () => {
    const a = await genStandIns(tiny, fakeRun), b = await genStandIns(tiny, fakeRun);
    const text = dataModuleText(tiny, a.days);
    expect(dataModuleText(tiny, b.days)).toBe(text);
    expect(a.battles).toBe(b.battles);
    expect(writtenProblems(tiny, a.days, text)).toEqual([]);
    expect(text).toContain("--par field --source caravan");
    expect(text).toContain("caravan-bound decks per");
    expect(text).toContain("policies typical, typical, sharp, loose by index (loose: typical with impulse 1); run seeds");
    expect(a.days).toHaveLength(20);
    for (const h of a.days) {
      for (const p of h.pop) {
        // each candidate is exactly its policy's run (normalised), with its run's meta
        const d = caravanCandidate(h.hero, h.day, tiny.seed, p.idx, STANDIN_MAX_STARS);
        expect(p.caravan).toEqual(d.meta);
        expect(p.code).toBe(encodeStarred(d.build));
        expect(p.floorMet).toBe(d.floorMet);
      }
      for (const p of h.picks) {
        expect(validateBuild(p.build, h.day).errors).toEqual([]);
        expect(unfusedPairs(p.build)).toEqual([]);
        expect(p.cost).toBeLessThanOrEqual(maxGoldByDay(h.day));
        expect(maxStarsOf(p.build)).toBeLessThanOrEqual(2);
      }
      // F8: the 2-star cap report compares with the same player uncapped
      const uncapped = h.pop.filter((p) => encodeStarred(caravanCandidate(h.hero, h.day, tiny.seed, p.idx, FUSE_MAX).build) !== p.code).length;
      expect(h.capAffected).toBe(uncapped);
    }
  }, 120_000);

  it("resumes: days loaded from a saved run give the same module and battles as playing them", async () => {
    const saved = new Map<number, string>();
    const full = await genStandIns(tiny, fakeRun, undefined, { save: (day, r) => saved.set(day, JSON.stringify(r)) });
    expect([...saved.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    let played = 0;
    const counting: Runner = async (field, jobs) => { played += jobs.length; return fakeRun(field, jobs); };
    const half = await genStandIns(tiny, counting, undefined, { load: (day) => (day <= 6 ? JSON.parse(saved.get(day)!) as DayResult : undefined) });
    expect(dataModuleText(tiny, half.days)).toBe(dataModuleText(tiny, full.days));
    expect(half.battles).toBe(full.battles);
    expect(writtenProblems(tiny, half.days, dataModuleText(tiny, half.days))).toEqual([]);
    expect(played).toBeGreaterThan(0); // days 7-10 were played
  }, 120_000);

  it("refuses the caravan source with stars off", async () => {
    await expect(genStandIns({ ...tiny, stars: "off" }, fakeRun)).rejects.toThrow(/stars on/);
  });
});

describe("M2: --par-band (off by default) and the header command", () => {
  const cand = (idx: number, pct: number, vsPar: number): Cand => ({ idx, build: { hero: "furnace", items: [], routes: [], mods: [], beltCap: 14, hullBonus: 0 }, code: "", cost: 0, tries: 1, floorMet: true, score: pct / 100, pct, vsRef: {}, vsPar });

  it("off: eligibility and (d) are exactly as before; on: a pick needs lo <= vsPar <= hi and (d) takes the builds nearest the band", () => {
    const pop = [cand(0, 45, 0.95), cand(1, 50, 0.55), cand(2, 55, 0.62), cand(3, 60, 0.5), cand(4, 65, 0.45), cand(5, 70, 0.58), cand(6, 99, 0.9), cand(7, 10, 0.3)];
    const o: StandInOpts = { ...STANDIN_DEFAULTS, per: 2 };
    expect(parBandGap(o, 0.95)).toBe(0);
    expect(eligibleOf(pop, o, false).map((c) => c.idx)).toEqual([0, 1, 2, 3, 5]);
    const banded = { ...o, parBand: [0.5, 0.6] as [number, number] };
    expect(eligibleOf(pop, banded, false).map((c) => c.idx)).toEqual([1, 3, 5]);
    expect(parBandGap(banded, 0.62)).toBeCloseTo(0.02);
    expect(parBandGap(banded, 0.45)).toBeCloseTo(0.05);
    // (d) off: the highest vsPar first; on: inside the band first, then the nearest
    expect(pickBest(pop, { ...o, per: 3 }).picks.map((c) => c.idx).sort()).toEqual([0, 2, 6]);
    expect(pickBest(pop, { ...banded, per: 3 }).picks.map((c) => c.idx).sort()).toEqual([1, 3, 5]);
    expect(pickBest(pop, { ...banded, per: 4 }).picks.map((c) => c.idx).sort()).toEqual([1, 2, 3, 5]);
  });

  it("the header prints --source for every pool but the legacy full-purse + heroref one, and --par-band when set", () => {
    const cli: StandInOpts = { ...STANDIN_DEFAULTS, cores: "on", factories: "on" }; // the CLI's stars, cores and factories
    const base = standInCommand(cli); // absent source and par: pool v2.1's header exactly
    // the committed module's header (line 2) is one of them: pool v2.1's legacy header, or the step-5 regen's (the CLI
    // defaults: --par field --source caravan, with --par-band when the regen used it), so its own command replays it
    const header = readFileSync(new URL("../src/sim/standInPoolData.ts", import.meta.url), "utf8").split("\n")[1];
    const band = / --par-band ([\d.]+),([\d.]+)$/.exec(header);
    const regen: StandInOpts = { ...cli, source: "caravan", par: "field", ...(band ? { parBand: [Number(band[1]), Number(band[2])] as [number, number] } : {}) };
    expect([`//   ${base}`, `//   ${standInCommand(regen)}`]).toContain(header);
    if (!header.includes("--source")) expect(header).toBe(`//   ${base}`); // pool v2.1
    expect(base).not.toMatch(/--source|--par (field|heroref)|--par-band/);
    expect(standInCommand({ ...cli, source: "fullpurse", par: "heroref" })).toBe(base);
    expect(standInCommand({ ...cli, source: "fullpurse", par: "field" })).toBe(`${base} --par field --source fullpurse`);
    expect(standInCommand({ ...cli, source: "caravan", par: "field" })).toBe(`${base} --par field --source caravan`);
    expect(standInCommand({ ...cli, source: "caravan", par: "heroref" })).toBe(`${base} --par heroref --source caravan`);
    expect(standInCommand({ ...cli, source: "caravan", par: "field", parBand: [0.5, 0.6] })).toBe(`${base} --par field --source caravan --par-band 0.5,0.6`);
    expect(base).toBe("npm run standins -- --seed 1 --pop 64 --band 40,60 --per 6 --par-floor 50 --factories on");
  });
});

describe("M2: deckStats (the dry run's turret and join counts)", () => {
  it("counts merged starting turrets, turrets beyond the starting layout and joins", () => {
    const p = [1, 2, 3, 4, 5].map((s) => playerBuild("furnace", 3, s)).find((x) => !x.turrets)!;
    // 0.6.2 CAND-A: the par player draws joins, so its deck counts its own; the same deck with its joins cleared counts none
    expect(deckStats(p).joins).toBe(p.routes.filter((r) => r.join !== undefined).length);
    const b = JSON.parse(JSON.stringify(p)) as Build;
    for (const r of b.routes) delete r.join;
    expect(deckStats(b)).toMatchObject({ turretsField: false, mergedStart: 0, beyondStart: 0, joins: 0 });
    const m = JSON.parse(JSON.stringify(b)) as Build;
    m.turrets = [{ slot: 0, def: "scrapcannon", uid: 90, stars: 2, free: true }];
    expect(deckStats(m)).toMatchObject({ turretsField: true, mergedStart: 1, beyondStart: 0, star2: expect.any(Number) });
    expect(deckStats(m).star2).toBe(deckStats(b).star2 + 1);
    expect(caravanDeck("weaver", 2, 1000, "typical", 2).meta.policy).toBe("typical");
  });
});

// ---------------------------------------------------------------- M5: the gold spent (the sixth tuple element)

/** The STAND_IN_DATA literal of a generated module's text: the data the game would load from it. */
function moduleData(text: string): unknown {
  const head = "export const STAND_IN_DATA: StandInData = ";
  const at = text.indexOf(head);
  expect(at).toBeGreaterThan(0);
  return new Function(`return (${text.slice(at + head.length).replace(/;\s*$/, "")});`)() as unknown;
}

/** A fresh copy of the game's loader (src/sim/standInPool.ts) whose data module is `data`. */
async function loaderWith(data: unknown): Promise<typeof import("../src/sim/standInPool")> {
  vi.resetModules();
  vi.doMock("../src/sim/standInPoolData", () => ({ STAND_IN_DATA: data }));
  try {
    return await import("../src/sim/standInPool");
  } finally {
    vi.doUnmock("../src/sim/standInPoolData");
    vi.resetModules();
  }
}

/** Line 2 of the committed data module: its command. Pool v2.1's legacy header has no --source. */
const committedHeader = (): string => readFileSync(new URL("../src/sim/standInPoolData.ts", import.meta.url), "utf8").split("\n")[1];

describe("M5: a caravan pool stores each pick's gold spent (REQ-BFG-033), a full-purse pool doesn't", () => {
  const tiny: StandInOpts = { ...STANDIN_DEFAULTS, pop: 8, gauntlet: 1, seeds: 1, elites: 1, refSeeds: 1, per: 2, grow: [12], stars: "on", par: "field", source: "caravan" };
  const TUPLES_CARAVAN = "// Tuples are [cost (gold), pct, score (win rate vs the gauntlet), build code, vsPar (0-1), spent (gold)]; each day is";
  const TUPLES_V21 = "// Tuples are [cost (gold), pct, score (win rate vs the gauntlet), build code, vsPar (0-1)]; each day is";
  const TYPE_CARAVAN = "export type StandInTuple = readonly [cost: number, pct: number, score: number, build: string, vsPar: number, spent: number];";
  const TYPE_V21 = "export type StandInTuple = readonly [cost: number, pct: number, score: number, build: string, vsPar: number];";

  it("a caravan pool (fake runner) writes each pick's gold spent as a sixth element, the guard checks it, and the loader returns it", async () => {
    const res = await genStandIns(tiny, fakeRun);
    const text = dataModuleText(tiny, res.days);
    expect(writtenProblems(tiny, res.days, text)).toEqual([]);
    const written = writtenPicks(text);
    expect(written).toHaveLength(20 * tiny.per);
    let above = 0;
    for (const hd of res.days) {
      hd.picks.forEach((p, i) => {
        const w = written.find((x) => x.hero === hd.hero && x.day === hd.day && x.i === i)!, m = p.caravan!, at = `${hd.hero} d${hd.day} #${p.idx}`;
        expect(w.spent, at).toBe(spentOf(p));
        expect(w.spent, at).toBe(m.spent);
        expect(w.spent, at).toBe(p.cost + m.rerollGold + m.soldLoss); // cargoGold is 0: the deck, the rerolls and the sale losses
        expect(w.cost, at).toBe(p.cost);
        if (m.spent > p.cost) above++;
      });
    }
    expect(above).toBeGreaterThan(0); // some picks rerolled or sold at a loss, so spent says more than the cost
    // the guard: a stored spent that is not the scored candidate's is reported, and so is a missing one
    const lines = text.split("\n"), k = lines.findIndex((l) => /^ {8}\[.*, \d+\],$/.test(l));
    const off = [...lines], five = [...lines];
    off[k] = off[k].replace(/, (\d+)\],$/, (_, s: string) => `, ${Number(s) + 1}],`);
    five[k] = five[k].replace(/, \d+\],$/, "],");
    expect(writtenProblems(tiny, res.days, off.join("\n")).filter((x) => x.includes("stored spent"))).toHaveLength(1);
    expect(writtenProblems(tiny, res.days, five.join("\n")).filter((x) => x.includes("stored spent (none)"))).toHaveLength(1);
    // the game's loader reads the written module: each entry's spent beside its cost, in the stored order
    const L = await loaderWith(moduleData(text));
    for (const hd of res.days) {
      expect(L.standInPool(hd.hero, hd.day).map((e) => [e.cost, e.spent]), `${hd.hero} d${hd.day}`).toEqual(hd.picks.map((p) => [p.cost, spentOf(p)]));
    }
  }, 120_000);

  it("a full-purse pool is written as before (five elements) and its entries' spent is their cost", async () => {
    const fp: StandInOpts = { ...tiny, source: "fullpurse", par: "heroref" }; // the legacy options of pool v2.1
    const res = await genStandIns(fp, fakeRun);
    const text = dataModuleText(fp, res.days);
    expect(writtenProblems(fp, res.days, text)).toEqual([]);
    expect(writtenPicks(text)).toHaveLength(20 * fp.per);
    for (const w of writtenPicks(text)) expect(w.spent).toBeUndefined();
    const L = await loaderWith(moduleData(text));
    for (const hd of res.days) expect(L.standInPool(hd.hero, hd.day).map((e) => [e.cost, e.spent])).toEqual(hd.picks.map((p) => [p.cost, p.cost]));
  }, 120_000);

  it("the committed pool: pool v2.1's entries (five elements) have spent = cost; a caravan pool's carry their sixth", () => {
    const legacy = !committedHeader().includes("--source");
    let n = 0;
    for (const hero of STAND_IN_POOL_HEROES) {
      for (let day = 1; day <= 10; day++) {
        const tuples: readonly (readonly unknown[])[] = STAND_IN_DATA.pools[hero]![day - 1][1], es = standInPool(hero, day);
        expect(es).toHaveLength(tuples.length);
        es.forEach((e, i) => {
          expect(tuples[i], `${hero} d${day} #${i}`).toHaveLength(legacy ? 5 : 6);
          expect(e.spent, `${hero} d${day} #${i}`).toBe(legacy ? e.cost : tuples[i][5]);
          expect(e.spent).toBeGreaterThanOrEqual(e.cost);
          expect(e.spent).toBeLessThanOrEqual(maxGoldByDay(day));
          n++;
        });
      }
    }
    expect(n).toBe(120);
  });

  it("the header documents the sixth element: a caravan pool's tuple line and StandInTuple; pool v2.1's lines are unchanged", () => {
    const car = dataModuleText(tiny, []).split("\n"), fp = dataModuleText({ ...tiny, source: "fullpurse", par: "heroref" }, []).split("\n");
    expect(car).toContain(TUPLES_CARAVAN);
    expect(car).toContain(TYPE_CARAVAN);
    expect(car.join("\n")).toContain("// spent is the gold the pick's run had spent by that dusk (maxGoldByDay less the gold it kept): the deck's value\n// + reroll gold + sale losses (REQ-BFG-033).");
    expect(fp).toContain(TUPLES_V21);
    expect(fp).toContain(TYPE_V21);
    expect(fp.filter((l) => l.includes("spent"))).toEqual([]);
    // the committed module: pool v2.1's legacy lines while it is committed, else the regen's (a caravan pool)
    const committed = readFileSync(new URL("../src/sim/standInPoolData.ts", import.meta.url), "utf8").split("\n");
    const legacy = !committedHeader().includes("--source");
    expect(committed).toContain(legacy ? TUPLES_V21 : TUPLES_CARAVAN);
    expect(committed).toContain(legacy ? TYPE_V21 : TYPE_CARAVAN);
  });
});

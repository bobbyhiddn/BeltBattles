// Harness v2 part 2, step 4 (REQ-BFG-005, REQ-BFG-019): the star bench on the perks sim. The STEP column (each
// deck's paired 3-star minus 2-star delta, D1 on the steps: STEP WORSE), PAR~ (merged par decks, report only),
// the KNOWN_FALLS section and the BEFORE/AFTER table.
import { describe, expect, it } from "vitest";
import { kx, ky, occupancy, type Build } from "../src/sim/deck";
import { unfusedPairs, validateBuild } from "../src/net/validate";
import { fuseAll } from "../src/game/fuse";
import { newRun } from "../src/game/run";
import { starsOf } from "../src/sim/stars";
import { HARNESS_HEROES, heroRefBuild, heroStartBuild } from "../src/sim/harness/heroes";
import { fuseDeck } from "../src/sim/harness/merge";
import { beforeAfterSection, byHero, fallSteps, hopperSection, knownFallsSection } from "../src/sim/harness/report";
import {
  DEFAULT_OPTS, KNOWN_FALLS_DEFS, focusBench, hopperSources, runDay, starBench, type BenchRow, type BenchSource, type DetailRunner, type FocusDeck, type Runner,
} from "../src/sim/harness/tournament";

const freeCells = (b: Build): number[] => {
  const occ = occupancy(b);
  return b.routes.flatMap((r) => r.cells).filter((k) => occ[k].item < 0);
};
const put = (b: Build, uid: number, def: string, i: number, stars?: number) => {
  const k = freeCells(b)[i];
  b.items.push({ uid, def, x: kx(k), y: ky(k), ...(stars ? { stars } : {}) });
};
/** Points depend on the job's seeds (0.5, 1 or 1.5 per seed) plus an offset by the def's stars: 1 star +0, 2 stars
 *  +0.5, 3 stars -0.5 per seed. Paired, every deck's 3-2 step is exactly -1 point per seed, i.e. -0.5 as a rate. */
const base = (seeds: number[]) => seeds.reduce((t, s) => t + 0.5 + ((s >>> 0) % 3) * 0.5, 0);
const starOf = (b: Build, def: string) => Math.max(1, ...b.items.filter((p) => p.def === def && p.uid >= 900).map((p) => starsOf(p)));
const offset = [0, 0, 0.5, -0.5];
const stepRunner = (def: string): Runner => async (field, jobs) => jobs.map((j) => base(j.seeds) + offset[starOf(field[j.a], def)] * j.seeds.length);
const byDetail: DetailRunner = async (field, jobs) => jobs.map((j) => `${j.seeds.join(",")}|${JSON.stringify(field[j.a])}`);

function brakeDecks(n: number): BenchSource[] {
  return Array.from({ length: n }, (_, k) => {
    const b = heroStartBuild("furnace", 1);
    b.hullBonus = k;
    put(b, 900, "brake", 0);
    return { hero: "furnace" as const, tag: k === 0 ? "furnace par" : `furnace elite ${k}`, build: b, par: k === 0 };
  });
}

describe("STEP column (3-star minus 2-star, paired on shared seeds)", () => {
  it("every comparable deck's step is its own 3-star minus 2-star points on the same seeds; a deck without a 2-star variant is left out; D1 flags STEP WORSE", async () => {
    const sources = brakeDecks(5);
    // a sixth deck already holds a 2-star brake: its 1-star brake's 2-star variant is an unfused 2-star pair
    // (skipped), its 3-star variant is fine, so it is in the 3-star row but has no step
    const odd = heroStartBuild("weaver", 1);
    put(odd, 900, "brake", 0);
    put(odd, 800, "brake", 1, 2);
    expect(unfusedPairs(odd)).toEqual([]);
    sources.push({ hero: "weaver", tag: "weaver elite 0", build: odd });
    const gauntlet = Array.from({ length: 4 }, (_, g) => ({ ...heroStartBuild("weaver", 1), hullBonus: 100 + g }));
    const { rows } = await starBench({ ...DEFAULT_OPTS, seed: 5, seeds: 2 }, 7, gauntlet, sources, stepRunner("brake"), byDetail);
    const r3 = rows.find((r) => r.def === "brake" && r.star === 3)!;
    expect(r3.n).toBe(6);
    expect(r3.same2).toBe(5);
    expect(r3.step!.n).toBe(5);
    expect(r3.step!.decks.map((d) => d.tag)).toEqual(["furnace par", "furnace elite 1", "furnace elite 2", "furnace elite 3", "furnace elite 4"]);
    for (const d of r3.step!.decks) expect(d.delta).toBeCloseTo(-0.5, 12);
    expect(r3.step!.mean).toBeCloseTo(-0.5, 12);
    expect(r3.step!.worse).toBe(5);
    expect(r3.flags).toContain("STEP WORSE");
    // the 2-star row has no STEP; its decks rose (+0.25 as a rate each)
    const r2 = rows.find((r) => r.def === "brake" && r.star === 2)!;
    expect(r2.step).toBeUndefined();
    for (const d of r2.decks) expect(d.delta).toBeCloseTo(0.25, 12);
    expect(r2.flags).not.toContain("STEP WORSE");
  });

  it("D1 on the steps: one deck steps down a lot and four don't -> no STEP WORSE", async () => {
    const sources = brakeDecks(5);
    const gauntlet = [heroStartBuild("weaver", 1), heroStartBuild("weaver", 1)];
    const run: Runner = async (field, jobs) => jobs.map((j) => (starOf(field[j.a], "brake") === 3 && field[j.a].hullBonus === 0 ? 0 : 1));
    const { rows } = await starBench({ ...DEFAULT_OPTS, seeds: 1 }, 7, gauntlet, sources, run, byDetail);
    const r3 = rows.find((r) => r.def === "brake" && r.star === 3)!;
    expect(r3.step!.decks.map((d) => d.delta)).toEqual([-0.5, 0, 0, 0, 0]);
    expect(r3.flags).not.toContain("STEP WORSE");
  });
});

describe("PAR~ and the KNOWN_FALLS rows", () => {
  it("fuseDeck is src/game/fuse.ts:fuseAll on a wrapped deck (same deck as fuseAll on a real Run), and removes every unfused pair", () => {
    let merged = 0;
    for (const hero of HARNESS_HEROES) {
      for (const day of [3, 7, 10]) {
        const par = heroRefBuild(hero, day);
        const { build, steps } = fuseDeck(par);
        const run = newRun(hero, 1, "fuse-eq");
        run.build = JSON.parse(JSON.stringify(par));
        run.nextUid = 1 + Math.max(0, ...par.items.map((p) => p.uid), ...par.mods.map((m) => m.uid));
        fuseAll(run);
        expect(JSON.stringify(build)).toBe(JSON.stringify(run.build));
        expect(unfusedPairs(build)).toEqual([]);
        expect(validateBuild(build, day).errors, `${hero} d${day}`).toEqual([]);
        expect(JSON.stringify(par)).toBe(JSON.stringify(heroRefBuild(hero, day))); // the par deck itself is untouched
        if (steps.length) merged++;
      }
    }
    expect(merged).toBeGreaterThan(0); // some par decks really hold pairs (FIX-REPORT: FOUNDRY, SIPHON every day ...)
  });

  it("focusBench plays a copy at 1, 2 and 3 stars on shared seeds, whatever its start star; an unbuildable level is null", async () => {
    const b = heroStartBuild("furnace", 1);
    put(b, 900, "brake", 0, 2); // a merged 2-star brake, as fuseAll leaves it on a PAR~ deck
    put(b, 901, "splitter", 1);
    const seen: string[][] = [];
    const run: Runner = async (field, jobs) => jobs.map((j) => { seen.push([String(starOf(field[j.a], "brake")), JSON.stringify(j.seeds), String(j.b)]); return starOf(field[j.a], "brake"); });
    const gauntlet = [heroStartBuild("weaver", 1), heroStartBuild("weaver", 1), heroStartBuild("weaver", 1)];
    const { decks, battles } = await focusBench({ ...DEFAULT_OPTS, seeds: 2 }, 5, gauntlet, [{ hero: "furnace", tag: "furnace par~", build: b, par: true }], KNOWN_FALLS_DEFS, run, "t");
    const brake = decks.find((d) => d.def === "brake")!;
    expect(brake).toMatchObject({ tag: "furnace par~", stars0: 2, par: true, n: 3 * 4 });
    expect(brake.pts).toEqual([3, 6, 9]); // three gauntlet members x its star (the runner's points)
    expect(decks.map((d) => d.def).sort()).toEqual(["brake", "splitter"]);
    expect(battles).toBe(2 * 3 * 3 * 4); // 2 copies x 3 levels x 3 members x (2 seeds x 2 sides)
    // paired: against each gauntlet member (field index 6 + g after the 6 variants), every level of every copy of
    // this deck carries the same seed list, and different members get different lists
    const perMember = [0, 1, 2].map((g) => new Set(seen.filter((x) => x[2] === String(6 + g)).map((x) => x[1])));
    for (const lists of perMember) expect(lists.size).toBe(1);
    expect(new Set(perMember.map((s) => [...s][0])).size).toBe(3);
  });

  it("runDay (stars on): PAR~ decks are merged copies of the par decks that hold pairs, report only - never a source of the main bench", async () => {
    const o = { ...DEFAULT_OPTS, heroes: ["furnace", "foundry", "siphon"] as const, days: [7], calibrationDays: [7], pop: 3, gauntlet: 2, seeds: 1, elites: 1 };
    const tags = new Set<string>();
    const run: Runner = async (_f, jobs) => jobs.map(() => 1);
    const det: DetailRunner = async (_f, jobs) => jobs.map((j) => j.seeds.join(","));
    const d = await runDay({ ...o, heroes: [...o.heroes] }, 7, run, det);
    for (const r of d.bench ?? []) for (const k of [...r.decks, ...(r.step?.decks ?? [])]) tags.add(k.tag);
    expect([...tags].some((t) => t.endsWith("par~"))).toBe(false);
    for (const f of d.parTilde ?? []) {
      expect(f.tag.endsWith(" par~")).toBe(true);
      expect(unfusedPairs(heroRefBuild(f.hero, 7)).length).toBeGreaterThan(0); // only par decks that hold a pair
      expect(KNOWN_FALLS_DEFS).toContain(f.def);
    }
    expect((d.parTilde ?? []).some((f) => f.hero === "furnace")).toBe(false); // FURNACE's par deck holds no pair
  }, 60_000);

  it("the KNOWN_FALLS section: every deck with its delta, (PAR) marked, the FURNACE par deck called out, split by hero, and PAR~ listed apart", () => {
    const deck = (tag: string, delta: number, par = false) => ({ tag, par, delta });
    const row = (def: string, star: 2 | 3, decks: ReturnType<typeof deck>[], step?: ReturnType<typeof deck>[]): BenchRow => ({
      def, star, n: decks.length, skipped: 0, skippedBase: 0, wr1: { p: 0.5, lo: 0, hi: 1, n: 1, pts: 0 }, wrN: { p: 0.5, lo: 0, hi: 1, n: 1, pts: 0 },
      delta: 0, worse: 0, ci: null, flags: [], decks, ...(step ? { step: { n: step.length, mean: 0, worse: 0, ci: null, decks: step } } : {}),
    });
    const bench = [
      row("splitter", 3, [deck("furnace par", -0.1, true)], [deck("furnace par", -0.2, true), deck("weaver elite 1", -0.1), deck("weaver elite 2", 0.3)]),
      row("brake", 2, [deck("furnace par", -0.05, true), deck("siphon elite 3", -0.15)]),
      row("brake", 3, [deck("furnace par", -0.1, true)], [deck("furnace par", -0.05, true)]),
    ];
    const parTilde: FocusDeck[] = [{ tag: "siphon par~", hero: "siphon", par: true, def: "brake", uid: 5, stars0: 2, valid: true, pts: [10, 8, 4], n: 20 }];
    const steps = fallSteps({ bench, parTilde });
    expect(steps.map((s) => s.label)).toEqual(["SPLITTER ★2->★3", "BRAKE SHOE ★1->★2", "BRAKE SHOE ★2->★3", "BRAKE SHOE ★1->★3"]);
    expect(steps[0].decks.map((d) => d.delta)).toEqual([-0.2, -0.1, 0.3]); // the STEP decks, not the 3-vs-1 decks
    expect(steps[1].parTilde).toEqual([{ tag: "siphon par~ (merged ★2)", par: true, delta: -0.1 }]);
    expect(steps[2].parTilde[0].delta).toBeCloseTo(-0.2, 12);
    expect(byHero(steps[0].decks)).toEqual([{ hero: "furnace", n: 1, mean: -0.2 }, { hero: "weaver", n: 2, mean: expect.closeTo(0.1, 12) }]);
    const md = knownFallsSection([{ day: 7, bench, parTilde }]).join("\n");
    expect(md).toContain("**Day 7 SPLITTER ★2->★3**: 3 decks");
    expect(md).toContain("FURNACE par (clean case): -20.0%");
    expect(md).toContain("by hero: FURNACE 1 decks -20.0%; WEAVER 2 decks +10.0%");
    expect(md).toContain("furnace par (PAR) -20.0%");
    expect(md).toContain("PAR~: siphon par~ (merged ★2) (PAR) -10.0%");
  });
});

describe("optional: SPLITTER with HOPPER 3-star on its turret", () => {
  it("hopperSources pairs each deck holding a 1-star splitter on a route with a copy carrying HOPPER 3-star as that turret's gear; the section reads both on shared seeds", async () => {
    const b = heroStartBuild("weaver", 1);
    put(b, 900, "splitter", 0);
    b.mods.push({ uid: 950, def: "calibrate", turret: 0 }, { uid: 951, def: "chamber", turret: 1 }, { uid: 952, def: "scatter", turret: 0 });
    const lone = heroStartBuild("furnace", 1); // no splitter: left out
    const hp = hopperSources([{ hero: "weaver", tag: "weaver elite 0", build: b }, { hero: "furnace", tag: "furnace par", build: lone, par: true }]);
    expect(hp.without.map((s) => s.tag)).toEqual(["weaver elite 0"]);
    const h = hp.with[0].build;
    const t = h.mods.find((m) => m.def === "hopper")!;
    expect(t.stars).toBe(3);
    expect(h.mods.filter((m) => m.turret === t.turret && m.def !== "scatter").map((m) => m.def)).toEqual(["hopper"]); // its gear replaced, a core kept
    expect(validateBuild(h, 10).errors).toEqual([]);
    const seeds: Record<string, string[]> = { with: [], without: [] };
    const rec = (k: string): Runner => async (_f, jobs) => jobs.map((j) => { seeds[k].push(JSON.stringify(j.seeds)); return 1; });
    const g = [heroStartBuild("furnace", 1)];
    const w = await focusBench({ ...DEFAULT_OPTS, seeds: 1 }, 5, g, hp.with, ["splitter"], rec("with"), "bb-bench-hopper");
    const wo = await focusBench({ ...DEFAULT_OPTS, seeds: 1 }, 5, g, hp.without, ["splitter"], rec("without"), "bb-bench-hopper");
    expect(seeds.with).toEqual(seeds.without); // paired
    const md = hopperSection([{ day: 5, hopperSplitter: { with: w.decks, without: wo.decks } }]).join("\n");
    expect(md).toContain("| 5 | 1 | +0.0% (0/1) | +0.0% (0/1) |");
  });
});

describe("BEFORE/AFTER plumbing", () => {
  const r = (def: string, star: 2 | 3, n: number, delta: number, flags: BenchRow["flags"], extra: Partial<BenchRow> = {}): BenchRow => ({
    def, star, n, skipped: 0, skippedBase: 0, wr1: { p: 0.5, lo: 0, hi: 1, n: 1, pts: 0 }, wrN: { p: 0.5, lo: 0, hi: 1, n: 1, pts: 0 }, delta, worse: 0, ci: null, flags, decks: [], ...extra,
  });
  it("matches rows by day, def and star; a row missing on one side reads —; the after side shows its perk and STEP", () => {
    const before = [{ day: 5, bench: [r("coil", 2, 4, 0, ["NO EFFECT"]), r("splitter", 3, 7, 0.05, ["SAME AS ★2"])] }];
    const after = [{ day: 5, bench: [r("coil", 2, 5, 0.03, [], { perk: "SPARK JUMP" }), r("splitter", 3, 6, -0.02, ["STEP WORSE"], { perk: "THREE-WAY", step: { n: 6, mean: -0.04, worse: 5, ci: null, decks: [] } })] },
      { day: 7, bench: [r("press", 2, 3, 0.1, [], { perk: "HARDENED DIES" })] }];
    const md = beforeAfterSection(before, after).join("\n");
    expect(md).toContain("| coil | 2 | 5 | 4 | +0.0% | NO EFFECT | 5 | +3.0% | - | SPARK JUMP | - |");
    expect(md).toContain("| splitter | 3 | 5 | 7 | +5.0% | SAME AS ★2 | 6 | -2.0% | STEP WORSE | THREE-WAY | -4.0% (5/6) |");
    expect(md).toContain("| press | 2 | 7 | — | — | — | 3 | +10.0% | - | HARDENED DIES | - |");
    expect(md).not.toContain("| temper |");
    // the table follows PERK_DEFS order: longhaul, coil, splitter, overdrive, press, chamber
    expect(md.indexOf("| coil |")).toBeLessThan(md.indexOf("| splitter |"));
    expect(md.indexOf("| splitter |")).toBeLessThan(md.indexOf("| press |"));
  });
});

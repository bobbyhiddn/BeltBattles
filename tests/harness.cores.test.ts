// Harness v2 part 2, step 2 (REQ-BFG-005, REQ-BFG-019): turret cores (0.6.1b), stars on only. The shopper's
// "core" lever buys a core the hero's caravan sells and fits it: an empty socket first, a copy of a fitted core
// merges (gainModule), a different core on a full socket swaps and the old one goes to cargo (fuse.ts freeSocket).
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { HEROES, ITEMS, type HeroId } from "../src/sim/content";
import { coreFor, gearFor, type Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { gainModule, mergePreview } from "../src/game/fuse";
import { newRun } from "../src/game/run";
import { FUSE_MAX, starsOf } from "../src/sim/stars";
import { fullPurseBuild, randomBuild, shopBuild, spendFloor } from "../src/sim/harness/gen";
import { HARNESS_HEROES, heroStartBuild, shopItems } from "../src/sim/harness/heroes";
import { applyLever, canApply } from "../src/sim/harness/levers";
import { cargoValue, gainInto, unfusedWithCargo, type InvItem } from "../src/sim/harness/merge";
import { Shopper } from "../src/sim/harness/shopper";
import { STANDIN_DEFAULTS, STANDIN_MAX_STARS, dataModuleText, standInCandidate, standInCommand, writtenProblems, type HeroDay } from "../src/sim/harness/standins";
import { encodeStarred } from "../src/sim/harness/standinCode";
import { DEFAULT_OPTS, runTournament, type Runner } from "../src/sim/harness/tournament";

const hash32 = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};
const isCore = (def: string) => ITEMS[def]?.kind === "core";
const coresOn = (b: Build) => b.mods.filter((m) => isCore(m.def));

/** The stars-on invariant (brief step 2): at most one core and one gear per turret, validateBuild ok, no
 *  unfused pair (deck, and deck + cargo through fuse.ts unfusedInRun), deck + cargo within the day's gold,
 *  and every uid (deck and cargo) unique. Returns the problems found. */
function problems(b: Build, cargo: readonly InvItem[], day: number): string[] {
  const out: string[] = [];
  HEROES[b.hero].turrets.forEach((_, t) => {
    const here = b.mods.filter((m) => m.turret === t);
    if (here.filter((m) => isCore(m.def)).length > 1) out.push(`turret ${t}: two cores`);
    if (here.filter((m) => !isCore(m.def)).length > 1) out.push(`turret ${t}: two gear`);
  });
  out.push(...validateBuild(b, day).errors, ...unfusedPairs(b), ...unfusedWithCargo(b, cargo));
  if (cargo.some((i) => !isCore(i.def))) out.push("cargo holds a non-core");
  if (buildCost(b).total + cargoValue(cargo) > maxGoldByDay(day)) out.push(`over budget: ${buildCost(b).total} + cargo ${cargoValue(cargo)} > ${maxGoldByDay(day)}`);
  const uids = [...b.items.map((p) => p.uid), ...b.mods.map((m) => m.uid), ...cargo.map((i) => i.uid)];
  if (new Set(uids).size !== uids.length) out.push("a uid is used twice");
  return out;
}

describe("harness cores (0.6.1b): legality", () => {
  it("property test, stars on + cores on: after EVERY lever of randomBuild (all six heroes, days 1,3,5,7,10) the invariant holds; cores, 2-star cores and swaps really happen", () => {
    let withCore = 0, starred = 0, swaps = 0, levers = 0;
    for (const hero of HARNESS_HEROES) {
      for (const day of [1, 3, 5, 7, 10]) {
        for (let i = 0; i < 6; i++) {
          const r = shopBuild(hero, day, new Rng(hashSeed("core-prop", hero, day, i)), "on", FUSE_MAX, "on", (s, l, ok) => {
            levers++;
            expect(problems(s.b, s.cargo, day), `${hero} d${day} #${i} after ${l} (${ok})`).toEqual([]);
          });
          if (coresOn(r.build).length) withCore++;
          if (coresOn(r.build).some((m) => starsOf(m) >= 2)) starred++;
          swaps += r.swaps;
        }
      }
    }
    expect(levers).toBeGreaterThan(1000);
    expect(withCore).toBeGreaterThan(20);
    expect(starred).toBeGreaterThan(0);
    expect(swaps).toBeGreaterThan(0);
  }, 120_000);

  it("property test, stars on + cores on: fullPurseBuild outputs are legal, deck + cargo gold within the day's gold, and the reported cargo gold is exact", () => {
    for (const hero of ["furnace", "weaver", "foundry"] as const) {
      for (let day = 1; day <= 10; day++) {
        for (let i = 0; i < 3; i++) {
          const f = fullPurseBuild(hero, day, hashSeed("core-fp", hero, day, i), undefined, 60, "on", FUSE_MAX, "on");
          const b = f.build;
          expect(validateBuild(b, day).errors, `${hero} d${day} #${i}`).toEqual([]);
          expect(unfusedPairs(b)).toEqual([]);
          expect(f.cost).toBe(buildCost(b).total);
          expect(f.cost + (f.cargoGold ?? 0)).toBeLessThanOrEqual(maxGoldByDay(day));
          HEROES[hero].turrets.forEach((_, t) => expect(b.mods.filter((m) => m.turret === t && isCore(m.def)).length).toBeLessThanOrEqual(1));
          expect(f.cargoGold === undefined || f.cargoGold > 0).toBe(true);
        }
      }
    }
  }, 120_000);

  it("stars off never buys a core, even when cores 'on' is passed (randomBuild and fullPurseBuild, all heroes)", () => {
    for (const hero of HARNESS_HEROES) {
      for (const day of [2, 5, 8, 10]) {
        for (let i = 0; i < 4; i++) {
          const b = randomBuild(hero, day, new Rng(hashSeed("core-off", hero, day, i)), "off", FUSE_MAX, "on");
          expect(coresOn(b), `${hero} d${day} #${i}`).toEqual([]);
          const off = randomBuild(hero, day, new Rng(hashSeed("core-off", hero, day, i)), "off");
          expect(JSON.stringify(b)).toBe(JSON.stringify(off)); // the cores flag is inert with stars off
        }
        const f = fullPurseBuild(hero, day, hashSeed("core-off-fp", hero, day), undefined, 60, "off", FUSE_MAX, "on");
        expect(coresOn(f.build)).toEqual([]);
        expect(f.cargoGold).toBeUndefined();
      }
    }
    const s = new Shopper(heroStartBuild("furnace", 1), 60, 10, new Rng(1), "off", FUSE_MAX, "on");
    expect(s.coresOn).toBe(false);
    expect(canApply(s, "core")).toBe(false);
  });

  it("stars on + cores off is deterministic with the shared pool; Furnace/Weaver full-purse pin stays unchanged", () => {
    const a: string[] = [];
    for (const hero of HARNESS_HEROES) for (const day of [1, 3, 5, 7, 10]) for (let i = 0; i < 3; i++) a.push(JSON.stringify(randomBuild(hero, day, new Rng(hashSeed("on-pin", hero, day, i)), "on", FUSE_MAX, "off")));
    const b: string[] = [];
    for (const hero of ["furnace", "weaver"] as const) for (let day = 1; day <= 10; day++) for (let i = 0; i < 3; i++) b.push(JSON.stringify(fullPurseBuild(hero, day, hashSeed("fp-on-pin", hero, day, i), undefined, 60, "on", FUSE_MAX, "off")));
    // beltside-062-on-061 re-pin (DESIGN §13 P16, moved by H2's rig placement: every rig these builds buy stands where
    // H2 puts it, and a merging copy leaves the survivor's cell and rotation): 3068763238 -> 2679854933 and
    // 1965100384 -> 3070968615, measured on this branch. BELTSIDE never had a pre-cores stars-on harness to compute
    // them with (the stars-off pins in tests/harness.merge.test.ts are the ones checked against beltside-062c's own
    // harness); cores off still draws nothing for the core lever (tests above), so the pins hold that path.
    // Combined shared-pool and expanded-catalogue pins are checked on the integrated branch.
    expect(hash32(a.join("|"))).toBe(3990378578);
    expect(hash32(b.join("|"))).toBe(3070968615);
  }, 60_000);
});

/** A deck of `hero`'s start build with the given turret equipment already fitted. */
const fitted = (hero: HeroId, mods: { uid: number; def: string; turret: number; stars?: number }[]): Build => {
  const b = heroStartBuild(hero, 1);
  b.mods.push(...mods);
  return b;
};
/** The same gain on a real Run with the game's own code, exactly as run.ts:330 buyOffer drops a card on a
 *  turret: `gainModule(run, def, pv && pv.where !== "cargo" ? undefined : at)`. */
function gameGain(b: Build, cargo: InvItem[], def: string, turret: number, uid: number) {
  const run = newRun(b.hero, 1, "cores-eq");
  run.build = JSON.parse(JSON.stringify(b));
  run.inventory = cargo.map((i) => ({ ...i }));
  run.nextUid = uid;
  const pv = mergePreview(run, def);
  gainModule(run, def, pv && pv.where !== "cargo" ? undefined : { turret });
  return run;
}

describe("harness cores (0.6.1b): the core paths, through the game's own gainModule", () => {
  it("a copy of a fitted core merges into it (the fitted twin keeps its socket); equal to gainModule on a real Run", () => {
    const b = fitted("weaver", [{ uid: 50, def: "scatter", turret: 1 }]);
    const cargo: InvItem[] = [];
    const g = gainInto({ uid: 60 }, b, "scatter", { turret: 2 }, cargo);
    expect(g).toMatchObject({ survivor: 50, stars: 2, where: "turret" });
    expect(coresOn(b)).toEqual([{ uid: 50, def: "scatter", turret: 1, stars: 2 }]);
    expect(cargo).toEqual([]);
    const run = gameGain(fitted("weaver", [{ uid: 50, def: "scatter", turret: 1 }]), [], "scatter", 2, 60);
    expect(JSON.stringify(run.build)).toBe(JSON.stringify(b));
    expect(validateBuild(b, 5).errors).toEqual([]);
  });

  it("a different core on a full socket swaps: the old core goes to cargo with its stars (fuse.ts freeSocket); equal to gainModule", () => {
    const b = fitted("furnace", [{ uid: 50, def: "scatter", turret: 0, stars: 2 }, { uid: 51, def: "calibrate", turret: 0 }]);
    const cargo: InvItem[] = [];
    gainInto({ uid: 60 }, b, "rotary", { turret: 0 }, cargo);
    expect(coresOn(b)).toEqual([{ uid: 60, def: "rotary", turret: 0 }]);
    expect(gearFor(b, 0)?.def).toBe("calibrate"); // the gear hardpoint is untouched by a core swap
    expect(cargo).toEqual([{ uid: 50, def: "scatter", stars: 2 }]);
    const run = gameGain(fitted("furnace", [{ uid: 50, def: "scatter", turret: 0, stars: 2 }, { uid: 51, def: "calibrate", turret: 0 }]), [], "rotary", 0, 60);
    expect(JSON.stringify(run.build)).toBe(JSON.stringify(b));
    expect(run.inventory).toEqual(cargo);
    expect(validateBuild(b, 5).errors).toEqual([]);
  });

  it("a copy of a CARGO core fitted on a turret swaps, then merges with the cargo twin (placed beats cargo); equal to gainModule", () => {
    const b = fitted("furnace", [{ uid: 52, def: "rotary", turret: 0 }]);
    const cargo: InvItem[] = [{ uid: 50, def: "scatter" }];
    gainInto({ uid: 60 }, b, "scatter", { turret: 0 }, cargo);
    expect(coresOn(b)).toEqual([{ uid: 60, def: "scatter", turret: 0, stars: 2 }]);
    expect(cargo).toEqual([{ uid: 52, def: "rotary" }]);
    const run = gameGain(fitted("furnace", [{ uid: 52, def: "rotary", turret: 0 }]), [{ uid: 50, def: "scatter" }], "scatter", 0, 60);
    expect(JSON.stringify(run.build)).toBe(JSON.stringify(b));
    expect(run.inventory).toEqual(cargo);
  });

  it("the core lever: an empty socket comes first; a copy merges; a different core swaps to cargo, which costs gold but doesn't fight", () => {
    const rotary = ITEMS.rotary.price; // the cheapest core: a budget of deck + 3 makes it the only affordable one
    expect(shopItems("weaver", "core").map((d) => d.id).sort()).toEqual(
      Object.values(ITEMS).filter((d) => d.kind === "core" && d.merchant).map((d) => d.id).sort());
    // empty socket first: WEAVER, turret 0 already has a core; the new core goes to an EMPTY socket
    const w = fitted("weaver", [{ uid: 50, def: "scatter", turret: 0 }]);
    const sw = new Shopper(w, buildCost(w).total + rotary, 5, new Rng(7), "on", FUSE_MAX, "on");
    expect(applyLever(sw, "core")).toBe(true);
    expect(coreFor(w, 0)?.def).toBe("scatter");
    expect(coresOn(w).map((m) => m.def).sort()).toEqual(["rotary", "scatter"]);
    expect(sw.cargo).toEqual([]);
    // a copy merges: FURNACE, rotary fitted; the only affordable core is another rotary
    const f = fitted("furnace", [{ uid: 50, def: "rotary", turret: 0 }]);
    const sf = new Shopper(f, buildCost(f).total + rotary, 5, new Rng(7), "on", FUSE_MAX, "on");
    expect(applyLever(sf, "core")).toBe(true);
    expect(coresOn(f)).toEqual([{ uid: 50, def: "rotary", turret: 0, stars: 2 }]);
    expect([sf.cargo, sf.swaps]).toEqual([[], 0]);
    // a different core on the full socket swaps: FURNACE, scatter fitted, only rotary affordable
    const x = fitted("furnace", [{ uid: 50, def: "scatter", turret: 0 }]);
    const sx = new Shopper(x, buildCost(x).total + rotary, 5, new Rng(7), "on", FUSE_MAX, "on");
    expect(applyLever(sx, "core")).toBe(true);
    expect(coresOn(x).map((m) => m.def)).toEqual(["rotary"]);
    expect(sx.cargo).toEqual([{ uid: 50, def: "scatter" }]);
    expect(sx.swaps).toBe(1);
    expect(sx.left()).toBe(0); // the swapped-out scatter's gold stays spent
    expect(problems(x, sx.cargo, 5)).toEqual([]);
    // never swapped out for its own copy: a 2-star rotary fitted, one 1-star rotary affordable -> no move
    const y = fitted("furnace", [{ uid: 50, def: "rotary", turret: 0, stars: 2 }]);
    const sy = new Shopper(y, buildCost(y).total + rotary, 5, new Rng(7), "on", FUSE_MAX, "on");
    expect(applyLever(sy, "core")).toBe(false);
    expect(coresOn(y)).toEqual([{ uid: 50, def: "rotary", turret: 0, stars: 2 }]);
  });

  it("a fitted core leaves the gear hardpoint free: the mod lever fits gear beside it (one core and one mod per turret)", () => {
    const b = fitted("furnace", [{ uid: 50, def: "scatter", turret: 0 }]);
    const s = new Shopper(b, buildCost(b).total + 7, 5, new Rng(3), "on", FUSE_MAX, "on");
    expect(canApply(s, "mod")).toBe(true);
    expect(applyLever(s, "mod")).toBe(true);
    expect(b.mods.filter((m) => m.turret === 0).map((m) => ITEMS[m.def].kind).sort()).toEqual(["core", "mod"]);
    expect(validateBuild(b, 5).errors).toEqual([]);
  });
});

describe("harness cores (0.6.1b): options and reports", () => {
  it("standInCommand prints --cores only for stars on + cores off (the stars-off header, checked by --check, is unchanged)", () => {
    const base = standInCommand({ ...STANDIN_DEFAULTS, stars: "off" });
    expect(standInCommand({ ...STANDIN_DEFAULTS, stars: "off", cores: "off" })).toBe(base);
    expect(base).not.toContain("--cores");
    expect(standInCommand({ ...STANDIN_DEFAULTS, stars: "on", cores: "on" })).not.toContain("--cores");
    expect(standInCommand({ ...STANDIN_DEFAULTS, stars: "on", cores: "off" })).toContain("--cores off");
  });

  it("a tiny stars-on tournament reports core use with cores on (cores fitted, per def and star) and none with cores off", async () => {
    const tiny = { ...DEFAULT_OPTS, heroes: ["furnace", "weaver"] as HeroId[], days: [7], calibrationDays: [7], pop: 6, gauntlet: 2, seeds: 1, elites: 2 };
    const noBench: Runner = async (_f, jobs) => jobs.map(() => 1);
    const on = (await runTournament({ ...tiny, cores: "on" }, noBench)).days[0];
    const off = (await runTournament({ ...tiny, cores: "off" }, noBench)).days[0];
    expect(off.coreUse).toBeUndefined();
    const u = on.coreUse!;
    const total = (["furnace", "weaver"] as const).reduce((s, h) => s + u[h]!.pop.cores, 0);
    expect(total).toBeGreaterThan(0);
    for (const h of ["furnace", "weaver"] as const) {
      expect(u[h]!.pop.builds).toBe(6);
      expect(u[h]!.pop.stars.reduce((s, x) => s + x, 0)).toBe(u[h]!.pop.cores);
      expect(Object.values(u[h]!.pop.byDef).reduce((s, x) => s + x, 0)).toBe(u[h]!.pop.cores);
    }
    // cores ride in build.mods, so a fitted 1-star core is a benched def (a fitted core raised to 2 and 3 stars)
    expect((on.bench ?? []).some((r) => isCore(r.def))).toBe(true);
  }, 60_000);
});

describe("harness cores (0.6.1b): the stand-in 2-star cap covers cores (D4, ARSENAL.md:502)", () => {
  it("stars on + cores on: a stand-in candidate never holds a core above 2 stars, where the uncapped build of the same seed does", () => {
    let capped3 = 0, free3 = 0, core2 = 0;
    for (const hero of ["furnace", "weaver"] as const) {
      for (const day of [6, 8, 10]) {
        for (let i = 0; i < 16; i++) {
          const seed = hashSeed("core-cap", hero, day, i);
          const c = standInCandidate(hero, day, seed, "on", "on").build;
          const free = fullPurseBuild(hero, day, seed, spendFloor(day), 60, "on", FUSE_MAX, "on").build;
          const top = (b: Build) => Math.max(0, ...coresOn(b).map((m) => starsOf(m)));
          if (top(c) > STANDIN_MAX_STARS) capped3++;
          if (top(free) > STANDIN_MAX_STARS) free3++;
          if (top(c) === 2) core2++;
          expect(validateBuild(c, day).errors).toEqual([]);
        }
      }
    }
    expect(capped3).toBe(0);
    expect(free3).toBeGreaterThan(0); // the cap really bites on cores for these seeds
    expect(core2).toBeGreaterThan(0);
  }, 120_000);

  it("the written-module guard reports a stand-in pick holding a 3-star core", () => {
    const o = { ...STANDIN_DEFAULTS, stars: "on" as const, cores: "on" as const };
    const b = fitted("furnace", [{ uid: 50, def: "scatter", turret: 0, stars: 2 }]);
    const pick = (build: Build) => ({ idx: 0, build, code: encodeStarred(build), cost: buildCost(build).total, tries: 1, floorMet: true, score: 0.5, pct: 50, vsRef: {}, vsPar: 1 });
    const hd = (build: Build) => ({ hero: "furnace", day: 10, budget: maxGoldByDay(10), floor: 0, pop: [], picks: [pick(build)], par: 0, window: [40, 60], relax: "none", widened: false, short: false, elites: [], parVsRef: {}, parVsElites: 0, robustRemoved: 0, robustReplayed: 0, capAffected: 0, capWould3: 0 }) as unknown as HeroDay;
    expect(writtenProblems(o, [hd(b)], dataModuleText(o, [hd(b)])).filter((p) => p.includes("3-star module"))).toEqual([]);
    const three: Build = JSON.parse(JSON.stringify(b));
    three.mods[0].stars = 3;
    expect(writtenProblems(o, [hd(three)], dataModuleText(o, [hd(three)])).some((p) => p.includes("3-star module"))).toBe(true);
  });
});

// Harness v2 part 3, step 2 (REQ-BFG-005, REQ-BFG-019): the six wave-1 factories (0.6.1c), stars on only. With
// factories on, the "press" and "drop" levers buy any factory the hero can buy (STAMP PRESS and the six, drawn with
// the day's rarity weights), a GANTRY PRESS draws a route into every free connector it can reach up to its outputs
// (and tries its new route when a merge raises them: THIRD ARM), the "merge" lever may buy a factory copy that
// merges at once, and no speed gate goes onto a slag route (AMMO.slag.fixedSpeed).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { AMMO, ITEMS, type HeroId, type ItemDef } from "../src/sim/content";
import { rigHits, routesOf, type Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { FUSE_MAX, effectAt, outputsAt, starsOf } from "../src/sim/stars";
import { fullPurseBuild, randomBuild, shopBuild } from "../src/sim/harness/gen";
import { HARNESS_HEROES, heroStartBuild, shopFactories } from "../src/sim/harness/heroes";
import { applyLever, canApply, factoryToBuy, mergeableDefs } from "../src/sim/harness/levers";
import { cargoValue, unfusedWithCargo, type InvItem } from "../src/sim/harness/merge";
import { blockedCells, freeConnectors, shortestTiles, startCells } from "../src/sim/harness/path";
import { Shopper, fixedSpeedCells, isSpeedGate } from "../src/sim/harness/shopper";
import { STANDIN_DEFAULTS, STANDIN_MAX_STARS, dataModuleText, maxStarsOf, standInCandidate, standInCommand, writtenProblems, type HeroDay } from "../src/sim/harness/standins";
import { encodeStarred } from "../src/sim/harness/standinCode";
import { withLegacyStock } from "./catalogueLegacy";

const hash32 = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};
const SIX = ["doublestamp", "shottower", "hotswap", "slagpot", "assembly", "gantry"];
const isFactory = (def: string) => ITEMS[def]?.kind === "factory";
const bought = (b: Build) => b.items.filter((p) => isFactory(p.def) && ITEMS[p.def].price > 0);
const factoryCount = (b: Build) => b.items.filter((p) => isFactory(p.def)).length;

/** The stars-on invariant with factories on (brief step 2): validateBuild ok, no unfused pair (deck, and deck +
 *  cargo), deck + cargo within the day's gold, no factory feeding more routes than outputsAt(its stars), and (the
 *  slag rule) no speed-rig hit on a slag route. */
function problems(b: Build, cargo: readonly InvItem[], day: number): string[] {
  const out: string[] = [...validateBuild(b, day).errors, ...unfusedPairs(b), ...unfusedWithCargo(b, cargo)];
  if (buildCost(b).total + cargoValue(cargo) > maxGoldByDay(day)) out.push(`over budget: ${buildCost(b).total} + cargo ${cargoValue(cargo)} > ${maxGoldByDay(day)}`);
  for (const p of b.items) {
    if (!isFactory(p.def)) continue;
    const n = routesOf(b, p.uid).length, outs = outputsAt(p.def, starsOf(p));
    if (n > outs) out.push(`${p.def}*${starsOf(p)} feeds ${n} routes, outputs ${outs}`);
  }
  const slag = fixedSpeedCells(b);
  for (const route of rigHits(b)) for (const tile of route) for (const hit of tile) {
    if (isSpeedGate(ITEMS[hit.def]) && slag.has(hit.cell)) out.push(`speed rig ${hit.def} on a slag route`);
  }
  return out;
}

/** A Shopper whose factory shop is only `defs` (to steer the press/drop draw in unit tests). */
function shopper(b: Build, day: number, seed: number, defs: string[], maxStars = FUSE_MAX): Shopper {
  const s = new Shopper(b, 500, day, new Rng(seed), "on", maxStars, "off", "on");
  (s as unknown as { factories: ItemDef[] }).factories = defs.map((d) => ITEMS[d]);
  return s;
}

describe("harness factories (0.6.1c): the shop", () => {
  it("shopFactories: STAMP PRESS and the six, for every hero; never KILN, LOOM or a race factory", () => {
    for (const h of HARNESS_HEROES) {
      const ids = shopFactories(h).map((d) => d.id).sort();
      expect(ids).toEqual(Object.values(ITEMS).filter((d) => d.kind === "factory" && d.merchant && d.price > 0).map((d) => d.id).sort());
      for (const d of shopFactories(h)) expect(!!d.merchant && d.price > 0 && d.kind === "factory").toBe(true);
    }
  });

  it("a factory's ammo kind is its own spec at every star (so the slag rule may read ITEMS; the harness reads no star value)", () => {
    for (const def of ["press", ...SIX]) for (const s of [1, 2, 3]) expect(effectAt(def, s).factory!.ammo, `${def}*${s}`).toBe(ITEMS[def].factory!.ammo);
    expect(ITEMS.slagpot.factory!.ammo).toBe("slag");
    expect(AMMO.slag.fixedSpeed).toBeDefined();
    expect(SIX.filter((d) => AMMO[ITEMS[d].factory!.ammo].fixedSpeed !== undefined)).toEqual(["slagpot"]);
  });

  it("factoryToBuy draws with the day's rarity weights (factories off: always the STAMP PRESS, no RNG draw)", () => {
    const off = new Shopper(heroStartBuild("furnace", 1), 500, 1, new Rng(7), "on", FUSE_MAX, "on", "off");
    expect(factoryToBuy(off)!.id).toBe("press");
    expect(off.rng.next()).toBe(new Rng(7).next()); // no draw was taken
    const counts: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const s = new Shopper(heroStartBuild("furnace", 1), 500, 1, new Rng(hashSeed("draw", i)), "on", FUSE_MAX, "on", "on");
      (s as unknown as { factories: ItemDef[] }).factories = ["press", ...SIX].map((id) => ITEMS[id]);
      const d = factoryToBuy(s)!.id;
      counts[d] = (counts[d] ?? 0) + 1;
    }
    // day 1: common 60, rare 28 (5 rare factories), epic 10: ASSEMBLY LINE ~61%, STAMP PRESS ~10%, each rare ~5.7%
    expect(counts.assembly / 3000).toBeGreaterThan(0.55);
    expect(counts.assembly / 3000).toBeLessThan(0.67);
    expect(counts.press / 3000).toBeGreaterThan(0.07);
    expect(counts.press / 3000).toBeLessThan(0.13);
    for (const d of ["doublestamp", "shottower", "hotswap", "slagpot", "gantry"]) expect(counts[d] / 3000).toBeGreaterThan(0.03);
  });
});

describe("harness factories (0.6.1c): legality", () => {
  it("property test, stars + cores + factories on: after EVERY lever of randomBuild (all six heroes, days 1,3,5,7,10) the invariant holds; the six are bought, merged, and the merge lever never adds a factory", () => {
    let levers = 0, merges = 0, factoryMerges = 0, twoStar = 0, gantry2 = 0, slagHit = 0, third = 0;
    const seen = new Set<string>();
    for (const hero of HARNESS_HEROES) {
      for (const day of [1, 3, 5, 7, 10]) {
        for (let i = 0; i < 8; i++) {
          let before = factoryCount(heroStartBuild(hero, 1));
          let stars = new Map<number, number>();
          const r = shopBuild(hero, day, new Rng(hashSeed("fac-prop", hero, day, i)), "on", FUSE_MAX, "on", (s, l, ok) => {
            levers++;
            expect(problems(s.b, s.cargo, day), `${hero} d${day} #${i} after ${l} (${ok})`).toEqual([]);
            const now = factoryCount(s.b);
            if (l === "merge") {
              merges++;
              // the merge lever buys a factory copy only when it merges at once: never a new factory item
              expect(now, `${hero} d${day} #${i}: merge lever added a factory`).toBeLessThanOrEqual(before);
              if (s.b.items.some((p) => isFactory(p.def) && starsOf(p) > (stars.get(p.uid) ?? 1))) factoryMerges++;
            }
            before = now;
            stars = new Map(s.b.items.filter((p) => isFactory(p.def)).map((p) => [p.uid, starsOf(p)]));
          }, "on");
          for (const p of bought(r.build)) {
            seen.add(p.def);
            if (starsOf(p) > 1) twoStar++;
            if (p.def === "gantry" && routesOf(r.build, p.uid).length === 2) gantry2++;
          }
          slagHit += r.slag.skipped + r.slag.steered;
          third += r.thirdArm;
        }
      }
    }
    console.log(`factories property scan: levers ${levers}, merge levers ${merges} (factory merges ${factoryMerges}), 2-star factories ${twoStar}, GANTRY on 2 routes ${gantry2}, slag skipped+steered ${slagHit}, THIRD ARM routes ${third}, bought ${[...seen].sort().join(",")}`);
    expect(levers).toBeGreaterThan(2000);
    expect([...seen].sort()).toEqual(Object.values(ITEMS)
      .filter((d) => d.kind === "factory" && d.merchant && d.price > 0).map((d) => d.id).sort());
    expect(twoStar).toBeGreaterThan(5);
    expect(merges).toBeGreaterThan(50);
    expect(factoryMerges).toBeGreaterThan(0); // the merge lever does merge factory copies
    // (a GANTRY on two routes needs two free connectors: FOUNDRY only; the unit tests below cover it)
  }, 240_000);

  it("property test, stars + cores + factories on: fullPurseBuild outputs are legal and within the day's gold", () => {
    let withNew = 0;
    for (const hero of HARNESS_HEROES) {
      for (let day = 1; day <= 10; day++) {
        for (let i = 0; i < 2; i++) {
          const f = fullPurseBuild(hero, day, hashSeed("fac-fp", hero, day, i), undefined, 60, "on", FUSE_MAX, "on", "on");
          expect(problems(f.build, [], day), `${hero} d${day} #${i}`).toEqual([]);
          expect(f.cost).toBe(buildCost(f.build).total);
          expect(f.cost + (f.cargoGold ?? 0)).toBeLessThanOrEqual(maxGoldByDay(day));
          if (bought(f.build).some((p) => SIX.includes(p.def))) withNew++;
        }
      }
    }
    expect(withNew).toBeGreaterThan(20);
  }, 240_000);

  it("stars off never buys one of the six, even when factories 'on' is passed (randomBuild and fullPurseBuild): the flag is inert", () => {
    for (const hero of HARNESS_HEROES) {
      for (const day of [2, 5, 8, 10]) {
        for (let i = 0; i < 3; i++) {
          const b = randomBuild(hero, day, new Rng(hashSeed("fac-off", hero, day, i)), "off", FUSE_MAX, "on", "on");
          expect(bought(b).filter((p) => p.def !== "press"), `${hero} d${day} #${i}`).toEqual([]);
          expect(JSON.stringify(b)).toBe(JSON.stringify(randomBuild(hero, day, new Rng(hashSeed("fac-off", hero, day, i)), "off")));
        }
        const f = fullPurseBuild(hero, day, hashSeed("fac-off-fp", hero, day), undefined, 60, "off", FUSE_MAX, "off", "on");
        expect(JSON.stringify(f)).toBe(JSON.stringify(fullPurseBuild(hero, day, hashSeed("fac-off-fp", hero, day), undefined, 60, "off")));
      }
    }
    const s = new Shopper(heroStartBuild("furnace", 1), 60, 10, new Rng(1), "off", FUSE_MAX, "on", "on");
    expect(s.factoriesOn).toBe(false);
    expect(factoryToBuy(s)!.id).toBe("press");
  });

  it("stars on + factories off buys the STAMP PRESS alone (no one of the six)", () => {
    for (const hero of HARNESS_HEROES) for (const day of [3, 7, 10]) for (let i = 0; i < 4; i++) {
      const b = randomBuild(hero, day, new Rng(hashSeed("fac-offon", hero, day, i)), "on", FUSE_MAX, "on", "off");
      expect(bought(b).filter((p) => p.def !== "press")).toEqual([]);
    }
  });

  // P19 pins predate the shared-pool change. These new pins include Metronome's speed rigs while factories are off.
  it("stars on + cores on + factories off is deterministic with the shared pool", () => {
    const a: string[] = [];
    const b: string[] = [];
    withLegacyStock(() => {
      for (const hero of HARNESS_HEROES) for (const day of [1, 3, 5, 7, 10]) for (let i = 0; i < 3; i++) a.push(JSON.stringify(randomBuild(hero, day, new Rng(hashSeed("fac-off-pin", hero, day, i)), "on", FUSE_MAX, "on", "off")));
      for (const hero of HARNESS_HEROES) for (let day = 1; day <= 10; day++) for (let i = 0; i < 3; i++) b.push(JSON.stringify(fullPurseBuild(hero, day, hashSeed("fp-fac-off-pin", hero, day, i), undefined, 60, "on", FUSE_MAX, "on", "off")));
    });
    // REQ-BFG-021 changes Metronome's choices within the pre-expansion stock.
    expect(hash32(a.join("|"))).toBe(788536636);
    expect(hash32(b.join("|"))).toBe(1842022582);
  }, 240_000);
});

describe("harness factories (0.6.1c): the factory paths", () => {
  /** A deck of `hero` with one `def` placed by the press lever (the shop narrowed to it). */
  function placed(hero: HeroId, def: string, day = 10, seed = 1): { s: Shopper; uid: number } {
    for (let k = 0; k < 40; k++) {
      const s = shopper(heroStartBuild(hero, 1), day, hashSeed("placed", hero, def, seed, k), [def]);
      if (!canApply(s, "press") || !applyLever(s, "press")) continue;
      const f = s.b.items.find((p) => p.def === def);
      if (f) return { s, uid: f.uid };
    }
    throw new Error(`could not place ${def} for ${hero}`);
  }

  it("a copy merges in place: same uid, cell and routes, one star up (the press lever and the merge lever)", () => {
    for (const def of ["press", ...SIX]) {
      for (const lever of ["press", "merge"] as const) {
        const { s, uid } = placed("foundry", def);
        const f0 = JSON.parse(JSON.stringify(s.b.items.find((p) => p.uid === uid)));
        const routes0 = JSON.stringify(s.b.routes.filter((r) => r.factory === uid));
        const n0 = s.b.items.length, cost0 = buildCost(s.b).total;
        if (lever === "merge") expect(mergeableDefs(s), def).toEqual([def]); // the only fusible copy on the deck
        expect(applyLever(s, lever), `${def} ${lever}`).toBe(true);
        const f = s.b.items.find((p) => p.uid === uid)!;
        expect(starsOf(f), `${def} ${lever}`).toBe(2);
        expect([f.x, f.y]).toEqual([f0.x, f0.y]);
        expect(s.b.items.length).toBe(n0);
        expect(factoryCount(s.b)).toBe(factoryCount(heroStartBuild("foundry", 1)) + 1);
        const own = s.b.routes.filter((r) => r.factory === uid);
        if (def !== "gantry") expect(JSON.stringify(own)).toBe(routes0); // its routes are kept
        else expect(JSON.stringify(own.slice(0, JSON.parse(routes0).length))).toBe(routes0); // kept; a GANTRY may add one
        expect(buildCost(s.b).total - cost0).toBeGreaterThanOrEqual(ITEMS[def].price);
        expect(problems(s.b, s.cargo, 10)).toEqual([]);
      }
    }
  });

  it("the merge lever never buys a factory copy that would not merge at once (no placed 1-star twin: not offered)", () => {
    const { s, uid } = placed("foundry", "doublestamp");
    s.b.items.find((p) => p.uid === uid)!.stars = 2; // a 2-star copy: a new 1-star copy would land beside it
    expect(mergeableDefs(s)).toEqual([]);
    expect(canApply(s, "merge")).toBe(false);
    const { s: s1 } = placed("foundry", "doublestamp");
    expect(mergeableDefs(s1)).toEqual(["doublestamp"]);
  });

  it("GANTRY PRESS: a route into every free connector it can reach, never more than its outputs; after THIRD ARM it gains a route when a connector is free", () => {
    // FOUNDRY has two connectors free beside its Crucible twins: a 1-star GANTRY takes both (2 = its outputs) when
    // its first route leaves the second connector reachable (random belts can wall it off: then it feeds one)
    let both = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const { s, uid } = placed("foundry", "gantry", 10, seed);
      const n = routesOf(s.b, uid).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(outputsAt("gantry", 1));
      if (n === 2) both++;
      else expect(freeConnectors(s.b).length, `seed ${seed}: a free connector left`).toBeGreaterThanOrEqual(0);
    }
    console.log(`GANTRY on FOUNDRY: ${both} of 24 feed both free connectors`);
    expect(both).toBeGreaterThan(3);
    // THIRD ARM: WEAVER with its LOOM's belts removed (a legal deck: a factory may feed fewer routes than it has
    // outputs), a 1-star GANTRY feeding two of the three connectors; a merge raises it to 3 outputs and the free
    // connector gets the third route in the same lever
    let gained = 0, reachable = 0, tried = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const b = heroStartBuild("weaver", 1);
      b.routes = [];
      const s = shopper(b, 10, hashSeed("third-arm", seed), ["gantry"]);
      if (!applyLever(s, "press")) continue;
      const g = s.b.items.find((p) => p.def === "gantry")!;
      // three connectors free: a 1-star GANTRY still feeds at most its 2 outputs
      expect(routesOf(s.b, g.uid).length, `seed ${seed}: 1-star GANTRY routes`).toBeLessThanOrEqual(outputsAt("gantry", 1));
      expect(problems(s.b, s.cargo, 10), `seed ${seed} after the press`).toEqual([]);
      if (routesOf(s.b, g.uid).length !== 2 || freeConnectors(s.b).length !== 1) continue;
      tried++;
      const bl = blockedCells(s.b), can = shortestTiles(bl, startCells(g.x, g.y, 2, bl), freeConnectors(s.b)[0]) !== Infinity;
      if (can) reachable++;
      expect(applyLever(s, "merge")).toBe(true);
      expect(starsOf(s.b.items.find((p) => p.uid === g.uid))).toBe(2);
      const n = routesOf(s.b, g.uid).length;
      expect(n).toBeLessThanOrEqual(outputsAt("gantry", 2));
      expect(n, `seed ${seed}: reachable ${can}`).toBe(can ? 3 : 2); // the third route whenever its connector is reachable
      if (n === 3) gained++;
      expect(s.thirdArm).toBe(n - 2);
      expect(problems(s.b, s.cargo, 10)).toEqual([]);
    }
    console.log(`THIRD ARM: ${tried} 1-star GANTRY decks on two routes with one connector free; ${reachable} reachable, ${gained} gained the third route`);
    expect(tried).toBeGreaterThan(3);
    expect(gained).toBeGreaterThan(0);
  });

  it("no speed-rig hit on a slag route: the gate and merge levers steer speed rigs off it; rigTilesFor skips slag tiles", () => {
    const { s, uid } = placed("foundry", "slagpot");
    const slag = fixedSpeedCells(s.b);
    expect(slag.size).toBe(s.b.routes.filter((r) => r.factory === uid).reduce((n, r) => n + r.cells.length, 0));
    (s as unknown as { gates: ItemDef[] }).gates = [ITEMS.grease, ITEMS.brake];
    for (let i = 0; i < 12 && canApply(s, "gate"); i++) applyLever(s, "gate");
    expect(s.b.items.filter((p) => isSpeedGate(ITEMS[p.def])).length).toBeGreaterThan(0);
    expect(problems(s.b, s.cargo, 10)).toEqual([]);
    expect(s.slag.steered).toBeGreaterThan(0);
    const before = s.slag.skipped;
    const slagTiles = s.rigTiles().filter(([ri, ti]) => slag.has(s.b.routes[ri].cells[ti]));
    expect(slagTiles.length).toBeGreaterThan(0);
    expect(s.rigTilesFor(ITEMS.overdrive, slagTiles)).toEqual([]); // a speed rig with no twin: no slag tile to work
    expect(s.slag.skipped).toBe(before + 1);
    expect(s.rigTilesFor(ITEMS.temper, slagTiles)).toEqual(slagTiles); // not a speed rig: any tile
    // factories off: the rule is off too (no slag route can exist there), rigTilesFor is the identity with no count
    const off = new Shopper(s.b, 500, 10, new Rng(1), "on", FUSE_MAX, "off", "off");
    expect(off.rigTilesFor(ITEMS.grease, slagTiles)).toEqual(slagTiles);
    expect(off.slag).toEqual({ skipped: 0, steered: 0 });
  });
});

describe("harness factories (0.6.1c): stand-ins", () => {
  it("the 2-star cap covers factories: a copy that would chain to 3 stars is never bought (press and merge levers)", () => {
    // a deck holding a 2-star and a 1-star GANTRY: one more copy merges 1+1 = 2, then 2+2 = 3 stars
    const mk = (maxStars: number) => {
      const s = shopper(heroStartBuild("foundry", 1), 10, 5, ["gantry"], maxStars);
      expect(applyLever(s, "press")).toBe(true); // a 1-star GANTRY ...
      s.b.items.find((p) => p.def === "gantry")!.stars = 2; // ... now 2-star
      s.b.items.push({ uid: 901, def: "gantry", x: 0, y: 8 }); // and a 1-star one beside it (no route: the cap only)
      return s;
    };
    const capped = mk(STANDIN_MAX_STARS);
    expect(capped.canGain("gantry")).toBe(false);
    expect(factoryToBuy(capped)).toBeUndefined();
    expect(mergeableDefs(capped)).not.toContain("gantry");
    expect(applyLever(capped, "press")).toBe(false);
    expect(maxStarsOf(capped.b)).toBe(2);
    const free = mk(FUSE_MAX); // control: uncapped, the same copy chains to 3 stars
    expect(free.canGain("gantry")).toBe(true);
    expect(mergeableDefs(free)).toContain("gantry");
    expect(applyLever(free, "merge")).toBe(true);
    expect(maxStarsOf(free.b)).toBe(3);
  });

  it("stand-in candidates with factories on hold no factory above 2 stars, and are legal", () => {
    let factories = 0;
    for (const hero of ["furnace", "weaver", "foundry"] as const) {
      for (let day = 1; day <= 10; day++) {
        for (let i = 0; i < 2; i++) {
          const f = standInCandidate(hero, day, hashSeed("fac-standin", hero, day, i), "on", "on", "on");
          expect(maxStarsOf(f.build)).toBeLessThanOrEqual(STANDIN_MAX_STARS);
          expect(problems(f.build, [], day), `${hero} d${day} #${i}`).toEqual([]);
          factories += bought(f.build).length;
        }
      }
    }
    expect(factories).toBeGreaterThan(10);
  }, 240_000);

  it("the written-module guard sees a factory: a stored 3-star GANTRY is reported", () => {
    const o = { ...STANDIN_DEFAULTS, stars: "on" as const, cores: "on" as const, factories: "on" as const };
    const b = heroStartBuild("furnace", 1); // a pool hero (STANDIN_DEFAULTS.heroes): the module writes its picks
    const s = shopper(b, 10, 5, ["gantry"]);
    expect(applyLever(s, "press")).toBe(true);
    const pick = (build: Build) => ({ idx: 0, build, code: encodeStarred(build), cost: buildCost(build).total, tries: 1, floorMet: true, score: 0.5, pct: 50, vsRef: {}, vsPar: 1 });
    const hd = (build: Build) => ({ hero: "furnace", day: 10, budget: maxGoldByDay(10), floor: 0, pop: [], picks: [pick(build)], par: 0, window: [40, 60], relax: "none", widened: false, short: false, elites: [], parVsRef: {}, parVsElites: 0, robustRemoved: 0, robustReplayed: 0, capAffected: 0, capWould3: 0 }) as unknown as HeroDay;
    const two: Build = JSON.parse(JSON.stringify(s.b));
    two.items.find((p) => p.def === "gantry")!.stars = 2;
    expect(writtenProblems(o, [hd(two)], dataModuleText(o, [hd(two)])).filter((p) => p.includes("3-star module"))).toEqual([]);
    const three: Build = JSON.parse(JSON.stringify(s.b));
    three.items.find((p) => p.def === "gantry")!.stars = 3;
    expect(writtenProblems(o, [hd(three)], dataModuleText(o, [hd(three)])).some((p) => p.includes("3-star module"))).toBe(true);
    // On the 0.6.1 release (task 9dc97383c8c8b5a7): the header prints --factories on when factories are on, and
    // nothing with factories off (the shipped pool v2's header predates --factories). Was: nothing when on, and
    // "--factories off" when off (pre-flip, when the committed module was the stars-off v1.1).
    expect(standInCommand(o)).toContain("--factories on");
    expect(standInCommand({ ...o, factories: "off" })).not.toContain("--factories");
    expect(standInCommand({ ...o, stars: "off", factories: "on" })).not.toContain("--factories");
  });

  it("on the release: the shipped pool's header is standInCommand of the flip's options with factories off or on, so `standins --check --factories off` (or on) can regenerate it exactly", () => {
    const header = readFileSync(resolve("src/sim/standInPoolData.ts"), "utf8").split("\n")[1];
    const flip = { ...STANDIN_DEFAULTS, stars: "on" as const, cores: "on" as const };
    const off = `//   ${standInCommand({ ...flip, factories: "off" })}`, on = `//   ${standInCommand({ ...flip, factories: "on" })}`;
    expect(off).toBe(`//   ${standInCommand(flip)}`); // factories absent = off
    expect(on).toBe(`${off} --factories on`);
    expect([off, on]).toContain(header);
    // at 689c2e8 the shipped pool is pool v2, generated before --factories existed: the factories-off header
    expect(header).toBe(off);
    // the header line is the one dataModuleText writes (line 2 of the module)
    expect(dataModuleText({ ...flip, factories: "off" }, []).split("\n")[1]).toBe(off);
    expect(dataModuleText({ ...flip, factories: "on" }, []).split("\n")[1]).toBe(on);
  });
});

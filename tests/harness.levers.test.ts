import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { Battle } from "../src/sim/battle";
import { HEROES, ITEMS } from "../src/sim/content";
import { estimateRoute, key as K, occupancy, routeInfo, routesOf, type Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { fullPurseBuild, randomBuild, spendFloor } from "../src/sim/harness/gen";
import { HARNESS_HEROES, heroRefBuild, heroStartBuild } from "../src/sim/harness/heroes";
import { applyLever, gateSeq, routesOutOfOrder } from "../src/sim/harness/levers";
import { Shopper, isFlatGate, isSpeedGate, isSplitter } from "../src/sim/harness/shopper";

// Balance harness v1 levers: Crucible sync, gate order, signature-route drop; no off-route gates.

const pop = (hero: string, day: number, n: number) =>
  Array.from({ length: n }, (_, i) => randomBuild(hero as Build["hero"], day, new Rng(hashSeed("bb-pop", 1, hero, day, i))));

const speedAt = (b: Build, ri: number) => {
  const occ = occupancy(b);
  return b.routes[ri].cells.map((k) => {
    const p = b.items.find((q) => q.uid === occ[k].item);
    return p && isSpeedGate(ITEMS[p.def]) ? p.def : "-";
  });
};

describe("harness levers", () => {
  it("sync: a lone speed gate on one Crucible route is mirrored at the same cell index", () => {
    const b = heroStartBuild("foundry", 1);
    b.items.push({ uid: 50, def: "grease", x: 2, y: 3 }); // route 0 (column 2), cell index 2
    const s = new Shopper(b, maxGoldByDay(5), 5, new Rng(3));
    expect(applyLever(s, "sync")).toBe(true);
    const [a, c] = routesOf(b, b.items[0].uid);
    expect(speedAt(b, a)).toEqual(speedAt(b, c));
    expect(speedAt(b, c)[2]).toBe("grease");
    expect(estimateRoute(b, a).time).toBeCloseTo(estimateRoute(b, c).time, 9);
    expect(validateBuild(b, 5).errors).toEqual([]);
  });

  it("sync: synced Foundry decks keep twin blanks arriving together, and they fuse", () => {
    let synced = 0, withSpeed = 0;
    for (const day of [3, 7, 10]) {
      for (const b of pop("foundry", day, 20)) {
        const [a, c] = routesOf(b, b.items.find((p) => p.def === "crucible")!.uid);
        if (c === undefined) continue;
        const ia = routeInfo(b, a), ic = routeInfo(b, c);
        if (ia.turret !== ic.turret || ia.tiles !== ic.tiles || speedAt(b, a).join() !== speedAt(b, c).join()) continue;
        synced++;
        if (speedAt(b, a).some((d) => d !== "-")) withSpeed++;
        expect(estimateRoute(b, a).time).toBeCloseTo(estimateRoute(b, c).time, 9);
      }
    }
    expect(synced).toBeGreaterThan(20); // of 60
    expect(withSpeed).toBeGreaterThan(10);
    const b = pop("foundry", 7, 20).find((x) => speedAt(x, 0).some((d) => d !== "-") && speedAt(x, 0).join() === speedAt(x, 1).join())!;
    const bt = new Battle(b, heroRefBuild("furnace", 7), 11);
    for (let t = 0; t < 60 * 20 && !bt.over; t++) { bt.step(); bt.drainEvents(); }
    expect(bt.sides[0].race!.foundry.fusions).toBeGreaterThan(0);
  }, 30_000);

  it("order: flat-bonus gates move ahead of Splitters on the cells the gates already hold", () => {
    const b = heroStartBuild("furnace", 1); // Kiln route: (4,5) .. (4,0)
    b.items.push({ uid: 60, def: "splitter", x: 4, y: 4 }, { uid: 61, def: "temper", x: 4, y: 3 }, { uid: 62, def: "whetstone", x: 4, y: 2 });
    const cost = buildCost(b).total;
    expect(routesOutOfOrder(b)).toEqual([0]);
    const s = new Shopper(b, maxGoldByDay(4), 4, new Rng(5));
    expect(applyLever(s, "order")).toBe(true);
    expect(gateSeq(b, 0).map((g) => g.def.id)).toEqual(["whetstone", "temper", "splitter"]);
    expect(routesOutOfOrder(b)).toEqual([]);
    expect(buildCost(b).total).toBe(cost);
    expect(validateBuild(b, 4).errors).toEqual([]);
  });

  it("order: ordered builds (flat gates, then a Splitter) turn up in every population from day 3", () => {
    for (const hero of HARNESS_HEROES) {
      for (const day of [3, 5, 7, 10]) {
        const ordered = pop(hero, day, 40).filter((b) => routesOutOfOrder(b).length === 0 && b.routes.some((_, ri) => {
          const seq = gateSeq(b, ri);
          return seq.some((g) => isFlatGate(g.def)) && seq.some((g) => isSplitter(g.def));
        }));
        expect(ordered.length, `${hero} d${day}`).toBeGreaterThan(0);
      }
    }
  }, 60_000);

  it("drop: REMOVE BELT on a Loom route frees its connector for a Stamp Press line, and validateBuild accepts it", () => {
    const b = heroStartBuild("weaver", 1);
    b.routes.splice(1, 1); // the c1 route: (3,5) (2,5) (1,5) then up column 1
    b.items.push({ uid: 70, def: "press", x: 0, y: 6 });
    b.routes.push({ factory: 70, cells: [K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)] });
    expect(validateBuild(b, 1).errors).toEqual([]); // the Loom feeds 2 of its 3 outputs; 8 g
    let dropped = 0;
    for (const hero of ["weaver", "siphon"] as const) {
      for (const b2 of pop(hero, 5, 30)) {
        const sig = b2.items.find((p) => p.def === HEROES[hero].factory)!;
        if (routesOf(b2, sig.uid).length < heroStartBuild(hero, 1).routes.length) {
          dropped++;
          expect(b2.items.some((p) => p.def === "press")).toBe(true);
          expect(validateBuild(b2, 5).errors).toEqual([]);
        }
      }
    }
    expect(dropped).toBeGreaterThan(5);
  }, 30_000);

  it("no gate is ever left off-route, and no Crucible route is ever dropped", () => {
    for (const hero of HARNESS_HEROES) {
      for (const day of [2, 6, 10]) {
        for (const b of pop(hero, day, 12)) {
          const occ = occupancy(b);
          for (const p of b.items) if (ITEMS[p.def].kind === "gate") expect(occ[K(p.x, p.y)].route, `${hero} d${day}`).toBeGreaterThanOrEqual(0);
          if (hero === "foundry") expect(routesOf(b, b.items.find((p) => p.def === "crucible")!.uid)).toHaveLength(2);
        }
      }
    }
  }, 60_000);

  it("fullPurseBuild spends at least 90% of the day's gold, legally, and is reproducible", () => {
    for (const hero of ["furnace", "weaver"] as const) {
      for (const day of [1, 2, 5, 10]) {
        for (let i = 0; i < 4; i++) {
          const f = fullPurseBuild(hero, day, hashSeed("fp-test", hero, day, i));
          expect(f.floorMet).toBe(true);
          expect(f.cost).toBe(buildCost(f.build).total);
          expect(f.cost).toBeGreaterThanOrEqual(spendFloor(day));
          expect(validateBuild(f.build, day).errors).toEqual([]);
          expect(JSON.stringify(fullPurseBuild(hero, day, hashSeed("fp-test", hero, day, i)).build)).toBe(JSON.stringify(f.build));
        }
      }
    }
  }, 60_000);
});

import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { Battle } from "../src/sim/battle";
import { HEROES, ITEMS } from "../src/sim/content";
import { estimateRoute, hitsOfRig, key as K, occupancy, rigHits, routeInfo, routesOf, type Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { fullPurseBuild, randomBuild, spendFloor } from "../src/sim/harness/gen";
import { HARNESS_HEROES, heroRefBuild, heroStartBuild } from "../src/sim/harness/heroes";
import { applyLever, gateSeq, routesOutOfOrder, speedProfile } from "../src/sim/harness/levers";
import { Shopper, isFlatGate, isSplitter } from "../src/sim/harness/shopper";
import { exceptPairs } from "./harnessLegacy";

// Balance harness v1 levers: Crucible sync, rig order, signature-route drop; no idle rigs.
// 0.6.2 BELTSIDE: rigs stand beside the belt (H2); a speed profile lists the speed rigs landing on each tile.

const pop = (hero: string, day: number, n: number) =>
  Array.from({ length: n }, (_, i) => randomBuild(hero as Build["hero"], day, new Rng(hashSeed("bb-pop", 1, hero, day, i))));

const speedAt = (b: Build, ri: number) => speedProfile(b, ri).map((x) => x || "-");

describe("harness levers", () => {
  it("H2: a rig goes to the free cell beside its tile with the most hits on connected belts; ties go to the first in D3 order", () => {
    // Weaver: belt B up column 4 into connector 4, belt A up column 6 then over to connector 8; column 5 lies between them
    const b: Build = {
      hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 5 }], mods: [], beltCap: 24, hullBonus: 0,
      routes: [
        { factory: 1, cells: [K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
        { factory: 1, cells: [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(7, 1), K(8, 1), K(8, 0)] },
      ],
    };
    expect(validateBuild(b, 3).errors).toEqual([]);
    const s = new Shopper(b, maxGoldByDay(3), 3, new Rng(1));
    const lh = s.placeRig("longhaul", 0, 1)!; // tile (4,3): left of travel is (3,3) with 1 hit, right is (5,3) with 2
    expect([lh.x, lh.y, lh.rot]).toEqual([5, 3, 2]); // its first arrow faces the tile it was placed to work
    expect(hitsOfRig(b, lh.uid).map((h) => [h.route, h.tile])).toEqual([[0, 1], [1, 2]]);
    const ws = s.placeRig("whetstone", 0, 2)!; // tile (4,2): 1 hit either side, so the first in D3 order (left)
    expect([ws.x, ws.y, ws.rot]).toEqual([3, 2, 1]);
    expect(validateBuild(b, 3).errors).toEqual([]);
  });

  it("sync: a lone speed rig on one Crucible route is mirrored at the same tile index", () => {
    const b = heroStartBuild("foundry", 1);
    b.items.push({ uid: 50, def: "grease", x: 1, y: 3, rot: 1 }); // works route 0 (column 2), tile index 2
    const s = new Shopper(b, maxGoldByDay(5), 5, new Rng(3));
    expect(applyLever(s, "sync")).toBe(true);
    const [a, c] = routesOf(b, b.items[0].uid);
    expect(speedAt(b, a)).toEqual(speedAt(b, c));
    expect(speedAt(b, c)[2]).toBe("grease");
    expect(estimateRoute(b, a).time).toBeCloseTo(estimateRoute(b, c).time, 9);
    expect(exceptPairs(validateBuild(b, 5).errors)).toEqual([]); // stars off: two 1-star GREASE WORKS
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

  it("order: flat-bonus rigs move ahead of Splitters on the cells the rigs already hold", () => {
    const b = heroStartBuild("furnace", 1); // Kiln route: (4,5) .. (4,0); the rigs stand left of it
    b.items.push(
      { uid: 60, def: "splitter", x: 3, y: 4 }, // works tile 1 (4,4)
      { uid: 61, def: "temper", x: 3, y: 3, rot: 1 }, // tile 2
      { uid: 62, def: "whetstone", x: 3, y: 2, rot: 1 }, // tile 3
    );
    const cells = b.items.map((p) => K(p.x, p.y)).sort();
    const cost = buildCost(b).total;
    expect(routesOutOfOrder(b)).toEqual([0]);
    const s = new Shopper(b, maxGoldByDay(4), 4, new Rng(5));
    expect(applyLever(s, "order")).toBe(true);
    expect(gateSeq(b, 0).map((g) => [g.def.id, g.ci])).toEqual([["whetstone", 1], ["temper", 2], ["splitter", 3]]);
    expect(routesOutOfOrder(b)).toEqual([]);
    expect(b.items.map((p) => K(p.x, p.y)).sort()).toEqual(cells); // the same cells, swapped
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
          expect(exceptPairs(validateBuild(b2, 5).errors)).toEqual([]); // stars-off population
        }
      }
    }
    expect(dropped).toBeGreaterThan(5);
  }, 30_000);

  it("no rig is ever left idle or on a belt tile (every rig lands an arrow on a connected belt), and no Crucible route is ever dropped", () => {
    let rigs = 0, multi = 0;
    for (const hero of HARNESS_HEROES) {
      for (const day of [2, 6, 10]) {
        for (const b of pop(hero, day, 12)) {
          const occ = occupancy(b), hits = rigHits(b);
          for (const p of b.items) {
            if (ITEMS[p.def].kind !== "gate") continue;
            rigs++;
            expect(occ[K(p.x, p.y)].route, `${hero} d${day}: ${p.def} on a belt`).toBe(-1);
            const hs = hitsOfRig(b, p.uid, hits);
            expect(hs.length, `${hero} d${day}: ${p.def} idle`).toBeGreaterThan(0);
            for (const h of hs) expect(routeInfo(b, h.route, undefined, undefined, hits).connected).toBe(true);
            if (hs.length >= 2) multi++;
          }
          if (hero === "foundry") expect(routesOf(b, b.items.find((p) => p.def === "crucible")!.uid)).toHaveLength(2);
        }
      }
    }
    expect(rigs).toBeGreaterThan(500);
    expect(multi).toBeGreaterThan(0); // greedy placement finds multi-hit spots (H2)
  }, 60_000);

  it("fullPurseBuild spends at least 90% of the day's gold, legally, and is reproducible", () => {
    for (const hero of ["furnace", "weaver"] as const) {
      for (const day of [1, 2, 5, 10]) {
        for (let i = 0; i < 4; i++) {
          const f = fullPurseBuild(hero, day, hashSeed("fp-test", hero, day, i));
          expect(f.floorMet).toBe(true);
          expect(f.cost).toBe(buildCost(f.build).total);
          expect(f.cost).toBeGreaterThanOrEqual(spendFloor(day));
          expect(exceptPairs(validateBuild(f.build, day).errors)).toEqual([]); // stars off
          expect(JSON.stringify(fullPurseBuild(hero, day, hashSeed("fp-test", hero, day, i)).build)).toBe(JSON.stringify(f.build));
        }
      }
    }
  }, 60_000);
});

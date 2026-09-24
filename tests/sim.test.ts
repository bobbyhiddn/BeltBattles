import { describe, expect, it } from "vitest";
import { simulate, Battle } from "../src/sim/battle";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import {
  canExtend, cloneBuild, connectorClaims, estimateRoute, key, moveItem, rotField, routeInfo, type Build,
} from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { buyOffer, newRun } from "../src/game/run";
import { ITEMS } from "../src/sim/content";

const K = key;

function furnace(route: number[], extra: Partial<Build> = {}): Build {
  return {
    hero: "furnace",
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }],
    routes: [{ factory: 1, cells: route }],
    mods: [], beltCap: 40, hullBonus: 0, ...extra,
  };
}

const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const LONG = [
  K(3, 7), K(2, 7), K(1, 7), K(1, 6), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(2, 2), K(3, 2), K(3, 1), K(4, 1), K(4, 0),
];

function firstShot(b: Build, seed = 7): number {
  const bt = new Battle(b, warlordBuild("weaver", 1), seed);
  while (!bt.over && bt.sides[0].stats.firstShot < 0 && bt.t < 60) bt.step();
  return bt.sides[0].stats.firstShot;
}

describe("routing and timing (acceptance 1)", () => {
  it("route shapes are valid and connected", () => {
    expect(routeInfo(furnace(SHORT), 0).connected).toBe(true);
    expect(routeInfo(furnace(LONG), 0).connected).toBe(true);
  });

  it("a longer connected route delays the first arrival", () => {
    const a = firstShot(furnace(SHORT));
    const b = firstShot(furnace(LONG));
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a + 1.5);
  });

  it("moving the factory changes the route and its timing", () => {
    const b = furnace(SHORT);
    const before = estimateRoute(b, 0).time;
    const moved = cloneBuild(b);
    moveItem(moved, 1, 4, 8); // route no longer attaches -> dropped
    expect(moved.routes.length).toBe(0);
    moved.routes.push({ factory: 1, cells: [K(4, 7), K(4, 6), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] });
    expect(estimateRoute(moved, 0).time).toBeGreaterThan(before);
  });

  it("belts cannot cross and cannot exceed capacity", () => {
    const b = startingBuild("weaver", 1);
    // (4,3) belongs to the middle route
    const pending = [K(3, 6)];
    expect(canExtend(b, 1, [], K(3, 6), -1).ok).toBe(true);
    expect(canExtend(b, 1, pending, K(3, 7), -1).ok).toBe(true);
    const crossing = canExtend(b, 1, [K(5, 4)], K(4, 4), -1);
    expect(crossing.ok).toBe(false);
    const tight = { ...b, beltCap: 21 };
    expect(canExtend(tight, 1, [], K(3, 6), -1).reason).toBe("OUT OF BELT");
  });
});

describe("gate order (acceptance 2)", () => {
  const route = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
  // 0.6.2 BELTSIDE: rigs stand west of the tiles they work, (4,4) then (4,2), facing east
  const east = (def: string) => rotField(def, rotFacing(def, 1));
  const withGates = (a: string, b: string): Build =>
    furnace(route, {
      items: [
        { uid: 1, def: "kiln", x: 4, y: 6 },
        { uid: 2, def: a, x: 3, y: 4, ...east(a) },
        { uid: 3, def: b, x: 3, y: 2, ...east(b) },
      ],
    });

  it("long haul after other gates beats long haul first", () => {
    const early = estimateRoute(withGates("longhaul", "temper"), 0).dmg;
    const late = estimateRoute(withGates("temper", "longhaul"), 0).dmg;
    expect(late).toBeGreaterThan(early);
  });

  it("splitting before a flat bonus differs from after", () => {
    const flatFirst = estimateRoute(withGates("whetstone", "splitter"), 0);
    const splitFirst = estimateRoute(withGates("splitter", "whetstone"), 0);
    expect(flatFirst.copies).toBe(2);
    expect(splitFirst.copies).toBe(2);
    expect(splitFirst.dmg).toBeGreaterThan(flatFirst.dmg);
  });

  it("brake shoe cooks cinder slugs hotter but later", () => {
    const plain = estimateRoute(furnace(route), 0);
    const braked = estimateRoute(furnace(route, {
      items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "brake", x: 3, y: 4, ...east("brake") }],
    }), 0);
    expect(braked.time).toBeGreaterThan(plain.time);
    expect(braked.dmg).toBeGreaterThan(plain.dmg);
  });
});

describe("supported production only (acceptance 3)", () => {
  it("a disconnected route never fires", () => {
    const b = furnace([K(4, 5), K(4, 4), K(4, 3)]);
    expect(routeInfo(b, 0).connected).toBe(false);
    const bt = simulate(b, warlordBuild("weaver", 1), 3);
    expect(bt.sides[0].stats.shots).toBe(0);
    expect(bt.winner).toBe(1);
  });

  it("each connector feeds only one route", () => {
    const b = furnace(SHORT, {
      items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 }],
      routes: [
        { factory: 1, cells: SHORT },
        { factory: 2, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
      ],
    });
    const claims = connectorClaims(b);
    expect(claims.get(4)).toBe(0);
    expect(claims.get(5)).toBe(1);
  });
});

describe("congestion and determinism (acceptance 4)", () => {
  it("same builds and seed replay identically", () => {
    const p = startingBuild("furnace", 1);
    const e = warlordBuild("weaver", 3);
    const a = simulate(p, e, 42);
    const b = simulate(p, e, 42);
    expect(a.t).toBe(b.t);
    expect(a.winner).toBe(b.winner);
    expect(a.sides[0].hull.hp).toBe(b.sides[0].hull.hp);
    expect(a.sides[1].stats.shots).toBe(b.sides[1].stats.shots);
  });

  it("over-production backs up and jams the chamber, reproducibly", () => {
    // 0.6.2 BELTSIDE: a SPLITTER west of the kiln belt at (4,4) and one east of the press belt at (5,3)
    const b = furnace(SHORT, {
      items: [
        { uid: 1, def: "kiln", x: 4, y: 6 },
        { uid: 2, def: "press", x: 6, y: 6 },
        { uid: 3, def: "splitter", x: 3, y: 4, rot: 1 },
        { uid: 4, def: "splitter", x: 6, y: 3 },
      ],
      routes: [
        { factory: 1, cells: SHORT },
        { factory: 2, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
      ],
    });
    const a = simulate(b, warlordBuild("weaver", 1), 11);
    const c = simulate(b, warlordBuild("weaver", 1), 11);
    expect(a.sides[0].stats.maxQueue).toBeGreaterThanOrEqual(3);
    expect(a.sides[0].stats.jams).toBeGreaterThan(0);
    expect(a.sides[0].stats.jams).toBe(c.sides[0].stats.jams);
  });

  it("battles end (dark wind) and warlord builds are valid", () => {
    for (const h of ["weaver", "furnace"] as const) {
      for (let r = 1; r <= 9; r++) {
        const w = warlordBuild(h, r);
        w.routes.forEach((_, i) => expect(routeInfo(w, i).connected).toBe(true));
        const bt = simulate(startingBuild(h === "weaver" ? "furnace" : "weaver", 1), w, 5 + r);
        expect(bt.over).toBe(true);
        expect(bt.t).toBeLessThan(90);
      }
    }
  });
});

describe("shop consistency (acceptance 5)", () => {
  it("buying yields exactly the offered item and a sold slot cannot charge twice", () => {
    const run = newRun("furnace", 1234);
    run.gold = 100;
    const offer = run.shop.wagons[0].offers[0];
    const before = run.gold;
    const res = buyOffer(run, 0, 0);
    expect(res.ok).toBe(true);
    expect(run.gold).toBe(before - offer.price);
    if (ITEMS[offer.def].kind === "supply") expect(res.consumed).toBe(offer.def);
    else expect(res.item?.def).toBe(offer.def);
    const again = buyOffer(run, 0, 0);
    expect(again.ok).toBe(false);
    expect(run.gold).toBe(before - offer.price);
    const count = run.shop.wagons.reduce((n, w) => n + w.offers.length, 0);
    expect(count).toBe(5);
  });
});

describe("balance smoke", () => {
  it("round-1 matchups are decided in a sensible time", () => {
    const f = simulate(startingBuild("furnace", 1), warlordBuild("weaver", 1), 99);
    const w = simulate(startingBuild("weaver", 1), warlordBuild("furnace", 1), 99);
    // eslint-disable-next-line no-console
    console.log("furnace vs weaver r1:", f.winner, f.t.toFixed(1), f.sides.map((s) => Math.round(s.hull.hp)));
    // eslint-disable-next-line no-console
    console.log("weaver vs furnace r1:", w.winner, w.t.toFixed(1), w.sides.map((s) => Math.round(s.hull.hp)));
    expect(f.t).toBeGreaterThan(8);
    expect(w.t).toBeGreaterThan(8);
  });
});

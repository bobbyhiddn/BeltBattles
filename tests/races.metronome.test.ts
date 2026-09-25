import { describe, expect, it } from "vitest";
import { Battle, simulate, type Payload } from "../src/sim/battle";
import { DISRUPT_TIME, HEROES, ITEMS, type HeroId } from "../src/sim/content";
import { estimateRoute, key as K, routeInfo, type Build, type Placed } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { migrateInlineGates } from "../src/sim/beltside";
import { DORMANT_ITEMS, PEAK_SHIFT, heroRules, pendulumCurve } from "../src/sim/races/data";
import { adaptableHead, peakRide } from "../src/sim/races/metronome";
import { dummyFoe, expectSaneBattles, shots } from "./races.helpers";

// Routes from the Clockworks at (4,6) into the adaptable turret (connectors 4 and 5), by tiles.
const ROUTES: Record<number, number[]> = {
  6: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)],
  7: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(5, 1), K(5, 0)],
  8: [K(4, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)],
  10: [K(4, 5), K(3, 5), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(3, 2), K(4, 2), K(4, 1), K(4, 0)],
  12: [K(4, 5), K(3, 5), K(2, 5), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(2, 2), K(3, 2), K(4, 2), K(4, 1), K(4, 0)],
  13: [K(4, 5), K(3, 5), K(2, 5), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(2, 2), K(3, 2), K(4, 2), K(5, 2), K(5, 1), K(5, 0)],
};
const TILES = Object.keys(ROUTES).map(Number);
const ride = (n: number) => 0.4 * n + 0.2;

/** 0.6.2 BELTSIDE: `gates` name the belt tiles their rigs work; D3 (migrateInlineGates) stands each beside its tile. */
function metro(tiles: number, gates: [string, number, number][] = [], mod?: string): Build {
  const items: Placed[] = [{ uid: 1, def: "clockworks", x: 4, y: 6 }];
  gates.forEach(([def, x, y], i) => items.push({ uid: 10 + i, def, x, y }));
  const mods = mod ? [{ uid: 50, def: mod, turret: 0 }] : [];
  const b: Build = { hero: "metronome", items, routes: [{ factory: 1, cells: [...ROUTES[tiles]] }], mods, beltCap: 20, hullBonus: 0 };
  migrateInlineGates(b);
  return b;
}

/** Rides of side-0 pendulum slugs as they sit in the chamber (ride no longer changes there). */
function chamberRides(b: Battle, secs: number, each?: (b: Battle) => void): Map<number, number> {
  const rides = new Map<number, number>();
  while (!b.over && b.t < secs) {
    b.step();
    b.events.length = 0;
    each?.(b);
    for (const tu of b.sides[0].turrets) for (const p of tu.stack) if (p.ammo === "pendulum") rides.set(p.id, p.ride);
  }
  return rides;
}

describe("METRONOME pendulum curve", () => {
  it("samples at 6, 8, 10 and 12 tiles: 6.4, 7.2, 8, 7.2 (curve, route estimate and battle)", () => {
    const want: Record<number, number> = { 6: 4 + 4 * (1 - 1.6 / 4), 8: 4 + 4 * (1 - 0.8 / 4), 10: 8, 12: 4 + 4 * (1 - 0.8 / 4) };
    for (const n of [6, 8, 10, 12]) {
      expect(pendulumCurve(ride(n))).toBeCloseTo(want[n], 9);
      const b = metro(n);
      expect(routeInfo(b, 0).connected).toBe(true);
      const est = estimateRoute(b, 0);
      expect(est.ride).toBeCloseTo(ride(n), 9);
      expect(est.dmg).toBeCloseTo(want[n], 9);
      const fired = shots(new Battle(b, dummyFoe(), 5), 15);
      expect(fired.length).toBeGreaterThan(4);
      for (const s of fired) expect(s.dmg).toBeCloseTo(want[n], 9);
    }
    expect(pendulumCurve(0.2)).toBeCloseTo(4, 12);
    expect(pendulumCurve(8.2)).toBeCloseTo(4, 12);
    expect(pendulumCurve(0)).toBe(4);
  });

  it("ESCAPEMENT moves the peak to 7 tiles and LONGCASE to 13; no module peaks at 10", () => {
    for (const [mod, peak] of [[undefined, 10], ["escapement", 7], ["longcase", 13]] as const) {
      const dmg = TILES.map((n) => estimateRoute(metro(n, [], mod), 0).dmg);
      expect(TILES[dmg.indexOf(Math.max(...dmg))], String(mod)).toBe(peak);
      expect(Math.max(...dmg)).toBeCloseTo(8, 9);
      expect(peakRide(metro(10, [], mod), 0)).toBeCloseTo(ride(peak), 12);
      const fired = shots(new Battle(metro(peak, [], mod), dummyFoe(), 5), 15);
      expect(fired.length).toBeGreaterThan(4);
      for (const s of fired) expect(s.dmg).toBeCloseTo(8, 9);
    }
    expect(PEAK_SHIFT).toEqual({ escapement: -1.2, longcase: 1.2 });
  });

  it("the modules touch pendulum slugs only: a Furnace carrying one fights exactly as before", () => {
    const f = heroStartBuild("furnace", 1);
    const esc: Build = { ...f, mods: [{ uid: 99, def: "escapement", turret: 0 }] };
    const w = heroStartBuild("weaver", 100);
    for (const seed of [1, 2, 3]) {
      const a = simulate(f, w, seed), b = simulate(esc, w, seed);
      expect([b.winner, b.ticks, b.sides[0].hull.hp, b.sides[1].hull.hp]).toEqual([a.winner, a.ticks, a.sides[0].hull.hp, a.sides[1].hull.hp]);
    }
    expect(estimateRoute(esc, 0)).toEqual(estimateRoute(f, 0));
  });
});

describe("METRONOME speed lock", () => {
  const gates: [string, number, number][] = [["grease", 2, 4], ["brake", 2, 3], ["overdrive", 2, 2]];

  it("Grease, Brake and Overdrive leave ride at exactly 0.4n + 0.2 s, and still count as gates", () => {
    const b = metro(10, gates);
    expect(estimateRoute(b, 0).ride).toBeCloseTo(ride(10), 9);
    const rides = chamberRides(new Battle(b, dummyFoe(), 3), 30);
    expect(rides.size).toBeGreaterThan(15);
    for (const r of rides.values()) expect(r).toBeCloseTo(ride(10), 9);
    const lh = metro(10, [["grease", 2, 4], ["longhaul", 2, 3]]);
    expect(estimateRoute(lh, 0).dmg).toBeCloseTo(8 + 1 + 2, 9); // Grease adds locked damage; Long Haul still counts it
  });

  it("each speed rig gives locked belts useful damage at every star without moving the pendulum beat", () => {
    for (const [def, x, y] of gates) for (const stars of [1, 2, 3]) {
      const b = metro(10, [[def, x, y]]);
      b.items.find((p) => p.def === def)!.stars = stars;
      const bonus = ITEMS[def].levels?.[stars as 2 | 3]?.gate?.lockedFlat ?? ITEMS[def].gate!.lockedFlat!;
      const ordinary = ITEMS[def].levels?.[stars as 2 | 3]?.gate?.flat ?? 0;
      const walk = estimateRoute(b, 0);
      expect(walk.ride, `${def} ${stars} stars`).toBeCloseTo(ride(10), 9);
      expect(walk.dmg, `${def} ${stars} stars`).toBeCloseTo(8 + bonus + ordinary, 9);
      const fired = shots(new Battle(b, dummyFoe(), 5), 15);
      expect(fired.length).toBeGreaterThan(4);
      for (const s of fired) expect(s.dmg, `${def} ${stars} stars`).toBeCloseTo(8 + bonus + ordinary, 9);
    }
  });

  it("enemy Drag never lands on Metronome belts: ride stays exactly 0.4n + 0.2 s", () => {
    const foe = heroStartBuild("siphon", 100);
    const b = new Battle(metro(10, gates), foe, 11);
    const dragShots = new Set<number>();
    const rides = chamberRides(b, 40, (bt) => {
      for (const pr of bt.projectiles) {
        if (pr.from === 1 && pr.payload.ammo === "leechDrag" && pr.target.kind !== "hull") dragShots.add(pr.id);
      }
    });
    expect(dragShots.size).toBeGreaterThan(5);
    expect(rides.size).toBeGreaterThan(10);
    for (const r of rides.values()) expect(r).toBeCloseTo(ride(10), 9);
    expect(b.sides[0].race!.drag.hits).toBe(0);
    expect(b.sides[0].race!.drag.until.every((cells) => cells.every((u) => u === 0))).toBe(true);
    // control: the same Siphon does drag a Furnace
    const c = new Battle(heroStartBuild("furnace", 1), foe, 11);
    while (!c.over && c.t < 40) c.step();
    expect(c.sides[0].race!.drag.hits).toBeGreaterThan(0);
  });

  it("stopped time (Shock) delays a slug but adds no ride", () => {
    const b = new Battle(metro(10), dummyFoe(), 3);
    const born = new Map<number, number>(), arrived = new Map<number, number>();
    const stop = (bt: Battle) => {
      const r = bt.sides[0].routes[0];
      if (bt.ticks === 180 || bt.ticks === 480) r.cellDisrupt.fill(DISRUPT_TIME); // Shock the whole belt at 3 s and 8 s
      for (const a of r.ammo) if (!born.has(a.p.id)) born.set(a.p.id, bt.t);
      for (const p of bt.sides[0].turrets[0].stack) if (!arrived.has(p.id)) arrived.set(p.id, bt.t);
    };
    const rides = chamberRides(b, 20, stop);
    expect(rides.size).toBeGreaterThan(8);
    for (const r of rides.values()) expect(r).toBeCloseTo(ride(10), 9);
    const travel = [...arrived].map(([id, t]) => t - (born.get(id) ?? t));
    expect(Math.max(...travel)).toBeGreaterThan(ride(10) + 1.4);
  });
});

describe("METRONOME rules data (rulings 4-6)", () => {
  it("free module swap and speed lock are Metronome's alone; there is no hero shop exclusion", () => {
    for (const h of Object.keys(HEROES) as HeroId[]) {
      expect(heroRules(h).freeModuleSwap, h).toBe(h === "metronome");
      expect(heroRules(h).speedLock, h).toBe(h === "metronome");
      expect("shopExclude" in heroRules(h), h).toBe(false);
    }
  });

  // 0.6.1f (REQ-BFG-021): a neutral dormant flag replaced ITEM_POOL's "beastfolk" mark; no faction pools
  it("ESCAPEMENT and LONGCASE are dormant turret modules priced like Calibration: both dormant, no merchant sells either", () => {
    expect([...DORMANT_ITEMS].sort()).toEqual(["escapement", "longcase"]);
    for (const id of ["escapement", "longcase"]) {
      const d = ITEMS[id];
      expect(d.kind).toBe("mod");
      expect(d.price).toBe(ITEMS.calibrate.price);
      expect(d.rarity).toBe(ITEMS.calibrate.rarity);
      expect(d.merchant).toBeUndefined();
      expect(DORMANT_ITEMS.has(id)).toBe(true);
    }
  });

  it("head art: no beastfolk module shows HAMMER, ESCAPEMENT REPEATER, LONGCASE LANCE", () => {
    expect(adaptableHead(metro(10), 0)).toBe("hammer");
    expect(adaptableHead(metro(10, [], "calibrate"), 0)).toBe("hammer");
    expect(adaptableHead(metro(10, [], "escapement"), 0)).toBe("repeater");
    expect(adaptableHead(metro(10, [], "longcase"), 0)).toBe("lance");
  });
});

describe("METRONOME battles", () => {
  it("vs Furnace, Weaver, Foundry and Bastion (start and days 1/5/10, 10 seeds, both sides) end before the cap with no NaN", () => {
    expectSaneBattles("metronome", ["furnace", "weaver", "foundry", "bastion"]);
  });

  // A copy is placed 0.01 px behind its parent's pre-move position with the parent's post-move
  // ride, so it re-rides at most one tick of belt (0.5 px, 1/60 s). That quirk predates the races
  // work and Furnace shares it; the sim keeps it so Furnace stays bit-identical.
  it("splitter copies keep the parent's ride time (within one tick)", () => {
    const b = new Battle(metro(10, [["splitter", 2, 3]]), dummyFoe(), 2);
    const seen: Payload[] = [];
    while (b.t < 20) {
      b.step();
      b.events.length = 0;
      for (const p of b.sides[0].turrets[0].stack) if (!seen.includes(p)) seen.push(p);
    }
    expect(seen.filter((p) => p.copy).length).toBeGreaterThan(10);
    for (const p of seen) {
      expect(p.ride).toBeGreaterThanOrEqual(ride(10) - 1e-9);
      expect(p.ride).toBeLessThanOrEqual(ride(10) + 0.51 / 30);
    }
  });
});

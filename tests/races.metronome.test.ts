import { describe, expect, it } from "vitest";
import { Battle, type Payload } from "../src/sim/battle";
import { DISRUPT_TIME, HEROES, ITEMS, type HeroId } from "../src/sim/content";
import { estimateRoute, key as K, routeInfo, type Build, type Placed } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { migrateInlineGates } from "../src/sim/beltside";
import { DORMANT_ITEMS, PEAK_SHIFT, heroRules, pendulumCurve } from "../src/sim/races/data";
import { adaptableHead, peakRide } from "../src/sim/races/metronome";
import { effectAt } from "../src/sim/stars";
import { pct, roundHalfUp } from "../src/sim/pct";
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
  it("samples at 6, 8, 10 and 12 tiles: 64, 72, 80, 72 (curve, route estimate and battle)", () => {
    // NUM-1: the curve x10 (floor and swing 4 -> 40; was 6.4, 7.2, 8, 7.2); the route estimate and every fired shot are
    // the curve rounded half up once (whole)
    const want: Record<number, number> = { 6: 40 + 40 * (1 - 1.6 / 4), 8: 40 + 40 * (1 - 0.8 / 4), 10: 80, 12: 40 + 40 * (1 - 0.8 / 4) };
    for (const n of [6, 8, 10, 12]) {
      expect(pendulumCurve(ride(n))).toBeCloseTo(want[n], 9);
      const b = metro(n);
      expect(routeInfo(b, 0).connected).toBe(true);
      const est = estimateRoute(b, 0);
      expect(est.ride).toBeCloseTo(ride(n), 9);
      expect(est.dmg).toBe(roundHalfUp(want[n]));
      const fired = shots(new Battle(b, dummyFoe(), 5), 15);
      expect(fired.length).toBeGreaterThan(4);
      for (const s of fired) expect(s.dmg).toBe(roundHalfUp(want[n]));
    }
    expect(pendulumCurve(0.2)).toBeCloseTo(40, 12); // NUM-1: x10 (was 4)
    expect(pendulumCurve(8.2)).toBeCloseTo(40, 12);
    expect(pendulumCurve(0)).toBe(40);
  });

  it("ESCAPEMENT moves the peak to 7 tiles and LONGCASE to 13; no module peaks at 10", () => {
    for (const [mod, peak] of [[undefined, 10], ["escapement", 7], ["longcase", 13]] as const) {
      const dmg = TILES.map((n) => estimateRoute(metro(n, [], mod), 0).dmg);
      expect(TILES[dmg.indexOf(Math.max(...dmg))], String(mod)).toBe(peak);
      expect(Math.max(...dmg)).toBe(80); // NUM-1: the peak x10 (was 8), whole
      expect(peakRide(metro(10, [], mod), 0)).toBeCloseTo(ride(peak), 12);
      const fired = shots(new Battle(metro(peak, [], mod), dummyFoe(), 5), 15);
      expect(fired.length).toBeGreaterThan(4);
      for (const s of fired) expect(s.dmg).toBe(80);
    }
    expect(PEAK_SHIFT).toEqual({ escapement: -1.2, longcase: 1.2 });
  });

  it("the timing mods have useful effects on other ammo without changing the pendulum curve", () => {
    expect(ITEMS.escapement.mod).toEqual({ fireMul: 0.9 });
    expect(ITEMS.longcase.mod).toEqual({ longRideFlat: 15, longRideMin: 2 }); // NUM-1: the flat x10 (was 1.5); 2 s of ride is a time
    expect(ITEMS.escapement.levels?.[2]?.mod?.fireMul).toBe(0.86);
    expect(ITEMS.escapement.levels?.[3]?.mod?.fireMul).toBe(0.82);
    expect(ITEMS.longcase.levels?.[2]?.mod?.longRideFlat).toBe(25); // NUM-1: x10 (was 2.5)
    expect(ITEMS.longcase.levels?.[3]?.mod?.longRideFlat).toBe(40); // NUM-1: x10 (was 4)
    expect(ITEMS.escapement.desc.join(" ")).toContain("FIRES 10% FASTER");
    expect(ITEMS.longcase.desc.join(" ")).toContain("OTHER SLUGS: +1.5");
    expect(ITEMS.longcase.desc.join(" ")).toContain("PENDULUM PEAK +1.2S");
    for (const [id, tiles] of [["escapement", 7], ["longcase", 13]] as const) {
      const b = metro(tiles, [], id);
      b.mods[0].stars = 3;
      expect(peakRide(b, 0)).toBeCloseTo(ride(tiles), 9);
      expect(estimateRoute(b, 0).dmg).toBe(80); // NUM-1: the peak x10 (was 8), whole
    }
  });

  it("HEAT JACKET's ride heat is flat damage on the pendulum curve, in the route estimate and in battle (0.6.2)", () => {
    // the jacket works tile 3 (K(2,4)), whose centre a slug crosses at 1.4 s; it rides on to the chamber at ride(10)
    const heatRide = ride(10) - (3 * 12 + 6) / 30;
    for (const [stars, heat] of [[1, 4], [2, 9], [3, 14]] as const) { // NUM-1: heat a second x10 (was 0.4, 0.9, 1.4)
      const b = metro(10, [["heatjacket", 2, 4]]);
      b.items.find((p) => p.def === "heatjacket")!.stars = stars;
      // NUM-1: whole: the peak 80 (was 8) + the heat flat, rounded half up once: 91.2 -> 91, 105.2 -> 105, 119.2 -> 119
      const want = roundHalfUp(80 + heat * heatRide);
      const est = estimateRoute(b, 0);
      expect(est.ride, `${stars} stars`).toBeCloseTo(ride(10), 9);
      expect(est.dmg, `${stars} stars`).toBe(want);
      const fired = shots(new Battle(b, dummyFoe(), 5), 15);
      expect(fired.length).toBeGreaterThan(4);
      for (const s of fired) expect(s.dmg, `${stars} stars`).toBe(want);
    }
  });

  it("Longcase adds long-ride damage in both signature and bought-core firing", () => {
    let plain = 0; // NUM-1: the signature first shot (whole), which HULLBREAKER's x1.3 takes
    for (const core of [undefined, "hullbreaker"] as const) {
      const base = heroStartBuild("furnace", 1);
      if (core) base.mods.push({ uid: 50, def: core, turret: 0 });
      const a = shots(new Battle(base, dummyFoe(), 5), 12);
      expect(a.length).toBeGreaterThan(3);
      if (!core) plain = a[0].dmg;
      else expect(a[0].dmg).toBe(pct(plain, 130));
      for (const [stars, flat] of [[1, 15], [2, 25], [3, 40]] as const) { // NUM-1: x10 (was 1.5, 2.5, 4)
        const boosted: Build = { ...base, mods: [...base.mods, { uid: 51, def: "longcase", turret: 0, stars }] };
        const b = shots(new Battle(boosted, dummyFoe(), 5), 12);
        expect(b.length).toBe(a.length);
        // NUM-1: HULLBREAKER's x1.3 rounds half up once on the whole shot, so with it the gain is the difference of two
        // rounded shots (was exactly flat x 1.3)
        expect(b[0].dmg - a[0].dmg).toBe(core ? pct(plain + flat, 130) - pct(plain, 130) : flat);
      }
    }
  });
});

describe("METRONOME speed lock", () => {
  const gates: [string, number, number][] = [["grease", 2, 4], ["brake", 2, 3], ["overdrive", 2, 2]];
  // 0.6.2: SURGE VALVE's pulse is a speed change too, so a locked belt takes its locked flat instead (REQ-BFG-021)
  const speedRigs: [string, number, number][] = [...gates, ["surge", 3, 2]];

  it("Grease, Brake and Overdrive leave ride at exactly 0.4n + 0.2 s, and still count as gates", () => {
    const b = metro(10, gates);
    expect(estimateRoute(b, 0).ride).toBeCloseTo(ride(10), 9);
    const rides = chamberRides(new Battle(b, dummyFoe(), 3), 30);
    expect(rides.size).toBeGreaterThan(15);
    for (const r of rides.values()) expect(r).toBeCloseTo(ride(10), 9);
    const lh = metro(10, [["grease", 2, 4], ["longhaul", 2, 3]]);
    // Grease adds locked damage; Long Haul still counts it. NUM-1: 80 + 10 + 10 = 100 (was 8 + 1 + 1; Grease's 1 now read
    // from the data)
    expect(estimateRoute(lh, 0).dmg).toBe(80 + ITEMS.grease.gate!.lockedFlat! + effectAt("longhaul", 1).gate!.perPriorGate!);
  });

  it("each speed rig gives locked belts useful damage at every star without moving the pendulum beat", () => {
    for (const [def, x, y] of speedRigs) for (const stars of [1, 2, 3]) {
      const b = metro(10, [[def, x, y]]);
      b.items.find((p) => p.def === def)!.stars = stars;
      const bonus = ITEMS[def].levels?.[stars as 2 | 3]?.gate?.lockedFlat ?? ITEMS[def].gate!.lockedFlat!;
      const ordinary = ITEMS[def].levels?.[stars as 2 | 3]?.gate?.flat ?? 0;
      const want = 80 + bonus + ordinary; // NUM-1: the peak x10 (was 8); the rigs' flats are whole, so the shot is too
      const walk = estimateRoute(b, 0);
      expect(walk.ride, `${def} ${stars} stars`).toBeCloseTo(ride(10), 9);
      expect(walk.dmg, `${def} ${stars} stars`).toBe(want);
      const fired = shots(new Battle(b, dummyFoe(), 5), 15);
      expect(fired.length).toBeGreaterThan(4);
      for (const s of fired) expect(s.dmg, `${def} ${stars} stars`).toBe(want);
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

  it("ESCAPEMENT and LONGCASE are sold shared turret modules priced like Calibration", () => {
    for (const id of ["escapement", "longcase"]) expect(DORMANT_ITEMS.has(id)).toBe(false);
    for (const id of ["escapement", "longcase"]) {
      const d = ITEMS[id];
      expect(d.kind).toBe("mod");
      expect(d.price).toBe(ITEMS.calibrate.price);
      expect(d.rarity).toBe(ITEMS.calibrate.rarity);
      expect(d.merchant).toBe("gunsmith");
      expect(DORMANT_ITEMS.has(id)).toBe(false);
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

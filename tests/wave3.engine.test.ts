// 0.8.0 P1 (BRIEF-wave3-P1 M2; DESIGN-wave3.md 3.2; VERIFIED-D1 Q4-Q7): wave 3's six engine pieces, each with its guard.
// E1 plating on every hull, E2 pairs, E3 stokers, E4 holds (TWIN LATCH), E5 crossfire (PINCER), E6 matched belts
// (TWIN GAUGE). Each piece runs only when its wave-3 part is on that side; tests/wave3.guard.test.ts replays decks without
// one bit for bit against a fixture frozen on v070-rc, and the fingerprints (output-P1/fp) prove the same at scale.
import { describe, expect, it } from "vitest";
import { Battle, type Payload, type Projectile, type SimEvent } from "../src/sim/battle";
import { PLATE_CAP, absorb, newPlateState } from "../src/sim/races/bastion";
import { SYNC_WINDOW } from "../src/sim/races/foundry";
import { estimateRoute, matchedRoutes, rigFactoryHits, rigHits, stokeHits, walkRoute, type Build } from "../src/sim/deck";
import { stokeSpots, stokesIfPlaced, hitsIfPlaced } from "../src/sim/beltside";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { K, SEED, barge, events, furnaceBench, item, latchDeck, pastTile, run, twoPress, withItem, withMod } from "./wave3.helpers";

const plain = (id: number): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 0, copy: false });
/** A projectile from side `from` that lands `dmg` on the other side's bare hull. */
const shot = (from: 0 | 1, dmg: number): Projectile => ({
  id: 999, from, turret: 0, payload: plain(998), dmg, t: 0, flight: 0,
  target: { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 }, tx: 60, ty: 60, heavy: false,
});
const impact = (bt: Battle, pr: Projectile) => (bt as unknown as { impact(p: Projectile): void }).impact(pr);
const typeCount = (ev: { e: SimEvent }[], type: string, side?: number) => ev.filter((x) => x.e.type === type && (side === undefined || ("side" in x.e && x.e.side === side))).length;

describe("E1: plating on every hull (SideState.plate, the Prime's Q4)", () => {
  it("every side has a pool; addPlate caps it at 24 and fires a plate event for what lands", () => {
    const bt = new Battle(furnaceBench(), barge(), SEED);
    const s = bt.sides[0];
    expect(s.plate).toEqual(newPlateState());
    expect(bt.sides[1].plate).toEqual(newPlateState());
    expect(bt.addPlate(s, 10)).toBe(10);
    expect(bt.addPlate(s, 20)).toBe(PLATE_CAP - 10);
    expect(bt.addPlate(s, 5)).toBe(0);
    expect(s.plate).toEqual({ plate: 24, gained: 24, absorbed: 0, peak: 24 });
    expect(bt.events.filter((e) => e.type === "plate").map((e) => (e as { amount: number }).amount)).toEqual([10, 14]);
    expect(bt.spendPlate(s, 1)).toBe(1);
    expect(s.plate.plate).toBe(23);
    expect(bt.events.at(-1)).toEqual({ type: "plate", side: 0, amount: -1, plate: 23 });
  });

  it("plating soaks impact damage with the Fray bonus point for point before the hull", () => {
    const bt = new Battle(furnaceBench(), barge(), SEED);
    const s = bt.sides[0], hp = s.hull.hp;
    bt.addPlate(s, 10);
    s.hull.fray = 5; // + 5 x 0.2 = 1 on every hit
    impact(bt, shot(1, 6)); // 7 with the bonus: all soaked
    expect([s.hull.hp, s.plate.plate, s.plate.absorbed]).toEqual([hp, 3, 7]);
    impact(bt, shot(1, 6)); // 7: 3 soaked, 4 through
    expect([s.hull.hp, s.plate.plate, s.plate.absorbed]).toEqual([hp - 4, 0, 10]);
    expect(bt.sides[1].stats.damage).toBe(14); // the attacker dealt the whole of both hits
  });

  it("plating soaks burn, poison and limpet ticks; the dark wind goes straight through it", () => {
    const bt = new Battle(furnaceBench(), barge(), SEED);
    const s = bt.sides[0], hp = s.hull.hp;
    bt.addPlate(s, 20);
    s.hull.burns.push({ dps: 2, t: 1 });
    s.hull.poison = { stacks: 5, t: 1 }; // 2 a second
    s.limpets.push({ at: bt.t + 0.5, target: { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 }, from: 1, blast: 5, stall: 0 });
    for (let i = 0; i < 70; i++) bt.step();
    expect(s.hull.hp).toBeCloseTo(hp, 9);
    expect(s.plate.plate).toBeCloseTo(20 - 2 - 2 - 5, 6);
    // the wind: past WIND_START it hits the hull, and plating doesn't move
    bt.t = 26;
    const plate = s.plate.plate, before = s.hull.hp;
    for (let i = 0; i < 60; i++) bt.step();
    expect(s.plate.plate).toBe(plate);
    expect(before - s.hull.hp).toBeCloseTo(s.stats.windTaken, 9);
    expect(s.stats.windTaken).toBeGreaterThan(0.9);
  });

  it("with no plating source a side keeps 0: absorb hands back the damage unchanged, and no plate event fires", () => {
    for (const x of [0, 0.1, 7, 1e9]) expect(absorb(newPlateState(), x)).toBe(x);
    const ev = events(heroStartBuild("furnace", 1), 60, heroStartBuild("weaver", 101), 7);
    expect(typeCount(ev, "plate")).toBe(0);
    const bt = run(heroStartBuild("furnace", 1), 60, heroStartBuild("weaver", 101), 7);
    expect(bt.sides.map((s) => s.plate)).toEqual([newPlateState(), newPlateState()]);
  });

  it("BASTION's plating is the same pool: RaceSide.plating IS SideState.plate (H1's plating bar reads either), no plate event", () => {
    const bt = new Battle(heroStartBuild("bastion", 1), barge(), SEED);
    expect(bt.sides[0].race!.plating).toBe(bt.sides[0].plate);
    let plates = 0;
    while (bt.t < 20) { bt.step(); plates += bt.drainEvents().filter((e) => e.type === "plate").length; }
    expect(bt.sides[0].plate.gained).toBeGreaterThan(0);
    expect(plates).toBe(0); // a race hero fires what it fired before
    // a FURNACE facing SIPHON gets a race side for Drag: it shares the pool too
    const vs = new Battle(heroStartBuild("furnace", 1), heroStartBuild("siphon", 101), SEED);
    expect(vs.sides[0].race!.plating).toBe(vs.sides[0].plate);
  });
});

describe("E2: pairs (Foundry's sync rule for any ammo, the Prime's Q5)", () => {
  const pairs = (b: Build, secs = 20) => typeCount(events(b, secs), "pair", 0);

  it("two equal belts into one gun pair their loads; a belt 0.4 s longer never does; one belt never pairs", () => {
    // CALIBRATION ★3 makes the heavy gun fast enough that nothing waits at its intakes, so loads enter as they arrive
    const reader = (b: Build) => withMod(withMod(b, 50, "seamwelder"), 51, "calibrate", 0, 3);
    expect(pairs(reader(twoPress()))).toBeGreaterThan(5);
    expect(pairs(reader(twoPress(true)))).toBe(0);
    expect(0.4).toBeGreaterThan(SYNC_WINDOW); // one tile at normal speed is outside the window
    const one = twoPress();
    one.routes.pop();
    expect(pairs(reader(one))).toBe(0);
    // a busy gun: loads that waited at both intakes enter on one tick when its chamber opens, so they pair
    expect(pairs(withMod(twoPress(true), 50, "seamwelder"))).toBeGreaterThan(0);
  });

  it("marks only in a pair-reading turret (TWIN TRIGGER or SEAM WELDER): without one, no record and no pair event", () => {
    const bt = new Battle(twoPress(), barge(), SEED);
    expect(bt.sides[0].pairs).toBeUndefined();
    expect(bt.sides[0].turrets[0].pairing).toBeUndefined();
    expect(pairs(twoPress())).toBe(0);
    for (const def of ["twintrigger", "seamwelder"]) {
      const b = new Battle(withMod(twoPress(), 50, def), barge(), SEED);
      expect(b.sides[0].turrets[0].pairing, def).toBe(true);
      expect(b.sides[0].pairs, def).toBeDefined();
    }
  });

  it("a FOUNDRY fusion is a pair: in a reading turret every fusion marks the alloy and fires a pair event", () => {
    const b = withMod(heroStartBuild("foundry", 1), 50, "seamwelder", 0);
    const ev = events(b, 30);
    const fuses = ev.filter((x) => x.e.type === "fuse" && x.e.side === 0).length;
    expect(fuses).toBeGreaterThan(5);
    expect(typeCount(ev, "pair", 0)).toBe(fuses);
  });

  it("no RNG: marking pairs (SEAM WELDER's plating aside) changes no draw; the shots and their aim are the same", () => {
    const aim = (b: Build) => {
      const out: string[] = [];
      const seen = new Set<number>();
      run(b, 25, barge(), SEED, (_e, bt) => {
        for (const p of bt.projectiles) if (p.from === 0 && !seen.has(p.id)) { seen.add(p.id); out.push(`${p.id}:${p.tx.toFixed(9)},${p.ty.toFixed(9)}:${p.dmg}`); }
      });
      return out;
    };
    const plainAim = aim(twoPress()), readerAim = aim(withMod(twoPress(), 50, "seamwelder"));
    expect(readerAim.length).toBeGreaterThan(10);
    expect(readerAim).toEqual(plainAim);
  });
});

describe("E3: rig arrows at factories (STOKER; the Prime's Q6 guard)", () => {
  /** The output bench: a WEAVER whose STAMP PRESS (uid 7, at (4,6)) feeds light turret 1 (EXT. CHAMBER ★3: never full). */
  const press = (): Build => ({
    hero: "weaver", items: [{ uid: 1, def: "loom", x: 0, y: 8 }, { uid: 7, def: "press", x: 4, y: 6 }],
    routes: [{ factory: 7, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
    mods: [{ uid: 20, def: "chamber", turret: 1, stars: 3 }], beltCap: 30, hullBonus: 5000,
  });
  const gaps = (b: Build, from = 3) => {
    const t: number[] = [];
    run(b, 20, barge(), SEED, (ev, bt) => { for (const e of ev) if (e.type === "produce" && e.side === 0 && e.factory === 7 && bt.t > from) t.push(bt.t); });
    return t.slice(1).map((x, i) => x - t[i]);
  };

  it("a STOKER beside a factory makes it work 20% / 44% / 70% faster (its stamp timer)", () => {
    const base = gaps(press());
    expect(Math.max(...base) - 1.4).toBeLessThan(2 / 60);
    [0.2, 0.44, 0.7].forEach((k, i) => {
      const g = gaps(withItem(press(), item(30, "stoker", 6, 6, 0, i + 1))); // west arrow on the press at (5,6)
      for (const x of g) expect(Math.abs(x - 1.4 / (1 + k)), `★${i + 1} ${x}`).toBeLessThan(2 / 60);
    });
  });

  it("its factory hits are its only hits: it comes online at 1.2 s, never touches a belt, and is not IDLE", () => {
    const b = withItem(press(), item(30, "stoker", 6, 6));
    expect(stokeHits(b).map((h) => [h.uid, h.factory])).toEqual([[30, 7]]);
    // a STOKER beside a belt hits nothing there (its arrows do nothing to belts)
    const onBelt = withItem(press(), item(30, "stoker", 3, 3));
    expect(rigHits(onBelt).flat(2).filter((h) => h.uid === 30)).toEqual([]);
    expect(hitsIfPlaced(onBelt, "stoker", 3, 3, 0)).toEqual([]);
    const ev = events(b, 5);
    expect(ev.filter((x) => x.e.type === "commission" && x.e.side === 0 && x.e.gate === 30).map((x) => +x.t.toFixed(4))).toEqual([1.2]);
    expect(ev.filter((x) => x.e.type === "process" && x.e.side === 0 && (x.e as { gate: number }).gate === 30)).toEqual([]);
    expect(stokesIfPlaced(b, "stoker", 6, 6, 0).map((s) => s.factory)).toEqual([7]);
    expect(stokeSpots(press(), "stoker").length).toBeGreaterThan(0);
    expect(stokeSpots(press(), "stoker").every((s) => s.stokes.length >= 1)).toBe(true);
  });

  it("the guard: an existing rig, or a non-stoking wave-3 rig, aimed at a factory stays IDLE (never online, no stoke)", () => {
    for (const def of ["whetstone", "temper", "plateroller", "pincer"]) {
      const b = withItem(press(), item(30, def, 3, 6, 1)); // its arrow points east into the press at (4,6)
      expect(rigFactoryHits(b).map((h) => h.uid), def).toEqual([30]);
      expect(stokeHits(b), def).toEqual([]);
      const ev = events(b, 10);
      expect(ev.some((x) => x.e.type === "commission" && (x.e as { gate: number }).gate === 30), def).toBe(false);
      const bt = new Battle(b, barge(), SEED);
      expect(bt.sides[0].factories.find((f) => f.uid === 7)!.stokers, def).toBeUndefined();
    }
  });

  it("a stalled STOKER stokes nothing; a joined factory runs at JOIN_PACE x (1 + stoke)", () => {
    const b = withItem(press(), item(30, "stoker", 6, 6));
    const t: number[] = [];
    run(b, 16, barge(), SEED, (ev, bt) => {
      const g = bt.sides[0].gates.find((x) => x.uid === 30)!;
      if (bt.t > 5) g.disrupted = 1; // held stalled from 5 s on
      for (const e of ev) if (e.type === "produce" && e.side === 0 && e.factory === 7 && bt.t > 7) t.push(bt.t);
    });
    for (const x of t.slice(1).map((v, i) => v - t[i])) expect(Math.abs(x - 1.4)).toBeLessThan(2 / 60);
    const bt = new Battle(b, barge(), SEED);
    const f = bt.sides[0].factories.find((x) => x.uid === 7)!;
    expect(f.stokers!.map((s) => s.stoke)).toEqual([0.2]);
    f.pace = 0.7;
    for (let i = 0; i < 120; i++) bt.step();
    expect(f.stoked).toBeCloseTo((120 - 71) / 60 * 0.7 * 0.2, 6); // online at 1.2 s: stoked on ticks 72 to 120
  });
});

describe("E4: holds (TWIN LATCH, the Prime's Q7)", () => {
  const LATCH = () => item(40, "twinlatch", 4, 3); // between (3,3) on belt A and (5,3) on belt B
  const holdEv = (b: Build, secs = 12) => events(b, secs).filter((x) => ["hold", "release"].includes(x.e.type));

  it("both arrows on belts: it holds each payload until the other belt brings one, then lets both go on one tick", () => {
    const b = withItem(latchDeck(), LATCH());
    const bt = new Battle(b, barge(), SEED);
    expect(bt.sides[0].latches?.map((g) => g.uid)).toEqual([40]);
    expect(bt.sides[0].routes.map((r) => r.holds?.map((l) => l.length).join(""))).toEqual(["0010000", "0001000"]);
    const ev = holdEv(b);
    const holds = ev.filter((x) => x.e.type === "hold"), rel = ev.filter((x) => x.e.type === "release");
    expect(holds.length).toBeGreaterThan(6);
    // releases come in pairs on one tick (one per belt), never one alone (B always brings one within 1 s here)
    const byTick = new Map<number, number[]>();
    for (const r of rel) byTick.set(r.t, [...(byTick.get(r.t) ?? []), (r.e as { route: number }).route]);
    for (const [t, routes] of byTick) expect(routes.sort(), `t ${t}`).toEqual([0, 1]);
  });

  /** Belt B's press (uid 3) held stalled from the first tick, so nothing ever reaches the latch's other arrow. */
  const quietB = (on?: (ev: SimEvent[], bt: Battle) => void) => (ev: SimEvent[], bt: Battle) => {
    bt.sides[0].factories.find((f) => f.uid === 3)!.disrupted = 1;
    on?.(ev, bt);
  };

  it("holds at most 1 s: with nothing coming on its other belt, each payload goes alone 1 s later", () => {
    const ev: { t: number; e: SimEvent }[] = [];
    run(withItem(latchDeck(), LATCH()), 12, barge(), SEED, quietB((es, bt) => { for (const e of es) if (e.type === "hold" || e.type === "release") ev.push({ t: bt.t, e }); }));
    const holds = ev.filter((x) => x.e.type === "hold"), rel = ev.filter((x) => x.e.type === "release");
    expect(holds.length).toBeGreaterThan(3);
    expect(rel.length).toBeGreaterThanOrEqual(holds.length - 1);
    rel.forEach((r, i) => expect(r.t - holds[i].t).toBeCloseTo(1, 6));
  });

  it("a latch with one arrow on a belt never holds and only adds damage; a stalled latch lets everything go", () => {
    const one = withItem(latchDeck(), item(40, "twinlatch", 2, 3)); // west arrow at (1,3): empty deck
    expect(new Battle(one, barge(), SEED).sides[0].latches).toBeUndefined();
    expect(holdEv(one)).toEqual([]);
    expect(walkRoute(one, 0).timeline.flatMap((r) => r.hits).find((h) => h.uid === 40)?.flat).toBe(1);
    expect(pastTile(one, 0, 2).map((x) => x.flat)).toEqual(expect.arrayContaining([1]));
    const b = withItem(latchDeck(), LATCH());
    const stallAt: number[] = [], released: number[] = [];
    run(b, 6, barge(), SEED, quietB((ev, bt) => {
      const g = bt.sides[0].gates.find((x) => x.uid === 40)!;
      if (g.latch!.held[0] && !stallAt.length && g.online) { g.disrupted = 0.5; stallAt.push(bt.t); } // stall it while it holds
      for (const e of ev) if (e.type === "release") released.push(bt.t);
    }));
    expect(stallAt.length).toBe(1);
    expect(released[0] - stallAt[0]).toBeCloseTo(1 / 60, 6); // let go on the next tick, not 1 s later
  });

  it("held time is not ride time: a held slug loads with the ride of its belt alone", () => {
    const b = withItem(latchDeck(), LATCH());
    const rides: number[] = [];
    let held = 0;
    run(b, 12, barge(), SEED, quietB((ev, bt) => {
      for (const e of ev) {
        if (e.type === "hold") held++;
        if (e.type === "load" && e.side === 0) rides.push(bt.sides[0].turrets[0].stack.at(-1)!.ride);
      }
    }));
    expect(held).toBeGreaterThan(3);
    expect(rides.length).toBeGreaterThan(3);
    for (const r of rides) expect(r).toBeCloseTo(estimateRoute(b, 0).ride, 1); // 3.0 s, though each waited 1 s
  });

  it("released together, the two payloads reach the gun an odd number of tiles apart (the hold tiles sit 2 apart, the intakes 1)", () => {
    // DESIGN-wave3.md 3.3 module 5 promises pairs for TWIN TRIGGER through a latch. A latch's two tiles are 2 cells apart
    // and a gun's two intakes 1 apart, so the belts left after the hold always differ by an odd number of tiles (here 4
    // and 3): at one belt speed the released payloads arrive 0.4 s apart, outside SYNC_WINDOW. On a gun fast enough
    // that nothing waits at its intakes, the latch turns the equal belts' pairs into none. Recorded in REPORT.md (Q).
    const tilesLeft = (ri: number, tile: number) => latchDeck().routes[ri].cells.length - 1 - tile;
    expect([tilesLeft(0, 2), tilesLeft(1, 3)]).toEqual([4, 3]);
    const fast = (b: Build) => withMod(withMod(b, 50, "seamwelder"), 51, "calibrate", 0, 3);
    expect(typeCount(events(fast(latchDeck()), 20), "pair", 0)).toBeGreaterThan(3); // equal belts, no latch: pairs
    expect(typeCount(events(fast(withItem(latchDeck(), LATCH())), 20), "pair", 0)).toBe(0);
  });
});

describe("E5: crossfire (PINCER)", () => {
  // the Kiln bench's tile 3, (4,3): a PINCER west of it (facing east), a WHETSTONE east of it (facing west)
  const pincer = (stars = 1) => item(30, "pincer", 3, 3, 1, stars);
  const whet = () => item(31, "whetstone", 5, 3, 3);

  it("adds its flat alone, and each for every other rig on its tile, up to 3 others: the walk and the battle agree", () => {
    for (const [s, flat, each] of [[1, 1, 2], [2, 2.2, 4.4], [3, 3.5, 7]] as const) {
      const alone = withItem(furnaceBench(), pincer(s)), both = withItem(alone, whet());
      const th = (b: Build) => walkRoute(b, 0).timeline.flatMap((r) => r.hits).find((h) => h.uid === 30)!;
      expect([th(alone).flat, th(alone).others]).toEqual([flat, 0]);
      expect([th(both).flat, th(both).others]).toEqual([flat + each, 1]);
      // the battle: a kiln slug past the tile once both are online carries both rigs' damage
      const flats: number[] = [];
      run(both, 8, barge(), SEED, (ev, bt) => { for (const e of ev) if (e.type === "load" && e.side === 0 && bt.t > 4) flats.push(bt.sides[0].turrets[0].stack.at(-1)!.flat); });
      expect(flats.length).toBeGreaterThan(1);
      for (const f of flats) expect(f).toBeCloseTo(flat + each + 2, 9);
    }
  });

  it("a stalled, frozen or wrecked partner doesn't count", () => {
    const both = withItem(withItem(furnaceBench(), pincer()), whet());
    for (const how of ["disrupted", "frozen", "wrecked"] as const) {
      const flats: number[] = [];
      run(both, 8, barge(), SEED, (ev, bt) => {
        const w = bt.sides[0].gates.find((g) => g.uid === 31)!;
        if (how === "wrecked") w.wrecked = true; else w[how] = 1;
        for (const e of ev) if (e.type === "load" && e.side === 0 && bt.t > 4) flats.push(bt.sides[0].turrets[0].stack.at(-1)!.flat);
      });
      for (const f of flats) expect(f, how).toBe(1); // the pincer alone, and the whetstone adds nothing
    }
  });
});

describe("E6: matched belts (TWIN GAUGE)", () => {
  it("FOUNDRY's two mirrored belts into gun 1 are matched: +3 there, +1 on an unmatched belt; walk = battle", () => {
    const f = withItem(heroStartBuild("foundry", 1), item(60, "twingauge", 1, 3, 1)); // west of column 2, facing east
    expect(matchedRoutes(f)).toEqual([true, true]);
    const th = walkRoute(f, 0).timeline.flatMap((r) => r.hits).find((h) => h.uid === 60)!;
    expect([th.flat, th.matched]).toEqual([3, true]);
    const bt = new Battle(f, barge(), SEED);
    expect(bt.sides[0].gates.find((g) => g.uid === 60)!.hits.map((h) => h.matched)).toEqual([true]);
    // FURNACE's 6-tile kiln belt with a 7-tile press belt into the same gun: not matched; 7 and 7: matched
    const busy = furnaceBench();
    busy.items.push({ uid: 7, def: "press", x: 6, y: 6 });
    busy.routes.push({ factory: 7, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
    expect(matchedRoutes(busy)).toEqual([false, false]);
    const g1 = withItem(busy, item(60, "twingauge", 3, 3, 1));
    expect(walkRoute(g1, 0).timeline.flatMap((r) => r.hits).find((h) => h.uid === 60)!.flat).toBe(1);
    expect(matchedRoutes(twoPress())).toEqual([true, true]);
    expect(matchedRoutes(twoPress(true))).toEqual([false, false]);
  });

  it("the battle pays the matched number: each slug past the gauge carries 3 / 6.6 / 10.5 on a matched belt", () => {
    for (const [s, m] of [[1, 3], [2, 6.6], [3, 10.5]] as const) {
      const g = withItem(twoPress(), item(60, "twingauge", 3, 3, 1, s)); // west of (4,3), belt A's tile 3, facing east
      const flats = pastTile(g, 0, 3).map((x) => x.flat);
      expect(flats.length, `★${s}`).toBeGreaterThan(1);
      for (const f of flats) expect(f, `★${s}`).toBe(m);
      const off = withItem(twoPress(true), item(60, "twingauge", 3, 3, 1, s)); // belt B one tile longer: unmatched
      for (const f of pastTile(off, 0, 3).map((x) => x.flat)) expect(f, `★${s} unmatched`).toBe([1, 2.2, 3.5][s - 1]);
    }
  });
});

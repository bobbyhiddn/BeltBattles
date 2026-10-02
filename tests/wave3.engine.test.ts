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

  it("BASTION's plating is the same pool: RaceSide.plating IS SideState.plate (H1's plating bar reads either), no E1 plate event (the bulwark slug's CLANK is H1's)", () => {
    const bt = new Battle(heroStartBuild("bastion", 1), barge(), SEED);
    expect(bt.sides[0].race!.plating).toBe(bt.sides[0].plate);
    // 0.8.0 I1 (oracle c38b1df9f2e9c338): H1 M3's display-only CLANK names its gun; P1's E1 event never does
    let plates = 0, clanks = 0;
    while (bt.t < 20) {
      bt.step();
      for (const e of bt.drainEvents()) if (e.type === "plate") { if ("turret" in e) clanks++; else plates++; }
    }
    expect(bt.sides[0].plate.gained).toBeGreaterThan(0);
    expect(plates).toBe(0); // a race hero fires what it fired before
    expect(clanks).toBeGreaterThan(0); // not an empty stream: the bulwark slugs CLANK as on dae2177
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

  it("one belt never pairs, even where its loads come closer than 0.25 s (a SHOT TOWER's buckshot, 7 px apart)", () => {
    // press A (uid 2) becomes a SHOT TOWER, press B's belt goes: 3 buckshot a stamp leave the mouth as the belt makes room,
    // AMMO_SPACING (7 px) apart, 0.23 s at normal speed, so a gun that takes them as they come sees loads inside the window
    const b = twoPress();
    b.routes.pop();
    b.items = b.items.map((p) => (p.uid === 2 ? { ...p, def: "shottower" } : p));
    const ev = events(withMod(withMod(b, 50, "seamwelder"), 51, "calibrate", 0, 3), 20);
    const loads = ev.filter((x) => x.e.type === "load" && x.e.side === 0).map((x) => x.t);
    expect(loads.slice(1).filter((t, i) => t - loads[i] < SYNC_WINDOW).length).toBeGreaterThan(5); // the window would bite
    expect(typeCount(ev, "pair", 0)).toBe(0); // but they come through one intake
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

  it("both arrows on belts into one gun: it holds each payload until the other belt brings one, then lets the longer trip go first and the other after the difference (oracle a0e94bc69949561f)", () => {
    const b = withItem(latchDeck(), LATCH());
    const bt = new Battle(b, barge(), SEED);
    expect(bt.sides[0].latches?.map((g) => g.uid)).toEqual([40]);
    expect(bt.sides[0].latches![0].latch!.same).toBe(true);
    expect(bt.sides[0].routes.map((r) => r.holds?.map((l) => l.length).join(""))).toEqual(["0010000", "0001000"]);
    const ev = holdEv(b);
    const holds = ev.filter((x) => x.e.type === "hold"), rel = ev.filter((x) => x.e.type === "release");
    expect(holds.length).toBeGreaterThan(6);
    // belt A has 4 tiles left after its hold tile, belt B 3: A goes first, B one tile's time (0.4 s) later
    const routes = rel.map((r) => (r.e as { route: number }).route);
    expect(routes.length).toBeGreaterThan(5);
    for (let i = 0; i + 1 < routes.length; i += 2) {
      expect([routes[i], routes[i + 1]], `release ${i}`).toEqual([0, 1]);
      expect(rel[i + 1].t - rel[i].t, `release ${i}`).toBeCloseTo(0.4, 6);
    }
  });

  it("belts that end at different guns are let go on one tick", () => {
    // WEAVER: press X (4,6) up column 4 into gun 1; press Y (2,6) up column 2, then into connector 1 (gun 0); the latch at
    // (3,3) between (2,3) and (4,3)
    const b: Build = {
      hero: "weaver", items: [{ uid: 1, def: "loom", x: 0, y: 8 }, { uid: 2, def: "press", x: 2, y: 6 }, { uid: 3, def: "press", x: 4, y: 6 }, item(40, "twinlatch", 3, 3)],
      routes: [
        { factory: 2, cells: [K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(1, 1), K(1, 0)] },
        { factory: 3, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      ], mods: [], beltCap: 30, hullBonus: 5000,
    };
    expect(new Battle(b, barge(), SEED).sides[0].latches![0].latch!.same).toBe(false);
    const rel = holdEv(b).filter((x) => x.e.type === "release");
    expect(rel.length).toBeGreaterThan(4);
    const byTick = new Map<number, number[]>();
    for (const r of rel) byTick.set(r.t, [...(byTick.get(r.t) ?? []), (r.e as { route: number }).route]);
    for (const [t, rs] of byTick) expect(rs.sort(), `t ${t}`).toEqual([0, 1]);
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

  it("a latch alone makes pairs at a two-intake gun (LOCKJAW's layout: an 8-tile Kiln belt and a TWIN MOULD belt into connectors 4 and 5)", () => {
    // a latch's two tiles sit 2 cells apart and a gun's intakes 1 apart, so the belts left after the hold differ by an odd
    // number of tiles (here 4 and 3): the staggered release (the longer trip first) is what lands them together
    const lockjaw = (latch: boolean): Build => ({
      hero: "furnace",
      items: [{ uid: 1, def: "kiln", x: 2, y: 6 }, { uid: 2, def: "twinmould", x: 6, y: 6 }, ...(latch ? [item(40, "twinlatch", 4, 3)] : [])],
      routes: [
        { factory: 1, cells: [K(2, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] },
        { factory: 2, cells: [K(7, 5), K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
      ],
      // CALIBRATION ★3: the gun takes every load as it comes, so a pair is two loads that arrive together (on a busy gun,
      // loads that waited at both intakes pair anyway when its chamber opens: tested under E2)
      mods: [{ uid: 50, def: "seamwelder", turret: 0 }, { uid: 51, def: "calibrate", turret: 0, stars: 3 }], beltCap: 30, hullBonus: 5000,
    });
    const without = typeCount(events(lockjaw(false), 30), "pair", 0), with_ = typeCount(events(lockjaw(true), 30), "pair", 0);
    const moulded = run(lockjaw(true), 30).sides[0].factories.find((f) => f.uid === 2)!.produced;
    // without a latch the Kiln (1.25 s) and the mould (1.8 s) meet by chance about every 3.6 s; with it, nearly every
    // mould slug arrives with a Kiln slug
    expect(with_, `${without} pairs without, ${with_} with, ${moulded} mould slugs`).toBeGreaterThanOrEqual(without + 5);
    expect(with_).toBeGreaterThanOrEqual(moulded - 4);
  });

  it("on FOUNDRY's mirrored belts a latch never gives fewer fusions than no latch, with or without shocks on one belt", () => {
    // the Crucible at (2,6) pours onto two 8-tile belts into gun 1: A up column 1 and in at column 2, B up column 4 and in
    // at column 3; the latch at (3,2) works A's tile 5 and B's tile 4
    const foundry = (latch: boolean): Build => {
      const b = heroStartBuild("foundry", 1);
      b.routes = [
        { factory: 1, cells: [K(2, 5), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(2, 2), K(2, 1), K(2, 0)] },
        { factory: 1, cells: [K(4, 6), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(3, 1), K(3, 0)] },
      ];
      if (latch) b.items.push(item(40, "twinlatch", 3, 2));
      return b;
    };
    expect(heroStartBuild("foundry", 1).items[0]).toMatchObject({ uid: 1, def: "crucible", x: 2, y: 6 });
    for (const shocks of [false, true]) {
      const fuses = (b: Build) => {
        let n = 0;
        run(b, 40, barge(), SEED, (ev, bt) => {
          if (shocks && bt.ticks % 180 === 0) bt.sides[0].routes[0].cellDisrupt[3] = 0.7; // a stall on belt A every 3 s
          for (const e of ev) if (e.type === "fuse" && e.side === 0) n++;
        });
        return n;
      };
      const plain = fuses(foundry(false)), latched = fuses(foundry(true));
      expect(latched, `shocks ${shocks}: ${plain} without, ${latched} with`).toBeGreaterThanOrEqual(plain);
      expect(latched).toBeGreaterThan(5);
    }
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

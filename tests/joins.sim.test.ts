// 0.6.2j BELT JOINS (REQ-BFG-027, REQ-BFG-030): the battle sim. A payload at the end of a joining belt enters its main
// belt at the join tile when the main belt leaves it an AMMO_SPACING gap (J5), takes the join tile's hits and every
// later one (J4), rides the main belt's speed state (slag keeps its own: J15), counts toward jams by its path (J6),
// and meets the race hooks as a main-belt payload (J7). J14 (a): the payload's own journey; J14 (b): the shared stretch.
import { describe, expect, it } from "vitest";
import { Battle, assemblyLines, makeTurret, type Payload, type RouteState, type SideState } from "../src/sim/battle";
import { AMMO_SPACING, CELL, GUARD_SKIRT, HEROES, JOIN_PACE } from "../src/sim/content";
import { cloneBuild, joinOf, journeyTiles, key as K, rotField, type Build, type Placed } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { SYNC_WINDOW } from "../src/sim/races/foundry";
import { DRAG_MULT, dragSpans } from "../src/sim/races/siphon";
import { PLATE_PER_SLUG } from "../src/sim/races/bastion";
import { cruiserModel } from "../src/render/cruiser";

const rig = (uid: number, def: string, x: number, y: number, rot = 0): Placed => ({ uid, def, x, y, ...rotField(def, rot) });
// a foe that never fires (no belts) and never falls
const FOE: Build = { hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 6 }], routes: [], mods: [], beltCap: 24, hullBonus: 100000 };

// FURNACE: the KILN's belt M up column 4 into the turret; a STAMP PRESS (or SLAG POT) west of it feeds R, which ends at
// (3,4) and joins M's tile 1 (4,4). M's tiles: (4,5) 0, (4,4) 1, (4,3) 2, (4,2) 3, (4,1) 4, (4,0) 5.
const M = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const R = [K(2, 6), K(2, 5), K(2, 4), K(3, 4)];
function deck(extra: Placed[] = [], o: { joiner?: string; main?: string; hero?: Build["hero"]; joined?: boolean } = {}): Build {
  return {
    hero: o.hero ?? "furnace", mods: [], beltCap: 40, hullBonus: 0,
    items: [{ uid: 1, def: o.main ?? "kiln", x: 4, y: 6 }, { uid: 2, def: o.joiner ?? "press", x: 0, y: 6 }, ...extra],
    routes: [{ factory: 1, cells: [...M] }, { factory: 2, cells: [...R], ...(o.joined === false ? {} : { join: K(4, 4) }) }],
  };
}
/** The same deck with R and M's tiles from the join tile on as ONE continuous belt from R's factory (J14 (a)). */
function single(b: Build): Build {
  const s = cloneBuild(b);
  s.routes = [{ factory: 2, cells: [...R, ...M.slice(1)] }];
  return s;
}
const quiet = (uid: number) => (s: SideState) => { s.factories.find((f) => f.uid === uid)!.routes = []; };
// 0.6.2 TUNE-M, RULE JOIN PACE: a joined factory stamps at JOIN_PACE of its rate. The J14 (a) comparisons below run the
// continuous belt's factory at the same pace, so both decks stamp in step and the journeys compare tick for tick (the
// pace itself: tests/joinpace.test.ts)
const paced = (uid: number) => (s: SideState) => { s.factories.find((f) => f.uid === uid)!.pace = JOIN_PACE; };

interface Load { tick: number; id: number; factory: number; ride: number; prior: number; flat: number; burn: number; heat: number; ammo: string }
interface Run { bt: Battle; loads: Load[]; seenOn: Map<number, number> }
/** Step a battle; note every payload of side 0 the first tick it is in a chamber (or already fired). */
function run(b: Build, ticks: number, setup?: (s: SideState, bt: Battle) => void, each?: (bt: Battle, s: SideState) => void, foe = FOE): Run {
  const bt = new Battle(b, foe, 7);
  const s = bt.sides[0];
  setup?.(s, bt);
  const loads: Load[] = [];
  const seen = new Set<number>();
  const seenOn = new Map<number, number>(); // payload id -> the first route it was seen on
  const note = (p: Payload) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    loads.push({ tick: bt.ticks, id: p.id, factory: p.factory, ride: p.ride, prior: p.prior, flat: p.flat, burn: p.burn, heat: p.heatBonus ?? 0, ammo: p.ammo });
  };
  for (let i = 0; i < ticks && !bt.over; i++) {
    bt.step();
    for (const r of s.routes) for (const a of r.ammo) if (!seenOn.has(a.p.id)) seenOn.set(a.p.id, r.index);
    for (const tu of s.turrets) for (const p of tu.stack) note(p);
    for (const pr of bt.projectiles) if (pr.from === 0) note(pr.payload);
    each?.(bt, s);
    bt.events.length = 0;
  }
  return { bt, loads, seenOn };
}
const pick = (l: Load) => [l.tick, l.ride, l.prior, l.flat, l.burn, l.heat];

describe("J4: hits, speeds and what a payload carries through the join", () => {
  it("a joined payload takes the join tile's hit and every later one, exactly once, and none before the join", () => {
    const b = deck([
      rig(10, "temper", 1, 5, 1), // R tile 1: +2 burn
      rig(12, "whetstone", 5, 5, 3), // M tile 0, before the join
      rig(13, "whetstone", 5, 4, 3), // M tile 1, the join tile
      rig(14, "whetstone", 5, 2, 3), // M tile 3
    ]);
    const { loads } = run(b, 60 * 30);
    const late = loads.filter((l) => l.tick > 60 * 8);
    const kiln = late.filter((l) => l.factory === 1), press = late.filter((l) => l.factory === 2);
    expect(kiln.length).toBeGreaterThan(5);
    expect(press.length).toBeGreaterThan(5);
    for (const l of kiln) expect([l.prior, l.flat, l.burn]).toEqual([3, 6, 0]);
    for (const l of press) expect([l.prior, l.flat, l.burn]).toEqual([3, 4, 2]);
  });

  it("SPLITTER copies trail their original through the join, in order", () => {
    const b = deck([rig(10, "splitter", 1, 5)]); // R tile 1 (its other two arrows find no belt)
    const pairs: [number, number][] = [];
    const known = new Set<number>();
    let bad = 0;
    const { loads } = run(b, 60 * 30, quiet(1), (_bt, s) => {
      const r = s.routes[1], m = s.routes[0];
      for (let i = 1; i < r.ammo.length; i++) {
        const c = r.ammo[i]; // a new payload closer than AMMO_SPACING behind another is a copy (stamps keep the spacing)
        if (!known.has(c.p.id) && r.ammo[i - 1].s - c.s < AMMO_SPACING) pairs.push([r.ammo[i - 1].p.id, c.p.id]);
      }
      for (const a of r.ammo) known.add(a.p.id);
      const at = new Map(m.ammo.map((a, i) => [a.p.id, i]));
      for (const [o, c] of pairs) if (at.has(o) && at.has(c) && at.get(o)! > at.get(c)!) bad++;
    });
    expect(pairs.length).toBeGreaterThan(5);
    expect(bad).toBe(0);
    const order = new Map(loads.map((l, i) => [l.id, i]));
    let both = 0;
    for (const [o, c] of pairs) {
      if (!order.has(o) || !order.has(c)) continue;
      both++;
      expect(order.get(o)!).toBeLessThan(order.get(c)!);
    }
    expect(both).toBeGreaterThan(5);
  });
});

describe("J5: the main belt has right of way", () => {
  it("a payload enters only with no main-belt payload within AMMO_SPACING of the entry point; sparse main belts take them", () => {
    const b = deck();
    let entered = 0, before = new Set<number>();
    const { bt } = run(b, 60 * 40, undefined, (_bt, s) => {
      const m = s.routes[0], enter = s.routes[1].join!.enter;
      for (const a of m.ammo) {
        if (before.has(a.p.id) || a.via !== 1) continue;
        entered++;
        expect(a.s).toBe(enter);
        for (const o of m.ammo) if (o !== a) expect(Math.abs(o.s - enter)).toBeGreaterThanOrEqual(AMMO_SPACING);
      }
      before = new Set(m.ammo.map((a) => a.p.id));
    });
    expect(entered).toBeGreaterThan(15);
    expect(bt.sides[0].routes[1].join).toEqual({ route: 0, tile: 1, enter: CELL, tail: 6 * CELL + CELL / 2 - CELL, feeds: 0 });
  });

  it("a saturated main belt starves its joiner: it waits at its end and its belt backs up", () => {
    const b = deck();
    let lastEntry = -1;
    const onM = new Set<number>();
    const { bt } = run(b, 60 * 60, (s) => { s.turrets[0].frozen = 1e9; }, (bt2, s) => { // nothing enters the chamber
      for (const a of s.routes[0].ammo) {
        if (!onM.has(a.p.id) && a.via === 1) lastEntry = bt2.ticks;
        onM.add(a.p.id);
      }
    });
    const s = bt.sides[0], r = s.routes[1], m = s.routes[0];
    expect(lastEntry).toBeGreaterThan(0);
    expect(bt.ticks - lastEntry).toBeGreaterThan(60 * 20); // nothing got in for the last 20 s
    expect(r.ammo[0].s).toBe(r.L);
    expect(r.ammo[0].blocked).toBe(true);
    expect(r.ammo.length).toBeGreaterThan(3); // R backed up
    expect(m.ammo.some((a) => Math.abs(a.s - r.join!.enter) < AMMO_SPACING)).toBe(true);
    // the main belt stayed in path order and kept its spacing
    for (let i = 1; i < m.ammo.length; i++) expect(m.ammo[i - 1].s - m.ammo[i].s).toBeGreaterThanOrEqual(AMMO_SPACING - 1e-9);
  });

  it("two joiners waiting for the same gap: the one whose last cell has the lower cell key goes first", () => {
    // A ends at (3,3) (key 33) and B at (5,3) (key 35), both beside M's tile 2 (4,3); both 5 tiles long, both
    // STAMP PRESSes stamping on the same ticks, so each pair reaches the join together
    const b: Build = {
      hero: "furnace", mods: [], beltCap: 40, hullBonus: 0,
      items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }, { uid: 3, def: "press", x: 7, y: 6 }],
      routes: [
        { factory: 1, cells: [...M] },
        { factory: 3, cells: [K(6, 6), K(6, 5), K(6, 4), K(5, 4), K(5, 3)], join: K(4, 3) }, // B first in route order
        { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(3, 4), K(3, 3)], join: K(4, 3) },
      ],
    };
    const entries: { tick: number; via: number }[] = [];
    const onM = new Set<number>();
    const { bt } = run(b, 60 * 20, quiet(1), (bt2, s) => {
      for (const a of s.routes[0].ammo) {
        if (!onM.has(a.p.id)) entries.push({ tick: bt2.ticks, via: a.via ?? -1 });
        onM.add(a.p.id);
      }
    });
    expect(bt.sides[0].joiners!.map((r) => r.index)).toEqual([2, 1]); // J5's order: last-cell key 33, then 35
    expect(entries.length).toBeGreaterThanOrEqual(10);
    for (let i = 0; i + 1 < entries.length; i += 2) {
      expect(entries[i].via).toBe(2); // A (key 33) enters first
      expect(entries[i + 1].via).toBe(1);
      expect(entries[i + 1].tick - entries[i].tick).toBe(Math.round(AMMO_SPACING / 0.5)); // B waits for a full gap
    }
  });

  it("is deterministic: the same battle twice gives the same loads", () => {
    const b = deck([rig(10, "temper", 1, 5, 1), rig(13, "whetstone", 5, 4, 3)]);
    expect(run(b, 60 * 20).loads).toEqual(run(b, 60 * 20).loads);
  });
});

describe("J6: jams count the path to the intake", () => {
  it("a joiner's queue counts toward the turret's waiting only within 4 tiles of the intake by its path through the join", () => {
    // R joins M's tile 4 (4,1): from R's end the intake is 30 px on
    const b = deck();
    b.routes[1] = { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(3, 1)], join: K(4, 1) };
    const { bt } = run(b, 60 * 70, (s) => { s.turrets[0].frozen = 1e9; });
    const s = bt.sides[0], m = s.routes[0], r = s.routes[1], tu = s.turrets[0];
    expect(r.join!.tail).toBe(m.L - 4 * CELL);
    const byPath = r.ammo.filter((a) => a.blocked && r.L - a.s + r.join!.tail <= 4 * CELL).length;
    const byOwn = r.ammo.filter((a) => a.blocked && r.L - a.s <= 4 * CELL).length;
    const main = m.ammo.filter((a) => a.blocked && a.s >= m.L - 4 * CELL).length;
    expect(byPath).toBeGreaterThan(0);
    expect(byOwn).toBeGreaterThan(byPath); // its own belt's length would count more
    expect(tu.waiting).toBe(main + byPath);
  });
});

describe("J7: race hooks see a joined payload as on the main belt", () => {
  it("METRONOME: the tempo lock holds joined payloads at 1x; a speed rig on the shared stretch pays them its locked damage", () => {
    const b = deck([rig(13, "grease", 5, 4, 3)], { hero: "metronome", main: "clockworks" }); // GREASE on the join tile
    const steps: number[] = [];
    let id = -1, last = -1;
    const { loads } = run(b, 60 * 20, undefined, (_bt, s) => {
      const a = s.routes[0].ammo.find((x) => x.via === 1 && (id < 0 || x.p.id === id));
      if (!a) return;
      if (id < 0) id = a.p.id;
      else if (!a.blocked && a.s < s.routes[0].L) steps.push(a.s - last);
      last = a.s;
    });
    expect(steps.length).toBeGreaterThan(20);
    for (const d of steps) expect(d).toBeCloseTo(0.5, 9);
    const press = loads.filter((l) => l.factory === 2 && l.tick > 60 * 5);
    expect(press.length).toBeGreaterThan(3);
    for (const l of press) expect(l.flat).toBe(1); // GREASE's lockedFlat
  });

  it("SIPHON Drag on the main belt's stretch drags joined payloads too (and that movement isn't ride)", () => {
    const siphon: Build = { hero: "siphon", items: [{ uid: 1, def: "sump", x: 4, y: 6 }], routes: [], mods: [], beltCap: 20, hullBonus: 100000 };
    const steps: number[] = [];
    let id = -1, last = -1, ride0 = -1, rideN = -1;
    run(deck(), 60 * 12, (s) => {
      quiet(1)(s);
      for (let t = 1; t < M.length; t++) s.race!.drag.until[0][t] = 1e9; // M dragged from the join tile on
    }, (_bt, s) => {
      const a = s.routes[0].ammo.find((x) => x.via === 1 && (id < 0 || x.p.id === id));
      if (!a) return;
      if (id < 0) { id = a.p.id; ride0 = a.p.ride; } else if (!a.blocked && a.s < s.routes[0].L) steps.push(a.s - last);
      last = a.s;
      rideN = a.p.ride;
    }, siphon);
    expect(steps.length).toBeGreaterThan(20);
    for (const d of steps) expect(d).toBeCloseTo(0.5 * DRAG_MULT, 9);
    expect(rideN).toBe(ride0);
  });

  it("FOUNDRY: a joined blank enters the chamber through the main belt's connector, so it never fuses with that belt's own", () => {
    // the Crucible pours into X (straight up column 2) and R (column 1, GREASE on its first tile), which joins X's tile 2:
    // R's blank reaches the join just as X's passes, waits for the gap and rides in 7 px behind it (within SYNC_WINDOW)
    const b: Build = {
      hero: "foundry", mods: [], beltCap: 40, hullBonus: 0,
      items: [{ uid: 1, def: "crucible", x: 1, y: 6 }, rig(10, "grease", 0, 5, 1)],
      routes: [
        { factory: 1, cells: [K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(2, 0)] },
        { factory: 1, cells: [K(1, 5), K(1, 4), K(1, 3)], join: K(2, 3) },
      ],
    };
    const { bt, loads, seenOn } = run(b, 60 * 30);
    const late = loads.filter((l) => l.tick > 60 * 4);
    const close = late.filter((l, i) => i > 0 && seenOn.get(l.id) !== seenOn.get(late[i - 1].id)
      && (l.tick - late[i - 1].tick) / 60 <= SYNC_WINDOW);
    expect(close.length).toBeGreaterThan(3); // joined and own blanks loading within the sync window
    expect(bt.sides[0].race!.foundry.fusions).toBe(0);
    // control: two belts into turret 0's two connectors fuse
    const two: Build = {
      hero: "foundry", mods: [], beltCap: 40, hullBonus: 0, items: [{ uid: 1, def: "crucible", x: 2, y: 6 }],
      routes: [
        { factory: 1, cells: [K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(2, 0)] },
        { factory: 1, cells: [K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(3, 0)] },
      ],
    };
    expect(run(two, 60 * 30).bt.sides[0].race!.foundry.fusions).toBeGreaterThan(3);
  });

  it("BASTION: joined bulwark slugs plate the hull when the main belt's intake takes them", () => {
    const b = deck([], { hero: "bastion", joiner: "wardworks", main: "press" }); // the bulwark slugs come by the joiner
    const { bt, loads } = run(b, 60 * 8);
    const bulwark = loads.filter((l) => l.ammo === "bulwark").length;
    expect(bulwark).toBeGreaterThan(2);
    // nothing strikes this hull, so every plate stays: each joined slug added PLATE_PER_SLUG (up to the cap)
    expect(bt.sides[0].race!.plating.gained).toBe(Math.min(24, bulwark * PLATE_PER_SLUG));
  });

  it("MANTLET ★3: the skirt guards the main belt's last intake tiles, and no joiner's tiles", () => {
    const b = deck();
    b.mods = [{ uid: 50, def: "mantlet", turret: 0, stars: 3 }];
    const s = new Battle(b, FOE, 1).sides[0];
    const skirt = (r: RouteState) => r.guard.map((g) => (g & GUARD_SKIRT ? 1 : 0));
    expect(skirt(s.routes[0])).toEqual([0, 0, 0, 1, 1, 1]);
    expect(skirt(s.routes[1])).toEqual([0, 0, 0, 0]);
  });

  it("SIPHON Drag on a turret drags the last stretch of the belts that end at its intake: the main belt's, which the joined payloads ride; no joiner's tiles", () => {
    const s = new Battle(deck(), FOE, 1).sides[0];
    const turret = s.targets.find((t) => t.kind === "turret" && t.ref === 0)!;
    expect(dragSpans(s, turret)).toEqual([{ route: 0, span: [0, 5] }]); // M has no rig: one segment, all of it
    expect(s.routes[1].join?.feeds).toBe(0); // the joiner feeds that turret, through M
  });

  it("TOLLBOOTH guards the belt it works; beside a joiner it doesn't guard the turret the joiner feeds (only the belts ending at its intake do)", () => {
    const hit = (b: Build) => {
      const bt = new Battle(b, FOE, 1);
      const s = bt.sides[0];
      for (let i = 0; i < 60 * 6; i++) bt.step(); // every rig online
      const accept = (t: SideState["targets"][number]) => (bt as unknown as { acceptHarassment(s: SideState, t: unknown, c: string): boolean }).acceptHarassment(s, t, "shock");
      const turret = s.targets.find((t) => t.kind === "turret" && t.ref === 0)!;
      const beltR = s.targets.find((t) => t.kind === "belt" && t.ref === 1 && t.cell === 1)!;
      return { belt: accept(beltR), turret: accept(turret) };
    };
    expect(hit(deck([rig(20, "tollbooth", 1, 5, 1)]))).toEqual({ belt: false, turret: true }); // beside R's tile 1
    expect(hit(deck([rig(20, "tollbooth", 5, 3, 3)]))).toEqual({ belt: true, turret: false }); // beside M's tile 2
  });

  it("ASSEMBLY LINE: one whose belt joins a connected belt runs (its commissioning factor holds; its own belt's rigs at 0 s)", () => {
    const joined = deck([], { joiner: "assembly" });
    expect(assemblyLines(joined)).toEqual({ factor: 0.5, own: new Map([[1, 0]]) });
    expect(assemblyLines(deck([], { joiner: "assembly", joined: false }))).toEqual({ factor: 1, own: new Map() });
  });

  it("E1: a joining belt feeds FURNACE's Breech as a long belt when its journey (not its own tiles) runs 8 tiles or more", () => {
    const heavy = HEROES.furnace.turrets[0];
    // R: 4 own tiles, then M's 5 from the join tile on: a 9-tile journey (M itself is 6 tiles, R alone 4)
    expect(makeTurret(deck(), 0, heavy).interval).toBeCloseTo(0.72, 9);
    expect(makeTurret(deck([], { joined: false }), 0, heavy).interval).toBe(1); // unjoined, R reaches no turret
    // a STAMP PRESS beside M's tile 4 joins it from 1 own tile: a 3-tile journey, not long
    const near: Build = {
      ...deck(), items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 1 }],
      routes: [{ factory: 1, cells: [...M] }, { factory: 2, cells: [K(5, 1)], join: K(4, 1) }],
    };
    expect(joinOf(near, 1)).toMatchObject({ route: 0, tile: 4 });
    expect(journeyTiles(near, 1)).toBe(3);
    expect(makeTurret(near, 0, heavy).interval).toBe(1);
  });

  it("SIPHON: a leech stamped on a joiner is marked by its chain's turret (ECHO for the right gun)", () => {
    // M from a STAMP PRESS feeds the right gun (column 7); the Sump's belt R joins it
    const b: Build = {
      hero: "siphon", mods: [], beltCap: 40, hullBonus: 0,
      items: [{ uid: 1, def: "sump", x: 3, y: 6 }, { uid: 2, def: "press", x: 7, y: 6 }],
      routes: [
        { factory: 2, cells: [K(7, 5), K(7, 4), K(7, 3), K(7, 2), K(7, 1), K(7, 0)] },
        { factory: 1, cells: [K(5, 6), K(5, 5), K(5, 4), K(6, 4)], join: K(7, 4) },
      ],
    };
    const kinds = (x: Build) => {
      const out = new Set<string>();
      run(x, 60 * 6, undefined, (_bt, s) => { for (const a of s.routes[1].ammo) out.add(a.p.ammo); });
      return [...out];
    };
    expect(kinds(b)).toEqual(["leechEcho"]);
    const open = cloneBuild(b);
    delete open.routes[1].join;
    expect(kinds(open)).toEqual(["leechDrag"]);
  });
});

describe("J14 (a): the payload's own journey", () => {
  const rigs = [
    rig(10, "temper", 1, 5, 1), // R tile 1
    rig(11, "heatjacket", 3, 5, 1), // R tile 3 (its other arrow finds no belt)
    rig(12, "whetstone", 5, 5, 3), // M tile 0: before the join, idle on the continuous belt
    rig(13, "whetstone", 5, 4, 3), // the join tile
    rig(16, "counterweight", 5, 3), // M tile 2: the payload's 6th tile
    rig(14, "whetstone", 5, 2, 3), // M tile 3
    rig(15, "longhaul", 3, 1), // M tile 4
  ];

  it("with no contention and no speed effects, a joined payload's hits, timing and LONG HAUL equal the continuous belt's", () => {
    const joined = deck(rigs);
    const a = run(joined, 60 * 25, quiet(1)).loads.filter((l) => l.factory === 2);
    const c = run(single(joined), 60 * 25, paced(2)).loads.filter((l) => l.factory === 2);
    expect(a.length).toBeGreaterThan(8);
    // from the 4th payload on every rig is online on both decks (commissioning ranks rigs per belt)
    expect(a.slice(3, 9).map(pick)).toEqual(c.slice(3, 9).map(pick));
    const l = a[5];
    expect(l.prior).toBe(6); // TEMPER, HEAT JACKET, then the join tile's WHETSTONE, COUNTERWEIGHT, WHETSTONE, LONG HAUL
    expect(l.flat).toBeCloseTo(2 + 2.5 + 2 + effectAt("longhaul", 1).gate!.perPriorGate! * 5, 9); // COUNTERWEIGHT: 5 tiles ridden; LONG HAUL: 5 earlier hits
    expect(l.burn).toBe(2);
    expect(l.heat).toBeGreaterThan(0);
  });

  it("by design (J4), a speed rig on the main belt before the join speeds the joined payload; the continuous belt misses it", () => {
    const fast = deck([rig(12, "grease", 5, 5, 3)]); // GREASE on M's tile 0
    const a = run(fast, 60 * 25, quiet(1)).loads.filter((l) => l.factory === 2);
    const c = run(single(fast), 60 * 25, paced(2)).loads.filter((l) => l.factory === 2);
    for (let i = 3; i < 8; i++) {
      expect(a[i].ride).toBeLessThan(c[i].ride);
      expect(a[i].tick).toBeLessThan(c[i].tick);
    }
  });

  it("OVERCLOCKER on a joining belt boosts the next boostable rig on the payload's journey, past the join", () => {
    // OVERCLOCKER beside R's tile 2 (nothing boostable after it on R); a WHETSTONE on the join tile
    const b = deck([rig(10, "overclocker", 1, 4), rig(13, "whetstone", 5, 4, 3)]);
    const { loads } = run(b, 60 * 40);
    const late = loads.filter((l) => l.tick > 60 * 4);
    const press = late.filter((l) => l.factory === 2), kiln = late.filter((l) => l.factory === 1);
    expect(press.filter((l) => l.flat === 4).length).toBeGreaterThan(3); // doubled past the join, then it cools
    expect(press.every((l) => l.flat === 2 || l.flat === 4)).toBe(true);
    expect(kiln.length).toBeGreaterThan(10);
    expect(kiln.every((l) => l.flat === 2)).toBe(true); // the main belt's own payloads never passed it
  });

  it("J15: a slag joiner's timing equals the same slug's on the continuous belt (no speed rigs)", () => {
    const joined = deck([], { joiner: "slagpot" });
    const a = run(joined, 60 * 30, quiet(1)).loads.filter((l) => l.factory === 2);
    const c = run(single(joined), 60 * 30, paced(2)).loads.filter((l) => l.factory === 2);
    expect(a.length).toBeGreaterThan(5);
    expect(a.map(pick)).toEqual(c.slice(0, a.length).map(pick));
  });
});

describe("J14 (b): a rig beside the shared stretch hits every line that rides it", () => {
  it("the main belt's own payloads, each joiner's and a chain's (C into B into A)", () => {
    const b: Build = {
      hero: "weaver", mods: [], beltCap: 60, hullBonus: 0,
      items: [{ uid: 1, def: "loom", x: 4, y: 7 }, rig(10, "temper", 5, 1, 3)], // TEMPER on A's tile 5 (4,1)
      routes: [
        { factory: 1, cells: [K(4, 6), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }, // A into turret 1
        { factory: 1, cells: [K(3, 7), K(2, 7), K(2, 6), K(2, 5), K(2, 4), K(3, 4)], join: K(4, 4) }, // B joins A
        { factory: 1, cells: [K(3, 8), K(2, 8), K(1, 8), K(1, 7), K(1, 6), K(1, 5)], join: K(2, 5) }, // C joins B
      ],
    };
    const { loads, seenOn } = run(b, 60 * 30);
    const late = loads.filter((l) => l.tick > 60 * 5);
    for (const line of [0, 1, 2]) {
      const mine = late.filter((l) => seenOn.get(l.id) === line);
      expect(mine.length).toBeGreaterThan(3);
      for (const l of mine) expect(l.burn).toBe(2);
    }
  });
});

describe("J15: slag through a join", () => {
  /** Per-tick moves of payloads on M past the GREASE on the join tile, by kind; and the order/spacing invariants. */
  function watch(b: Build) {
    const moves: Record<string, number[]> = {};
    let prev = new Map<number, number>(), prevOrder: number[] = [], bad = 0;
    const { bt } = run(b, 60 * 40, undefined, (_bt, s) => {
      const m = s.routes[0];
      const order = m.ammo.map((a) => a.p.id);
      for (let i = 1; i < m.ammo.length; i++) if (m.ammo[i - 1].s - m.ammo[i].s < AMMO_SPACING - 1e-9) bad++;
      const kept = prevOrder.filter((id) => order.includes(id));
      if (JSON.stringify(kept) !== JSON.stringify(order.filter((id) => kept.includes(id)))) bad++;
      for (let i = 0; i < m.ammo.length; i++) {
        const a = m.ammo[i], was = prev.get(a.p.id);
        const ahead = m.ammo[i - 1];
        const free = !a.blocked && a.s < m.L && (!ahead || ahead.s - a.s > AMMO_SPACING + 1);
        // past the join tile's centre, once the GREASE there has come online
        if (was !== undefined && was > 1.5 * CELL && free && _bt.ticks > 60 * 3) (moves[a.p.ammo] ??= []).push(a.s - was);
      }
      prev = new Map(m.ammo.map((a) => [a.p.id, a.s]));
      prevOrder = order;
    });
    return { moves, bad, bt };
  }

  it("slag into a normal belt: the slag keeps 0.75x on the shared stretch, the belt's own payloads ride the speed rig", () => {
    const { moves, bad } = watch(deck([rig(13, "grease", 5, 4, 3)], { joiner: "slagpot" }));
    expect(moves.slag.length).toBeGreaterThan(20);
    for (const d of moves.slag) expect(d).toBeCloseTo(0.75 * 0.5, 9);
    expect(moves.cinder.length).toBeGreaterThan(20);
    for (const d of moves.cinder) expect(d).toBeCloseTo(1.6 * 0.5, 9);
    expect(bad).toBe(0); // the faster payloads queue behind the slag: no overlap, no passing
  });

  it("a normal belt into a slag-fed belt: the joined payloads ride its speed rig, its slag keeps 0.75x", () => {
    const { moves, bad } = watch(deck([rig(13, "grease", 5, 4, 3)], { main: "slagpot" }));
    expect(moves.slag.length).toBeGreaterThan(20);
    for (const d of moves.slag) expect(d).toBeCloseTo(0.75 * 0.5, 9);
    expect(moves.plain.length).toBeGreaterThan(20);
    for (const d of moves.plain) expect(d).toBeCloseTo(1.6 * 0.5, 9);
    expect(bad).toBe(0);
  });

  it("the main belt's chevrons don't change when a belt joins it: battle speedAt and the build preview's RouteModel.speeds", () => {
    for (const o of [{ joiner: "slagpot" }, { main: "slagpot" }]) {
      const rigs = [rig(12, "brake", 5, 5, 3), rig(13, "grease", 5, 4, 3)];
      const joined = deck(rigs, o), open = deck(rigs, { ...o, joined: false });
      expect(Array.from(cruiserModel(joined).routes[0].speeds)).toEqual(Array.from(cruiserModel(open).routes[0].speeds));
      const sa: number[][] = [], sb: number[][] = [];
      run(joined, 60 * 10, undefined, (_bt, s) => sa.push([...s.routes[0].speedAt]));
      run(open, 60 * 10, undefined, (_bt, s) => sb.push([...s.routes[0].speedAt]));
      expect(sa).toEqual(sb);
      expect(sa[sa.length - 1]).toEqual([0.5, 1.6, 1.6, 1.6, 1.6, 1.6]);
    }
  });
});

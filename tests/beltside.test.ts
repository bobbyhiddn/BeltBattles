// 0.6.2 BELTSIDE (ref/DESIGN-beltside.md): gates became RIGS on their own deck cells, whose arrows act on the
// belt tiles they point at. The rules R1-R9 in the engine: shapes and arrow counts (R2, R3), rotation (R4),
// reach and hits (R5, R8), the per-tile order R7 in estimateRoute and in the battle, placement (R1, B3) and
// the rig as a target at its own cell (R9). Migration, saves, snapshots and the validator: beltside.migrate.
import { describe, expect, it } from "vitest";
import { Battle, type SimEvent } from "../src/sim/battle";
import { ITEMS, RARITY_ARROWS, SHAPE_ARROWS, rigShape, CELL, AMMO, BELT_SPEED } from "../src/sim/content";
import {
  arrowsOf, canExtend, canPlaceItem, estimateRoute, hitTier, hitsOfRig, key as K, rigArrows, rigHits, rotField,
  rotOf, routeInfo, routeWellFormed, setRot, speedWinner, type Build, type Placed,
} from "../src/sim/deck";

// Deck-local directions: 0 forward (toward the enemy, -y), 1 = +x, 2 back (+y), 3 = -x.
const RIGS = Object.values(ITEMS).filter((d) => d.kind === "gate");

/** A Furnace deck: the Kiln at (4,6) and a straight route up column 4 (tiles 0..5 = rows 5..0). */
function furnace(items: Placed[] = [], cells = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)]): Build {
  return { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells }], mods: [], beltCap: 40, hullBonus: 5000 };
}
const rig = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed =>
  ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });
/** A target barge: Weaver hull + 5000 and no belts, so it never fires back. */
const barge = (): Build => ({ hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 5 }], routes: [], mods: [], beltCap: 24, hullBonus: 5000 });

/**
 * Run a battle for `secs`, returning it and every event. `fresh(route, tile)` lists the payloads on that route
 * past `tile` that were stamped after `online` seconds (every rig in these decks is commissioned by then), so a
 * payload that crossed a hit tile before its rig came online never counts.
 */
function run(b: Build, secs: number, online = 3) {
  const bt = new Battle(b, barge(), 777);
  const ev: SimEvent[] = [];
  let floor = -1;
  while (bt.t < secs && !bt.over) {
    bt.step();
    ev.push(...bt.events);
    bt.events.length = 0;
    if (floor < 0 && bt.t >= online) floor = Math.max(0, ...bt.sides[0].routes.flatMap((r) => r.ammo.map((a) => a.p.id)));
  }
  const fresh = (route: number, tile: number) => bt.sides[0].routes[route].ammo.filter((a) => a.processed >= tile && a.p.id > floor);
  return { bt, ev, fresh };
}
/** Step the battle of `b` until a payload stamped after `online` s is past `tile` of route 0; return it. */
function payloadPast(b: Build, tile: number, online = 3) {
  const bt = new Battle(b, barge(), 777);
  let floor = -1;
  while (bt.t < 40 && !bt.over) {
    bt.step();
    bt.events.length = 0;
    if (floor < 0 && bt.t >= online) floor = Math.max(0, ...bt.sides[0].routes.flatMap((r) => r.ammo.map((a) => a.p.id)));
    const a = floor >= 0 ? bt.sides[0].routes[0].ammo.find((x) => x.processed >= tile && x.p.id > floor) : undefined;
    if (a) return a.p;
  }
  throw new Error(`no payload past tile ${tile}`);
}

describe("R2, R3: shapes and arrow counts", () => {
  it("every rig def's arrow count matches its rarity (common 1, rare 2, epic 3, legendary 4)", () => {
    expect(RIGS.length).toBeGreaterThanOrEqual(8);
    for (const d of RIGS) {
      const shape = rigShape(d)!;
      expect(shape, d.id).toBeTruthy();
      expect(SHAPE_ARROWS[shape].length, `${d.id} ${d.rarity} ${shape}`).toBe(RARITY_ARROWS[d.rarity]);
      expect(new Set(SHAPE_ARROWS[shape]).size, d.id).toBe(SHAPE_ARROWS[shape].length);
      for (const r of [0, 1, 2, 3]) expect(rigArrows(d.id, r), `${d.id} rot ${r}`).toHaveLength(RARITY_ARROWS[d.rarity]);
    }
  });
  it("the catalogue's shapes: commons I, LONG HAUL II, COIL L, SPLITTER T, OVERDRIVE X; a rare picks II or L", () => {
    for (const id of ["temper", "whetstone", "grease", "brake"]) expect(rigShape(id), id).toBe("I");
    expect([rigShape("longhaul"), rigShape("coil"), rigShape("splitter"), rigShape("overdrive")]).toEqual(["II", "L", "T", "X"]);
    for (const d of RIGS) if (d.rarity === "rare") expect(["II", "L"]).toContain(rigShape(d));
    expect(SHAPE_ARROWS).toEqual({ I: [0], II: [1, 3], L: [0, 1], T: [0, 1, 3], X: [0, 1, 2, 3] });
    for (const id of ["kiln", "press", "chamber", "scatter", "plating", "nope"]) expect(rigShape(id), id).toBeUndefined();
  });
});

describe("R4: rotation", () => {
  it("arrows are (d + rot) % 4, clockwise quarter turns; X ignores rotation", () => {
    const at = (id: string) => [0, 1, 2, 3].map((r) => rigArrows(id, r));
    expect(at("temper")).toEqual([[0], [1], [2], [3]]);
    expect(at("longhaul")).toEqual([[1, 3], [2, 0], [3, 1], [0, 2]]);
    expect(at("coil")).toEqual([[0, 1], [1, 2], [2, 3], [3, 0]]);
    expect(at("splitter")).toEqual([[0, 1, 3], [1, 2, 0], [2, 3, 1], [3, 0, 2]]);
    expect(at("overdrive")).toEqual([[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]]);
    expect(rigArrows("temper", 5)).toEqual([1]); // quarter turns wrap
    expect(rigArrows("kiln", 1)).toEqual([]);
  });
  it("D1: rot is absent at 0, written only for rigs (never for X), and anything malformed reads as 0", () => {
    expect([rotField("temper", 0), rotField("temper", 1), rotField("temper", 4), rotField("longhaul", 3)]).toEqual([{}, { rot: 1 }, {}, { rot: 3 }]);
    expect(rotField("overdrive", 2)).toEqual({});
    expect([rotOf({}), rotOf({ rot: 2 }), rotOf({ rot: 7 }), rotOf({ rot: 1.5 }), rotOf({ rot: -1 })]).toEqual([0, 2, 0, 0, 0]);
    const p: Placed = { uid: 5, def: "coil", x: 0, y: 0 };
    expect(arrowsOf(p)).toEqual([0, 1]);
    setRot(p, 1);
    expect([p.rot, arrowsOf(p)]).toEqual([1, [1, 2]]);
    setRot(p, 4);
    expect("rot" in p).toBe(false);
  });
});

describe("R1, B3: placement", () => {
  it("a rig takes a free cell beside the belt, never a belt tile; it needs no belt in reach (IDLE)", () => {
    const b = furnace();
    expect(canPlaceItem(b, "temper", 4, 3)).toEqual({ ok: false, reason: "BELT IN THE WAY" });
    expect(canPlaceItem(b, "temper", 3, 3).ok).toBe(true);
    expect(canPlaceItem(b, "overdrive", 0, 9).ok).toBe(true);
    b.items.push(rig(2, "overdrive", 0, 9));
    expect(hitsOfRig(b, 2)).toEqual([]); // IDLE
    expect(canPlaceItem(b, "whetstone", 0, 9)).toEqual({ ok: false, reason: "OCCUPIED" });
    expect(canPlaceItem(b, "press", 3, 4)).toEqual({ ok: false, reason: "BELT IN THE WAY" });
  });
  it("every machine blocks a belt: MACHINE IN THE WAY, and a route through a rig is not well formed", () => {
    const b = furnace([rig(2, "temper", 4, 3)], [K(4, 5), K(4, 4)]);
    expect(canExtend(b, 1, [K(4, 5), K(4, 4)], K(4, 3), 0)).toEqual({ ok: false, reason: "MACHINE IN THE WAY" });
    expect(canExtend(b, 1, [K(4, 5), K(4, 4)], K(3, 4), 0).ok).toBe(true);
    const through = furnace([rig(2, "temper", 4, 3)]);
    expect(routeWellFormed(through, through.routes[0])).toBe(false);
    expect(routeInfo(through, 0).connected).toBe(false);
  });
});

describe("R5, R8: hits", () => {
  it("rigs on both sides of a belt: two hits on one tile, both applied (estimate and battle)", () => {
    // WHETSTONE west of tile 2 facing east (+x), TEMPER east of it facing west (-x)
    const b = furnace([rig(2, "whetstone", 3, 3, 1), rig(3, "temper", 5, 3, 3)]);
    const h = rigHits(b)[0];
    expect(h.map((t) => t.length)).toEqual([0, 0, 2, 0, 0, 0]);
    expect(h[2].map((x) => [x.uid, x.dir, x.cell])).toEqual([[2, 1, K(4, 3)], [3, 3, K(4, 3)]]);
    const info = routeInfo(b, 0);
    expect([info.gates, info.gateCells]).toEqual([[2, 3], [2, 2]]);
    const e = estimateRoute(b, 0), plain = estimateRoute(furnace(), 0);
    expect(e.dmg - plain.dmg).toBeCloseTo(2);
    expect(e.burn).toBe(2);
    const p = payloadPast(b, 2);
    expect([p.flat, p.burn, p.prior]).toEqual([2, 2, 2]);
    const { ev } = run(b, 6);
    const proc = ev.filter((x): x is Extract<SimEvent, { type: "process" }> => x.type === "process");
    expect(new Set(proc.map((x) => `${x.gate}:${x.dir}:${x.route}:${x.tile}`))).toEqual(new Set(["2:1:0:2", "3:3:0:2"]));
  });

  it("one rig feeding two belts: a LONG HAUL (II) between two parallel belts hits each once", () => {
    // Weaver: the Loom at (4,5); route 0 up column 4; route 1 west then up column 2, into connector 1
    const b: Build = {
      hero: "weaver", mods: [], beltCap: 40, hullBonus: 5000,
      items: [{ uid: 1, def: "loom", x: 4, y: 5 }, rig(2, "whetstone", 5, 4, 3), rig(3, "longhaul", 3, 2)],
      routes: [
        { factory: 1, cells: [K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
        { factory: 1, cells: [K(3, 5), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(1, 1), K(1, 0)] },
      ],
    };
    expect(arrowsOf(b.items[2])).toEqual([1, 3]);
    const mine = hitsOfRig(b, 3);
    expect(mine.map((x) => [x.route, x.tile, x.dir])).toEqual([[0, 2, 1], [1, 4, 3]]);
    expect(routeInfo(b, 0).gates).toEqual([2, 3]);
    expect(routeInfo(b, 1).gates).toEqual([3]);
    // route 0: WHETSTONE (+2) then LONG HAUL (+2 x 1 prior); route 1: LONG HAUL with no prior hit
    expect(estimateRoute(b, 0).dmg - estimateRoute({ ...b, items: [b.items[0]] }, 0).dmg).toBeCloseTo(4);
    expect(estimateRoute(b, 1).dmg).toBeCloseTo(estimateRoute({ ...b, items: [b.items[0]] }, 1).dmg);
    const { ev } = run(b, 8);
    const routes = new Set(ev.filter((x) => x.type === "process" && x.gate === 3).map((x) => (x as { route: number }).route));
    expect(routes).toEqual(new Set([0, 1]));
  });

  it("a belt wrapping a rig takes one hit per arrow that reaches it; each counts as a prior hit", () => {
    // a U around (3,4): tiles (3,5)=1, (2,5)=2, (2,4)=3, (2,3)=4, (3,3)=5; OVERDRIVE (X) at (3,4); east of it
    // (4,4) is empty deck, so that arrow is idle. A LONG HAUL at (5,1) facing west reads (4,1), tile 8.
    const cells = [K(4, 5), K(3, 5), K(2, 5), K(2, 4), K(2, 3), K(3, 3), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
    const b = furnace([rig(2, "overdrive", 3, 4), rig(3, "longhaul", 5, 1)], cells);
    const od = hitsOfRig(b, 2);
    expect(od.map((x) => [x.tile, x.dir])).toEqual([[1, 2], [3, 3], [5, 0]]);
    expect(routeInfo(b, 0).gates).toEqual([2, 2, 2, 3]);
    expect(routeInfo(b, 0).gateCells).toEqual([1, 3, 5, 8]);
    const lh = hitsOfRig(b, 3);
    expect(lh.map((x) => [x.tile, x.dir])).toEqual([[8, 3]]); // its east arrow points at empty deck
    const e = estimateRoute(b, 0);
    const ammo = AMMO.cinder;
    expect(e.dmg).toBeCloseTo(ammo.base + ammo.rideScale * e.ride + 2 * 3); // LONG HAUL: 3 prior hits
    const p = payloadPast(b, 8);
    expect([p.prior, p.flat]).toEqual([4, 6]);
  });
});

describe("R7: several hits on one tile", () => {
  it("LONG HAUL counts the same tile's additive hits, even with a lower uid", () => {
    // tile 2: LONG HAUL (uid 2, west, rot 0: arrows east and west) and WHETSTONE (uid 3, east, facing west)
    const b = furnace([rig(2, "longhaul", 3, 3), rig(3, "whetstone", 5, 3, 3)]);
    expect(rigHits(b)[0][2].map((x) => [x.uid, x.tier])).toEqual([[3, 1], [2, 2]]);
    const plain = estimateRoute(furnace(), 0);
    expect(estimateRoute(b, 0).dmg - plain.dmg).toBeCloseTo(2 + 2 * 1);
    expect(payloadPast(b, 2).flat).toBe(4);
  });

  it("a SPLITTER scales the flat bonus gained earlier on its own tile", () => {
    // tile 2: SPLITTER (uid 2, west, facing east) and WHETSTONE (uid 3, east, facing west)
    const b = furnace([rig(2, "splitter", 3, 3, 1), rig(3, "whetstone", 5, 3, 3)]);
    expect(rigHits(b)[0][2].map((x) => [x.uid, x.tier])).toEqual([[3, 1], [2, 3]]);
    const e = estimateRoute(b, 0);
    expect(e.copies).toBe(2);
    expect(e.dmg).toBeCloseTo((AMMO.cinder.base + AMMO.cinder.rideScale * e.ride) * 0.6 + 2 * 0.6);
    const { fresh } = run(b, 8);
    const pair = fresh(0, 2);
    expect(pair.length).toBeGreaterThanOrEqual(2);
    for (const a of pair) expect(a.p.flat).toBeCloseTo(1.2);
  });

  it("speed clash: the bigger change on a log scale wins, a tie goes to the faster", () => {
    expect(speedWinner([1.6, 0.5])).toBe(0.5); // |ln 0.5| > |ln 1.6|
    expect(speedWinner([0.5, 3])).toBe(3); // OVERDRIVE beats a 1-star BRAKE
    expect(speedWinner([3, 0.22])).toBe(0.22); // a 3-star BRAKE beats OVERDRIVE
    expect([speedWinner([2, 0.5]), speedWinner([0.5, 2])]).toEqual([2, 2]); // a tie: the faster
    expect(speedWinner([])).toBeUndefined();
    // GREASE (uid 2) and BRAKE (uid 3) on tile 2: BRAKE wins from tile 2 downstream, in the estimate and the battle
    const b = furnace([rig(2, "grease", 3, 3, 1), rig(3, "brake", 5, 3, 3)]);
    const braked = furnace([rig(3, "brake", 5, 3, 3)]);
    expect(estimateRoute(b, 0).time).toBeCloseTo(estimateRoute(braked, 0).time);
    const { bt } = run(b, 5);
    expect(bt.sides[0].routes[0].speedAt).toEqual([1, 1, 0.5, 0.5, 0.5, 0.5]);
    // with the BRAKE disrupted, the GREASE holds the tile
    bt.sides[0].gates.find((g) => g.uid === 3)!.disrupted = 1;
    bt.step();
    expect(bt.sides[0].routes[0].speedAt[2]).toBe(1.6);
  });

  it("hit tiers: additive 1, LONG HAUL-type 2, SPLITTER-type 3, speed 4; within a tier by rig uid, then direction", () => {
    expect([hitTier(ITEMS.temper.gate), hitTier(ITEMS.whetstone.gate), hitTier(ITEMS.coil.gate)]).toEqual([1, 1, 1]);
    expect([hitTier(ITEMS.longhaul.gate), hitTier(ITEMS.splitter.gate), hitTier(ITEMS.grease.gate), hitTier(ITEMS.overdrive.gate)]).toEqual([2, 3, 4, 4]);
    // two arrows of one rig on one tile can't happen (distinct directions reach distinct cells), so the uid
    // decides between two WHETSTONEs: the lower first
    const b = furnace([rig(7, "whetstone", 5, 3, 3), rig(4, "whetstone", 3, 3, 1)]);
    expect(rigHits(b)[0][2].map((x) => x.uid)).toEqual([4, 7]);
  });
});

describe("R9: combat", () => {
  it("a rig is a gate target at its own cell; every belt tile is a belt target; an IDLE rig never comes online", () => {
    const b = furnace([rig(2, "temper", 3, 3, 1), rig(3, "coil", 0, 9)]);
    const bt = new Battle(barge(), b, 1);
    const s = bt.sides[1];
    const gt = s.targets.filter((t) => t.kind === "gate");
    expect(gt.map((t) => [t.ref, t.x, t.y])).toEqual([[2, 3 * CELL + 6, 3 * CELL + 6], [3, 0 * CELL + 6, 9 * CELL + 6]]);
    expect(s.targets.filter((t) => t.kind === "belt")).toHaveLength(6);
    while (bt.t < 4) bt.step();
    expect(s.gates.find((g) => g.uid === 2)!.online).toBe(true);
    expect(s.gates.find((g) => g.uid === 3)!.online).toBe(false);
  });

  it("commissioning keeps the per-route rule, counting rigs in the order of their first hit", () => {
    const b = furnace([rig(2, "whetstone", 3, 1, 1), rig(3, "temper", 3, 4, 1), rig(4, "longhaul", 5, 3)]);
    const bt = new Battle(b, barge(), 1);
    const at = Object.fromEntries(bt.sides[0].gates.map((g) => [g.uid, g.commissionAt]));
    expect(at[3]).toBeCloseTo(1.2); // tile 1
    expect(at[4]).toBeCloseTo(1.8); // tile 2 (its east arrow is idle)
    expect(at[2]).toBeCloseTo(2.4); // tile 4
  });

  it("a disrupted rig stops all of its arrows, and a belt never breaks because of a rig", () => {
    const b = furnace([rig(2, "whetstone", 3, 3, 1)]);
    const { bt } = run(b, 3);
    bt.sides[0].gates[0].disrupted = 60;
    const floor = Math.max(0, ...bt.sides[0].routes[0].ammo.map((a) => a.p.id));
    for (let i = 0; i < 60 * 4; i++) bt.step();
    const late = bt.sides[0].routes[0].ammo.filter((a) => a.processed >= 2 && a.p.id > floor);
    expect(late.length).toBeGreaterThan(0);
    for (const a of late) expect(a.p.flat).toBe(0);
    expect(bt.sides[0].routes[0].connected).toBe(true);
  });

  it("belt speed at tile i uses the tile's own hits; payloads cross at BELT_SPEED x state", () => {
    const b = furnace([rig(2, "overdrive", 5, 3)]);
    const { bt } = run(b, 3);
    expect(bt.sides[0].routes[0].speedAt).toEqual([1, 1, 3, 3, 3, 3]);
    expect(BELT_SPEED).toBe(30);
  });
});

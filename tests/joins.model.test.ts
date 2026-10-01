// 0.6.2j BELT JOINS (REQ-BFG-027, REQ-BFG-030): the deck model. A joining belt (RouteDef.join) ends beside a tile of
// another belt and feeds into it from the side. Rules J1-J3, J8-J10 and J14 (e)'s builder API (joinTiles, setJoin,
// clearJoin); the sim is tests/joins.sim.test.ts, the build screen tests/joins.ui.test.ts.
import { describe, expect, it } from "vitest";
import {
  JOIN_LOOP, JOIN_NOT_BELT, JOIN_NOT_NEXT, JOIN_OFF_DECK, JOIN_SELF, beltUsed, canExtend, canJoin, chainEnd, clearJoin,
  cloneBuild, commitRoute, connectorClaims, estimateRoute, feedOf, joinOf, joinProblem, joinTiles, joinersOf, journeyOf,
  journeyTiles, key as K, moveItem, pruneJoins, removeItem, removeRoute, rotField, routeDirs, routeInfo, routePolyline,
  setJoin, walkRoute, type Build, type Placed,
} from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";

const rig = (uid: number, def: string, x: number, y: number, rot = 0): Placed => ({ uid, def, x, y, ...rotField(def, rot) });

// FURNACE: the KILN's belt M runs up column 4 into the turret (connector 4). A STAMP PRESS west of it feeds R, which
// ends at (3,4), beside M's tile 1 (4,4), and joins it there.
const M = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const R = [K(2, 6), K(2, 5), K(2, 4), K(3, 4)];
function deck(extra: Placed[] = [], joined = true): Build {
  return {
    hero: "furnace", mods: [], beltCap: 40, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }, ...extra],
    routes: [{ factory: 1, cells: [...M] }, { factory: 2, cells: [...R], ...(joined ? { join: K(4, 4) } : {}) }],
  };
}

describe("J1-J2: the model and a legal join", () => {
  it("joinOf finds the main belt by the tile it holds; the joining belt claims no connector and is connected through it", () => {
    const b = deck();
    expect(joinProblem(b, 1)).toBeNull();
    expect(joinOf(b, 1)).toEqual({ route: 0, tile: 1, cell: K(4, 4), dir: 1 });
    expect(joinOf(b, 0)).toBeUndefined(); // the main belt joins nothing
    expect([...connectorClaims(b)]).toEqual([[4, 0]]);
    const info = routeInfo(b, 1);
    expect(info).toMatchObject({ connected: true, turret: 0, connector: -1, tiles: 4, length: 48, wellFormed: true });
    expect(info.join).toEqual(joinOf(b, 1));
    expect(routeInfo(b, 0).join).toBeUndefined();
    expect(feedOf(b, 1)).toEqual({ connected: true, turret: 0, end: 0 });
    expect(chainEnd(b, 1)).toBe(0);
    expect(joinersOf(b, 0)).toEqual([1]);
    expect(journeyOf(b, 1)).toEqual([{ route: 1, from: 0 }, { route: 0, from: 1 }]);
    expect(journeyTiles(b, 1)).toBe(4 + 5);
    expect(journeyTiles(b, 0)).toBe(6);
  });

  it("the main belt is found by its tile, never by route index (indices shift when a belt is removed)", () => {
    const b = deck();
    b.routes.reverse(); // R first, M second
    expect(joinOf(b, 0)?.route).toBe(1);
    // an unrelated belt in front shifts every index; the join still lands on M's tile
    const c = deck([{ uid: 3, def: "press", x: 7, y: 6 }]);
    c.routes.unshift({ factory: 3, cells: [K(7, 5), K(7, 4)] });
    expect(joinOf(c, 2)?.route).toBe(1);
    removeRoute(c, 0);
    expect(c.routes[1].join).toBe(K(4, 4));
    expect(joinOf(c, 1)).toEqual({ route: 0, tile: 1, cell: K(4, 4), dir: 1 });
  });

  it("any tile of the main belt counts, first and last included, entered from any free side", () => {
    const first = deck();
    first.routes[1] = { factory: 2, cells: [K(2, 6), K(2, 5), K(3, 5)], join: K(4, 5) };
    expect(joinOf(first, 1)).toMatchObject({ route: 0, tile: 0, dir: 1 });
    const last = deck();
    last.routes[1] = { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(2, 0), K(3, 0)], join: K(4, 0) };
    expect(joinOf(last, 1)).toMatchObject({ route: 0, tile: 5, dir: 1 });
    expect(routeInfo(last, 1).connected).toBe(true);
    // from the east side, and from the north of a turning belt's tile
    const east: Build = { ...deck(), items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 7, y: 6 }] };
    east.routes[1] = { factory: 2, cells: [K(6, 6), K(6, 5), K(6, 4), K(5, 4)], join: K(4, 4) };
    expect(joinOf(east, 1)).toMatchObject({ route: 0, tile: 1, dir: 3 });
    const bend = deck();
    bend.routes[0] = { factory: 1, cells: [K(4, 5), K(4, 4), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] };
    bend.routes[1] = { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(2, 0), K(3, 0)], join: K(3, 1) };
    expect(joinOf(bend, 1)).toMatchObject({ route: 0, tile: 5, dir: 2 });
  });

  it("chains are fine: C joins B, B joins A; each is connected and feeds A's turret", () => {
    const b: Build = {
      hero: "weaver", mods: [], beltCap: 60, hullBonus: 0,
      items: [{ uid: 1, def: "loom", x: 4, y: 7 }],
      routes: [
        { factory: 1, cells: [K(4, 6), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }, // A: into turret 1 (col 4)
        { factory: 1, cells: [K(3, 7), K(2, 7), K(2, 6), K(2, 5), K(2, 4), K(3, 4)], join: K(4, 4) }, // B joins A
        { factory: 1, cells: [K(6, 7), K(6, 6), K(6, 5), K(6, 4), K(6, 3), K(5, 3)], join: K(4, 3) }, // C joins A too
      ],
    };
    expect(routeInfo(b, 1)).toMatchObject({ connected: true, turret: 1 });
    expect(joinersOf(b, 0)).toEqual([1, 2]);
    // a real chain: C joins B's tile instead
    b.routes[2] = { factory: 1, cells: [K(3, 8), K(2, 8), K(1, 8), K(1, 7), K(1, 6), K(1, 5)], join: K(2, 5) };
    expect(joinOf(b, 2)).toMatchObject({ route: 1 });
    expect(routeInfo(b, 2)).toMatchObject({ connected: true, turret: 1 });
    expect(chainEnd(b, 2)).toBe(0);
    expect(journeyOf(b, 2)).toEqual([{ route: 2, from: 0 }, { route: 1, from: 3 }, { route: 0, from: 2 }]);
    expect(journeyTiles(b, 2)).toBe(6 + 3 + 5);
  });

  it("a joining belt claims no turret connector, even ending on one", () => {
    // M feeds connector 5; R ends on the free connector (4,0), beside M's last tile (5,0)
    const b = deck();
    b.routes[0] = { factory: 1, cells: [K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] };
    b.routes[1] = { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(3, 1), K(4, 1), K(4, 0)] };
    expect([...connectorClaims(b)]).toEqual([[5, 0], [4, 1]]); // unjoined, R feeds connector 4 itself
    b.routes[1].join = K(5, 0);
    expect(joinOf(b, 1)).toMatchObject({ route: 0, tile: 5, dir: 1 });
    expect([...connectorClaims(b)]).toEqual([[5, 0]]);
    expect(routeInfo(b, 1)).toMatchObject({ connected: true, turret: 0, connector: -1 });
  });

  it("a joining belt whose chain ends short of a turret is not connected", () => {
    const b = deck();
    b.routes[0].cells = M.slice(0, 4); // M stops at (4,2)
    expect(joinOf(b, 1)).toBeDefined();
    expect(routeInfo(b, 1)).toMatchObject({ connected: false, turret: -1 });
    expect(feedOf(b, 1)).toEqual({ connected: false, turret: -1, end: 0 });
  });
});

describe("J2, J12: illegal joins leave an open end", () => {
  it("each illegal join has its reason, and the belt is an open, unconnected end", () => {
    const at = (join: number, cells = R): Build => {
      const b = deck();
      b.routes[1] = { factory: 2, cells: [...cells], join };
      return b;
    };
    expect(joinProblem(at(K(4, 3)), 1)).toBe(JOIN_NOT_NEXT); // (3,4) is not beside (4,3)
    expect(joinProblem(at(K(3, 3)), 1)).toBe(JOIN_NOT_BELT);
    expect(joinProblem(at(K(2, 4)), 1)).toBe(JOIN_SELF);
    expect(joinProblem(at(-1), 1)).toBe(JOIN_OFF_DECK);
    expect(joinProblem(at(100), 1)).toBe(JOIN_OFF_DECK);
    expect(joinProblem(at(4.5), 1)).toBe(JOIN_OFF_DECK);
    for (const b of [at(K(4, 3)), at(K(3, 3)), at(K(2, 4))]) {
      expect(joinOf(b, 1)).toBeUndefined();
      expect(routeInfo(b, 1)).toMatchObject({ connected: false, turret: -1, length: 4 * 12 - 6 });
      expect(routeInfo(b, 1).join).toBeUndefined();
      expect([...connectorClaims(b)]).toEqual([[4, 0]]);
    }
  });

  it("no loops: two belts that join each other are both illegal; a loop of three too; a chain beside a loop is fine", () => {
    // A (KILN) ends at (4,3) beside B's (3,3); B (PRESS) ends at (3,3) beside A's (4,3)
    const b: Build = {
      hero: "furnace", mods: [], beltCap: 40, hullBonus: 0,
      items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }],
      routes: [
        { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3)], join: K(3, 3) },
        { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(2, 3), K(3, 3)], join: K(4, 3) },
      ],
    };
    expect(joinProblem(b, 0)).toBe(JOIN_LOOP);
    expect(joinProblem(b, 1)).toBe(JOIN_LOOP);
    expect(joinOf(b, 0)).toBeUndefined();
    expect(routeInfo(b, 1).connected).toBe(false);
    delete b.routes[0].join;
    expect(joinProblem(b, 1)).toBeNull(); // B into A alone is a legal join (A just goes nowhere)
    expect(routeInfo(b, 1).connected).toBe(false);
  });
});

describe("J3: drawing a join (canJoin), the belt budget (J9)", () => {
  const only = (): Build => {
    const b = deck();
    b.routes.pop(); // M only; the PRESS has no belt yet
    return b;
  };

  it("a step into another belt's tile: canExtend still refuses it (BELTS CAN'T CROSS), canJoin joins it", () => {
    const b = only();
    const pending = [...R];
    expect(canExtend(b, 2, pending, K(4, 4), -1)).toEqual({ ok: false, reason: "BELTS CAN'T CROSS" });
    expect(canJoin(b, 2, pending, K(4, 4), -1)).toEqual({ ok: true, route: 0, tile: 1 });
    expect(canJoin(b, 2, [], K(4, 5), -1).ok).toBe(false); // a belt needs a tile of its own to join from
    expect(canJoin(b, 2, pending, K(4, 3), -1)).toMatchObject({ ok: false, reason: "ORTHOGONAL ONLY" });
    expect(canJoin(b, 2, pending, K(3, 3), -1)).toMatchObject({ ok: false, reason: JOIN_NOT_BELT });
    const idx = commitRoute(b, 2, pending, -1, K(4, 4));
    expect(b.routes[idx]).toEqual({ factory: 2, cells: R, join: K(4, 4) }); // the join tile is not one of its cells
    expect(routeInfo(b, idx)).toMatchObject({ connected: true, turret: 0 });
    // J9: the join tile is the main belt's, so the joining belt counts only its own cells
    expect(beltUsed(b)).toBe(6 + 4);
  });

  it("the join step needs no belt: a drawn belt at the cap can still join", () => {
    const b = only();
    b.beltCap = 6 + 4;
    expect(canExtend(b, 2, R.slice(0, 3), R[3], -1).ok).toBe(true);
    expect(canJoin(b, 2, [...R], K(4, 4), -1).ok).toBe(true);
  });

  it("an ordinary drawn belt carries no join field", () => {
    const b = only();
    const idx = commitRoute(b, 2, [K(2, 6), K(2, 5)], -1);
    expect(b.routes[idx]).toEqual({ factory: 2, cells: [K(2, 6), K(2, 5)] });
    expect("join" in b.routes[idx]).toBe(false);
  });

  it("redrawing a main belt so that it would join a belt that joins it says WOULD LOOP; off the old join tile it may", () => {
    const b = deck();
    // M redrawn from the KILN, still over its join tile (4,4), turning west via (3,3) to step into R's end (3,4)
    const via = [K(4, 5), K(4, 4), K(4, 3), K(3, 3)];
    expect(canJoin(b, 1, via, K(3, 4), 0)).toMatchObject({ ok: false, reason: JOIN_LOOP });
    // redrawn off (4,4): committing clears R's join (J8), so M may join R
    const off = [K(5, 5), K(5, 4), K(5, 3), K(4, 3), K(3, 3)];
    expect(canJoin(b, 1, off, K(3, 4), 0)).toEqual({ ok: true, route: 1, tile: 3 });
    commitRoute(b, 1, off, 0, K(3, 4));
    expect(b.routes[1].join).toBeUndefined();
    expect(b.routes[0].join).toBe(K(3, 4));
    // the API refuses a belt's own tile (the editor re-lays over it instead: canExtend treats it as free)
    expect(canJoin(deck(), 1, [K(4, 5)], K(4, 4), 0)).toMatchObject({ ok: false, reason: JOIN_SELF });
  });

  it("the join's dirs and polyline: the last tile leaves toward the join tile; the line runs on to its side and centre", () => {
    const b = deck();
    const link = joinOf(b, 1)!;
    const dirs = routeDirs(b, b.routes[1], true, link);
    expect(dirs[3]).toEqual({ din: 1, dout: 1 }); // (2,4) -> (3,4) east, on east into (4,4)
    const pts = routePolyline(b, b.routes[1], true, link);
    expect(pts.slice(-3)).toEqual([{ x: 42, y: 54 }, { x: 48, y: 54 }, { x: 54, y: 54 }]);
    // a belt that joins nothing: exactly as before
    expect(routeDirs(b, b.routes[0], true)).toEqual(routeDirs(b, b.routes[0], true, undefined));
  });
});

describe("J8: removing, moving or redrawing the main belt clears the join; it never re-attaches by itself", () => {
  it("removing the main belt: the joining belt becomes an open, unconnected end", () => {
    const b = deck();
    removeRoute(b, 0);
    expect(b.routes).toEqual([{ factory: 2, cells: R }]);
    expect(routeInfo(b, 0)).toMatchObject({ connected: false, turret: -1 });
    // a new belt laid over the old join tile doesn't bring the join back
    commitRoute(b, 1, [...M], -1);
    expect(b.routes[0].join).toBeUndefined();
    expect(routeInfo(b, 0).connected).toBe(false);
  });

  it("removing the main belt's factory clears it too", () => {
    const b = deck();
    removeItem(b, 1);
    expect(b.routes).toEqual([{ factory: 2, cells: R }]);
  });

  it("moving the main belt's factory: a move that cuts the main belt loose clears it; one that keeps the belt keeps it", () => {
    const cut = deck();
    expect(moveItem(cut, 1, 6, 7).dropped).toBe(1);
    expect(cut.routes).toEqual([{ factory: 2, cells: R }]);
    const kept = deck();
    expect(moveItem(kept, 1, 3, 6).dropped).toBe(0); // the KILN one cell west still touches (4,5)
    expect(kept.routes[1].join).toBe(K(4, 4));
    expect(joinOf(kept, 1)).toMatchObject({ route: 0, tile: 1 });
  });

  it("redrawing the main belt off the join tile clears it; a redraw that still covers the tile keeps it", () => {
    const off = deck();
    commitRoute(off, 1, [K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)], 0);
    expect(off.routes[1].join).toBeUndefined();
    const on = deck();
    commitRoute(on, 1, [K(4, 5), K(4, 4), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)], 0);
    expect(on.routes[1].join).toBe(K(4, 4));
    expect(joinOf(on, 1)).toMatchObject({ route: 0, tile: 1 });
    expect(routeInfo(on, 1)).toMatchObject({ connected: true, turret: 0 });
  });

  it("a chain: removing the middle belt clears the join into it, and only that one", () => {
    const b = deck([{ uid: 3, def: "press", x: 0, y: 1 }]);
    b.routes.push({ factory: 3, cells: [K(1, 3), K(2, 3)], join: K(2, 4) }); // C joins R, R joins M
    expect(routeInfo(b, 2)).toMatchObject({ connected: true, turret: 0 });
    removeRoute(b, 1);
    expect(b.routes).toEqual([{ factory: 1, cells: M }, { factory: 3, cells: [K(1, 3), K(2, 3)] }]);
  });

  it("pruneJoins leaves a deck without joins exactly as it is, and clears only illegal joins", () => {
    const plain = deck([], false);
    const before = JSON.stringify(plain);
    expect(pruneJoins(plain)).toBe(0);
    expect(JSON.stringify(plain)).toBe(before);
    const bad = deck();
    bad.routes[1].join = K(3, 3);
    const good = deck();
    expect(pruneJoins(good)).toBe(0);
    expect(pruneJoins(bad)).toBe(1);
    expect("join" in bad.routes[1]).toBe(false);
  });
});

describe("J10, J14 (a), J15: the walk through a join", () => {
  // rigs beside R and beside M before, at and after the join tile
  const rigs = [
    rig(10, "temper", 1, 5, 1), // R tile 1: +1 burn
    rig(12, "whetstone", 5, 5, 3), // M tile 0 (before the join): not the joiner's
    rig(13, "whetstone", 5, 4, 3), // M tile 1: the join tile
    rig(14, "whetstone", 5, 2, 3), // M tile 3
    rig(15, "longhaul", 3, 1), // M tile 4 (II: its west arrow finds no belt)
  ];

  it("a joining belt's walk: its own tiles, JOINS at the join tile, then the main belt's hits from there on", () => {
    const b = deck(rigs);
    const w = walkRoute(b, 1);
    expect(w.timeline.map((r) => [r.route ?? "own", r.tile, r.hits.map((h) => h.uid)])).toEqual([
      ["own", 1, [10]], [0, 1, [13]], [0, 3, [14]], [0, 4, [15]],
    ]);
    expect(w.joins).toEqual([{ route: 0, tile: 1, cell: K(4, 4), row: 1 }]);
    expect(w.timeline[3].hits[0]).toMatchObject({ prior: 3, flat: effectAt("longhaul", 1).gate!.perPriorGate! * 3 }); // LONG HAUL counts TEMPER + 2 WHETSTONEs
    expect(w.estimate.burn).toBe(effectAt("temper", 1).gate!.burn);
    expect(w.estimate).toEqual(estimateRoute(b, 1));
    // the main belt's own walk doesn't change when a belt joins it
    expect(walkRoute(b, 0)).toEqual(walkRoute(deck(rigs, false), 0));
    expect(walkRoute(b, 0).joins).toBeUndefined();
  });

  it("J14 (a): with no speed effects the joined walk equals the walk of the same payload on the one continuous belt", () => {
    const joined = deck([...rigs, rig(16, "counterweight", 5, 3), rig(17, "heatjacket", 3, 5, 1)]);
    const single = cloneBuild(joined);
    single.routes = [{ factory: 2, cells: [...R, ...M.slice(1)] }];
    const a = walkRoute(joined, 1), c = walkRoute(single, 0);
    expect(a.estimate).toEqual(c.estimate);
    expect(a.speedEnd).toBe(c.speedEnd);
    expect(a.timeline.map((r) => r.hits)).toEqual(c.timeline.map((r) => r.hits));
    // COUNTERWEIGHT counts the journey's tiles: (4,3) is the payload's 6th tile (index 5), not M's tile 2
    const cw = a.timeline.flatMap((r) => r.hits).find((h) => h.uid === 16)!;
    expect(cw.flat).toBe(5 * 0.5);
  });

  it("J4 by design: past the join the payload rides the main belt's speed state, set by rigs before the join tile", () => {
    const b = deck([rig(12, "grease", 5, 5, 3)]); // GREASE on M's tile 0, before the join
    const single = cloneBuild(b);
    single.routes = [{ factory: 2, cells: [...R, ...M.slice(1)] }]; // the continuous belt misses (4,5): GREASE is idle
    const a = walkRoute(b, 1), c = walkRoute(single, 0);
    expect(a.speedEnd).toBe(1.6);
    expect(c.speedEnd).toBe(1);
    expect(a.estimate.time).toBeLessThan(c.estimate.time);
    expect(a.timeline).toEqual([]); // no hit: GREASE worked M before the join
  });

  it("J15: a slag joiner's walk keeps its fixed speed past the join and marks no speed hit as winning", () => {
    const b = deck([rig(13, "grease", 5, 4, 3)]); // GREASE on the join tile, the shared stretch
    b.items[1] = { uid: 2, def: "slagpot", x: 0, y: 6 };
    const w = walkRoute(b, 1);
    expect(w.fixed).toBe(0.75);
    expect(w.speedEnd).toBe(0.75);
    expect(w.timeline).toHaveLength(1);
    expect(w.timeline[0]).toMatchObject({ route: 0, tile: 1, speed: 0.75 });
    expect(w.timeline[0].hits[0]).toMatchObject({ uid: 13, speed: 1.6, won: false });
    // the same slug on the one continuous belt: the same time (J14 (a) with a slag joiner, no speed rigs)
    const noRig = deck();
    noRig.items[1] = { uid: 2, def: "slagpot", x: 0, y: 6 };
    const single = cloneBuild(noRig);
    single.routes = [{ factory: 2, cells: [...R, ...M.slice(1)] }];
    expect(walkRoute(noRig, 1).estimate).toEqual(walkRoute(single, 0).estimate);
  });

  it("J15: a normal joiner into a slag-fed belt takes that belt's speed hits; the slag belt's own walk doesn't change", () => {
    const b = deck([rig(13, "grease", 5, 4, 3)]);
    b.items[0] = { uid: 1, def: "slagpot", x: 4, y: 6 }; // M carries slag now
    const main = walkRoute(b, 0);
    expect(main.fixed).toBe(0.75);
    expect(main.timeline[0].hits[0].won).toBe(false);
    const w = walkRoute(b, 1);
    expect(w.fixed).toBeUndefined();
    expect(w.timeline[0]).toMatchObject({ route: 0, tile: 1, speed: 1.6 });
    expect(w.timeline[0].hits[0]).toMatchObject({ uid: 13, speed: 1.6, won: true });
    expect(w.speedEnd).toBe(1.6);
    expect(walkRoute(b, 0)).toEqual(walkRoute({ ...b, routes: [b.routes[0]] }, 0));
  });
});

describe("J14 (e): the builder API", () => {
  it("joinTiles lists the tiles a belt could join from its last cell; setJoin sets a legal one; clearJoin clears it", () => {
    const b = deck([], false);
    expect(joinTiles(b, 1)).toEqual([K(4, 4)]);
    expect(joinTiles(b, 0)).toEqual([]); // M's last cell (4,0) has no other belt beside it
    expect(setJoin(b, 1, K(3, 3))).toBe(JOIN_NOT_BELT);
    expect("join" in b.routes[1]).toBe(false);
    expect(setJoin(b, 1, K(4, 4))).toBeNull();
    expect(b.routes[1].join).toBe(K(4, 4));
    expect(routeInfo(b, 1).connected).toBe(true);
    clearJoin(b, 1);
    expect("join" in b.routes[1]).toBe(false);
    expect(routeInfo(b, 1).connected).toBe(false);
  });
});

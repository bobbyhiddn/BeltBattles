// 0.6.2j BELT JOINS (REQ-BFG-027, REQ-BFG-030) on the build screen, without a browser: drawing a join with the real
// Editor (J3), its preview (J11), the inspector's readouts (J10), the FIGHT gate (J14 (c): routeCheck) and the render
// model (J11). The model is tests/joins.model.test.ts, the sim tests/joins.sim.test.ts.
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { NOWHERE, brokenRoutes, fightBlock, routeProblems } from "../src/game/routeCheck";
import { JOIN_LOOP, key as K, removeItem, removeRoute, rotField, routeInfo, type Build, type Placed } from "../src/sim/deck";
import { frame as deckFrame } from "../src/render/frame";
import { cruiserModel } from "../src/render/cruiser";
import { Editor, type EditHost } from "../src/screens/build/edit";
import { beltPanel } from "../src/screens/build/inspector";
import type { Sel } from "../src/screens/build/layout";
import { C } from "../src/render/palette";

const rig = (uid: number, def: string, x: number, y: number, rot = 0): Placed => ({ uid, def, x, y, ...rotField(def, rot) });
const M = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const R = [K(2, 6), K(2, 5), K(2, 4), K(3, 4)];

/** FURNACE: the KILN's belt M up column 4 into the turret; a STAMP PRESS at (0,6) with or without its belt R. */
function run(o: { r?: boolean; joined?: boolean; items?: Placed[] } = {}): Run {
  const rn = newRun("furnace", 5, "joins");
  const b: Build = {
    hero: "furnace", mods: [], beltCap: 40, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }, ...(o.items ?? [])],
    routes: [{ factory: 1, cells: [...M] }],
  };
  if (o.r) b.routes.push({ factory: 2, cells: [...R], ...(o.joined === false ? {} : { join: K(4, 4) }) });
  rn.build = b;
  rn.inventory = [];
  return rn;
}

/** A build-screen host without a screen: the deck at (0, 0) facing north, so cell (x, y) spans screen (12x, 12y). */
function host(rn: Run) {
  const log: string[] = [];
  const noop = () => undefined;
  const fx = { ring: noop, sparkle: noop, sparks: noop, dust: noop, popup: noop } as unknown as EditHost["wfx"];
  const h = {
    run: rn, sel: { kind: "none" } as Sel,
    game: { audio: { play: (s: string) => log.push(`sound:${s}`) }, toast: (m: string) => log.push(`toast:${m}`), error: (m: string) => log.push(`error:${m}`) },
    L: { frame: deckFrame(0, 0, 0), hull: { x: -30, y: -30, w: 200, h: 200 }, cargo: { x: 0, y: 300, w: 100, h: 20 } },
    wfx: fx, ufx: fx,
    select(s: Sel) { h.sel = s; },
    turretAt: () => -1, coinPos: () => ({ x: 0, y: 0 }), touched: noop, placed: noop,
    invalid: (m: string) => log.push(`invalid:${m}`),
    offerAt: () => null, cargoAt: () => null,
  };
  return { h: h as unknown as EditHost & { sel: Sel }, log };
}
const at = (x: number, y: number) => [x * 12 + 6, y * 12 + 6] as const;

/** Drag out of the STAMP PRESS along `path` (cells), one move per cell, without releasing. */
function drawFromPress(ed: Editor, path: [number, number][]) {
  ed.down(...at(1, 6));
  for (const [x, y] of path) ed.move(...at(x, y));
}

describe("J3: drawing a join in the build screen", () => {
  it("a drag that steps into another belt's tile joins it there: complete, the tile not its own, no step past it", () => {
    const rn = run();
    const { h, log } = host(rn);
    const ed = new Editor(h);
    drawFromPress(ed, [[2, 6], [2, 5], [2, 4], [3, 4], [4, 4]]);
    expect(ed.draw).toMatchObject({ factory: 2, cells: R, replacing: -1, join: K(4, 4) });
    expect(ed.ghost()).toEqual({ factory: 2, cells: R, connected: true, join: K(4, 4) });
    ed.move(...at(5, 4)); // on across the main belt: refused silently, the draw stays joined
    ed.move(...at(4, 3));
    expect(ed.draw!.cells).toEqual(R);
    expect(log).toContain("sound:connect");
    expect(log.filter((l) => l.startsWith("error:"))).toEqual([]);
    ed.up(...at(4, 3));
    expect(rn.build.routes[1]).toEqual({ factory: 2, cells: R, join: K(4, 4) });
    expect(routeInfo(rn.build, 1)).toMatchObject({ connected: true, turret: 0 });
    expect(log).toContain("toast:JOINS BELT 1");
    expect(h.sel).toEqual({ kind: "route", index: 1 });
  });

  it("a fast drag joins at the first belt tile it enters; dragging back over its own belt undoes the join", () => {
    const rn = run();
    const { h } = host(rn);
    const ed = new Editor(h);
    drawFromPress(ed, [[2, 6], [2, 5], [2, 4], [3, 4], [7, 4]]); // one jump from (3,4) to (7,4) crosses (4,4) first
    expect(ed.draw).toMatchObject({ cells: R, join: K(4, 4) });
    ed.move(...at(2, 4));
    expect(ed.draw!.join).toBeUndefined();
    expect(ed.draw!.cells).toEqual(R.slice(0, 3));
    ed.move(...at(2, 3)); // on, free again
    expect(ed.draw!.cells).toEqual([...R.slice(0, 3), K(2, 3)]);
    ed.up(...at(2, 3));
    expect(rn.build.routes[1]).toEqual({ factory: 2, cells: [...R.slice(0, 3), K(2, 3)] });
  });

  it("an illegal join shows its reason: redrawing the main belt into the belt that joins it WOULD LOOP", () => {
    const rn = run({ r: true });
    const { h, log } = host(rn);
    const ed = new Editor(h);
    ed.down(...at(4, 3)); // grab M at its tile 2 and redraw it west, into R's end (3,4)
    ed.move(...at(3, 3));
    ed.move(...at(3, 4));
    expect(ed.draw).toMatchObject({ replacing: 0, cells: [K(4, 5), K(4, 4), K(4, 3), K(3, 3)], refused: { cell: K(3, 4), reason: JOIN_LOOP } });
    expect(ed.draw!.join).toBeUndefined();
    expect(ed.ghost()!.refused).toEqual({ cell: K(3, 4), reason: JOIN_LOOP });
    expect(log).toContain(`error:${JOIN_LOOP}`);
    ed.move(...at(3, 2)); // off it: the mark goes, the draw goes on north
    expect(ed.draw!.refused).toBeUndefined();
  });

  it("grabbing a joining belt at its end keeps the join; grabbing it earlier redraws from there", () => {
    const rn = run({ r: true });
    const { h } = host(rn);
    const ed = new Editor(h);
    ed.down(...at(3, 4));
    ed.move(at(3, 4)[0] + 5, at(3, 4)[1]); // a drag inside its last tile
    expect(ed.draw).toMatchObject({ replacing: 1, cells: R, join: K(4, 4) });
    ed.up(at(3, 4)[0] + 5, at(3, 4)[1]);
    expect(rn.build.routes[1]).toEqual({ factory: 2, cells: R, join: K(4, 4) });
    ed.down(...at(2, 5));
    ed.move(...at(3, 5));
    ed.move(...at(3, 4)); // own old tile: re-laid, not a join
    ed.move(...at(4, 4));
    expect(ed.draw).toMatchObject({ replacing: 1, cells: [K(2, 6), K(2, 5), K(3, 5), K(3, 4)], join: K(4, 4) });
    ed.up(...at(4, 4));
    expect(rn.build.routes[1]).toEqual({ factory: 2, cells: [K(2, 6), K(2, 5), K(3, 5), K(3, 4)], join: K(4, 4) });
  });
});

describe("J14 (c): the FIGHT gate (routeCheck)", () => {
  it("a legal join passes; the dead end left by removing the main belt blocks FIGHT and is marked broken", () => {
    const rn = run({ r: true });
    expect(fightBlock(rn.build)).toBeUndefined();
    expect(brokenRoutes(rn.build)).toEqual([]);
    removeRoute(rn.build, 0);
    expect(rn.build.routes).toEqual([{ factory: 2, cells: R }]);
    expect(fightBlock(rn.build)).toBe(NOWHERE);
    expect(brokenRoutes(rn.build)).toEqual([0]);
    const again = run({ r: true });
    removeItem(again.build, 1); // the main belt's factory
    expect(fightBlock(again.build)).toBe(NOWHERE);
  });

  it("an illegal join is reported as validateBuild reports it; the belt is then an open end", () => {
    const rn = run({ r: true });
    rn.build.routes[1].join = K(3, 3); // no belt there
    expect(routeProblems(rn.build).map((p) => p.why)).toEqual([
      "route 1 can't join cell 33: NOT A BELT TILE",
      "route 1 does not end on a free turret connector (disconnected)",
    ]);
    expect(fightBlock(rn.build)).toBe(NOWHERE);
    expect(brokenRoutes(rn.build)).toEqual([1]);
  });

  it("a joining belt into a belt that goes nowhere goes nowhere too", () => {
    const rn = run({ r: true });
    rn.build.routes[0].cells = M.slice(0, 4);
    expect(brokenRoutes(rn.build)).toEqual([0, 1]);
    expect(fightBlock(rn.build)).toBe(NOWHERE);
  });
});

describe("J10: the inspector's readouts through a join", () => {
  const items = [rig(10, "temper", 1, 5, 1), rig(13, "whetstone", 5, 4, 3)]; // R tile 1; the join tile

  it("the joining belt: its own hits, JOINS BELT n AT TILE t, the main belt's hits from there, and the gun end", () => {
    const bp = beltPanel(run({ r: true, items }), 1)!;
    expect(bp.sub).toBe("JOINS BELT 1 · FEEDS TURRET 1");
    expect(bp.head).toEqual(["4 TILES · 2 HITS IN ORDER:"]);
    expect(bp.rows).toEqual(["T2: TEMPER BURN +2", ["JOINS BELT 1 AT TILE 2", C.cyan], "T2: WHETSTONE +2"]);
    expect(bp.foot[0]).toEqual([expect.stringMatching(/^AT THE GUN: DMG [\d.]+ · BURN 2 · NO SHOCK$/), C.yellow]);
    expect(bp.subTight?.[0]).toMatch(/BURN 2/);
  });

  it("the main belt says how many belts join it; its own lines don't change", () => {
    const joined = beltPanel(run({ r: true, items }), 0)!;
    const open = beltPanel(run({ r: true, joined: false, items }), 0)!;
    expect(joined.head).toEqual([["1 BELT JOINS IT: BELT 2", C.cyan], "6 TILES · 1 HIT IN ORDER:"]);
    expect(open.head).toEqual(["6 TILES · 1 HIT IN ORDER:"]);
    expect(joined.rows).toEqual(open.rows);
    expect(joined.foot).toEqual(open.foot);
    expect(joined.sub).toBe(open.sub);
  });

  it("on a short panel (phones) the rows given way count hit tiles only: a JOINS line is none", () => {
    const bp = beltPanel(run({ r: true, items }), 1)!; // rows: T2 TEMPER, JOINS BELT 1 AT TILE 2, T2 WHETSTONE
    expect(bp.more(1)).toEqual(["+1 MORE HIT TILE (NUMBERED ON THE DECK)", C.slate4]);
    expect(bp.more(2)).toEqual(["+1 MORE HIT TILE (NUMBERED ON THE DECK)", C.slate4]);
    expect(bp.more(3)).toEqual(["+2 MORE HIT TILES (NUMBERED ON THE DECK)", C.slate4]);
    // a join with no hit after it: dropping only its JOINS line shows that line itself
    const bare = beltPanel(run({ r: true, items: [rig(10, "temper", 1, 5, 1)] }), 1)!;
    expect(bare.rows).toEqual(["T2: TEMPER BURN +2", ["JOINS BELT 1 AT TILE 2", C.cyan]]);
    expect(bare.more(1)).toEqual(["JOINS BELT 1 AT TILE 2", C.cyan]);
    expect(bare.more(2)).toEqual(["+1 MORE HIT TILE (NUMBERED ON THE DECK)", C.slate4]);
    // a belt without joins: as before 0.6.2j
    expect(beltPanel(run({ r: true, joined: false, items }), 0)!.more(1)).toEqual(["+1 MORE HIT TILE (NUMBERED ON THE DECK)", C.slate4]);
  });

  it("a belt that joins nothing reads exactly as before 0.6.2j", () => {
    const bp = beltPanel(run({ r: true, joined: false, items }), 1)!;
    expect(bp.sub).toBe("NOT CONNECTED");
    expect(bp.subTight).toBeUndefined();
    expect(bp.head).toEqual([["ENDS SHORT OF A TURRET INTAKE.", C.amber], "4 TILES · 1 HIT IN ORDER:"]);
    expect(bp.rows).toEqual(["T2: TEMPER BURN +2"]);
  });
});

describe("J11: the render model", () => {
  it("a joining belt's chevrons run into the join tile's side; it claims no intake; the main belt's model is its own", () => {
    const m = cruiserModel(run({ r: true }).build);
    const open = cruiserModel(run({ r: true, joined: false }).build);
    expect(m.routes[1].join).toMatchObject({ route: 0, tile: 1, cell: K(4, 4), dir: 1 });
    expect(m.routes[1].connected).toBe(true);
    expect(open.routes[1].connected).toBe(false);
    expect([...m.connectedCols]).toEqual([4]);
    expect(m.routes[0]).toEqual(open.routes[0]);
    expect(m.routes[1].pts.slice(-3)).toEqual([{ x: 42, y: 54 }, { x: 48, y: 54 }, { x: 54, y: 54 }]);
    // a belt that climbs into its last tile and joins east: that tile turns into the main belt's side
    const turn = run();
    turn.build.routes.push({ factory: 2, cells: [K(2, 6), K(3, 6), K(3, 5)], join: K(4, 5) });
    const t = cruiserModel(turn.build).routes[1];
    expect(t.join).toMatchObject({ route: 0, tile: 0, dir: 1 });
    expect(Array.from(t.din)).toEqual([1, 1, 0]);
    expect(Array.from(t.dout)).toEqual([1, 0, 1]);
    delete turn.build.routes[1].join;
    expect(Array.from(cruiserModel(turn.build).routes[1].dout)).toEqual([1, 0, 0]); // open: it ends in a stopper
  });
});

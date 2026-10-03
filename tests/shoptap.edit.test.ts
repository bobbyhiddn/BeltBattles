// shoptap (BeltBattles 0.8.0 phone controls; REQ-BFG-034, -035, -036, -037): the build screen's editor (edit.ts) with a
// mouse and with a finger, without a browser (scripts/touchcheck.mjs drives the real page with real touch events).
//   D1 a touch or pen press stays a tap until it has moved 10 CSS px (in logical px through the view); the mouse keeps 4 px.
//   D2 a touch tap reads: it selects what it lands on and never buys, sells, moves, places, merges, cuts or reroutes; a rig
//      turns only on a tap while it is already selected; tap-to-place is the mouse's alone; a tap on the selected turret
//      steps through its core and gear.
//   D3 a touch tap on a belt puts up its X (Editor.beltX), which any other press takes down; a mouse click never does.
//   D4 a touch drag from a factory's own first belt tile draws a NEW belt while the factory has a free output; a drag out
//      of a one-output factory with a belt says it moves that belt (mouse and touch), and one that lays no tile changes
//      nothing; back on the factory, a touch draw starts over.
// The battle rules are untouched: outputs come from outputsAt (routeCheck.ts, validate.ts read the same), and every belt
// committed here is a belt the build screen could always commit (commitRoute).
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { key as K, rotField, routesOf, type Build, type Placed } from "../src/sim/deck";
import { outputsAt } from "../src/sim/stars";
import { frame as deckFrame } from "../src/render/frame";
import { computeView } from "../src/core/io";
import {
  Editor, MOUSE_SLOP, TOUCH_SLOP_CSS, direct, dragSlop, fittedPieces, freeOutputs, movesNotice, type EditHost,
} from "../src/screens/build/edit";
import { buildScale, type Sel } from "../src/screens/build/layout";
import type { PointerKind } from "../src/core/io";

const J = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const rig = (uid: number, def: string, x: number, y: number, rot = 0): Placed => ({ uid, def, x, y, ...rotField(def, rot) });
const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];

/** The build screen's CSS px per logical px on a phone view (its own scale, buildScale). */
function buildK(w: number, h: number, dpr: number): number {
  const v = computeView(w, h, dpr, buildScale);
  return v.scale / v.dpr;
}
const PHONE_K = buildK(390, 844, 3); // 7 / 3
const LAND_K = buildK(844, 390, 3); // 4 / 3
const SMALL_K = buildK(360, 640, 2); // 2

/** FURNACE: the KILN (one output) at (4,6) with its belt up column 4; `items` more parts; a shop with a TEMPER for 3 gold
 *  (affordable) and a STAMP PRESS for 8 (not, with 5 gold). */
function furnace(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "shoptap");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORT] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 5;
  run.shop.wagons = [{ merchant: "alchemist", offers: [{ def: "temper", price: 3, sold: false }, { def: "press", price: 8, sold: false }] }] as Run["shop"]["wagons"];
  return run;
}

/** WEAVER: the LOOM (three outputs) at (4,6) with one belt up column 4. */
function weaver(): Run {
  const run = newRun("weaver", 5, "shoptap");
  run.build = { hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 6 }], routes: [{ factory: 1, cells: [...SHORT] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  return run;
}

/** A build-screen host without a screen: the deck at (0, 0) facing north (cell (x, y) spans screen (12x, 12y)); the shop's
 *  two cards at y 400-440 (x 0-50, 50-100); cargo slots at y 300-320 (20 px each); TURRET SLOT 0 at x 48-72, y -24-0;
 *  `k` CSS px per logical px. */
function host(run: Run, k = PHONE_K) {
  const log: string[] = [];
  const noop = () => undefined;
  const fx = { ring: noop, sparkle: noop, sparks: noop, dust: noop, popup: noop } as unknown as EditHost["wfx"];
  const h = {
    run, sel: { kind: "none" } as Sel,
    game: { audio: { play: (s: string) => log.push(`sound:${s}`) }, toast: (m: string) => log.push(`toast:${m}`), error: (m: string) => log.push(`error:${m}`) },
    L: { frame: deckFrame(0, 0, 0), hull: { x: -30, y: -30, w: 200, h: 200 }, cargo: { x: 0, y: 300, w: 100, h: 20 } },
    wfx: fx, ufx: fx,
    select(s: Sel) { h.sel = s; },
    turretAt: (x: number, y: number) => (x >= 48 && x < 72 && y >= -24 && y < 0 ? 0 : -1),
    coinPos: () => ({ x: 0, y: 0 }), touched: noop, placed: noop,
    invalid: (m: string) => log.push(`invalid:${m}`),
    offerAt: (x: number, y: number) => (y >= 400 && y < 440 && x >= 0 && x < 100 ? { wagon: 0, slot: x < 50 ? 0 : 1 } : null),
    cargoAt: (x: number, y: number) => (y >= 300 && y < 320 ? run.inventory[Math.floor(x / 20)]?.uid ?? null : null),
    cssPerPx: () => k,
  };
  return { h: h as unknown as EditHost & { sel: Sel }, log };
}
const at = (x: number, y: number) => [x * 12 + 6, y * 12 + 6] as const;
const CARD0 = [25, 420] as const; // the TEMPER card
const CARD1 = [75, 420] as const; // the STAMP PRESS card
const TURRET = [60, -12] as const;

/** A tap at (x, y) whose finger drifts `css` CSS px (diagonally) before it lifts. */
function tap(ed: Editor, p: readonly [number, number], kind: PointerKind = "touch", css = 0, k = PHONE_K): void {
  const d = css / k / Math.SQRT2;
  ed.down(p[0], p[1], kind);
  if (css) ed.move(p[0] + d, p[1] + d);
  ed.up(p[0] + d, p[1] + d);
}

/** A drag along `path` (screen points), released at its end. */
function drag(ed: Editor, path: (readonly [number, number])[], kind: PointerKind = "touch", release = true): void {
  ed.down(path[0][0], path[0][1], kind);
  for (const p of path.slice(1)) ed.move(p[0], p[1]);
  if (release) ed.up(path[path.length - 1][0], path[path.length - 1][1]);
}

const state = (run: Run) => J({ build: run.build, inventory: run.inventory, gold: run.gold, shop: run.shop });

describe("D1: the touch slop (10 CSS px through the view); the mouse keeps 4 px", () => {
  it("dragSlop: the mouse 4 logical px exactly; touch and pen 10 CSS px at the build screen's scale on each phone view", () => {
    expect([MOUSE_SLOP, TOUCH_SLOP_CSS]).toEqual([4, 10]);
    expect([PHONE_K, LAND_K, SMALL_K]).toEqual([7 / 3, 4 / 3, 2]); // scale 7, 4 and 4 over dpr 3, 3 and 2
    for (const k of [PHONE_K, LAND_K, SMALL_K, 1, 3]) {
      expect(dragSlop("mouse", k)).toBe(4);
      expect(dragSlop("touch", k)).toBeCloseTo(10 / k, 12);
      expect(dragSlop("pen", k)).toBeCloseTo(10 / k, 12);
      expect(dragSlop("touch", k) * k).toBeCloseTo(10, 12); // in CSS px
    }
    // 0.8.0's 4 logical px were 9.3 CSS px on the portrait iPhone, 5.3 on its side and 8 on a 360x640 phone
    expect([4 * PHONE_K, 4 * LAND_K, 4 * SMALL_K].map((v) => +v.toFixed(2))).toEqual([9.33, 5.33, 8]);
    expect([direct("touch"), direct("pen"), direct("mouse"), direct(undefined)]).toEqual([true, true, false, false]);
  });

  it("a finger's tap drifting 3, 5 or 8 CSS px stays a tap on every phone view; 10 CSS px is a drag", () => {
    for (const k of [PHONE_K, LAND_K, SMALL_K]) {
      for (const css of [3, 5, 8, 9.9]) {
        const run = furnace();
        const { h } = host(run, k);
        const ed = new Editor(h);
        tap(ed, CARD0, "touch", css, k);
        expect([h.sel, ed.carry, run.gold], `${k} ${css}`).toEqual([{ kind: "offer", wagon: 0, slot: 0 }, null, 5]);
      }
      const run = furnace();
      const { h } = host(run, k);
      const ed = new Editor(h);
      ed.down(0, CARD0[1], "touch"); // the card's left edge (x 0), so the move is exactly 10 CSS px
      ed.move(10 / k, CARD0[1]);
      expect(ed.carry?.def, `${k}: 10 CSS px lifts the card`).toBe("temper");
    }
  });

  it("the mouse: 3.9 logical px stays a click, 4 lifts, whatever the view", () => {
    for (const k of [PHONE_K, 1]) {
      const run = furnace();
      const { h } = host(run, k);
      const ed = new Editor(h);
      ed.down(CARD0[0], CARD0[1]);
      ed.move(CARD0[0] + 3.9, CARD0[1]);
      expect(ed.carry).toBeNull();
      ed.move(CARD0[0] + 4, CARD0[1]);
      expect(ed.carry?.def).toBe("temper");
    }
  });
});

describe("D2: a touch tap reads", () => {
  it("a shop card, affordable or not, opens its panel; gold, the shop and the build stay as they were; nothing lifts", () => {
    for (const [card, slot] of [[CARD0, 0], [CARD1, 1]] as const) {
      for (const css of [3, 5, 8]) {
        const run = furnace();
        const before = state(run);
        const { h, log } = host(run);
        const ed = new Editor(h);
        tap(ed, card, "touch", css);
        expect(h.sel).toEqual({ kind: "offer", wagon: 0, slot });
        expect([ed.carry, ed.draw, state(run)]).toEqual([null, null, before]);
        expect(log.filter((l) => l.startsWith("invalid:") || l.startsWith("error:"))).toEqual([]); // no NEED N MORE GOLD
      }
    }
  });

  it("with a shop card selected, a tap on a part reads that part and buys nothing; on an empty cell it dismisses", () => {
    const run = furnace([rig(2, "temper", 3, 3, 1)]);
    const before = state(run);
    const { h } = host(run);
    const ed = new Editor(h);
    tap(ed, CARD0);
    tap(ed, at(3, 3), "touch", 5); // the TEMPER rig
    expect(h.sel).toEqual({ kind: "item", uid: 2 });
    expect(state(run)).toEqual(before); // not bought, not placed, the rig not turned
    tap(ed, CARD0);
    tap(ed, at(4, 7), "touch", 3); // the KILN
    expect(h.sel).toEqual({ kind: "item", uid: 1 });
    tap(ed, CARD0);
    tap(ed, at(4, 3), "touch", 8); // its belt
    expect(h.sel).toEqual({ kind: "route", index: 0 });
    tap(ed, CARD0);
    tap(ed, TURRET);
    expect(h.sel).toEqual({ kind: "turret", index: 0 });
    tap(ed, CARD0);
    tap(ed, at(7, 2)); // an empty cell
    expect(h.sel).toEqual({ kind: "none" });
    expect(state(run)).toEqual(before);
  });

  it("with a cargo part selected, a tap on the deck never places it", () => {
    const run = furnace();
    run.inventory = [{ uid: 50, def: "temper" }];
    const before = state(run);
    const { h } = host(run);
    const ed = new Editor(h);
    tap(ed, [10, 310]);
    expect(h.sel).toEqual({ kind: "cargo", uid: 50 });
    tap(ed, at(3, 3), "touch", 5);
    expect([h.sel, state(run)]).toEqual([{ kind: "none" }, before]);
  });

  it("the mouse keeps tap-to-place: a click on a card, then on a cell beside the belt, buys and places it there", () => {
    const run = furnace();
    const { h } = host(run);
    const ed = new Editor(h);
    tap(ed, CARD0, "mouse");
    expect(h.sel).toEqual({ kind: "offer", wagon: 0, slot: 0 });
    tap(ed, at(3, 3), "mouse");
    expect(run.gold).toBe(2);
    expect(run.shop.wagons[0].offers[0].sold).toBe(true);
    expect(run.build.items.find((p) => p.def === "temper")).toMatchObject({ x: 3, y: 3 });
    // and a cargo part, clicked then dropped by a click
    run.inventory = [{ uid: 60, def: "temper" }];
    tap(ed, [10, 310], "mouse");
    tap(ed, at(5, 3), "mouse");
    expect(run.build.items.find((p) => p.uid === 60)).toMatchObject({ x: 5, y: 3 });
  });

  it("a rig: the first touch tap selects it (no turn); a tap on the selected rig turns it; the mouse turns on every click", () => {
    const run = furnace([rig(2, "temper", 3, 3, 1), rig(3, "temper", 5, 3, 3)]);
    const { h } = host(run);
    const ed = new Editor(h);
    tap(ed, at(3, 3), "touch", 5);
    expect([h.sel, run.build.items[1].rot]).toEqual([{ kind: "item", uid: 2 }, 1]);
    tap(ed, at(3, 3), "touch", 8);
    expect([h.sel, run.build.items[1].rot]).toEqual([{ kind: "item", uid: 2 }, 2]);
    tap(ed, at(3, 3), "touch", 3);
    expect(run.build.items[1].rot).toBe(3);
    tap(ed, at(5, 3), "touch"); // another rig: selected, not turned
    expect([h.sel, run.build.items[2].rot]).toEqual([{ kind: "item", uid: 3 }, 3]);
    // the mouse, as 0.6.2 BELTSIDE (B2): every click turns and selects
    tap(ed, at(3, 3), "mouse");
    expect([h.sel, run.build.items[1].rot ?? 0]).toEqual([{ kind: "item", uid: 2 }, 0]);
    tap(ed, at(3, 3), "mouse");
    expect(run.build.items[1].rot).toBe(1);
  });

  it("a pen taps as a finger does", () => {
    const run = furnace([rig(2, "temper", 3, 3, 1)]);
    const { h } = host(run);
    const ed = new Editor(h);
    tap(ed, CARD0, "pen", 8);
    tap(ed, at(3, 3), "pen", 5);
    expect([h.sel, run.build.items[1].rot, run.gold]).toEqual([{ kind: "item", uid: 2 }, 1, 5]);
  });

  it("the selected turret: a tap again steps through its bought core, then its gear, then back to the turret", () => {
    const run = furnace();
    run.build.mods = [{ uid: 951, def: "hopper", turret: 0 }, { uid: 950, def: "pressure", turret: 0 }];
    expect(fittedPieces(run.build, 0)).toEqual([950, 951]); // the core first, then the gear in hardpoint order
    expect(fittedPieces(run.build, 1)).toEqual([]);
    const { h } = host(run);
    const ed = new Editor(h);
    const seen: Sel[] = [];
    for (let i = 0; i < 4; i++) {
      tap(ed, TURRET, "touch", 3 + i);
      seen.push(h.sel);
    }
    expect(seen).toEqual([{ kind: "turret", index: 0 }, { kind: "fitted", uid: 950 }, { kind: "fitted", uid: 951 }, { kind: "turret", index: 0 }]);
    expect(run.build.mods).toHaveLength(2); // nothing lifted, removed or moved
    // the mouse: a click selects the turret, as before, however often
    tap(ed, TURRET, "mouse");
    tap(ed, TURRET, "mouse");
    expect(h.sel).toEqual({ kind: "turret", index: 0 });
  });
});

describe("D3: the belt X (touch only)", () => {
  it("a touch tap on a belt selects it and puts up its X at the tapped tile; any other press takes it down", () => {
    const run = furnace();
    const { h } = host(run);
    const ed = new Editor(h);
    tap(ed, at(4, 3), "touch", 5);
    expect(h.sel).toEqual({ kind: "route", index: 0 });
    expect(ed.beltX()).toEqual({ index: 0, cell: K(4, 3), cells: SHORT.join(",") });
    ed.down(...at(7, 7), "touch"); // a press anywhere else
    expect(ed.beltX()).toBeNull();
    ed.up(...at(7, 7));
    tap(ed, at(4, 1), "touch");
    expect(ed.beltX()?.cell).toBe(K(4, 1));
    ed.dropX(); // a press on a UI region (the screen's pressed hook)
    expect(ed.beltX()).toBeNull();
    tap(ed, at(4, 1), "touch");
    h.select({ kind: "none" }); // the belt no longer selected (REMOVE BELT, Escape, ...)
    expect(ed.beltX()).toBeNull();
  });

  it("the X goes once its belt changes; a mouse click on a belt selects it and puts up no X", () => {
    const run = furnace();
    const { h } = host(run);
    const ed = new Editor(h);
    tap(ed, at(4, 2), "touch");
    expect(ed.beltX()).not.toBeNull();
    run.build.routes[0].cells.pop();
    expect(ed.beltX()).toBeNull();
    const run2 = furnace();
    const m = host(run2);
    const ed2 = new Editor(m.h);
    tap(ed2, at(4, 3), "mouse");
    expect([m.h.sel, ed2.beltX()]).toEqual([{ kind: "route", index: 0 }, null]);
  });

  it("a jittered tap never cuts a belt; a real drag past the slop reroutes it, as before", () => {
    for (const css of [3, 5, 8, 9.5]) {
      const run = furnace();
      const before = state(run);
      const { h } = host(run);
      const ed = new Editor(h);
      tap(ed, at(4, 3), "touch", css);
      expect(state(run), `${css} CSS px`).toEqual(before);
    }
    const run = furnace();
    const { h } = host(run);
    const ed = new Editor(h);
    drag(ed, [at(4, 3), at(3, 3), at(3, 2), at(3, 1), at(3, 0)]); // grab tile 3 and redraw it west
    expect(run.build.routes).toEqual([{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(3, 3), K(3, 2), K(3, 1), K(3, 0)] }]);
  });
});

describe("D4: drags out of a factory", () => {
  it("the outputs: the KILN 1, the LOOM 3, GANTRY PRESS 2 (3 at ★2), TWIN MOULD 2 (3 at ★3) (outputsAt, as validate.ts)", () => {
    expect([outputsAt("kiln", 1), outputsAt("loom", 1), outputsAt("gantry", 1), outputsAt("gantry", 2), outputsAt("twinmould", 1), outputsAt("twinmould", 3)])
      .toEqual([1, 3, 2, 3, 2, 3]);
    expect([freeOutputs(furnace().build, 1), freeOutputs(weaver().build, 1)]).toEqual([0, 2]);
  });

  it("(a) touch: a drag from the LOOM's own first belt tile draws a second belt and keeps the first", () => {
    for (const dir of [[3, 5], [5, 5], [3, 6]] as const) {
      const run = weaver();
      const { h } = host(run);
      const ed = new Editor(h);
      drag(ed, [at(4, 5), [at(4, 5)[0] - 3, at(4, 5)[1] + 3], at(...dir), at(dir[0], 4), at(dir[0], 3)], "touch", false);
      expect(ed.draw, `${dir}`).toMatchObject({ factory: 1, replacing: -1, start: K(4, 5) });
      expect(ed.draw!.cells).not.toContain(K(4, 5));
      expect(ed.draw!.join).toBeUndefined();
      ed.up(...at(dir[0], 3));
      expect(run.build.routes[0], `${dir}: the first belt`).toEqual({ factory: 1, cells: SHORT });
      expect(routesOf(run.build, 1)).toHaveLength(2);
    }
  });

  it("(a) the mouse, a later tile, or a factory with every output used: a drag from a belt tile reroutes it, as before", () => {
    const mouse = weaver();
    const m = host(mouse);
    const ed = new Editor(m.h);
    drag(ed, [at(4, 5), at(3, 5), at(3, 4)], "mouse", false);
    expect(ed.draw).toMatchObject({ factory: 1, replacing: 0, cells: [K(4, 5), K(3, 5), K(3, 4)] });
    const later = weaver();
    const l = host(later);
    const ed2 = new Editor(l.h);
    drag(ed2, [at(4, 4), at(3, 4)], "touch", false);
    expect(ed2.draw).toMatchObject({ replacing: 0, cells: [K(4, 5), K(4, 4), K(3, 4)] });
    const full = furnace(); // the KILN: one output, used
    const f = host(full);
    const ed3 = new Editor(f.h);
    drag(ed3, [at(4, 5), at(3, 5)], "touch", false);
    expect(ed3.draw).toMatchObject({ replacing: 0, cells: [K(4, 5), K(3, 5)] });
  });

  it("(b) a drag out of a one-output factory with a belt says it moves that belt, mouse and touch; released with no tile, nothing changes", () => {
    for (const kind of ["touch", "mouse"] as PointerKind[]) {
      const run = furnace();
      const before = J(run.build);
      const { h, log } = host(run);
      const ed = new Editor(h);
      drag(ed, [at(4, 7), at(5, 7), at(5, 6)], kind, false); // within the KILN's 2x2
      expect(log).toContain(`toast:${movesNotice("KILN")}`);
      expect(movesNotice("KILN")).toBe("KILN HAS 1 OUTPUT · THIS MOVES ITS BELT");
      expect(ed.draw).toMatchObject({ factory: 1, replacing: 0, cells: [] });
      expect(ed.draw!.moves).toBe(kind === "touch" ? true : undefined); // touch keeps the old belt in sight
      ed.up(...at(5, 6));
      expect(J(run.build), kind).toEqual(before);
      // a tap is a tap: no draw, no notice
      const l0 = log.length;
      tap(ed, at(4, 7), kind, kind === "touch" ? 8 : 0);
      expect([J(run.build), log.slice(l0).some((s) => s.startsWith("toast:"))]).toEqual([before, false]);
    }
  });

  it("(b) touch: out of the factory and back onto it, the draw starts over; released there, the old belt is untouched", () => {
    const run = furnace();
    const before = J(run.build);
    const { h } = host(run);
    const ed = new Editor(h);
    drag(ed, [at(5, 7), at(6, 7), at(7, 7), at(7, 6)], "touch", false);
    expect(ed.draw!.cells.length).toBeGreaterThan(1);
    ed.move(...at(5, 7)); // back on the KILN
    expect(ed.draw!.cells).toEqual([]);
    ed.up(...at(5, 7));
    expect(J(run.build)).toEqual(before);
    // out again: a new belt replaces the old one only when it commits
    drag(ed, [at(5, 7), at(6, 7), at(6, 6), at(6, 5), at(6, 4), at(6, 3), at(6, 2), at(6, 1), at(6, 0)], "touch");
    expect(run.build.routes).toEqual([{ factory: 1, cells: [K(6, 7), K(6, 6), K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(6, 0)] }]);
  });

  it("(c) a factory with every output used keeps today's warning, mouse and touch", () => {
    for (const kind of ["touch", "mouse"] as PointerKind[]) {
      const run = weaver();
      run.build.routes.push({ factory: 1, cells: [K(3, 6), K(2, 6), K(2, 5)] }, { factory: 1, cells: [K(6, 6), K(7, 6), K(7, 5)] });
      const { h, log } = host(run);
      const ed = new Editor(h);
      drag(ed, [at(4, 7), at(5, 7), at(5, 6)], kind, false);
      expect(ed.draw).toBeNull();
      expect(log).toContain("error:ALL 3 LOOM OUTPUTS USED - DRAG A BELT TO REROUTE");
    }
  });

  it("the hold that lifts a factory is 0.38 s, for a finger as for the mouse", () => {
    for (const kind of ["touch", "mouse"] as PointerKind[]) {
      const run = furnace([{ uid: 5, def: "press", x: 0, y: 6 }]);
      const { h } = host(run);
      const ed = new Editor(h);
      ed.down(...at(0, 6), kind);
      ed.update(0.3);
      expect(ed.carry).toBeNull();
      ed.update(0.1);
      expect(ed.carry?.def, kind).toBe("press");
    }
  });
});

/** The build behind each test is legal before and after (the deck validator's own question, routeCheck.ts). */
describe("the decks these gestures leave are decks the build screen always made", () => {
  it("a touch-drawn second LOOM belt is a belt commitRoute makes from the factory (no join, its own first tile)", () => {
    const run = weaver();
    const { h } = host(run);
    const ed = new Editor(h);
    drag(ed, [at(4, 5), at(3, 5), at(3, 4), at(3, 3), at(3, 2), at(3, 1), at(3, 0)], "touch");
    const b: Build = run.build;
    expect(b.routes[1]).toEqual({ factory: 1, cells: [K(3, 6), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(3, 0)] });
  });
});

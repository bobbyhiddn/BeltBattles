// 0.6.2 BELTSIDE build screen (ref/DESIGN-beltside.md B1-B4, V4) without a browser: rotating rigs (tap, the
// ROTATE command and R's carry rotation), the drag preview's auto-aim and the drop that honours it, a merge that
// keeps the survivor's rotation, and the belt timeline (walkRoute) the inspector reads.
import { describe, expect, it } from "vitest";
import { newRun, rotateRig, type Run } from "../src/game/run";
import { gainModule } from "../src/game/fuse";
import { estimateRoute, key as K, rotField, walkRoute, type Build, type Placed } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { frame as deckFrame } from "../src/render/frame";
import { Editor, type EditHost } from "../src/screens/build/edit";
import { rigRotAt } from "../src/screens/build/actions";
import type { Sel } from "../src/screens/build/layout";

const J = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const rig = (uid: number, def: string, x: number, y: number, rot = 0): Placed => ({ uid, def, x, y, ...rotField(def, rot) });
function furnaceRun(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "ui");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORT] }], mods: [], beltCap: 30, hullBonus: 0 };
  run.inventory = [];
  return run;
}

/** A build-screen host without a screen: the deck at (0, 0) facing north, so cell (x, y) spans screen (12x, 12y). */
function host(run: Run) {
  const log: string[] = [];
  const noop = () => undefined;
  const fx = { ring: noop, sparkle: noop, sparks: noop, dust: noop, popup: noop } as unknown as EditHost["wfx"];
  const h = {
    run, sel: { kind: "none" } as Sel,
    game: { audio: { play: (s: string) => log.push(`sound:${s}`) }, toast: (m: string) => log.push(`toast:${m}`), error: (m: string) => log.push(`error:${m}`) },
    L: { frame: deckFrame(0, 0, 0), hull: { x: -30, y: -30, w: 200, h: 200 }, cargo: { x: 0, y: 300, w: 100, h: 20 } },
    wfx: fx, ufx: fx,
    select(s: Sel) { h.sel = s; },
    turretAt: () => -1, coinPos: () => ({ x: 0, y: 0 }), touched: noop, placed: noop,
    invalid: (m: string) => log.push(`invalid:${m}`),
    offerAt: () => null, cargoAt: (x: number, y: number) => (y >= 300 ? run.inventory[0]?.uid ?? null : null),
  };
  return { h: h as unknown as EditHost & { sel: Sel }, log };
}
const at = (x: number, y: number) => [x * 12 + 6, y * 12 + 6] as const;

describe("B2: rotating a placed rig", () => {
  it("rotateRig turns a quarter turn clockwise, writes no rot at 0, and refuses X rigs and non-rigs", () => {
    const run = furnaceRun([rig(2, "splitter", 3, 3, 3), rig(3, "overdrive", 5, 3)]);
    expect(rotateRig(run, 2)).toBe(true);
    expect("rot" in run.build.items[1]).toBe(false); // 3 + 1 = 0: absent
    expect(rotateRig(run, 2)).toBe(true);
    expect(run.build.items[1].rot).toBe(1);
    expect(rotateRig(run, 3)).toBe(false);
    expect(rotateRig(run, 1)).toBe(false); // the KILN
  });

  it("a tap on a placed rig turns it and selects it; an X rig only selects", () => {
    const run = furnaceRun([rig(2, "temper", 3, 3, 1), rig(3, "overdrive", 5, 3)]);
    const { h, log } = host(run);
    const ed = new Editor(h);
    ed.down(...at(3, 3));
    ed.up(...at(3, 3));
    expect(run.build.items[1].rot).toBe(2);
    expect(h.sel).toEqual({ kind: "item", uid: 2 });
    ed.down(...at(5, 3));
    ed.up(...at(5, 3));
    expect("rot" in run.build.items[2]).toBe(false);
    expect(h.sel).toEqual({ kind: "item", uid: 3 });
    expect(log).toContain("toast:AN X RIG FACES EVERY SIDE");
  });
});

describe("B1: the drag preview aims itself, R turns it by hand, and the drop honours it", () => {
  it("a TEMPER dragged from cargo beside the belt faces it; dropped, it works that tile", () => {
    const run = furnaceRun();
    run.inventory = [{ uid: 50, def: "temper" }];
    const { h } = host(run);
    const ed = new Editor(h);
    ed.down(10, 305); // the cargo slot
    ed.move(...at(3, 3)); // lifted and carried west of (4,3)
    expect(ed.carry?.rot).toBe(1); // facing +x, at the belt
    ed.up(...at(3, 3));
    expect(run.build.items.find((p) => p.uid === 50)).toEqual({ uid: 50, def: "temper", x: 3, y: 3, rot: 1 });
    expect(run.inventory).toEqual([]);
  });

  it("R while carrying turns the preview by hand; the preview stops aiming itself", () => {
    const run = furnaceRun();
    run.inventory = [{ uid: 50, def: "coil" }];
    const { h } = host(run);
    const ed = new Editor(h);
    ed.down(10, 305);
    ed.move(...at(3, 3));
    const auto = ed.carry!.rot!;
    expect(rigRotAt(run.build, { def: "coil", rot: auto }, { x: 3, y: 3 })).toBe(auto);
    expect(ed.rotateCarry()).toBe(true);
    expect(ed.carry!.rot).toBe((auto + 1) % 4);
    ed.move(...at(5, 2)); // a new cell: no auto-aim once turned by hand
    expect(ed.carry!.rot).toBe((auto + 1) % 4);
    ed.up(...at(5, 2));
    expect(run.build.items.find((p) => p.uid === 50)!.rot ?? 0).toBe((auto + 1) % 4);
  });

  it("moving a placed rig keeps its aim until the new cell aims it better", () => {
    const run = furnaceRun([rig(2, "whetstone", 3, 3, 1)]);
    const { h } = host(run);
    const ed = new Editor(h);
    ed.down(...at(3, 3));
    ed.move(...at(5, 3)); // lifted from the deck, carried east of the belt
    expect(ed.carry?.rot).toBe(3); // now facing -x, at the belt
    ed.up(...at(5, 3));
    expect(run.build.items[1]).toEqual({ uid: 2, def: "whetstone", x: 5, y: 3, rot: 3 });
  });
});

describe("B4: merges keep the survivor's rotation", () => {
  it("a gained copy merges into the placed rig, which keeps its cell and its rotation", () => {
    const run = furnaceRun([rig(2, "temper", 3, 3, 1)]);
    const g = gainModule(run, "temper");
    expect(g.where).toBe("deck");
    expect(run.build.items[1]).toEqual({ uid: 2, def: "temper", x: 3, y: 3, rot: 1, stars: 2 });
  });
  it("gainModule places a copy dropped on a cell with the preview's rotation (never 0, never for X)", () => {
    const run = furnaceRun();
    gainModule(run, "coil", { x: 5, y: 3, rot: 3 });
    gainModule(run, "overdrive", { x: 3, y: 3, rot: 2 });
    expect(run.build.items.slice(1).map((p) => [p.def, p.rot])).toEqual([["coil", 3], ["overdrive", undefined]]);
  });
});

describe("V4: the belt timeline (walkRoute)", () => {
  it("lists every tile with hits in R7 order, what each did, and the turret-end numbers of estimateRoute", () => {
    const b: Build = furnaceRun([
      rig(2, "longhaul", 3, 3), rig(3, "whetstone", 5, 3, 3), rig(4, "grease", 3, 1, 1), rig(5, "brake", 5, 1, 3),
    ]).build;
    const w = walkRoute(b, 0);
    expect(w.estimate).toEqual(estimateRoute(b, 0));
    expect(w.timeline.map((r) => r.tile)).toEqual([2, 4]);
    const [t2, t4] = w.timeline;
    expect(t2.hits.map((x) => [x.def, x.flat, x.prior])).toEqual([["whetstone", 2, undefined], ["longhaul", effectAt("longhaul", 1).gate!.perPriorGate! * 1, 1]]);
    expect(t4.hits.map((x) => [x.def, x.speed, x.won])).toEqual([["grease", 1.6, false], ["brake", 0.5, true]]);
    expect([t2.speed, t4.speed, w.speedEnd, w.locked]).toEqual([1, 0.5, 0.5, false]);
    expect(J(walkRoute(b, 0))).toEqual(J(w)); // deterministic
  });
});

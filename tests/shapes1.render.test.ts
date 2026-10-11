// SHAPES-1 (REQ-BFG-086 S8, step 6: the drawing): the three shaped rigs' icons (one picture each, none shared), a shaped
// rig drawn as ONE body over its turned footprint's screen box with a nozzle per arrow (deck.ts rigArrowCells through
// cruiser.ts RigModel.arrows), GANTRY PRESS's 2x3 and ASSEMBLY LINE's I3 bodies, the ghost chute's side beside any
// footprint cell, and every other place a deck piece is placed or found by its box (levelMark.ts, foeView.ts,
// battleScout.ts, arenaReact.ts) with SHAPES on; with SHAPES off the same helpers give 0.9.9's numbers for a 1-cell rig
// and a 2x2 factory. Drawn into tests/raster.helpers.ts's software raster.
import { describe, expect, it } from "vitest";
import { G, R, fresh, installRaster, region, sig } from "./raster.helpers";
import { CELL, ITEMS, type ItemDef } from "../src/sim/content";
import { adjacentToFactory, cellsOf, key as K, type Build, type Placed } from "../src/sim/deck";
import { isShaped } from "../src/sim/foot";
import { SHAPES, SHAPES_IDS, withShapes } from "../src/sim/shapes";
import { boxRect, footX, footY, frame, sx, sy, type DeckFrame, type Facing } from "../src/render/frame";
import { C } from "../src/render/palette";
import { gateSprite, itemIcon } from "../src/render/sprites";
import { pieceRect, screenMask, shapedFactorySprite, shapedRigBody } from "../src/render/shapeArt";
import { drawMachinery, shapedSide } from "../src/render/machinery";
import { cruiserModel, type CruiserView } from "../src/render/cruiser";
import { MARK_H, levelMarks } from "../src/render/levelMark";
import { foePartsOnScreen } from "../src/screens/build/foeView";
import { partsOnScreen } from "../src/screens/battleScout";
import { pieceMid } from "../src/game/arenaReact";

installRaster();

const THREE = ["nailstrip", "embertrough", "spikerail"];
const FACINGS: Facing[] = [0, 1, 2, 3];
const row = (y: number, x0: number, x1: number): number[] => Array.from({ length: x1 - x0 + 1 }, (_, i) => K(x0 + i, y));
const col = (x: number, y0: number, y1: number): number[] => Array.from({ length: y1 - y0 + 1 }, (_, i) => K(x, y0 + i));
/** A deck of `items` (a KILN at (8, 8), uid 1, feeds every route) and `routes`. */
function deck(items: Placed[], routes: number[][] = []): Build {
  return { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 8, y: 8 }, ...items], routes: routes.map((cells) => ({ factory: 1, cells })), mods: [], beltCap: 99, hullBonus: 0 };
}
/** A piece's body sprite as drawRigs / drawFactories pick it, on frame `f`. */
function bodyOf(f: DeckFrame, p: Placed): HTMLCanvasElement {
  const r = pieceRect(f, p), id = ITEMS[p.def].id;
  return ITEMS[p.def].kind === "factory" ? shapedFactorySprite(id, 0, false, 1, r.w, r.h) : shapedRigBody(id, r.w, r.h, 0, false, screenMask(f, p, r));
}
const dims = (c: HTMLCanvasElement): [number, number] => [c.width, c.height];
/** Just enough of an Arena for partsOnScreen and pieceMid: side 0's build. */
const arenaOf = (b: Build) => ({ b: { sides: [{ build: b }, { build: b }] } }) as unknown as Parameters<typeof partsOnScreen>[0];
/** A motion that hands deck-local points back unchanged. */
const LOCAL = { localToScreen: (_a: unknown, _s: number, lx: number, ly: number) => [lx, ly] } as unknown as Parameters<typeof partsOnScreen>[1];
const layoutOf = (f: DeckFrame) => ({ frame: f }) as unknown as Parameters<typeof foePartsOnScreen>[0];
const foeOf = (b: Build) => ({ build: b }) as unknown as Parameters<typeof foePartsOnScreen>[1];

describe("SHAPES-1 S8: the three shaped rigs' icons", () => {
  it("each is its own 12x12 picture: none matches another, nor any other item's icon (WHETSTONE, TEMPER, BARBED, RIVETER among them)", () => {
    withShapes(() => {
      const pics = THREE.map((id) => R(itemIcon(id)));
      for (const [i, c] of pics.entries()) {
        expect(dims(itemIcon(THREE[i]))).toEqual([12, 12]);
        expect(c.px.filter((p) => p !== null).length, THREE[i]).toBeGreaterThan(40);
      }
      const sigs = pics.map(sig);
      expect(new Set(sigs).size).toBe(3);
      const others = Object.keys(ITEMS).filter((id) => !THREE.includes(id));
      for (const must of ["whetstone", "temper", "barbed", "riveter"]) expect(others).toContain(must);
      for (const id of others) {
        const s = sig(R(itemIcon(id)));
        for (const [i, mine] of sigs.entries()) expect(s === mine, `${THREE[i]} draws as ${id}`).toBe(false);
      }
    });
  });
});

describe("SHAPES-1 S8: a shaped rig is one body over its turned box", () => {
  it("NAIL STRIP and EMBER TROUGH (I2): 24x12 at rot 0 and 12x24 at rot 1 on a facing-0 frame; SPIKE RAIL (I3) 12x36 at rot 0; facing 1 swaps them", () => {
    withShapes(() => {
      const F0 = frame(0, 0, 0), F1 = frame(1, 0, 0);
      for (const def of ["nailstrip", "embertrough"]) {
        expect(dims(bodyOf(F0, { uid: 5, def, x: 2, y: 4 }))).toEqual([24, 12]);
        expect(dims(bodyOf(F0, { uid: 5, def, x: 2, y: 4, rot: 1 }))).toEqual([12, 24]);
        expect(dims(bodyOf(F0, { uid: 5, def, x: 2, y: 4, rot: 2 }))).toEqual([24, 12]);
        expect(dims(bodyOf(F1, { uid: 5, def, x: 2, y: 4 }))).toEqual([12, 24]);
      }
      expect(dims(bodyOf(F0, { uid: 7, def: "spikerail", x: 4, y: 3 }))).toEqual([12, 36]);
      expect(dims(bodyOf(F0, { uid: 7, def: "spikerail", x: 4, y: 3, rot: 1 }))).toEqual([36, 12]);
      expect(dims(bodyOf(F1, { uid: 7, def: "spikerail", x: 4, y: 3 }))).toEqual([36, 12]);
      // the box sits where boxRect puts the footprint's bounding box, on every facing
      for (const fc of FACINGS) {
        const f = frame(fc, 10, 20), p: Placed = { uid: 7, def: "spikerail", x: 4, y: 3 };
        expect(pieceRect(f, p)).toEqual(boxRect(f, 4, 3, 1, 3));
        expect(screenMask(f, p, pieceRect(f, p))).toBe(""); // an I foot fills its box
      }
      // the three bodies differ from one another
      expect(new Set(THREE.map((id) => sig(R(shapedRigBody(id, 24, 12, 0, false))))).size).toBe(3);
    });
  });

  it("drawMachinery draws NAIL STRIP as its body with a nozzle on each cell's arrow and a tip on each belt tile it hits", () => {
    withShapes(() => {
      // SPIKE RAIL at rot 0: cells (6,1)-(6,3), between two belts one cell apart
      const b = deck([{ uid: 5, def: "nailstrip", x: 2, y: 4 }, { uid: 7, def: "spikerail", x: 6, y: 1 }], [row(3, 1, 4), col(5, 1, 3), col(7, 1, 3)]);
      const model = cruiserModel(b);
      const nail = model.rigs.get(5)!, rail = model.rigs.get(7)!;
      expect(nail.arrows!.map((a) => [a.from, a.dir, a.to, a.hit])).toEqual([[K(2, 4), 0, K(2, 3), true], [K(3, 4), 0, K(3, 3), true]]);
      expect(rail.arrows!.length).toBe(6);
      expect(rail.arrows!.every((a) => a.hit)).toBe(true);
      const F = frame(0, 10, 10);
      const c = fresh(150, 150);
      c.opaqueOnly = true;
      drawMachinery(G(c), { side: 0, build: b, model, frame: F, t: 0, tread: 0 } as CruiserView);
      const x = 10 + 2 * CELL, y = 10 + 4 * CELL;
      const body = R(shapedRigBody("nailstrip", 24, 12, 0, false));
      // under the nozzles (rows 0-2 of each cell), the drawn pixels are the one body's
      expect(region(c, x, y + 3, 24, 9)).toBe(region(body, 0, 3, 24, 9));
      // never the 12x12 sprite per cell
      expect(region(c, x + 12, y + 3, 12, 9)).not.toBe(region(R(gateSprite("nailstrip", 0, false)), 0, 3, 12, 9));
      // a live nozzle's highlight on each cell's forward edge, and the arrowhead on the belt tile ahead of each
      for (const cx of [2, 3]) {
        expect(c.at(10 + cx * CELL + 5, y), `nozzle ${cx}`).toBe(C.fire4);
        expect(c.at(10 + cx * CELL + 5, 10 + 3 * CELL + 10), `tip ${cx}`).toBe(C.fire4);
      }
    });
  });

  it("with SHAPES off no rig model has per-cell arrows and no deck piece (rig or factory) is shaped", () => {
    expect(SHAPES).toBe(false);
    for (const id of SHAPES_IDS) expect(ITEMS[id]).toBeUndefined();
    for (const d of Object.values(ITEMS)) if (d.kind === "gate" || d.kind === "factory") expect(isShaped(d), d.id).toBe(false);
    const b = deck([{ uid: 6, def: "whetstone", x: 2, y: 4 }], [row(3, 1, 4)]);
    const rm = cruiserModel(b).rigs.get(6)!;
    expect(rm.arrows).toBeUndefined();
    expect(Object.keys(rm).sort()).toEqual(["dirs", "hit"]);
  });
});

describe("SHAPES-1 S8: GANTRY PRESS (2x3) and ASSEMBLY LINE (I3) bodies", () => {
  it("GANTRY PRESS is 36x24 at rot 0 and 24x36 at rot 1; ASSEMBLY LINE 36x12 and 12x36; facing 1 swaps them", () => {
    withShapes(() => {
      const F0 = frame(0, 0, 0), F1 = frame(1, 0, 0);
      expect(dims(bodyOf(F0, { uid: 3, def: "gantry", x: 3, y: 3 }))).toEqual([36, 24]);
      expect(dims(bodyOf(F0, { uid: 3, def: "gantry", x: 3, y: 3, rot: 1 }))).toEqual([24, 36]);
      expect(dims(bodyOf(F1, { uid: 3, def: "gantry", x: 3, y: 3 }))).toEqual([24, 36]);
      expect(dims(bodyOf(F0, { uid: 3, def: "assembly", x: 3, y: 3 }))).toEqual([36, 12]);
      expect(dims(bodyOf(F0, { uid: 3, def: "assembly", x: 3, y: 3, rot: 1 }))).toEqual([12, 36]);
      expect(dims(bodyOf(F1, { uid: 3, def: "assembly", x: 3, y: 3 }))).toEqual([12, 36]);
      // GANTRY's head moves with the frame (factoryFrame's chute index), and its 2-3 star bed has one more chute
      expect(sig(R(shapedFactorySprite("gantry", 0, false, 1, 36, 24)))).not.toBe(sig(R(shapedFactorySprite("gantry", 2, false, 1, 36, 24))));
      expect(sig(R(shapedFactorySprite("gantry", 0, false, 1, 36, 24)))).not.toBe(sig(R(shapedFactorySprite("gantry", 0, false, 2, 36, 24))));
      expect(sig(R(shapedFactorySprite("assembly", 0, false, 1, 36, 12)))).not.toBe(sig(R(shapedFactorySprite("assembly", 3, false, 1, 36, 12))));
    });
  });

  it("drawMachinery draws a 2x3 GANTRY PRESS turned as one body in its box, a ★3 brass frame round the whole box", () => {
    withShapes(() => {
      const b: Build = { hero: "furnace", items: [{ uid: 3, def: "gantry", x: 3, y: 3, rot: 1, stars: 3 }], routes: [], mods: [], beltCap: 99, hullBonus: 0 };
      const F = frame(0, 10, 10);
      const c = fresh(150, 150);
      drawMachinery(G(c), { side: 0, build: b, model: cruiserModel(b), frame: F, t: 0, tread: 0 } as CruiserView);
      const r = pieceRect(F, b.items[0]);
      expect(r).toEqual({ x: 46, y: 46, w: 24, h: 36 });
      // the ★3 frame's corners sit on the box's corners; the body fills it (nothing of it outside)
      for (const [px, py] of [[r.x, r.y], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]]) expect(c.at(px, py)).toBe(C.brass3);
      expect(c.at(r.x - 1, r.y + 10)).toBeNull();
      expect(c.at(r.x + r.w, r.y + 10)).toBeNull();
      expect(c.at(r.x + 5, r.y + r.h)).toBeNull();
    });
  });

  it("the ghost belt's chute side: beside any footprint cell, as deck.ts adjacentToFactory reads it", () => {
    withShapes(() => {
      for (const rot of [0, 1]) {
        const p: Placed = { uid: 3, def: "gantry", x: 3, y: 3, ...(rot ? { rot } : {}) };
        const b: Build = { hero: "furnace", items: [p], routes: [], mods: [], beltCap: 99, hullBonus: 0 };
        for (let k = 0; k < 100; k++) expect(shapedSide(cellsOf(p), k), `rot ${rot} k ${k}`).toBe(adjacentToFactory(b, 3, k));
      }
      const cells = cellsOf({ uid: 3, def: "gantry", x: 3, y: 3 }); // x 3-5, y 3-4
      expect([K(4, 2), K(6, 4), K(3, 5), K(2, 3), K(4, 3), K(6, 5)].map((k) => shapedSide(cells, k))).toEqual([0, 1, 2, 3, -1, -1]);
    });
  });
});

describe("SHAPES-1 S8: every other deck site reads the turned box", () => {
  it("a 2x3 at rot 1: foeView, battleScout and arenaReact find its middle at its box's centre; levelMark sits in its box's corner", () => {
    withShapes(() => {
      const p: Placed = { uid: 3, def: "gantry", x: 3, y: 3, rot: 1 }; // 2 wide, 3 deep
      const b = deck([p]);
      const mid = [(3 + 1) * CELL, (3 + 1.5) * CELL];
      expect(pieceMid(arenaOf(b), 0, { uid: 3, x: 3, y: 3, def: ITEMS.gantry })).toEqual(mid);
      const scout = partsOnScreen(arenaOf(b), LOCAL, 0).find((q) => q.sel.kind === "item" && q.sel.uid === 3)!;
      expect([scout.x, scout.y]).toEqual(mid);
      const F = frame(0, 7, 9);
      const foe = foePartsOnScreen(layoutOf(F), foeOf(b)).find((q) => q.sel.kind === "item" && q.sel.uid === 3)!;
      expect([foe.x, foe.y]).toEqual([7 + mid[0], 9 + mid[1]]);
      // levelMark: a signature factory given a 2x3 foot for the test (none is shaped in this release)
      const items = ITEMS as Record<string, ItemDef>, kiln = items.kiln;
      try {
        items.kiln = { ...kiln, foot: "2x3" };
        const sb: Build = { ...deck([]), items: [{ uid: 1, def: "kiln", x: 3, y: 3, rot: 1 }], upgrades: { factory: 2 } };
        for (const fc of FACINGS) {
          const f = frame(fc, 10, 20), r = boxRect(f, 3, 3, 2, 3), m = levelMarks(sb, f).find((q) => q.track === "factory")!;
          expect([m.x, m.y + MARK_H], `facing ${fc}`).toEqual([Math.round(r.x) + 1, Math.round(r.y) + r.h - 1]);
        }
      } finally {
        items.kiln = kiln;
      }
    });
  });

  it("SHAPES off: WHETSTONE and a 2x2 factory give 0.9.9's box, middle and level mark on every facing", () => {
    expect(SHAPES).toBe(false);
    const w: Placed = { uid: 6, def: "whetstone", x: 2, y: 4, rot: 3 }, k: Placed = { uid: 1, def: "kiln", x: 5, y: 6 };
    const b: Build = { hero: "furnace", items: [k, w], routes: [], mods: [], beltCap: 99, hullBonus: 0, upgrades: { factory: 2 } };
    for (const fc of FACINGS) {
      const f = frame(fc, 10, 20);
      expect(pieceRect(f, w)).toEqual({ x: footX(f, 2, 4), y: footY(f, 2, 4), w: 12, h: 12 });
      expect(pieceRect(f, k)).toEqual({ x: footX(f, 5, 6, 2), y: footY(f, 5, 6, 2), w: 24, h: 24 });
      const m = levelMarks(b, f).find((q) => q.track === "factory")!;
      expect([m.x, m.y + MARK_H]).toEqual([Math.round(footX(f, 5, 6, 2)) + 1, Math.round(footY(f, 5, 6, 2)) + 2 * CELL - 1]);
      const foe = foePartsOnScreen(layoutOf(f), foeOf(b));
      const at = (uid: number) => foe.find((q) => q.sel.kind === "item" && q.sel.uid === uid)!;
      expect([at(6).x, at(6).y]).toEqual([sx(f, 2.5 * CELL, 4.5 * CELL), sy(f, 2.5 * CELL, 4.5 * CELL)]);
      expect([at(1).x, at(1).y]).toEqual([sx(f, 6 * CELL, 7 * CELL), sy(f, 6 * CELL, 7 * CELL)]);
    }
    expect(pieceMid(arenaOf(b), 0, { uid: 6, x: 2, y: 4, def: ITEMS.whetstone })).toEqual([2.5 * CELL, 4.5 * CELL]);
    expect(pieceMid(arenaOf(b), 0, { uid: 1, x: 5, y: 6, def: ITEMS.kiln })).toEqual([6 * CELL, 7 * CELL]);
    const scout = partsOnScreen(arenaOf(b), LOCAL, 0);
    const at = (uid: number) => scout.find((q) => q.sel.kind === "item" && q.sel.uid === uid)!;
    expect([at(6).x, at(6).y]).toEqual([2.5 * CELL, 4.5 * CELL]);
    expect([at(1).x, at(1).y]).toEqual([6 * CELL, 7 * CELL]);
    const F = frame(0, 7, 9), foe = foePartsOnScreen(layoutOf(F), foeOf(b));
    const fat = (uid: number) => foe.find((q) => q.sel.kind === "item" && q.sel.uid === uid)!;
    expect([fat(6).x, fat(6).y]).toEqual([7 + 2.5 * CELL, 9 + 4.5 * CELL]);
    expect([fat(1).x, fat(1).y]).toEqual([7 + 6 * CELL, 9 + 7 * CELL]);
    // with SHAPES off GANTRY PRESS and ASSEMBLY LINE are 2x2 again
    for (const def of ["gantry", "assembly"]) expect(pieceRect(frame(0, 0, 0), { uid: 2, def, x: 1, y: 1 })).toEqual({ x: 12, y: 12, w: 24, h: 24 });
  });
});

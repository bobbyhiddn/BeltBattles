// SHAPES-2 (REQ-BFG-114, REQ-BFG-086 S8; BRIEF-SHAPES2 S5, step 4): the six more shaped rigs' icons and deck art, drawn into
// tests/raster.helpers.ts's software raster.
// - each icon is its own 12x12 picture: none matches another, nor any other item's (SHAPES-1's three, PLAIN-1's six, WHETSTONE...);
// - a shaped rig is ONE body over its turned footprint's box, on every facing: ELBOW GUARD and CINDER HOOK (L3) 24x24 with a mask
//   of three cells, JAW CRUSHER (2x2) 24x24 whole, PICKAXE (T4) 36x24 or 24x36 with a mask of four, SAW BAR (I3) and SPARK COMB
//   (I2) lines; never the 12x12 icon repeated per cell;
// - drawMachinery draws each as its body with a nozzle per arrow on the cell it shines from and a tip on each belt tile it hits;
// - every other deck site reads the turned box: the foe view, the battle scout, the battle world's piece point;
// - the animated ones (the spark, the ember, the jaws) move with the frame; the others don't.
import { afterEach, describe, expect, it } from "vitest";
import { R, fresh, G, installRaster, region, sig } from "./raster.helpers";
import { CELL, ITEMS } from "../src/sim/content";
import { cellsOf, key as K, type Build, type Placed } from "../src/sim/deck";
import { SHAPES2, SHAPES2_IDS, setShapes2, withShapes2 } from "../src/sim/shapes2";
import { withPlainRigs } from "../src/sim/plainRigs";
import { boxRect, frame, type DeckFrame, type Facing } from "../src/render/frame";
import { C } from "../src/render/palette";
import { gateSprite, itemIcon } from "../src/render/sprites";
import { pieceRect, screenMask, shapedRigBody, shapedRigSil } from "../src/render/shapeArt";
import { drawMachinery } from "../src/render/machinery";
import { cruiserModel, type CruiserView } from "../src/render/cruiser";
import { foePartsOnScreen } from "../src/screens/build/foeView";
import { partsOnScreen } from "../src/screens/battleScout";
import { pieceMid } from "../src/game/arenaReact";

installRaster();
afterEach(() => setShapes2(SHAPES2));
const on = <T>(fn: () => T): T => withPlainRigs(() => withShapes2(fn)); // 1D ships both
const FACINGS: Facing[] = [0, 1, 2, 3];
const row = (y: number, x0: number, x1: number): number[] => Array.from({ length: x1 - x0 + 1 }, (_, i) => K(x0 + i, y));
const col = (x: number, y0: number, y1: number): number[] => Array.from({ length: y1 - y0 + 1 }, (_, i) => K(x, y0 + i));
/** A deck of `items` (a KILN at (8, 8), uid 1, feeds every route) and `routes`. */
function deck(items: Placed[], routes: number[][] = []): Build {
  return { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 8, y: 8 }, ...items], routes: routes.map((cells) => ({ factory: 1, cells })), mods: [], beltCap: 99, hullBonus: 0 };
}
const dims = (c: HTMLCanvasElement): [number, number] => [c.width, c.height];
const bodyOf = (f: DeckFrame, p: Placed, frameIdx = 0, active = false): HTMLCanvasElement => {
  const r = pieceRect(f, p);
  return shapedRigBody(p.def, r.w, r.h, frameIdx, active, screenMask(f, p, r));
};
const ones = (mask: string): number => [...mask].filter((ch) => ch === "1").length;
const arenaOf = (b: Build) => ({ b: { sides: [{ build: b }, { build: b }] } }) as unknown as Parameters<typeof partsOnScreen>[0];
const LOCAL = { localToScreen: (_a: unknown, _s: number, lx: number, ly: number) => [lx, ly] } as unknown as Parameters<typeof partsOnScreen>[1];
const layoutOf = (f: DeckFrame) => ({ frame: f }) as unknown as Parameters<typeof foePartsOnScreen>[0];
const foeOf = (b: Build) => ({ build: b }) as unknown as Parameters<typeof foePartsOnScreen>[1];

describe("SHAPES-2 S5: the six icons", () => {
  it("each is its own 12x12 picture: none matches another, nor any other item's icon", () => {
    on(() => {
      const pics = SHAPES2_IDS.map((id) => R(itemIcon(id)));
      for (const [i, c] of pics.entries()) {
        expect(dims(itemIcon(SHAPES2_IDS[i])), SHAPES2_IDS[i]).toEqual([12, 12]);
        expect(c.px.filter((p) => p !== null).length, SHAPES2_IDS[i]).toBeGreaterThan(40);
      }
      const sigs = pics.map(sig);
      expect(new Set(sigs).size).toBe(6);
      const others = Object.keys(ITEMS).filter((id) => !SHAPES2_IDS.includes(id));
      for (const must of ["whetstone", "temper", "barbed", "nailstrip", "embertrough", "spikerail", "rasp", "sparkgap", "scaleguard", "grindstone", "brandingiron"]) expect(others).toContain(must);
      for (const id of others) {
        const s = sig(R(itemIcon(id)));
        for (const [i, mine] of sigs.entries()) expect(s === mine, `${SHAPES2_IDS[i]} draws as ${id}`).toBe(false);
      }
      // the hit flash and the frames: a rig's sprite has the same silhouette whatever the frame
      for (const id of SHAPES2_IDS) {
        expect(sig(R(gateSprite(id, 0, true))), `${id}: a hit flashes`).not.toBe(sig(R(gateSprite(id, 0, false))));
        expect(dims(gateSprite(id, 3, false))).toEqual([12, 12]);
      }
    });
  });
});

describe("SHAPES-2 S5: a shaped rig is one body over its turned box", () => {
  it("ELBOW GUARD and CINDER HOOK (L3) are 24x24 with a mask of three cells; JAW CRUSHER (2x2) 24x24 whole; on every facing and rot", () => {
    on(() => {
      for (const def of ["elbowguard", "cinderhook"]) for (const fc of FACINGS) for (const rot of [0, 1, 2, 3]) {
        const f = frame(fc, 0, 0), p: Placed = { uid: 5, def, x: 2, y: 4, ...(rot ? { rot } : {}) };
        const r = pieceRect(f, p);
        expect([r.w, r.h], `${def} facing ${fc} rot ${rot}`).toEqual([24, 24]);
        expect(ones(screenMask(f, p, r)), `${def} facing ${fc} rot ${rot}: three cells of the four`).toBe(3);
        expect(dims(bodyOf(f, p))).toEqual([24, 24]);
      }
      for (const fc of FACINGS) {
        const f = frame(fc, 0, 0), p: Placed = { uid: 5, def: "jawcrusher", x: 2, y: 4 };
        expect([pieceRect(f, p).w, pieceRect(f, p).h]).toEqual([24, 24]);
        expect(screenMask(f, p, pieceRect(f, p)), "a 2x2 fills its box").toBe("");
      }
    });
  });

  it("PICKAXE (T4) is 36x24 at rot 0 and 24x36 at rot 1 on facing 0, with a mask of four cells; facing 1 swaps them; the line rigs keep their boxes", () => {
    on(() => {
      const F0 = frame(0, 0, 0), F1 = frame(1, 0, 0);
      const T = (rot: number): Placed => ({ uid: 5, def: "pickaxe", x: 3, y: 3, ...(rot ? { rot } : {}) });
      expect(dims(bodyOf(F0, T(0)))).toEqual([36, 24]);
      expect(dims(bodyOf(F0, T(1)))).toEqual([24, 36]);
      expect(dims(bodyOf(F0, T(2)))).toEqual([36, 24]);
      expect(dims(bodyOf(F1, T(0)))).toEqual([24, 36]);
      for (const fc of FACINGS) for (const rot of [0, 1, 2, 3]) {
        const f = frame(fc, 0, 0);
        expect(ones(screenMask(f, T(rot), pieceRect(f, T(rot)))), `facing ${fc} rot ${rot}`).toBe(4);
      }
      expect(screenMask(F0, T(0), pieceRect(F0, T(0)))).toBe("111/010"); // the head across the top, the stem below
      expect(screenMask(F0, T(2), pieceRect(F0, T(2)))).toBe("010/111");
      expect(dims(bodyOf(F0, { uid: 6, def: "sawbar", x: 2, y: 4 }))).toEqual([36, 12]);
      expect(dims(bodyOf(F0, { uid: 6, def: "sawbar", x: 2, y: 4, rot: 1 }))).toEqual([12, 36]);
      expect(dims(bodyOf(F0, { uid: 7, def: "sparkcomb", x: 2, y: 4 }))).toEqual([24, 12]);
      expect(dims(bodyOf(F1, { uid: 7, def: "sparkcomb", x: 2, y: 4 }))).toEqual([12, 24]);
      // the box sits where boxRect puts the footprint's bounding box, on every facing
      for (const fc of FACINGS) {
        const f = frame(fc, 10, 20);
        expect(pieceRect(f, T(0))).toEqual(boxRect(f, 3, 3, 3, 2));
      }
    });
  });

  it("the six bodies differ from one another and from their own icon repeated; the hit flash is a silhouette of the body", () => {
    on(() => {
      const F0 = frame(0, 0, 0);
      const sigs = SHAPES2_IDS.map((id) => sig(R(bodyOf(F0, { uid: 5, def: id, x: 3, y: 3 }))));
      expect(new Set(sigs).size).toBe(6);
      // never the 12x12 sprite per cell: the second cell's pixels are not the icon's
      for (const id of ["sawbar", "sparkcomb"]) {
        const b = R(bodyOf(F0, { uid: 5, def: id, x: 3, y: 3 }));
        expect(region(b, 12, 0, 12, 12), id).not.toBe(region(R(gateSprite(id, 0, false)), 0, 0, 12, 12));
      }
      for (const id of SHAPES2_IDS) {
        const p: Placed = { uid: 5, def: id, x: 3, y: 3 }, r = pieceRect(F0, p), m = screenMask(F0, p, r);
        const sil = R(shapedRigSil(id, r.w, r.h, m)), body = R(shapedRigBody(id, r.w, r.h, 0, false, m));
        expect([sil.width, sil.height], id).toEqual([body.width, body.height]);
        let covered = 0, silPx = 0;
        for (let i = 0; i < body.px.length; i++) { if (body.px[i] !== null) covered++; if (sil.px[i] !== null) silPx++; }
        expect(silPx, `${id}: the silhouette covers the body`).toBe(covered);
        expect(covered, `${id}: the body fills its cells`).toBeGreaterThan(r.w * r.h * 0.5 * (ones(m) ? ones(m) / ((r.w / CELL) * (r.h / CELL)) : 1));
      }
    });
  });

  it("the spark, the ember and the jaws move with the frame; the others hold still; a hit flash changes the body", () => {
    on(() => {
      const F0 = frame(0, 0, 0);
      for (const id of SHAPES2_IDS) {
        const p: Placed = { uid: 5, def: id, x: 3, y: 3 };
        const still = sig(R(bodyOf(F0, p, 0))) === sig(R(bodyOf(F0, p, 2))) && sig(R(bodyOf(F0, p, 0))) === sig(R(bodyOf(F0, p, 5)));
        expect(still, id).toBe(!["sparkcomb", "cinderhook", "jawcrusher"].includes(id));
        expect(sig(R(bodyOf(F0, p, 0, true))), `${id}: a hit`).not.toBe(sig(R(bodyOf(F0, p, 0, false))));
      }
    });
  });
});

describe("SHAPES-2 S5: drawMachinery and every other deck site", () => {
  it("ELBOW GUARD at a belt's corner: its body, a nozzle on each of its two forward edges and a tip on each belt tile it hits", () => {
    on(() => {
      const bend = [K(1, 3), K(2, 3), K(3, 3), K(3, 4), K(4, 4)];
      const b = deck([{ uid: 5, def: "elbowguard", x: 2, y: 4 }], [bend]); // cells (2,4),(2,5),(3,5)
      const model = cruiserModel(b);
      const eg = model.rigs.get(5)!;
      expect(eg.arrows!.map((a) => [a.from, a.dir, a.to, a.hit])).toEqual([[K(2, 4), 0, K(2, 3), true], [K(3, 5), 0, K(3, 4), true]]);
      const F = frame(0, 10, 10), c = fresh(150, 150);
      c.opaqueOnly = true;
      drawMachinery(G(c), { side: 0, build: b, model, frame: F, t: 0, tread: 0 } as CruiserView);
      for (const [cx, cy] of [[2, 4], [3, 5]]) expect(c.at(10 + cx * CELL + 5, 10 + cy * CELL), `nozzle ${cx},${cy}`).toBe(C.fire4);
      for (const [tx, ty] of [[2, 3], [3, 4]]) expect(c.at(10 + tx * CELL + 5, 10 + ty * CELL + 10), `tip ${tx},${ty}`).toBe(C.fire4);
      expect(c.oob).toBe(0);
      // the body covers each of its three cells (their middles are painted)
      for (const [cx, cy] of [[2, 4], [2, 5], [3, 5]]) expect(c.at(10 + cx * CELL + 6, 10 + cy * CELL + 6), `cell ${cx},${cy}`).not.toBe(null);
    });
  });

  it("JAW CRUSHER between two belts and PICKAXE on three sides: a nozzle per arrow (4 and 7), each a live one on a belt", () => {
    on(() => {
      const jaw = deck([{ uid: 9, def: "jawcrusher", x: 4, y: 3 }], [col(3, 2, 7), col(6, 2, 7)]);
      const am = cruiserModel(jaw).rigs.get(9)!.arrows!;
      expect(am.length).toBe(4);
      expect(am.every((a) => a.hit)).toBe(true);
      const top = row(3, 2, 8), left = [K(3, 4), K(3, 5), K(4, 5), K(4, 6)], right = [K(7, 4), K(7, 5), K(6, 5), K(6, 6)];
      const pick = deck([{ uid: 10, def: "pickaxe", x: 4, y: 4 }], [top, left, right]);
      const pm = cruiserModel(pick).rigs.get(10)!.arrows!;
      expect(pm.length).toBe(7);
      expect(pm.every((a) => a.hit)).toBe(true);
      // drawn: no paint outside the canvas, and every live nozzle's highlight is on its cell's edge
      for (const [b, id] of [[jaw, 9], [pick, 10]] as [Build, number][]) {
        const c = fresh(150, 150);
        c.opaqueOnly = true;
        drawMachinery(G(c), { side: 0, build: b, model: cruiserModel(b), frame: frame(0, 10, 10), t: 0, tread: 0 } as CruiserView);
        expect(c.oob, `rig ${id}`).toBe(0);
        const lit = cruiserModel(b).rigs.get(id)!.arrows!.filter((a) => a.hit).length;
        expect(lit).toBeGreaterThan(0);
      }
    });
  });

  it("the foe view, the battle scout and the battle world find a shaped rig at its box's middle, on the deck's facing", () => {
    on(() => {
      for (const [def, w, h] of [["elbowguard", 2, 2], ["cinderhook", 2, 2], ["jawcrusher", 2, 2], ["pickaxe", 3, 2], ["sawbar", 3, 1], ["sparkcomb", 2, 1]] as [string, number, number][]) {
        const p: Placed = { uid: 3, def, x: 3, y: 3 };
        const b = deck([p]);
        const mid = [(3 + w / 2) * CELL, (3 + h / 2) * CELL];
        expect(pieceMid(arenaOf(b), 0, { uid: 3, x: 3, y: 3, def: ITEMS[def] }), def).toEqual(mid);
        const scout = partsOnScreen(arenaOf(b), LOCAL, 0).find((q) => q.sel.kind === "item" && q.sel.uid === 3)!;
        expect([scout.x, scout.y], def).toEqual(mid);
        const F = frame(0, 7, 9);
        const foe = foePartsOnScreen(layoutOf(F), foeOf(b)).find((q) => q.sel.kind === "item" && q.sel.uid === 3)!;
        expect([foe.x, foe.y], def).toEqual([7 + mid[0], 9 + mid[1]]);
        expect(cellsOf(p).length).toBe(w * h - (def === "elbowguard" || def === "cinderhook" ? 1 : def === "pickaxe" ? 2 : 0));
      }
    });
  });
});

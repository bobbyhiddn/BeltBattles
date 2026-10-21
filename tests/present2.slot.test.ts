// PRESENT-2 C2 (REQ-BFG-113 (1); backlog #492 (6); the read K-02): the cargo slot's grid over its icon.
// At the base the slot drew the SOLID grid (shapePic.ts shapeGrid at the slot's cell) over the piece's icon: a plain 2x2's tiles hid most of it, so KILN and SCRAP
// CANNON read alike (PRESENT-1 Question 4 (a)). Now the slot draws a LATTICE (slotGrid: the outline and seams of every cell, in SLOT_LATTICE; each tile clear), so
// the icon reads through and the footprint still reads. The box, the anchor (slot x + 1, y + 1), the cell (iconCell) and the arrowheads are the solid grid's.
// - slotGrid: the same box as the solid grid, every tile clear, every cell block's four edges a lattice line (or an arrowhead's base), the arrowheads the solid
//   grid's px for px, for every piece that has a grid (the eleven shaped ones and the plain 2x2s);
// - in the slot: each tile's px is what the slot draws under the grid (the icon where it is opaque, else the face): the icon reads through everywhere the lattice
//   has no line; the share of the icon's opaque px under the grid falls for every piece (solid -> lattice, counted and logged);
// - the call site: ui.ts draws slotGrid, not shapeGrid, in itemSlot.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { G, R, fresh, installRaster } from "./raster.helpers";
import { ITEMS } from "../src/sim/content";
import { C, RARITY_COLOR } from "../src/render/palette";
import { itemIcon } from "../src/render/sprites";
import { HEAD_LEN, SLOT_LATTICE, drawGrid, drawLattice, gridGeom, gridSpecOf, hasGrid, iconCell, shapeGrid, slotGrid, type GridSpec } from "../src/ui/shapePic";
import { itemSlot } from "../src/ui/ui";
import { shapedPiece } from "../src/screens/build/shapeEdit";

installRaster();
const pieces = Object.keys(ITEMS).filter((id) => hasGrid(id));
const plain = pieces.filter((id) => !shapedPiece(id));

describe("PRESENT-2 C2: slotGrid, the cargo slot's grid as a lattice", () => {
  it("every piece with a grid: the solid grid's box, every tile clear, every cell's block edge a lattice line (or an arrowhead's base), the arrowheads the solid grid's px for px", () => {
    expect(pieces.length).toBeGreaterThanOrEqual(11 + 28); // the eleven shaped pieces and the plain 2x2 factories and size-2 turrets
    for (const id of pieces) {
      const cl = iconCell(id), spec = gridSpecOf(id), geom = gridGeom(spec, cl, HEAD_LEN), t = cl - 1;
      const lat = R(slotGrid(id)), solid = R(shapeGrid(id, cl));
      expect([lat.width, lat.height], `${id}: the solid grid's box`).toEqual([solid.width, solid.height]);
      expect([lat.width, lat.height], `${id}: gridGeom's box`).toEqual([geom.w, geom.h]);
      for (const tl of geom.tiles) {
        for (let j = 0; j < t; j++) for (let i = 0; i < t; i++) expect(lat.at(tl.x + i, tl.y + j), `${id}: the tile (${tl.x}, ${tl.y}) is clear at (${i}, ${j})`).toBeNull();
        // the block's four edges (cell + 1 px square from the tile's top-left less 1 px): a lattice line, or lime where an arrowhead's base lies on it
        for (let k = 0; k <= cl; k++) {
          for (const [x, y] of [[tl.x - 1 + k, tl.y - 1], [tl.x - 1 + k, tl.y + t], [tl.x - 1, tl.y - 1 + k], [tl.x + t, tl.y - 1 + k]]) {
            const p = lat.at(x, y);
            expect(p === SLOT_LATTICE || p === C.lime, `${id}: the block edge px (${x}, ${y}) is ${String(p)}`).toBe(true);
          }
        }
      }
      let limeN = 0;
      for (let y = 0; y < solid.height; y++) for (let x = 0; x < solid.width; x++) {
        const l = lat.at(x, y) === C.lime, s = solid.at(x, y) === C.lime;
        expect(l, `${id}: the arrowhead px (${x}, ${y}) match the solid grid's`).toBe(s);
        if (l) limeN++;
        if (lat.at(x, y) !== null && lat.at(x, y) !== C.lime) expect(lat.at(x, y), `${id}: a lattice px (${x}, ${y})`).toBe(SLOT_LATTICE);
      }
      expect(limeN, `${id}: ${spec.arrows.length} arrowheads`).toBeGreaterThanOrEqual(spec.arrows.length * 7);
    }
  });

  it("a plain 2x2 at the slot's 5 px a cell: 11 x 11, a lattice of 4 panes: the outline and the cross, 57 px, none under a tile", () => {
    for (const id of plain) {
      const lat = R(slotGrid(id));
      expect([lat.width, lat.height], id).toEqual([11, 11]);
      let n = 0;
      for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (lat.at(x, y) !== null) n++;
      // the outline: 4 sides of 11 px less the shared corners (40), and the cross inside it: two lines of 9 px sharing the centre px (17): 40 + 17 = 57
      expect(n, `${id}: the lattice's px`).toBe(57);
      for (const [x, y] of [[0, 0], [10, 0], [0, 10], [10, 10], [5, 5], [5, 0], [0, 5], [10, 5], [5, 10]]) expect(lat.at(x, y), `${id}: the line px (${x}, ${y})`).toBe(SLOT_LATTICE);
      for (const [x, y] of [[1, 1], [4, 4], [6, 6], [9, 9], [1, 9], [9, 1]]) expect(lat.at(x, y), `${id}: the pane px (${x}, ${y}) is clear`).toBeNull();
    }
  });

  it("drawLattice is drawGrid without the tiles: the same box and the same arrowheads, on a synthetic footprint with an arrow on every side", () => {
    const spec: GridSpec = {
      cells: [[1, 0], [0, 1], [1, 1], [2, 1]], rig: true,
      arrows: [{ cell: [1, 0], dir: 0 }, { cell: [0, 1], dir: 3 }, { cell: [2, 1], dir: 1 }, { cell: [1, 1], dir: 2 }],
    };
    for (const cell of [4, 5]) for (const head of [3, 4]) {
      const geom = gridGeom(spec, cell, head);
      const a = fresh(geom.w + 2, geom.h + 2), b = fresh(geom.w + 2, geom.h + 2);
      expect(drawGrid(G(a), spec, 1, 1, cell, head)).toEqual(drawLattice(G(b), spec, 1, 1, cell, head));
      for (let y = 0; y < geom.h + 2; y++) for (let x = 0; x < geom.w + 2; x++) {
        expect(b.at(x, y) === C.lime, `cell ${cell} head ${head}: arrowhead px (${x}, ${y})`).toBe(a.at(x, y) === C.lime);
        if (b.at(x, y) !== null && b.at(x, y) !== C.lime) expect(b.at(x, y), `a lattice px (${x}, ${y})`).toBe(SLOT_LATTICE);
      }
      for (const tl of geom.tiles) expect(b.at(1 + tl.x + 1, 1 + tl.y + 1), `cell ${cell}: a tile is clear`).toBeNull();
    }
  });
});

describe("PRESENT-2 C2: in the cargo slot the icon reads through the footprint", () => {
  const icon = (id: string) => R(itemIcon(id));
  /** the share of `id`'s icon's opaque px (the icon at slot + (3, 3)) that lie under the grid `grid` (drawn at slot + (1, 1)) */
  const hidden = (id: string, grid: HTMLCanvasElement): number => {
    const ic = icon(id), g = R(grid);
    let opaque = 0, under = 0;
    for (let j = 0; j < ic.height; j++) for (let i = 0; i < ic.width; i++) {
      if (ic.at(i, j) === null) continue;
      opaque++;
      if (g.at(i + 2, j + 2) !== null) under++;
    }
    return under / opaque;
  };

  it("every tile's px is what the slot draws under the grid: the icon's own px where it is opaque, else the face (or the rarity line, or the frame)", () => {
    for (const id of pieces) {
      const c = fresh(24, 24);
      itemSlot(G(c), 2, 2, id, false, 0, 1);
      const ic = icon(id), geom = gridGeom(gridSpecOf(id), iconCell(id), HEAD_LEN), t = iconCell(id) - 1;
      for (const tl of geom.tiles) for (let j = 0; j < t; j++) for (let i = 0; i < t; i++) {
        const col = 1 + tl.x + i, row = 1 + tl.y + j; // in the slot's own 18 x 18 box
        const ix = col - 3, iy = row - 3;
        const under = ix >= 0 && iy >= 0 && ix < ic.width && iy < ic.height ? ic.at(ix, iy) : null;
        const base = col === 0 || col === 17 || row === 0 || row === 17 ? C.ink : row === 16 ? RARITY_COLOR[ITEMS[id].rarity] : C.slate0;
        expect(c.at(2 + col, 2 + row), `${id}: the tile px (${col}, ${row}) of the slot`).toBe(under ?? base);
      }
    }
  });

  it("the share of the icon's opaque px under the grid falls for every piece (solid -> lattice), and a plain 2x2's icon is at most a third hidden", () => {
    const rows: string[] = [];
    let worstPlain = 0, worstSolidPlain = 1;
    for (const id of pieces) {
      const solid = hidden(id, shapeGrid(id, iconCell(id))), lat = hidden(id, slotGrid(id));
      expect(lat, `${id}: the lattice hides less than the solid grid (${(100 * solid).toFixed(1)}% -> ${(100 * lat).toFixed(1)}%)`).toBeLessThan(solid);
      if (!shapedPiece(id)) { worstPlain = Math.max(worstPlain, lat); worstSolidPlain = Math.min(worstSolidPlain, solid); }
      rows.push(`${id} ${(100 * solid).toFixed(0)}->${(100 * lat).toFixed(0)}`);
    }
    // KILN and SCRAP CANNON, the pair PRESENT-1's read could not tell apart
    expect(hidden("kiln", slotGrid("kiln"))).toBeLessThan(hidden("kiln", shapeGrid("kiln", iconCell("kiln"))) / 2);
    expect(hidden("scrapcannon", slotGrid("scrapcannon"))).toBeLessThan(hidden("scrapcannon", shapeGrid("scrapcannon", iconCell("scrapcannon"))) / 2);
    expect(worstPlain, "the most a lattice hides of a plain 2x2's icon").toBeLessThanOrEqual(1 / 3);
    // eslint-disable-next-line no-console
    console.log(`PRESENT-2 C2: the icon's px under the grid, % (solid -> lattice), plain 2x2s: the least solid ${(100 * worstSolidPlain).toFixed(1)}%, the most lattice ${(100 * worstPlain).toFixed(1)}%; per piece: ${rows.join("; ")}`);
  });

  it("the call site: itemSlot draws slotGrid (the lattice), not the solid grid, and only for a piece that has one", () => {
    const src = readFileSync("src/ui/ui.ts", "utf8");
    expect(src).toContain("hasGrid(def)) g.drawImage(slotGrid(def), x + 1, y + 1)");
    expect(src).not.toMatch(/shapeGrid\(/);
    const plainSlot = fresh(24, 24);
    itemSlot(G(plainSlot), 2, 2, "whetstone", false, 0, 1);
    for (let y = 3; y < 17; y++) for (let x = 3; x < 17; x++) expect(plainSlot.at(2 + x, 2 + y) === SLOT_LATTICE, "a piece without a grid draws no lattice").toBe(false);
  });
});

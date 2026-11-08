// PRESENT-4 G (REQ-BFG-113; STAGE-0915's F9): the road's drop row shows a shaped part's icon AND its footprint (src/screens/fork/drops.ts drawDropIcons; src/ui/shapePic.ts shapeMark).
//  Before: SHOPCARD-1 G4 and PRESENT-1 S1 (d) drew G1's grid at iconCell over the 14 x 14 box from its corner: 11 x 11 for a 2x2 part, so the icon showed as a grey grid (PRESENT-3 C's carriage gun:
//  THANE KARSK's day-5 row, the first box); a rig's 11 x 8 (2x1) and 15 x 11 grids hid most of theirs.
//  Now: the icon is drawn whole and the footprint is a small cells-only MARK (shapeMark: the same drawGrid, no arrowheads, 3 px a cell up to 2 cells, 2 px for 3: 7 x 7 at the most) in the box's
//  bottom-right corner. The box, the 19 px pitch, the odds' row and every plain part are as they were. A copy of the old overlay is kept here to count what each drawing hides.
import { describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf, R, type RasterCanvas } from "./raster.helpers";
import { C } from "../src/render/palette";
import { drawText } from "../src/render/font";
import { itemIcon } from "../src/render/sprites";
import { ITEMS } from "../src/sim/content";
import { gridGeom, gridSpecOf, hasGrid, iconCell, markCell, shapeGrid, shapeMark, shapeMarkSize } from "../src/ui/shapePic";
import { drawDropIcons } from "../src/screens/fork/drops";
import { pctText, type DropLine, type DropTable } from "../src/sim/npcDay";

installRaster();

const SHAPED = Object.keys(ITEMS).filter((id) => hasGrid(id));
const PLAIN = ["whetstone", "kiln"].filter((id) => !hasGrid(id));
const fillOf = (id: string): string => (ITEMS[id].kind === "gate" ? C.wood2 : C.steel2);
const hiOf = (id: string): string => (ITEMS[id].kind === "gate" ? C.wood3 : C.steel3);
const table = (lines: DropLine[]): DropTable => ({ chance: 0.5, lines } as DropTable);
const X = 3, Y = 3; // the row's origin in the test raster
const PITCH = 19;

/** The old drawing's overlay (present4-base): G1's grid at iconCell over the box from its corner. */
const oldOverlay = (c: RasterCanvas, id: string, px: number, y: number): void => { gOf(c).drawImage(shapeGrid(id, iconCell(id)), px, y); };

/** the drop row of `ids` (class `cls`), 0.15 odds each, as the game draws it */
function row(ids: string[], cls: "rare" | "legendary" = "rare"): RasterCanvas {
  const c = fresh(X + ids.length * PITCH + 4, Y + 24);
  const n = drawDropIcons(gOf(c), table(ids.map((def) => ({ def, cls, odds: 0.15 }))), X, Y, ids.length * PITCH + 1);
  expect(n, "every line drawn").toBe(ids.length);
  return c;
}
/** the icon's opaque pixels as [box x, box y, colour] with the box's top-left at (px, y): the icon is drawn centred in the 12 x 12 inside */
function iconPixels(id: string, px: number, y: number): [number, number, string][] {
  const ic = R(itemIcon(id)), out: [number, number, string][] = [];
  const ox = px + 7 - Math.floor(ic.width / 2), oy = y + 7 - Math.floor(ic.height / 2);
  for (let j = 0; j < ic.height; j++) for (let i = 0; i < ic.width; i++) { const v = ic.at(i, j); if (v !== null) out.push([ox + i, oy + j, v]); }
  return out;
}

describe("PRESENT-4 G: a shaped part's icon and its footprint both show in the road's drop row", () => {
  it("the mark: cells only (no arrowhead), the footprint at rot 0 in the kind's colours, 3 px a cell up to 2 cells and 2 px for 3, at most 7 x 7", () => {
    expect(SHAPED.length).toBe(44);
    const sizes = new Set<string>();
    for (const id of SHAPED) {
      const spec = gridSpecOf(id), W = Math.max(...spec.cells.map((c) => c[0])) + 1, H = Math.max(...spec.cells.map((c) => c[1])) + 1;
      expect(markCell(id), id).toBe(Math.max(W, H) <= 2 ? 3 : 2);
      const sz = shapeMarkSize(id), mk = R(shapeMark(id));
      expect([mk.width, mk.height], `${id}: the canvas is the size`).toEqual([sz.w, sz.h]);
      expect(sz.w, `${id}: at most 7 wide`).toBeLessThanOrEqual(7);
      expect(sz.h, `${id}: at most 7 tall`).toBeLessThanOrEqual(7);
      expect(sz, id).toEqual({ w: 1 + W * markCell(id), h: 1 + H * markCell(id) }); // an outline px and the cells, no arrowhead margin
      sizes.add(`${W}x${H}:${sz.w}x${sz.h}`);
      // the cells: each cell's tile is the kind's fill (its top row the highlight), a seam between two cells, the outline round the whole
      const geom = gridGeom({ ...spec, arrows: [] }, markCell(id)), t = markCell(id) - 1;
      for (const tl of geom.tiles) {
        // a tile is cell - 1 px square: its top row the highlight, the rest the kind's fill (a 1 px tile, the 2 px cell of a 3-cell footprint, is the highlight alone)
        for (let i = 0; i < t; i++) expect(mk.at(tl.x + i, tl.y), `${id}: a tile's top row`).toBe(hiOf(id));
        if (t > 1) for (let j = 1; j < t; j++) for (let i = 0; i < t; i++) expect(mk.at(tl.x + i, tl.y + j), `${id}: a tile's fill`).toBe(fillOf(id));
      }
      const lime = mk.px.filter((p) => p === C.lime).length;
      expect(lime, `${id}: no arrowhead in the mark`).toBe(0);
      expect(mk.px.filter((p) => p === fillOf(id) || p === hiOf(id)).length, `${id}: tile px`).toBe(geom.tiles.length * t * t);
    }
    // every shape the game has: 2x2 (7x7), 2x1 (7x4), 3x1 (7x3), 3x2 (7x5), 1x3 (3x7), L (7x7), T (7x5)
    for (const s of ["2x2:7x7", "2x1:7x4", "3x1:7x3", "3x2:7x5", "1x3:3x7"]) expect(sizes.has(s), s).toBe(true);
  });

  it("the drop row: the box, the 19 px pitch and the odds' row are as they were for every shaped part (rare and legendary boxes); a plain part's entry has no mark", () => {
    for (const cls of ["rare", "legendary"] as const) for (const id of SHAPED) {
      const c = row([id, "whetstone", id], cls), sz = shapeMarkSize(id);
      const fill = cls === "legendary" ? C.plum1 : C.slate0;
      for (const k of [0, 1, 2]) {
        const px = X + k * PITCH;
        // the box's ink ring
        for (let i = 0; i < 14; i++) for (const [x, y] of [[px + i, Y], [px + i, Y + 13], [px, Y + i], [px + 13, Y + i]]) expect(c.at(x, y), `${id} ${cls} box ${k} ring (${x - px}, ${y - Y})`).toBe(C.ink);
        // the odds' row: the same pixels as the odds drawn alone under an empty box (the mark never leaves the box)
        const ref = fresh(c.width, c.height);
        drawText(gOf(ref), pctText(0.15), px + 7, Y + 16, C.bone, { font: "3", align: "center" });
        for (let y = Y + 14; y < c.height; y++) for (let x = px - 2; x < px + PITCH - 2; x++) expect(c.at(x, y), `${id} ${cls} box ${k}: below the box (${x - px}, ${y - Y})`).toBe(ref.at(x, y));
      }
      // the mark sits in the first and third boxes' bottom-right corners, inside the box; the plain part's box (2nd) holds its icon and the fill only
      for (const k of [0, 2]) {
        const mx = X + k * PITCH + 14 - sz.w, my = Y + 14 - sz.h, mk = R(shapeMark(id));
        for (let j = 0; j < sz.h; j++) for (let i = 0; i < sz.w; i++) { const v = mk.at(i, j); if (v !== null) expect(c.at(mx + i, my + j), `${id} ${cls}: the mark's px (${i}, ${j})`).toBe(v); }
        expect(mx, `${id}: the mark inside the box`).toBeGreaterThanOrEqual(X + k * PITCH);
        expect(my, `${id}: the mark inside the box`).toBeGreaterThanOrEqual(Y);
      }
      const px1 = X + PITCH, icon = new Map(iconPixels("whetstone", px1, Y).map(([x, y, v]) => [`${x},${y}`, v]));
      for (let j = 1; j < 13; j++) for (let i = 1; i < 13; i++) expect(c.at(px1 + i, Y + j), `a plain part's box: (${i}, ${j})`).toBe(icon.get(`${px1 + i},${Y + j}`) ?? fill);
    }
  });

  it("the icon reads: the mark hides at most its own box of the icon, and every shaped part shows at least as much of its icon as the old overlay left (counts: the table in the log)", () => {
    const lines: string[] = [];
    let oldAll = 0, newAll = 0, total = 0;
    for (const id of SHAPED) {
      const c = row([id]), px = X, px0 = iconPixels(id, px, Y);
      let nowHidden = 0;
      for (const [x, y, v] of px0) if (c.at(x, y) !== v) nowHidden++;
      const o = fresh(c.width, c.height);
      oldOverlay(o, id, px, Y);
      let oldHidden = 0;
      for (const [x, y] of px0) if (o.at(x, y) !== null) oldHidden++;
      const sz = shapeMarkSize(id);
      // PRESENT-5 G2b (REQ-BFG-113), old -> new: was `at most its box` (sz.w * sz.h); the mark now stands on a 1 px ink backing above and left of it (shapePic.ts iconMarkBack), so it hides at most that rect, (w + 1) x (h + 1)
      expect(nowHidden, `${id}: the mark and its backing hide at most the backing's rect`).toBeLessThanOrEqual((sz.w + 1) * (sz.h + 1));
      expect(nowHidden, `${id}: no more of the icon than the old overlay hid`).toBeLessThanOrEqual(oldHidden);
      oldAll += px0.length - oldHidden; newAll += px0.length - nowHidden; total += px0.length;
      lines.push(`G-ICON ${id.padEnd(12)} icon px ${String(px0.length).padStart(3)}: visible old ${String(px0.length - oldHidden).padStart(3)} -> new ${String(px0.length - nowHidden).padStart(3)} (mark ${sz.w}x${sz.h}, grid ${gridGeom(gridSpecOf(id), iconCell(id)).w}x${gridGeom(gridSpecOf(id), iconCell(id)).h})`);
      // the 2x2 parts: the old grid hid the whole icon (the icon's px under an 11 x 11 grid); now at least 70% of it shows
      // PRESENT-5 G2b (REQ-BFG-113), old -> new: was `at least 70%`; the backing hides up to a px row and a px column more (the least shown is 66.7%: TWIN NEEDLE, 54 of 81), so the floor is 65% (tests/present5.dropmark.test.ts counts every part)
      if (gridSpecOf(id).cells.length === 4 && gridSpecOf(id).arrows.length === 0 && gridGeom(gridSpecOf(id), iconCell(id)).w === 11) expect((px0.length - nowHidden) / px0.length, `${id}: the icon shows`).toBeGreaterThanOrEqual(0.65);
    }
    console.log(`${lines.join("\n")}\nG-ICON total icon px ${total}: visible old ${oldAll} -> new ${newAll}`);
    expect(newAll).toBeGreaterThan(oldAll * 1.5);
  });

  it("the footprint reads: every cell's tile is on the screen in the kind's colours (the count of tiles is the footprint's cells), the seams and outline round them, no tile where a cell is missing (L, T)", () => {
    for (const id of SHAPED) {
      const c = row([id]), spec = gridSpecOf(id), sz = shapeMarkSize(id), cell = markCell(id), geom = gridGeom({ ...spec, arrows: [] }, cell);
      const mx = X + 14 - sz.w, my = Y + 14 - sz.h, t = cell - 1;
      let tiles = 0;
      for (const tl of geom.tiles) {
        let ok = true;
        for (let j = 0; j < t; j++) for (let i = 0; i < t; i++) { const v = c.at(mx + tl.x + i, my + tl.y + j); if (v !== fillOf(id) && v !== hiOf(id)) ok = false; }
        if (ok) tiles++;
      }
      expect(tiles, `${id}: tiles on the screen`).toBe(spec.cells.length);
      // a cell the footprint lacks (the L's, the T's): no tile there, the box's own px (or the icon's) show
      const W = Math.max(...spec.cells.map((q) => q[0])) + 1, H = Math.max(...spec.cells.map((q) => q[1])) + 1;
      for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
        if (spec.cells.some((q) => q[0] === cx && q[1] === cy)) continue;
        const v = c.at(mx + 1 + cx * cell, my + 1 + cy * cell);
        expect(v === fillOf(id) || v === hiOf(id), `${id}: no tile at the missing cell (${cx}, ${cy})`).toBe(false);
      }
      // the outline round the whole shape is ink: the mark's top-left corner px and, for a full rectangle, its bottom-right
      expect(c.at(mx, my), `${id}: the outline's corner`).toBe(C.ink);
    }
  });

  it("a plain part's entry is the old one (the box, the icon, the odds): drawn by the same code with no mark", () => {
    for (const id of ["whetstone", "scrapmetal", "shield"].filter((d) => ITEMS[d] && !hasGrid(d))) {
      const c = row([id]), ref = fresh(c.width, c.height), g = gOf(ref);
      g.fillStyle = C.ink; g.fillRect(X, Y, 14, 14);
      g.fillStyle = C.slate0; g.fillRect(X + 1, Y + 1, 12, 12);
      const ic = itemIcon(id);
      g.drawImage(ic, X + 7 - Math.floor(ic.width / 2), Y + 7 - Math.floor(ic.height / 2));
      drawText(g, pctText(0.15), X + 7, Y + 16, C.bone, { font: "3", align: "center" });
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) expect(c.at(x, y), `${id} (${x}, ${y})`).toBe(ref.at(x, y));
    }
  });
});

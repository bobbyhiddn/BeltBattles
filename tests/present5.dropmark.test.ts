// PRESENT-5 G2 (REQ-BFG-113; backlog #537 (1)): the road's drop row draws a shaped part's footprint mark through ONE helper, src/ui/shapePic.ts drawIconMark (G2a), and G2b changes that helper alone.
//  G2a (the first commit): drawIconMark(g, defId, boxX, boxY, boxSize) drew PRESENT-4 G's mark exactly as drops.ts:69-74 did (shapeMark flush in the box's bottom-right corner); the drop row's pixels were IDENTICAL to PRESENT-4's
//  for every shaped part, in the rare and the legendary box, with a plain part between them: a copy of the base's drawDropIcons is kept below as the oracle.
//  G2b (the second commit, variant (a) of #537 (1)): the mark stands on a 1 px INK backing (iconMarkBack: the mark's rect grown 1 px up and left; right and below it is the box's own ring). PRESENT-4's K-03 read the carriage gun's box
//  `four tiles` 2 of 6: the icon's pale wheel patch sat level with the mark's bottom row in nearly the tiles' grey (a fifth tile). The row is now PRESENT-4's drawing EXCEPT inside the backing's rect, where every pixel is the
//  backing's ink or the mark's own; the box, the 19 px pitch and the odds' row are identical. The icon's own pixels visible (all 44 shaped parts, 4,541 icon px): PRESENT-4's 3,691 -> 3,418 (the mark and its backing hide the rest).
import { describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf, R, type RasterCanvas } from "./raster.helpers";
import { C } from "../src/render/palette";
import { rect } from "../src/render/pixel";
import { drawText } from "../src/render/font";
import { itemIcon } from "../src/render/sprites";
import { ITEMS } from "../src/sim/content";
import { drawIconMark, gridGeom, gridSpecOf, hasGrid, iconMarkBack, markCell, shapeMark, shapeMarkSize } from "../src/ui/shapePic";
import { drawDropIcons } from "../src/screens/fork/drops";
import { pctText, type DropLine, type DropTable } from "../src/sim/npcDay";

installRaster();

const SHAPED = Object.keys(ITEMS).filter((id) => hasGrid(id));
const table = (lines: DropLine[]): DropTable => ({ chance: 0.5, lines } as DropTable);
const X = 3, Y = 3, PITCH = 19;
const fillOf = (id: string): string => (ITEMS[id].kind === "gate" ? C.wood2 : C.steel2);
const hiOf = (id: string): string => (ITEMS[id].kind === "gate" ? C.wood3 : C.steel3);

/** PRESENT-4's drawDropIcons as it stood at present5-base (src/screens/fork/drops.ts:61-77), kept here as the oracle: the mark drawn by hand, two lines, no backing. */
function baseDrawDropIcons(g: CanvasRenderingContext2D, t: DropTable, x: number, y: number, w: number): number {
  let px = x, n = 0;
  for (const l of t.lines) {
    if (px + 16 > x + w) break;
    const ic = itemIcon(l.def);
    rect(g, px, y, 14, 14, C.ink);
    rect(g, px + 1, y + 1, 12, 12, l.cls === "legendary" ? C.plum1 : C.slate0);
    g.drawImage(ic, px + 7 - Math.floor(ic.width / 2), y + 7 - Math.floor(ic.height / 2));
    if (hasGrid(l.def)) {
      const m = shapeMarkSize(l.def);
      g.drawImage(shapeMark(l.def), px + 14 - m.w, y + 14 - m.h);
    }
    drawText(g, pctText(l.odds), px + 7, y + 16, C.bone, { font: "3", align: "center" });
    px += 19;
    n++;
  }
  return n;
}

const lines = (ids: string[], cls: "rare" | "legendary"): DropLine[] => ids.map((def) => ({ def, cls, odds: 0.15 }) as DropLine);
function rowWith(draw: typeof drawDropIcons, ids: string[], cls: "rare" | "legendary"): RasterCanvas {
  const c = fresh(X + ids.length * PITCH + 4, Y + 24);
  const n = draw(gOf(c), table(lines(ids, cls)), X, Y, ids.length * PITCH + 1);
  expect(n, "every line drawn").toBe(ids.length);
  return c;
}
/** the icon's opaque pixels as [x, y, colour] with the box's top-left at (px, y): the icon is drawn centred in the 12 x 12 inside */
function iconPixels(id: string, px: number, y: number): [number, number, string][] {
  const ic = R(itemIcon(id)), out: [number, number, string][] = [];
  const ox = px + 7 - Math.floor(ic.width / 2), oy = y + 7 - Math.floor(ic.height / 2);
  for (let j = 0; j < ic.height; j++) for (let i = 0; i < ic.width; i++) { const v = ic.at(i, j); if (v !== null) out.push([ox + i, oy + j, v]); }
  return out;
}
const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

describe("PRESENT-5 G2: drawIconMark, the one helper that draws the footprint mark over an icon's box", () => {
  it("there are 44 shaped parts (PRESENT-4 counted 44; recount) and every one has a mark", () => {
    expect(SHAPED.length).toBe(44);
    for (const id of SHAPED) { const s = shapeMarkSize(id); expect(s.w, id).toBeGreaterThan(0); expect(s.h, id).toBeGreaterThan(0); }
  });

  it("G2b: iconMarkBack is the mark's rect grown 1 px up and left (right and below: the box's corner); drawIconMark lays that ink, then shapeMark flush in the box's bottom-right corner, and returns the mark's rect (any box size)", () => {
    for (const id of SHAPED) for (const size of [14, 16, 20]) {
      const c = fresh(30, 30), m = shapeMarkSize(id), mk = R(shapeMark(id));
      const back = iconMarkBack(id, 5, 6, size);
      expect(back, `${id} @${size}: the backing`).toEqual({ x: 5 + size - m.w - 1, y: 6 + size - m.h - 1, w: m.w + 1, h: m.h + 1 });
      expect(back.x + back.w, `${id}: the backing ends at the box's right edge`).toBe(5 + size);
      expect(back.y + back.h, `${id}: the backing ends at the box's foot`).toBe(6 + size);
      const r = drawIconMark(gOf(c), id, 5, 6, size);
      expect(r, `${id} @${size}`).toEqual({ x: 5 + size - m.w, y: 6 + size - m.h, w: m.w, h: m.h });
      const ref = fresh(30, 30);
      rect(gOf(ref), back.x, back.y, back.w, back.h, C.ink);
      gOf(ref).drawImage(shapeMark(id), 5 + size - m.w, 6 + size - m.h);
      for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) expect(c.at(x, y), `${id} @${size} (${x}, ${y})`).toBe(ref.at(x, y));
      expect([mk.width, mk.height], id).toEqual([m.w, m.h]);
      // the gap itself: the px row above the mark and the px column left of it are ink, from the backing's corner to the box's edge
      for (let i = 0; i < back.w; i++) expect(c.at(back.x + i, back.y), `${id}: the gap row above the mark`).toBe(C.ink);
      for (let j = 0; j < back.h; j++) expect(c.at(back.x, back.y + j), `${id}: the gap column left of the mark`).toBe(C.ink);
      // nothing outside the box: the backing never grows the box
      for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) if (!inRect({ x: 5, y: 6, w: size, h: size }, x, y)) expect(c.at(x, y), `${id} @${size}: outside the box (${x}, ${y})`).toBe(null);
    }
  });

  it("the drop row is PRESENT-4's drawing to the pixel everywhere except inside the backing's rect: every shaped part, the rare and the legendary box, with a plain part between; inside it every pixel is the backing's ink or the mark's own", () => {
    const plain = ["whetstone", "kiln"].find((id) => ITEMS[id] && !hasGrid(id))!;
    expect(plain).toBeTruthy();
    let compared = 0, inside = 0, changed = 0;
    for (const cls of ["rare", "legendary"] as const) for (const id of SHAPED) {
      const ids = [id, plain, id];
      const now = rowWith(drawDropIcons, ids, cls), was = rowWith(baseDrawDropIcons, ids, cls);
      expect([now.width, now.height]).toEqual([was.width, was.height]);
      const mk = R(shapeMark(id)), sz = shapeMarkSize(id);
      const backs = [0, 2].map((k) => iconMarkBack(id, X + k * PITCH, Y, 14));
      for (let y = 0; y < now.height; y++) for (let x = 0; x < now.width; x++) {
        compared++;
        const bk = backs.find((b) => inRect(b, x, y));
        if (!bk) { if (now.at(x, y) !== was.at(x, y)) expect.fail(`${id} ${cls}: pixel (${x}, ${y}) is ${now.at(x, y)}, PRESENT-4 drew ${was.at(x, y)} (outside the backing)`); continue; }
        inside++;
        const k = bk === backs[0] ? 0 : 2, mx = X + k * PITCH + 14 - sz.w, my = Y + 14 - sz.h, onMark = x >= mx && y >= my;
        const want = onMark ? mk.at(x - mx, y - my) ?? C.ink : C.ink; // the mark's own pixel (a mark px is never clear), else the backing's ink
        expect(now.at(x, y), `${id} ${cls}: inside the backing (${x}, ${y})`).toBe(want);
        if (now.at(x, y) !== was.at(x, y)) changed++;
      }
      // the plain part's box (the middle one) is untouched
      const px1 = X + PITCH;
      for (let j = 0; j < 14; j++) for (let i = 0; i < 14; i++) expect(now.at(px1 + i, Y + j), `${id} ${cls}: the plain box (${i}, ${j})`).toBe(was.at(px1 + i, Y + j));
    }
    expect(compared).toBeGreaterThan(44 * 2 * 60 * 20);
    expect(changed, "the backing changes some pixels").toBeGreaterThan(0);
    expect(inside, "the backing's rects are small").toBeLessThan(compared / 10);
  });

  it("the box, the 19 px pitch and the odds' row are as they were (the ink ring of every box, the odds' pixels under every box), for every shaped part in the rare and the legendary box", () => {
    for (const cls of ["rare", "legendary"] as const) for (const id of SHAPED) {
      const c = rowWith(drawDropIcons, [id, "whetstone", id], cls);
      for (const k of [0, 1, 2]) {
        const px = X + k * PITCH;
        for (let i = 0; i < 14; i++) for (const [x, y] of [[px + i, Y], [px + i, Y + 13], [px, Y + i], [px + 13, Y + i]]) expect(c.at(x, y), `${id} ${cls} box ${k} ring (${x - px}, ${y - Y})`).toBe(C.ink);
        const ref = fresh(c.width, c.height);
        drawText(gOf(ref), pctText(0.15), px + 7, Y + 16, C.bone, { font: "3", align: "center" });
        for (let y = Y + 14; y < c.height; y++) for (let x = px - 2; x < px + PITCH - 2; x++) expect(c.at(x, y), `${id} ${cls} box ${k}: below the box (${x - px}, ${y - Y})`).toBe(ref.at(x, y));
        // the gap between two boxes (the 5 px of the pitch beyond the box): nothing drawn
        if (k < 2) for (let j = 0; j < 14; j++) for (let i = 14; i < PITCH; i++) expect(c.at(px + i, Y + j), `${id} ${cls}: the gap right of box ${k} (${i}, ${j})`).toBe(null);
      }
    }
  });

  it("the footprint reads: one tile per footprint cell in the kind's colours (none at a missing cell of an L or a T), the backing's ink above and left of the mark, and the mark's tiles never touch the icon's pixels", () => {
    let tilesAll = 0;
    for (const id of SHAPED) {
      const c = rowWith(drawDropIcons, [id], "rare"), spec = gridSpecOf(id), sz = shapeMarkSize(id), cell = markCell(id), geom = gridGeom({ ...spec, arrows: [] }, cell);
      const mx = X + 14 - sz.w, my = Y + 14 - sz.h, t = cell - 1, back = iconMarkBack(id, X, Y, 14);
      let tiles = 0;
      for (const tl of geom.tiles) {
        let ok = true;
        for (let j = 0; j < t; j++) for (let i = 0; i < t; i++) { const v = c.at(mx + tl.x + i, my + tl.y + j); if (v !== fillOf(id) && v !== hiOf(id)) ok = false; }
        if (ok) tiles++;
      }
      expect(tiles, `${id}: tiles on the screen`).toBe(spec.cells.length);
      tilesAll += tiles;
      const W = Math.max(...spec.cells.map((q) => q[0])) + 1, H = Math.max(...spec.cells.map((q) => q[1])) + 1;
      for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
        if (spec.cells.some((q) => q[0] === cx && q[1] === cy)) continue;
        const v = c.at(mx + 1 + cx * cell, my + 1 + cy * cell);
        expect(v === fillOf(id) || v === hiOf(id), `${id}: no tile at the missing cell (${cx}, ${cy})`).toBe(false);
      }
      // the gap: the px row above the mark and the px column left of it are ink along the whole backing (the mark's own outline is ink beside it)
      for (let i = 0; i < back.w; i++) expect(c.at(back.x + i, back.y), `${id}: the gap row`).toBe(C.ink);
      for (let j = 0; j < back.h; j++) expect(c.at(back.x, back.y + j), `${id}: the gap column`).toBe(C.ink);
      // the icon's own pixel next to the gap (left of the column, above the row) is the icon's: the gap is 1 px
      for (const [x, y, v] of iconPixels(id, X, Y)) if (!inRect(back, x, y)) expect(c.at(x, y), `${id}: an icon px outside the backing`).toBe(v);
    }
    expect(tilesAll).toBeGreaterThan(44 * 2);
  });

  it("the icon reads: the icon's own visible pixels, PRESENT-4's drawing -> now (counted over the 44 shaped parts; the table is in the log), and no 2x2 part keeps less than 65% of its icon", () => {
    const out: string[] = [];
    let was = 0, now = 0, total = 0, minFrac = 1, minId = "";
    for (const id of SHAPED) {
      const c = rowWith(drawDropIcons, [id], "rare"), o = rowWith(baseDrawDropIcons, [id], "rare"), px0 = iconPixels(id, X, Y);
      let vNow = 0, vWas = 0;
      for (const [x, y, v] of px0) { if (c.at(x, y) === v) vNow++; if (o.at(x, y) === v) vWas++; }
      const back = iconMarkBack(id, X, Y, 14);
      expect(px0.length - vNow, `${id}: the mark and its backing hide at most the backing's rect`).toBeLessThanOrEqual(back.w * back.h);
      expect(vNow, `${id}: never more than PRESENT-4 showed`).toBeLessThanOrEqual(vWas);
      was += vWas; now += vNow; total += px0.length;
      const frac = vNow / px0.length;
      if (frac < minFrac) { minFrac = frac; minId = id; }
      if (gridSpecOf(id).cells.length === 4 && gridSpecOf(id).arrows.length === 0) expect(frac, `${id}: a 2x2 part's icon shows`).toBeGreaterThanOrEqual(0.65);
      out.push(`G2-ICON ${id.padEnd(12)} icon px ${String(px0.length).padStart(3)}: visible PRESENT-4 ${String(vWas).padStart(3)} -> now ${String(vNow).padStart(3)}`);
    }
    console.log(`${out.join("\n")}\nG2-ICON total icon px ${total}: visible PRESENT-4 ${was} -> now ${now}; the least shown: ${minId} ${(minFrac * 100).toFixed(1)}%`);
    // the counts are pinned as what the drawings HIDE, so they do not move when an icon's own art does (PRESENT-5 M2 drops one px of the carriage gun, which no mark covers):
    // PRESENT-4's mark hid 850 of the 44 parts' icon px (REPORT-PRESENT4: 3,691 of 4,541 visible), the mark on its backing hides 1,123 (3,418 of 4,541 visible at G2b)
    expect(total - was, "icon px hidden by PRESENT-4's mark").toBe(850);
    expect(total - now, "icon px hidden by the mark and its backing").toBe(1123);
  });
});

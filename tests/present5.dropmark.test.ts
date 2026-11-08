// PRESENT-5 G2 (REQ-BFG-113; backlog #537 (1)): the road's drop row draws a shaped part's footprint mark through ONE helper, src/ui/shapePic.ts drawIconMark (G2a), and G2b may change that helper alone.
//  G2a (this file, the first commit): drawIconMark(g, defId, boxX, boxY, boxSize) draws PRESENT-4 G's mark exactly as drops.ts:69-74 did: shapeMark in the box's bottom-right corner, flush with the box.
//  The drop row's pixels are IDENTICAL to PRESENT-4's drawing for every shaped part, in the rare and the legendary box, with a plain part between them: a copy of the base's drawDropIcons is kept below.
//  (G2b's variant, if it stays, is asserted in this file's second describe; its commit re-pins the identity test only where the variant says.)
import { describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf, R, type RasterCanvas } from "./raster.helpers";
import { C } from "../src/render/palette";
import { rect } from "../src/render/pixel";
import { drawText } from "../src/render/font";
import { itemIcon } from "../src/render/sprites";
import { ITEMS } from "../src/sim/content";
import { drawIconMark, hasGrid, shapeMark, shapeMarkSize } from "../src/ui/shapePic";
import { drawDropIcons } from "../src/screens/fork/drops";
import { pctText, type DropLine, type DropTable } from "../src/sim/npcDay";

installRaster();

const SHAPED = Object.keys(ITEMS).filter((id) => hasGrid(id));
const table = (lines: DropLine[]): DropTable => ({ chance: 0.5, lines } as DropTable);
const X = 3, Y = 3, PITCH = 19;

/** PRESENT-4's drawDropIcons as it stood at present5-base (src/screens/fork/drops.ts:61-77), kept here as the oracle for G2a: the mark drawn by hand, two lines. */
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

describe("PRESENT-5 G2a: drawIconMark is PRESENT-4's mark, drawn once, in one place", () => {
  it("there are 44 shaped parts (PRESENT-4 counted 44; recount) and every one has a mark", () => {
    expect(SHAPED.length).toBe(44);
    for (const id of SHAPED) { const s = shapeMarkSize(id); expect(s.w, id).toBeGreaterThan(0); expect(s.h, id).toBeGreaterThan(0); }
  });

  it("drawIconMark puts shapeMark in the box's bottom-right corner, flush with the box (any box size), and returns the rect it covers", () => {
    for (const id of SHAPED) for (const size of [14, 16, 20]) {
      const c = fresh(30, 30), m = shapeMarkSize(id), mk = R(shapeMark(id));
      const r = drawIconMark(gOf(c), id, 5, 6, size);
      expect(r, `${id} @${size}`).toEqual({ x: 5 + size - m.w, y: 6 + size - m.h, w: m.w, h: m.h });
      const ref = fresh(30, 30);
      gOf(ref).drawImage(shapeMark(id), 5 + size - m.w, 6 + size - m.h);
      for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) expect(c.at(x, y), `${id} @${size} (${x}, ${y})`).toBe(ref.at(x, y));
      expect([mk.width, mk.height], id).toEqual([m.w, m.h]);
    }
  });

  it("the drop row is PRESENT-4's drawing to the pixel: every shaped part, the rare and the legendary box, with a plain part between (the box, the 19 px pitch, the odds' row, the mark)", () => {
    const plain = ["whetstone", "kiln"].find((id) => ITEMS[id] && !hasGrid(id))!;
    expect(plain).toBeTruthy();
    let compared = 0;
    for (const cls of ["rare", "legendary"] as const) for (const id of SHAPED) {
      const ids = [id, plain, id];
      const now = rowWith(drawDropIcons, ids, cls), was = rowWith(baseDrawDropIcons, ids, cls);
      expect([now.width, now.height]).toEqual([was.width, was.height]);
      for (let y = 0; y < now.height; y++) for (let x = 0; x < now.width; x++) { if (now.at(x, y) !== was.at(x, y)) expect.fail(`${id} ${cls}: pixel (${x}, ${y}) is ${now.at(x, y)}, PRESENT-4 drew ${was.at(x, y)}`); compared++; }
    }
    expect(compared).toBeGreaterThan(44 * 2 * 60 * 20);
  });
});

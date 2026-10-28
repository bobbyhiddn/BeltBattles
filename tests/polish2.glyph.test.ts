// POLISH-2 (REQ-BFG-089; BRIEF-POLISH2 Q3, POLISH-1's follow-up F-a): ONE info glyph. POLISH-1 drew the part panel's ⓘ button as the 5x7 face's `?`; LAST CHANCE's cards
// (lastChancePicker.ts drawInfo) and the road's drop list (fork/drops.ts drawInfoBox) still drew the old hand-made "i", and the event cards' button (event/wordInfo.ts
// drawInfoButton) drew the 3x5 face's `?`. Now all four draw the same 5x7 pixels (ui/infoGlyph.ts), each in its own box, size and colours.
//  (a) every info-button drawer draws the SAME lit pixels (the 5x7 face's `?`) in its box, in both states, and paints nothing outside the box;
//  (b) the box, its size and its colours stay each drawer's own (the face colours, the 11 px and 9 px boxes);
//  (c) the drawers are all found: a walk of src/screens lists every `draw...Info...` function, and none draws a hand-made mark (each reaches ui/infoGlyph).
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { C } from "../src/render/palette";
import { glyphRows } from "../src/render/font";
import { ENCHANT_DEFS } from "../src/sim/enchant";
import { INFO_GLYPH, INFO_GLYPH_H, INFO_GLYPH_W, infoMarkAt } from "../src/ui/infoGlyph";
import { drawInfoGlyph } from "../src/screens/build/keywords";
import { drawInfo } from "../src/screens/lastChancePicker";
import { drawInfoBox } from "../src/screens/fork/drops";
import { drawInfoButton, infoButton } from "../src/screens/event/wordInfo";

installRaster();

/** The rows of the cells of `c` inside `box` that hold `colour`, as `#` and `.`, cropped to their bounding box (null: none lit). */
function litRows(c: RasterCanvas, colour: string, box: { x: number; y: number; w: number; h: number }): { rows: string[]; x: number; y: number } | null {
  const cells: [number, number][] = [];
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) if (c.at(x, y) === colour) cells.push([x, y]);
  if (!cells.length) return null;
  const x0 = Math.min(...cells.map((q) => q[0])), x1 = Math.max(...cells.map((q) => q[0])), y0 = Math.min(...cells.map((q) => q[1])), y1 = Math.max(...cells.map((q) => q[1]));
  const rows: string[] = [];
  for (let y = y0; y <= y1; y++) {
    let r = "";
    for (let x = x0; x <= x1; x++) r += c.at(x, y) === colour ? "#" : ".";
    rows.push(r);
  }
  return { rows, x: x0, y: y0 };
}

/** The mark's rows the way the glyph table has them with its blank row kept: cropped rows of the table (the blank 6th row sits inside the mark's bounding box). */
const WANT = INFO_GLYPH.slice();

interface Drawer {
  name: string;
  box: { x: number; y: number; w: number; h: number };
  draw: (g: CanvasRenderingContext2D, on: boolean) => void;
  face: (on: boolean) => string; // the colour of the box's face
  mark: (on: boolean) => string; // the colour of the mark
}

const FIERY = ENCHANT_DEFS.fiery.color;
const DRAWERS: Drawer[] = [
  {
    name: "the part panel's corner button (keywords.ts drawInfoGlyph)",
    box: { x: 5, y: 4, w: 5, h: 7 }, // the 5x7 ink plate the keyword layer draws (qb.x + 11, qb.y + 9): the glyph's (x, y) is the plate + (1, 1)
    draw: (g, on) => drawInfoGlyph(g, 6, 5, on ? C.yellow : C.brass3),
    face: () => C.ink,
    mark: (on) => (on ? C.yellow : C.brass3),
  },
  {
    name: "LAST CHANCE's cards (lastChancePicker.ts drawInfo)",
    box: { x: 4, y: 3, w: 11, h: 11 },
    draw: (g, on) => drawInfo(g, { x: 4, y: 3, w: 11, h: 11 }, on),
    face: (on) => (on ? C.brass1 : C.slate0),
    mark: (on) => (on ? C.yellow : C.brass3),
  },
  {
    name: "the road's drop list (fork/drops.ts drawInfoBox)",
    box: { x: 4, y: 3, w: 11, h: 11 },
    draw: (g, on) => drawInfoBox(g, { x: 4, y: 3, w: 11, h: 11 }, on),
    face: (on) => (on ? C.brass1 : C.slate0),
    mark: (on) => (on ? C.yellow : C.brass3),
  },
  {
    name: "the event cards' button (event/wordInfo.ts drawInfoButton)",
    box: { x: 4, y: 3, w: 9, h: 9 },
    draw: (g, on) => drawInfoButton(g, { x: 4, y: 3, w: 9, h: 9 }, FIERY, on),
    face: (on) => (on ? C.slate3 : C.slate1),
    mark: () => FIERY,
  },
];

describe("POLISH-2 Q3: the one info glyph", () => {
  it("the table is the 5x7 face's own `?` (the pixels POLISH-1's read picked), 5 wide and 7 tall", () => {
    expect(INFO_GLYPH).toEqual(glyphRows("?", "5"));
    expect(INFO_GLYPH.length).toBe(INFO_GLYPH_H);
    expect(INFO_GLYPH.every((r) => r.length === INFO_GLYPH_W)).toBe(true);
  });

  for (const d of DRAWERS) {
    for (const on of [false, true]) {
      it(`${d.name}, ${on ? "lit" : "idle"}: draws the 5x7 \`?\` pixel for pixel, inside its box, and nothing outside the box`, () => {
        const c = fresh(24, 20);
        d.draw(G(c), on);
        expect(c.oob).toBe(0);
        const lit = litRows(c, d.mark(on), d.box);
        expect(lit, "the mark is drawn").not.toBeNull();
        expect(lit!.rows, "the mark's pixels").toEqual(WANT);
        // the mark sits inside the box's interior (or the plate), not on its border; every pixel outside the box is untouched
        const inner = d.box.w === 5 ? d.box : { x: d.box.x + 1, y: d.box.y + 1, w: d.box.w - 2, h: d.box.h - 2 };
        expect(lit!.x >= inner.x && lit!.y >= inner.y && lit!.x + INFO_GLYPH_W <= inner.x + inner.w && lit!.y + INFO_GLYPH_H <= inner.y + inner.h).toBe(true);
        for (let y = 0; y < 20; y++) for (let x = 0; x < 24; x++) {
          const inBox = x >= d.box.x && x < d.box.x + d.box.w && y >= d.box.y && y < d.box.y + d.box.h;
          if (!inBox) expect(c.at(x, y), `outside the box at (${x},${y})`).toBeNull();
        }
        // the box keeps its own colours: the ink border (a bordered box) and its face under the mark
        if (d.box.w > 5) {
          for (let x = d.box.x; x < d.box.x + d.box.w; x++) expect([c.at(x, d.box.y), c.at(x, d.box.y + d.box.h - 1)]).toEqual([C.ink, C.ink]);
          expect(c.at(d.box.x + 1, d.box.y + 1)).toBe(d.face(on));
        }
      });
    }
  }

  it("every drawer's mark is the same pixels as every other's (the four bitmaps are equal)", () => {
    const maps = DRAWERS.map((d) => {
      const c = fresh(24, 20);
      d.draw(G(c), false);
      return litRows(c, d.mark(false), d.box)!.rows.join("|");
    });
    expect(new Set(maps).size).toBe(1);
    expect(maps[0]).toBe(INFO_GLYPH.join("|"));
  });

  it("the mark sits centred in the interior of an 11 px box ((3, 2) from its corner) and of the event card's 9 px box ((2, 1)), rounded down", () => {
    expect(infoMarkAt({ x: 0, y: 0, w: 11, h: 11 })).toEqual({ x: 3, y: 2 });
    expect(infoMarkAt({ x: 10, y: 20, w: 9, h: 9 })).toEqual({ x: 12, y: 21 });
    const c = fresh(24, 20);
    drawInfo(G(c), { x: 4, y: 3, w: 11, h: 11 }, false);
    expect(litRows(c, C.brass3, { x: 4, y: 3, w: 11, h: 11 })).toMatchObject({ x: 7, y: 5 });
  });

  it("the event button keeps its geometry (a 9 x 9 box in the card's corner) and its colours: the word's colour on a slate face", () => {
    const card = { x: 3, y: 4, w: 182, h: 42 };
    const { btn } = infoButton(card);
    expect([btn.w, btn.h]).toEqual([9, 9]);
    const c = fresh(200, 60);
    drawInfoButton(G(c), btn, ENCHANT_DEFS.rising.color, true);
    expect(c.at(btn.x, btn.y)).toBe(C.ink);
    expect(c.at(btn.x + 1, btn.y + 1)).toBe(C.slate3);
    expect(litRows(c, ENCHANT_DEFS.rising.color, btn)!.rows).toEqual(WANT);
  });

  it("the drawers are all found: the walk of src/screens lists every `drawInfo...` function and each reaches the one mark (none draws a hand-made glyph)", () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
    });
    const found: { name: string; file: string; src: string }[] = [];
    for (const f of walk("src/screens")) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/(?:^|\n)(?:export )?function (drawInfo\w*)\(/g)) found.push({ name: m[1], file: f.replace(/\\/g, "/"), src });
    }
    // (drawWordInfo, the event's word card, is a card, not a button; dropInfoButton only places drawInfoBox's hit rect)
    expect(found.map((q) => `${q.file}:${q.name}`).sort()).toEqual([
      "src/screens/build/keywords.ts:drawInfoGlyph",
      "src/screens/event/wordInfo.ts:drawInfoButton",
      "src/screens/fork/drops.ts:drawInfoBox",
      "src/screens/lastChancePicker.ts:drawInfo",
    ]);
    for (const q of found) expect(q.src, `${q.file} draws the mark through ui/infoGlyph`).toMatch(/from "(\.\.\/)+ui\/infoGlyph"/);
    // no file in src/screens spells the old hand-made "i" any more (a dot, a 1x3 stem, a serif and a foot: the stem's `rect(g, x + 1, y + 2, 1, 3, c)` beside the serif's `rect(g, x, y + 2, 1, 1, c)`)
    for (const f of walk("src/screens")) {
      const src = readFileSync(f, "utf8");
      expect(src.includes("rect(g, x + 1, y + 2, 1, 3, c)") && src.includes("rect(g, x, y + 2, 1, 1, c)"), f).toBe(false);
    }
  });
});

// GATES-1b (REQ-BFG-057; BRIEF-GATES1B B2): the carried gate's tag reads `SPLITS IT: 2 TILES IN, 3 TILES OUT` (`1 TILE` when a
// count is 1), and it fits: at the longest real case (two counts of 2 digits: 133 px in the tag's font) the whole tag is drawn,
// inside the hull box (the view's width: 156 px across; 140 on a turned hull, the desk's), on every facing, with the gate near the
// left edge, the middle and the right edge of the deck. "Never cut": the tag's lit pixels equal those of the same line drawn in
// the clear. The tag moves sideways to stay on the hull (cues.ts drawSplitGhost) and is never narrower than its words.
// (tests/gates1.split.test.ts has the words; scripts/touchcheck.mjs gatesplit carries a real gate on the phone and the desk.)
import { afterEach, describe, expect, it } from "vitest";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { GRID } from "../src/sim/content";
import { key as K, rotField, type Build } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { GATES, setGates, withGates } from "../src/sim/gates";
import { previewSplit, splitSheetLines, splitTag } from "../src/sim/splitPreview";
import { footY, frame as deckFrame, hullBox, type Facing } from "../src/render/frame";
import { drawText, textWidth } from "../src/render/font";
import { C } from "../src/render/palette";
import { drawSplitGhost } from "../src/screens/build/cues";
import type { BuildLayout } from "../src/screens/build/layout";

installRaster();
afterEach(() => setGates(GATES));

/** A belt of `n` tiles snaking over the deck, from the bottom row up: rows of GRID cells joined by a one-cell step. */
function snake(n: number): number[] {
  const cells: number[] = [];
  for (let row = 0; cells.length < n; row++) {
    const y = GRID - 1 - 2 * row;
    for (let i = 0; i < GRID && cells.length < n; i++) cells.push(K(row % 2 === 0 ? i : GRID - 1 - i, y));
    if (cells.length < n) cells.push(K(row % 2 === 0 ? GRID - 1 : 0, y - 1));
  }
  return cells;
}
const BUILD = (n: number): Build => ({ hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 0 }], routes: [{ factory: 1, cells: snake(n) }], mods: [], beltCap: 99, hullBonus: 0 });

/** Draw the carried FUSER over belt tile `ti` of an n-tile snake on facing `fc`; the tag's lit lime pixels and the hull box. */
function carry(n: number, ti: number, fc: Facing) {
  const b = BUILD(n), cell = snake(n)[ti], x = cell % GRID, y = Math.floor(cell / GRID);
  const f = deckFrame(fc, 110, 110);
  const c: RasterCanvas = fresh(380, 380);
  const p = drawSplitGhost(G(c), { frame: f } as unknown as BuildLayout, b, "fuser", x, y, -1, 0);
  const gy = Math.round(footY(f, x, y));
  const lit: [number, number][] = [];
  for (let j = 0; j < Math.min(gy, c.height); j++) for (let i = 0; i < c.width; i++) if (c.at(i, j) === C.lime) lit.push([i, j]);
  return { p, lit, hb: hullBox(f), oob: c.oob };
}

/** The lit pixels in `col` of `line` drawn in the clear (a wide raster, centred): what "never cut" means. */
function litInTheClear(line: string, col: string = C.lime): number {
  const c = fresh(300, 30);
  drawText(G(c), line, 150, 10, col, { font: "3", align: "center", outline: C.ink });
  let n = 0;
  for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) if (c.at(i, j) === col) n++;
  return n;
}

describe("GATES-1b B2: the tag's words", () => {
  it("2 TILES IN, 3 TILES OUT; TILE (not TILES) when a count is 1; a refused tile shows its reason alone", () => {
    withGates(() => {
      const b = BUILD(6);
      expect(splitTag(previewSplit(b, "fuser", snake(6)[2]))).toBe("SPLITS IT: 2 TILES IN, 3 TILES OUT");
      expect(splitTag(previewSplit(b, "fuser", snake(6)[1]))).toBe("SPLITS IT: 1 TILE IN, 4 TILES OUT");
      expect(splitTag(previewSplit(b, "fuser", snake(6)[4]))).toBe("SPLITS IT: 4 TILES IN, 1 TILE OUT");
      expect(splitTag(previewSplit(BUILD(3), "fuser", snake(3)[1]))).toBe("SPLITS IT: 1 TILE IN, 1 TILE OUT");
      expect(splitTag(previewSplit(b, "fuser", K(0, 0)))).toBe("DROP IT ON A BELT");
      expect(splitTag(previewSplit(b, "fuser", snake(6)[0]))).toBe("NEEDS BELT ON BOTH SIDES");
    });
  });

  it("the text sheet's --gates lines list the tag in its real cases (splitSheetLines)", () => {
    const text = splitSheetLines().join("\n");
    for (const w of ["SPLITS IT: 2 TILES IN, 3 TILES OUT", "SPLITS IT: 1 TILE IN, 1 TILE OUT", "SPLITS IT: 14 TILES IN, 15 TILES OUT", "1 ARROW IDLES", "2 ARROWS IDLE", "DROP IT ON A BELT", "NEEDS BELT ON BOTH SIDES"]) expect(text).toContain(w);
    expect(text).not.toMatch(/\d OUT\b(?!.*TILES)/); // no bare `3 OUT` left
  });
});

describe("GATES-1b B2: the tag fits at the longest real case on the phone's and the desk's hull, and is never cut", () => {
  it("every real pair of counts (a belt up to the deck's 100 tiles) is at most 133 px wide: inside a turned hull's 140 and the 156 across, outline included", () => {
    let widest = 0;
    for (let tilesIn = 1; tilesIn <= GRID * GRID - 2; tilesIn++) {
      for (const tilesOut of [1, 2, 9, 10, 15, GRID * GRID - 1 - tilesIn]) {
        if (tilesOut < 1 || tilesIn + tilesOut > GRID * GRID - 1) continue;
        const ok = { ok: true, route: 0, tile: tilesIn, tilesIn, tilesOut, outCells: [], idles: 2 };
        for (const line of splitTag(ok).split(" · ")) widest = Math.max(widest, textWidth(line, "3"));
      }
    }
    expect(widest).toBe(133); // `SPLITS IT: 14 TILES IN, 15 TILES OUT` and every other pair of 2-digit counts
    expect(widest + 2).toBeLessThanOrEqual(140); // + the 1 px outline each side, in the narrowest hull box (a turned hull)
    expect(textWidth("SPLITS IT: 2 TILES IN, 3 OUT", "3")).toBe(102); // what it was before: the new words add 31 px at most
  });

  for (const fc of [0, 1, 2, 3] as Facing[]) {
    it(`facing ${fc}: the whole tag is on the hull box with the gate at the left edge, the middle and the right edge of the deck`, () => {
      withGates(() => {
        // a belt of 30 tiles: tile 11 = (9, 7) the right edge, 14 = (6, 7) the middle, 20 = (0, 7) the left edge: counts of 2 digits
        for (const ti of [11, 14, 20]) {
          const { p, lit, hb, oob } = carry(30, ti, fc);
          const line = splitTag(p);
          expect(line, `tile ${ti}`).toBe(`SPLITS IT: ${ti} TILES IN, ${29 - ti} TILES OUT`);
          expect(lit.length, `tile ${ti} facing ${fc}: the tag is drawn`).toBeGreaterThan(0);
          const xs = lit.map(([i]) => i), lo = Math.min(...xs), hi = Math.max(...xs);
          expect(lo, `tile ${ti} facing ${fc}: left edge inside the hull box`).toBeGreaterThanOrEqual(hb.x);
          expect(hi, `tile ${ti} facing ${fc}: right edge inside the hull box`).toBeLessThan(hb.x + hb.w);
          expect(oob, "nothing painted off the raster").toBe(0);
          expect(lit.length, `tile ${ti} facing ${fc}: never cut: as many lit pixels as the same line drawn in the clear`).toBe(litInTheClear(line));
          expect(hi - lo + 1, "as wide as its words").toBe(textWidth(line, "3"));
        }
      });
    });
  }

  it("with a rig's arrow aimed at the tile the second line `1 ARROW IDLES` is drawn (amber) on the hull too, under the tag", () => {
    withGates(() => {
      const b = BUILD(30);
      // a WHETSTONE at (7, 8) facing north aims at (7, 7), tile 13 of the snake's second row (x = 9 - (13 - 11) = 7): one arrow idles
      b.items.push({ uid: 7, def: "whetstone", x: 7, y: 8, ...rotField("whetstone", rotFacing("whetstone", 0)) });
      const tile = 13, cell = snake(30)[tile], x = cell % GRID, y = Math.floor(cell / GRID);
      expect(previewSplit(b, "fuser", cell).idles).toBe(1);
      expect(splitTag(previewSplit(b, "fuser", cell))).toBe(`SPLITS IT: ${tile} TILES IN, ${29 - tile} TILES OUT · 1 ARROW IDLES`);
      for (const fc of [0, 1, 2, 3] as Facing[]) {
        const f = deckFrame(fc, 110, 110), c = fresh(380, 380);
        drawSplitGhost(G(c), { frame: f } as unknown as BuildLayout, b, "fuser", x, y, -1, 0);
        const hb = hullBox(f), gy = Math.round(footY(f, x, y));
        const amber: number[] = [], lime: number[] = [];
        for (let j = 0; j < gy; j++) for (let i = 0; i < c.width; i++) { const px = c.at(i, j); if (px === C.amber) amber.push(i); else if (px === C.lime) lime.push(i); }
        expect(amber.length, `facing ${fc}: the arrows line is drawn`).toBe(litInTheClear("1 ARROW IDLES", C.amber));
        expect(Math.min(...amber, ...lime)).toBeGreaterThanOrEqual(hb.x);
        expect(Math.max(...amber, ...lime)).toBeLessThan(hb.x + hb.w);
      }
    });
  });
});

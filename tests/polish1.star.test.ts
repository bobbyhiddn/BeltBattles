// POLISH-1 (REQ-BFG-089; BRIEF-POLISH1 P5b; cap's answer 2 on ENCHANT-2W's read, REVIEW-ENCHANT2W.md:76): the panel's (i).
//  The (i) glyph reads as "more about this piece", not as a 1 (desk readers took the bare "i" for the star level): a ring round a dot and a stem, in the same 5x7 box and place as the bare "i" it replaces.
//  (P5a, the title's star at ★1, is not in this commit: O/patches/p5a-titles.diff, O/patches/polish1.star.test.ts.full.)
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { drawInfoGlyph } from "../src/screens/build/keywords";
import { C } from "../src/render/palette";

installRaster();

describe("POLISH-1 P5b: the (i) glyph is a ring round a dot and a stem, in the old glyph's 5x7 box", () => {
  const draw = (colour: string): (string | null)[][] => {
    const c = fresh(12, 12);
    // the box the keyword layer inks: (qb.x + 11, qb.y + 9) 5x7; the glyph's (x, y) is the box + (1, 1). Here the box is at (3, 2).
    drawInfoGlyph(G(c), 4, 3, colour);
    return Array.from({ length: 12 }, (_, y) => Array.from({ length: 12 }, (_, x) => c.at(x, y)));
  };

  it("the pixels: a 5 wide, 7 tall ring (corners open) with the dot at (2, 2) and the stem at (2, 4)-(2, 5); nothing outside the box", () => {
    const px = draw(C.brass3);
    const want = [
      ".###.",
      "#...#",
      "#.#.#",
      "#...#",
      "#.#.#",
      "#.#.#",
      ".###.",
    ];
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const inBox = x >= 3 && x < 8 && y >= 2 && y < 9;
      const lit = inBox && want[y - 2][x - 3] === "#";
      expect(px[y][x], `(${x},${y})`).toBe(lit ? C.brass3 : null);
    }
  });

  it("it is not the bare i: no stem on a foot, no serif (the glyph the desk readers took for a 1); lit in yellow when the view is open", () => {
    const px = draw(C.yellow);
    const rows = px.map((r) => r.map((p) => (p ? "#" : ".")).join(""));
    expect(rows.slice(2, 9).map((r) => r.slice(3, 8))).not.toContain("..#..");
    expect(rows.slice(2, 9).filter((r) => r.slice(3, 8) === "#...#").length).toBeGreaterThanOrEqual(2); // the ring's sides show as sides
    expect(px[3][3]).toBe(C.yellow);
  });
});

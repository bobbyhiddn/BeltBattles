// POLISH-1 (REQ-BFG-085; BRIEF-POLISH1 P6, FONT-W): the 3x5 face's W reads as a W.
//  ENCHANT-2W's read found the old W (`#.#|#.#|###|###|#.#`, the M turned over) read as H at phone size: SWIFT as SHIFT, WIDE as HIDE, WHICH and WARLORD too. It was ONE pixel from H.
//  The new W keeps its 3 columns (no text width moves, so no wrap, fit pin or text-sheet line moves) and fills its lower three rows; H, M, N and the 5x7 face's W are untouched.
//  (The candidates and the quick read that chose it: O/REPORT.md, P6; the glyph-pixel pins that moved: tests/replay1b.test.ts, old -> new in its comments.)
import { describe, expect, it } from "vitest";
import { drawText, glyphRows, textWidth } from "../src/render/font";
import { G, fresh, installRaster } from "./raster.helpers";

installRaster();

const rows = (ch: string, font: "3" | "5"): string[] => glyphRows(ch, font)!;
const dist = (a: string[], b: string[]): number => a.reduce((n, r, y) => n + [...r].filter((c, x) => c !== b[y][x]).length, 0);

describe("POLISH-1 P6: the 3x5 face's W", () => {
  it("is `#.#|#.#|###|###|###`: 3 columns, 5 rows, the lower three rows solid", () => {
    expect(rows("W", "3")).toEqual(["#.#", "#.#", "###", "###", "###"]);
  });

  it("H, M, N, U and V keep their bitmaps in the 3x5 face; the 5x7 face's W is untouched", () => {
    expect(rows("H", "3")).toEqual(["#.#", "#.#", "###", "#.#", "#.#"]);
    expect(rows("M", "3")).toEqual(["#.#", "###", "###", "#.#", "#.#"]);
    expect(rows("N", "3")).toEqual(["##.", "#.#", "#.#", "#.#", "#.#"]);
    expect(rows("U", "3")).toEqual(["#.#", "#.#", "#.#", "#.#", "###"]);
    expect(rows("V", "3")).toEqual(["#.#", "#.#", "#.#", "#.#", ".#."]);
    expect(rows("W", "5")).toEqual(["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."]);
  });

  it("no text width moves: the glyph is 3 wide as the old one was (WARLORD 27 px, SWIFT 19 px, WIDE 15 px, NEW 11 px in the 3x5 face)", () => {
    expect(textWidth("WARLORD", "3")).toBe(27);
    expect(textWidth("SWIFT", "3")).toBe(19);
    expect(textWidth("WIDE", "3")).toBe(15);
    expect(textWidth("NEW", "3")).toBe(11);
    expect(textWidth("W", "3")).toBe(3);
  });

  it("is told from H by its bottom row (H's is open) and by 2 pixels (the old W was 1 from H); W is no closer than 2 to M, N, U or V", () => {
    const w = rows("W", "3");
    expect(w[4]).toBe("###");
    expect(rows("H", "3")[4]).toBe("#.#");
    expect(dist(w, rows("H", "3"))).toBe(2);
    expect(dist(["#.#", "#.#", "###", "###", "#.#"], rows("H", "3"))).toBe(1); // the glyph this replaces
    for (const ch of ["M", "N", "U", "V"]) expect(dist(w, rows(ch, "3")), `W against ${ch}`).toBeGreaterThanOrEqual(2);
  });

  it("drawn by the game's own drawText at phone scale (x3): SWIFT and SHIFT differ in exactly the W's lower rows, in the 3x5 face", () => {
    const draw = (s: string): (string | null)[][] => {
      const c = fresh(textWidth(s, "3") * 3, 15);
      drawText(G(c), s, 0, 0, "#D0CEB7", { font: "3", scale: 3 });
      return Array.from({ length: 15 }, (_, y) => Array.from({ length: c.width }, (_, x) => c.at(x, y)));
    };
    const a = draw("SWIFT"), b = draw("SHIFT");
    let differ = 0;
    for (let y = 0; y < 15; y++) for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b[y][x]) { differ++; expect(y, `a differing pixel at (${x}, ${y})`).toBeGreaterThanOrEqual(9); } // rows 3 and 4 of the glyph, x3
    expect(differ).toBe(2 * 3 * 3); // the two lower middle pixels of the W, 3x3 device px each
  });
});

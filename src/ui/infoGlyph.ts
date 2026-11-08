// POLISH-2 (REQ-BFG-089; Q3, POLISH-1's follow-up F-a): THE ONE ⓘ GLYPH. Every info button on a screen draws this mark: the part panel's corner button
// (build/keywords.ts drawInfoGlyph), the event cards' `?` (event/wordInfo.ts drawInfoButton), LAST CHANCE's cards (lastChancePicker.ts drawInfo) and the road's
// drop list (fork/drops.ts drawInfoBox). Each keeps its own box, size and colours; only the mark is shared, so a player meets one button, not two.
//
// POLISH-1 (P5b) picked the mark by a blind read of three candidates on real panels: the 5x7 face's own `?` read as "more about this piece" by 7 of 8 seats
// (a ring round an i was read as a letter badge by 6 of 8, a filled badge with the i cut out as a padlock or an 8 by 8 of 8; no seat took the `?` for a number
// or a level). It is drawn here from the rows below, not from the font, so the font needs no new glyph: tests/polish1.star.test.ts pins the rows equal to
// glyphRows("?", "5"), and tests/polish2.glyph.test.ts pins every drawer to them.

import type { G } from "../render/pixel";
import { rect } from "../render/pixel";

/** The `?` of the 5x7 face: 5 wide, 7 tall (the hook at the top, the stem, a blank row, the dot). */
export const INFO_GLYPH: readonly string[] = [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."];

/** The mark's size in art px. */
export const INFO_GLYPH_W = 5;
export const INFO_GLYPH_H = 7;

/** Draw the mark with its top-left pixel at (x, y), one lit pixel each, in `colour`. */
export function drawInfoMark(g: G, x: number, y: number, colour: string): void {
  INFO_GLYPH.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === "#") rect(g, x + i, y + j, 1, 1, colour);
  });
}

/** The mark's top-left inside a bordered box `r` (1 px border): centred in the interior, rounded down (an 11 px box: (3, 2); a 9 px box: (2, 1)). */
export function infoMarkAt(r: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  return { x: r.x + 1 + Math.floor((r.w - 2 - INFO_GLYPH_W) / 2), y: r.y + 1 + Math.floor((r.h - 2 - INFO_GLYPH_H) / 2) };
}

/** Draw the mark centred in the 1 px bordered box `r`. */
export function drawInfoMarkIn(g: G, r: { x: number; y: number; w: number; h: number }, colour: string): void {
  const p = infoMarkAt(r);
  drawInfoMark(g, p.x, p.y, colour);
}

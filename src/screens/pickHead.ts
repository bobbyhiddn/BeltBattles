// TXT-AZ (REQ-BFG-073; REVIEW-STAGE097 R5): the pickers' title block on a plate. The LAST CHANCE picker (lastChancePicker.ts)
// and the dawn rune picker (runePicker.ts) draw the same title block over the dimmed build screen: the title at `top` (5x7,
// outlined), a line at top + 11 (5x7), a hint at top + 22 (3x5), and their first card at top + 33 (lcLayout, pickLayout).
// On the 1920x1080 desk that block sat over the dimmed shop row, so dimmed card names showed through beside the hint. Both
// pickers now draw it on the cards' own panel ("dark"), the cards' width, so it reads on a clean ground whatever the build
// screen holds under it; the phone, clean before, stays clean. Only the ground is new: no line, card or layout moves.
import type { G } from "../render/pixel";
import { panel, type Rect } from "../ui/ui";

/** How far the plate starts above the title's `top`, and its height: from top - 6 to top + 32, so it meets the first card
 *  (top + 33). Its bevel takes 3 rows at each edge (ui.ts bevel2), so its fill runs from top - 3 (above the title's outline
 *  at top - 1) to top + 29 (the hint's last row is top + 26). AZ-PREP (REQ-BFG-073; REVIEW-TXTAZ N1, BRIEF-AZPREP 2 (e)):
 *  was 36 tall, ending 3 px above the first card, and on the desk (x5) that 15 px strip showed the dimmed shop cards'
 *  first lines; the plate now closes it on both pickers. No line, card or layout moves. */
export const PLATE_ABOVE = 6;
export const PLATE_H = 39;

/** The plate behind the title block of a picker whose cards are `cardW` wide, centred on a screen `W` wide (lcLayout's and
 *  pickLayout's x). Pure (tests). */
export function titlePlate(W: number, top: number, cardW: number): Rect {
  return { x: Math.round(W / 2 - cardW / 2), y: top - PLATE_ABOVE, w: cardW, h: PLATE_H };
}

/** Draw the plate: the cards' panel. The caller draws it after its scrim and before its title block's text. */
export function drawTitlePlate(g: G, W: number, top: number, cardW: number): void {
  panel(g, titlePlate(W, top, cardW), "dark");
}

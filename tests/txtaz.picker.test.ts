// TXT-AZ item 6 (REQ-BFG-073; REVIEW-STAGE097 R5): the LAST CHANCE picker's title block (LAST CHANCE, "+1 LIFE. PICK ONE.
// FREE." and "DUSK OF DAY n · TAP TO READ") sat over the dimmed shop row on the 1920x1080 desk. Both pickers (the dawn rune
// picker draws the same block: PICK A RUNE, its dawn line, its hint) now draw it on the cards' own panel, the cards' width
// (pickHead.ts titlePlate), after the scrim and before the text: one plate for both. Pinned here: the plate covers the
// block's every row inside its fill and meets the first card (AZ-PREP; was 3 px clear), at the screens the game runs on (the desk with and
// without the rune row, the phone, LC-1's portrait and landscape bounds); every title line fits inside it; it is the cards'
// panel; and both pickers draw it in that order. No layout moved (the first card and the title where they were).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { textWidth } from "../src/render/font";
import { panel } from "../src/ui/ui";
import { LC_LINE, LC_TITLE, lcHint, lcLayout } from "../src/screens/lastChancePicker";
import { PICK_TITLE, pickDawn, pickHint, pickLayout } from "../src/screens/runePicker";
import { PLATE_ABOVE, PLATE_H, drawTitlePlate, titlePlate } from "../src/screens/pickHead";
import type { G } from "../src/render/pixel";

const ROOT = new URL("..", import.meta.url).pathname;
/** The screens (game px): the desk 1920x1080 with the rune row (640x360) and without (480x270), the phone 390x844 (234x506),
 *  LC-1's portrait and landscape bounds (292x633, 844x390). */
const SCREENS: [number, number][] = [[640, 360], [480, 270], [234, 506], [292, 633], [844, 390]];
/** The title block's rows: the title's outline (top - 1) to the hint's last row (3x5 at top + 22: top + 26). */
const BLOCK = { from: -1, to: 26 };
/** A G that records each filled rect: [colour, x, y, w, h]. */
function recorder(): { g: G; calls: [string, number, number, number, number][] } {
  const calls: [string, number, number, number, number][] = [];
  const g = { fillStyle: "", globalAlpha: 1, fillRect(x: number, y: number, w: number, h: number) { calls.push([String(this.fillStyle), x, y, w, h]); } };
  return { g: g as unknown as G, calls };
}

describe("TXT-AZ item 6: the pickers' title block on a clean ground (REQ-BFG-073; REVIEW-STAGE097 R5)", () => {
  // AZ-PREP (REVIEW-TXTAZ N1; BRIEF-AZPREP 2 (e)): the plate meets the first card (was 3 px clear of it: on the desk that strip
  // showed the dimmed shop cards' first lines); PLATE_H 36 -> 39
  it("the plate: the cards' x and width, the block's every row inside its fill, meeting the first card, on every screen", () => {
    const tall = 31 + 3 * 9 + 1 + 4 * 7 + 13 + 4; // lc1.ui's tallest card
    for (const [W, H] of SCREENS) {
      const layouts = [
        { name: "lc", L: lcLayout(W, H, [44, 44, 44]) }, { name: "lc tall", L: lcLayout(W, H, [tall, 44, 44]) },
        { name: "rune", L: pickLayout(W, H, ["iron_skin", "tar_barrel", "coin_purse"], -1, 0) },
        { name: "rune 9 held", L: pickLayout(W, H, ["iron_skin", "tar_barrel"], 0, 9) },
      ];
      for (const { name, L } of layouts) {
        const p = titlePlate(W, L.top, L.cardW), c0 = L.cards[0], at = `${W}x${H} ${name}`;
        expect([p.x, p.w], at).toEqual([c0.x, c0.w]);
        // the fill (inside bevel2's 3 rows at each edge) holds the block
        expect(p.y + 3, at).toBeLessThanOrEqual(L.top + BLOCK.from);
        expect(p.y + p.h - 4, at).toBeGreaterThanOrEqual(L.top + BLOCK.to);
        expect(c0.y - (p.y + p.h), at).toBe(0);
        expect(c0.y, at).toBe(L.top + 33); // the layouts are as they were: the first card 33 px under the title
      }
    }
    expect([PLATE_ABOVE, PLATE_H]).toEqual([6, 39]);
  });

  it("every title line fits inside the plate's fill at the narrowest cards (the phone's), the longest day and tier", () => {
    const fillW = lcLayout(234, 506, [44, 44, 44]).cardW - 6;
    const lines: [string, "5" | "3"][] = [
      [LC_TITLE, "5"], [LC_LINE, "5"], [lcHint(9), "3"],
      [PICK_TITLE, "5"], [pickDawn(10, "legendary").join(""), "5"], [pickHint(3), "3"],
    ];
    for (const [t, font] of lines) expect(textWidth(t, font) + 2, t).toBeLessThanOrEqual(fillW); // + the title's outline
  });

  it("it is the cards' panel (ui.ts panel \"dark\"), drawn whole", () => {
    const a = recorder(), b = recorder();
    drawTitlePlate(a.g, 640, 40, 300);
    panel(b.g, { x: 170, y: 34, w: 300, h: 39 }, "dark");
    expect(a.calls).toEqual(b.calls);
    expect(a.calls[0].slice(1)).toEqual([170, 34, 300, 39]); // its ink edge covers the whole plate
  });

  // BACKDROP-1 (REQ-BFG-073), old -> new: LAST CHANCE's picker no longer calls drawTitlePlate: its title plate is the TOP of lcGround's one "dark" panel (the card column's ground, the plate
  // grown down to the last card's foot: tests/backdrop1.ground.test.ts), drawn at the same place (after the scrim, before the title). The dawn picker keeps drawTitlePlate. Cause: the ground.
  it("both pickers draw it after their scrim and before their title (one plate for both)", () => {
    const MARK = { "src/screens/lastChancePicker.ts": 'panel(g, lcGround(W, H, L), "dark")', "src/screens/runePicker.ts": "drawTitlePlate(g, W, L.top, L.cardW)" };
    for (const [file, title] of [["src/screens/lastChancePicker.ts", "drawText(g, LC_TITLE"], ["src/screens/runePicker.ts", "drawText(g, PICK_TITLE"]] as const) {
      const src = readFileSync(join(ROOT, file), "utf8");
      const scrim = src.indexOf("rect(g, 0, 0, W, H, C.ink)"), plate = src.indexOf(MARK[file]), text = src.indexOf(title);
      expect([scrim > 0, plate > scrim, text > plate], file).toEqual([true, true, true]);
      expect(src.split(MARK[file]).length - 1, file).toBe(1);
    }
    expect(readFileSync(join(ROOT, "src/screens/lastChancePicker.ts"), "utf8").includes("drawTitlePlate("), "LAST CHANCE draws no separate title plate").toBe(false);
  });
});

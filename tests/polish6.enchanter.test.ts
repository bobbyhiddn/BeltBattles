// POLISH-6 P6-4 (REQ-BFG-089; RULING-POLISH5 R7, cap's answer Q5): framed() (tests/polish2.guestCorpus.ts) gets an `enchanter` option: the build screen as the page draws it with the ENCHANTER's wagon up
// (enchantStrip.ts wordLayout on a run at the dawn caravan of an ENCHANTER day, exactly what BuildScreen.layoutAt does after shiftLayout), so a lane report measures the belt panel in BOTH columns. The numbers below are the
// PAGE's own (read from `window.bb.game.screen.L` at the four views: kit/p6pics.mjs scene p6l; kit/p6-cmpL.py compared framed(..., true).L with the page's L key by key: 18 layout keys, 0 differ at all four views).
// At polish5-accepted the ENCHANTER's column is 126x136 (y 132) at 1920x1080, 119x122 at 1366x768, 128x158 at 844x390@3, and 128x324 unchanged at 1280x800 (the margin holds the cards).
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { framed } from "./polish2.guestCorpus";

installRaster();
/** [name, w, h, dpr, the harness's column (w x h), the ENCHANTER's column (x, y, w, h), the row's shift, a word card's rect (w x h)] */
const VIEWS: [string, number, number, number, [number, number], [number, number, number, number], number, [number, number]][] = [
  ["desk 1920x1080", 1920, 1080, 1, [126, 194], [6, 132, 126, 136], 58, [46, 46]],
  ["laptop 1366x768", 1366, 768, 1, [119, 180], [6, 132, 119, 122], 58, [46, 46]],
  ["land 844x390@3", 844, 390, 3, [128, 216], [6, 132, 128, 158], 58, [46, 46]],
  ["desk 1280x800", 1280, 800, 1, [128, 324], [6, 74, 128, 324], 0, [41, 46]], // the margin left of the shop block holds the cards: the column is the same with and without the row
];
describe("POLISH-6 P6-4: framed(..., enchanter) is the build screen with the ENCHANTER's wagon up", () => {
  for (const [name, w, h, dpr, plain, up, shift, card] of VIEWS) {
    it(`${name}: the column is ${plain[0]}x${plain[1]} without the row and ${up[2]}x${up[3]} with it (the row's shift ${shift})`, () => {
      const f = framed(w, h, dpr, 0, 5, false), e = framed(w, h, dpr, 0, 5, true);
      expect(f.enchanter, "the plain frame says so").toBe(false);
      expect(e.enchanter, "the wagon frame says so").toBe(true);
      expect([f.L.info.w, f.L.info.h], "the harness's column").toEqual(plain);
      expect(f.L.wagon, "no wagon in the plain frame").toBeUndefined();
      expect([e.L.info.x, e.L.info.y, e.L.info.w, e.L.info.h], "the ENCHANTER's column as the page draws it").toEqual(up);
      expect(e.L.wagon?.shift).toBe(shift);
      expect([e.L.wagon!.rects[0].w, e.L.wagon!.rects[0].h], "a word card").toEqual(card);
      expect(e.L.wagon!.rects.length).toBe(2);
      // the column is the harness's lowered by the shift, and nothing else moves: the shop, the hull, FIGHT, NEXT BATTLE, the cargo tray
      expect({ x: e.L.info.x, y: e.L.info.y, w: e.L.info.w, h: e.L.info.h }, "the column is the harness's, lowered by the shift").toEqual({ ...f.L.info, y: f.L.info.y + shift, h: f.L.info.h - shift });
      for (const k of ["cards", "reroll", "packs", "hull", "fight", "foe", "cargo", "bar"] as const) expect(e.L[k], k).toEqual(f.L[k]);
      // a word card's tap target on a phone is a finger (44 CSS px) in both directions
      if (e.phone || e.tap > 0) {
        const k = e.view.scale / e.view.dpr;
        for (const hit of e.L.wagon!.hits) expect(Math.min(hit.w, hit.h) * k, "the card's tap target in CSS px").toBeGreaterThanOrEqual(44 - 1e-9);
      }
    });
  }
  it("the plain frame is what it was: no option, no wagon, the same layout object shape (every existing caller)", () => {
    for (const [, w, h, dpr] of VIEWS) {
      const a = framed(w, h, dpr), b = framed(w, h, dpr, 0, 5, false);
      expect(a.L, `${w}x${h}`).toEqual(b.L);
      expect(a.L.wagon).toBeUndefined();
    }
  });
});

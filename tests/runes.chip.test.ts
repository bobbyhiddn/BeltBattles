// FLIP-X1 (F-a, REQ-BFG-069; REVIEW-SUSD F-a, SUS-D finding 6): the rune card's chip word fits its box. runeBar.ts
// drawRuneCard sizes the chip from its keyword word (runeCardChipW): SHIELD's six letters (23 px of the 3x5 face) ran about
// 1 art px past each side of the 22 px box. Every rune in runeList() with sustain on (the 57 in play and SUS-D's 8) is
// drawn into the software raster on the card the picker and the bar's read-out draw, at the phone's width (the op view,
// 402x690 CSS px at DPR 3) and the desk's (1920x1080), and every pixel of its chip word must sit inside the box's ink edge.
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { textWidth } from "../src/render/font";
import { withSustain } from "../src/sim/content";
import { RUNE_LIST, runeList, type RuneDef } from "../src/sim/runes";
import { DORMANT_RUNES, RUNES } from "../src/sim/runes"; // FLIP-X2: the 4 dormant runes (out of runeList(), their cards kept); BAL-2 (the lines): none
import { KEYWORD_WORD, RUNE_KEYWORD_COLOUR, runeKeyword, runeTag, runeTaken } from "../src/ui/runeText";
import { drawRuneCard, readoutW, runeCardChipW, runeCardH } from "../src/ui/runeBar";
import { pickLayout } from "../src/screens/runePicker";
import { buildScale } from "../src/screens/build/layout";

/** A view as computeView frames the build screen: CSS w x h at `dpr` (tests/runes.ui.test.ts's helper). */
function view(w: number, h: number, dpr: number) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05;
  const scale = buildScale(pw, ph, portrait, dpr);
  return { W: Math.floor(pw / scale), H: Math.floor(ph / scale), scale, dpr };
}
const VIEWS = { phone: view(402, 690, 3), desk: view(1920, 1080, 1) };

interface Drawn { inside: number; outside: number; nameX: number }

/** Draw `def`'s card `w` wide (opened, as the picker's opened card and the read-out draw it) and sort its chip word's
 *  pixels: inside the chip box's ink edge, or not. The word's rows only, left of the name column. */
function drawn(def: RuneDef, w: number, sub: string): Drawn {
  const k = runeKeyword(def)!;
  const r = { x: 10, y: 10, w, h: runeCardH(def, w, { reminder: true }) };
  const c = fresh(w + 20, r.h + 20);
  drawRuneCard(G(c), r, def, { sub, reminder: true });
  const cw = runeCardChipW(def), box = { x: r.x + 5, y: r.y + 6, w: cw, h: 22 }, nameX = r.x + 9 + cw;
  const col = RUNE_KEYWORD_COLOUR[k];
  const top = box.y + Math.floor((box.h - 3 - 13) / 2) + 8; // drawRuneChip: the word under the initials
  let inside = 0, outside = 0;
  for (let y = top; y < top + 5; y++) for (let x = 0; x < nameX; x++) {
    if (c.at(x, y) !== col) continue;
    if (x >= box.x + 1 && x < box.x + box.w - 1) inside++;
    else outside++;
  }
  return { inside, outside, nameX };
}

describe("FLIP-X1 F-a: the rune card's chip word fits its box", () => {
  installRaster();

  it("the views: the phone is the op view's 241 art px wide, the desk 1920x1080's", () => {
    expect(VIEWS.phone.W).toBe(241);
    expect(VIEWS.desk.W).toBeGreaterThanOrEqual(300 + 8); // the desk's card is the full 300
  });

  it("every chip word of every rune in runeList() with sustain on sits inside its box, on the phone and the desk", () => {
    withSustain(() => {
      // FLIP-X2 (REVIEW-TUNEX): runeList() leaves the 4 dormant runes out (DORMANT_RUNES: SEARING, SHATTER SHOT, COAL CHUTE,
      // HEAT SINK), 65 -> 61. Their cards still draw (a ghost in the device's local pool may hold one), so the sweep draws
      // them too: the 61 and the 4, all 65 cards as before (was runeList() alone, 65)
      // BAL-2 (the lines: DORMANT_RUNES empty): runeList() holds all 65 again, the four FURNACE runes included, so the
      // sweep's cards are runeList() itself (was the 61 and the 4 dormant)
      const list = runeList();
      expect(list.length).toBe(RUNE_LIST.length + 8); // BAL-2 (the lines: DORMANT_RUNES empty): 57 + 8 = 65 (was 57 + 8 - 4 = 61)
      expect(list.filter((d) => DORMANT_RUNES.has(d.id))).toEqual([]);
      const cards = [...list, ...[...DORMANT_RUNES].map((id) => RUNES[id])];
      expect(cards.length).toBe(RUNE_LIST.length + 8);
      for (const [name, v] of Object.entries(VIEWS)) {
        const w = pickLayout(v.W, v.H, [list[0].id], 0, 0).cardW;
        expect(readoutW(v.W), name).toBe(w); // the bar's read-out is the picker card's width
        for (const d of cards) {
          const k = runeKeyword(d)!;
          const word = KEYWORD_WORD[k];
          for (const sub of [runeTag(d), runeTaken(d, 10)]) {
            const p = drawn(d, w, sub);
            expect(p.inside, `${name} ${d.id} ${word}: drawn`).toBeGreaterThan(0);
            expect(p.outside, `${name} ${d.id} ${word}: past the box`).toBe(0);
            // the name and the sub line clear the chip and fit the card
            expect(p.nameX + textWidth(d.name), `${name} ${d.id} name`).toBeLessThanOrEqual(10 + w - 5);
            expect(p.nameX + textWidth(sub, "3"), `${name} ${d.id} sub`).toBeLessThanOrEqual(10 + w - 5);
          }
          expect(textWidth(word, "3") + 2, `${d.id}: the word within the ink edge`).toBeLessThanOrEqual(runeCardChipW(d));
        }
      }
    });
  });

  // CARD-3 (REQ-BFG-107): the 23 px chip word is SHIELD, which the soak layer's runes (token PLATE) draw now; the one-hit
  // block's runes (token SHIELD) draw WARD (15 px) and keep the 22 px chip. Was "only a SHIELD card's chip widens": WARD
  // STONE, BULWARK WARD, TICK GUARD and SHATTER SHOT at 26
  it("only a card whose chip word is SHIELD (the soak layer's) widens (to 26); every other card keeps the 22 px chip", () => {
    expect([textWidth(KEYWORD_WORD.PLATE, "3"), textWidth(KEYWORD_WORD.SHIELD, "3")]).toEqual([23, 15]); // SHIELD is wider than the 22 px box
    const wide = (list: readonly RuneDef[]) => list.filter((d) => runeCardChipW(d) !== 22).map((d) => [d.id, runeCardChipW(d)]);
    const soak = (list: readonly RuneDef[]) => list.filter((d) => runeKeyword(d) === "PLATE").map((d) => [d.id, 26]);
    expect(soak(RUNE_LIST).length).toBeGreaterThan(0);
    expect(wide(RUNE_LIST)).toEqual(soak(RUNE_LIST)); // switch off
    expect(withSustain(() => wide(runeList()))).toEqual(withSustain(() => soak(runeList())));
    for (const id of ["ward_stone", "bulwark_ward", "tick_guard", "shatter_shot"]) expect(runeCardChipW(RUNES[id]), id).toBe(22);
  });
});

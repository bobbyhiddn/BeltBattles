// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T3): the ASH SHRINE's cards as the event screen draws them: the word's icon and its NAME IN ITS OWN COLOUR on the
// gain chip, whatever part card 2 takes and on every card width the event screen lays out (landscape 138-160, portrait 182-190 logical px). A chip that
// does not fit is dropped by the card's exchange line (cards.ts chip), which would hide the word; this test pins that it is never the word.
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";

installRaster();

import { ITEMS } from "../src/sim/content";
import { ENCHANT_DEFS, ENCHANT_IDS } from "../src/sim/enchant";
import { deltaColour, deltaText, drawChoiceCard, itemName } from "../src/screens/event/cards";
import { eventLayout } from "../src/screens/event/layout";
import { SHRINE_HULL } from "../src/game/shrine";
import type { Choice } from "../src/game/eventDefs";

const view = { hover: false, pressed: false, state: "open" as const, won: false, shake: 0, t: 0, flash: false };

/** How many px of `colour` the exchange line (the row band under the label) holds. */
function colourPx(c: RasterCanvas, x: number, y: number, w: number, colour: string): number {
  let n = 0;
  for (let yy = y + 20; yy < y + 33; yy++) for (let xx = x; xx < x + w; xx++) if (c.at(xx, yy) === colour) n++;
  return n;
}

const CARGO_PARTS = Object.values(ITEMS).filter((d) => d.kind !== "turret" && d.kind !== "supply" && d.merchant).map((d) => d.id);

describe("the shrine's cards: the word is always on the card", () => {
  // the narrowest cards the event screen lays out: landscape W >= 440 (3 cards of 138), portrait W >= 190 (one card across, 182)
  const widths: [number, number][] = [[eventLayout(440, 250, false, 3).cards[0].w, 50], [160, 50], [eventLayout(190, 330, true, 3).cards[0].w, 42], [190, 42]];

  it("the layout's narrowest cards are 138 (desk) and 182 (phone) logical px wide", () => {
    expect(widths[0][0]).toBe(138);
    expect(widths[2][0]).toBe(182);
  });

  it("card 1 (-hull, word A): the word's name is drawn in its colour for every word on every card width", () => {
    for (const [w, h] of widths) {
      for (const id of ENCHANT_IDS) {
        const card: Choice = { label: "OFFER HULL", cost: [{ k: "hull", n: SHRINE_HULL }], gain: [{ k: "ench", word: id }], note: "YOU CHOOSE THE PART" };
        const c = fresh(w + 8, h + 10);
        drawChoiceCard(G(c), { x: 3, y: 4, w, h }, card, 0, view);
        expect(colourPx(c, 3, 4, w, ENCHANT_DEFS[id].color), `${id} on ${w}x${h}`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("card 2 (a cargo part, word B): the word survives the longest part names on the narrowest cards", () => {
    const names = CARGO_PARTS.map((d) => ({ d, w: itemName(d).length })).sort((a, b) => b.w - a.w);
    const longest = names.slice(0, 6).map((n) => n.d);
    const lost: string[] = [];
    for (const [w, h] of widths) {
      for (const id of ENCHANT_IDS) {
        for (const def of longest) {
          const card: Choice = { label: "OFFER A PART", cost: [{ k: "item", def, uid: 1, from: "cargo" }], gain: [{ k: "ench", word: id }], note: "YOU CHOOSE THE PART" };
          const c = fresh(w + 8, h + 10);
          drawChoiceCard(G(c), { x: 3, y: 4, w, h }, card, 1, view);
          if (colourPx(c, 3, 4, w, ENCHANT_DEFS[id].color) < 8) lost.push(`${id}/${def}@${w}`);
        }
      }
    }
    expect(lost).toEqual([]);
  });

  it("the chip text names the word and the colour is the word's; any other chip keeps its own colour", () => {
    expect(deltaText({ k: "ench", word: "fiery" }, false)).toBe("FIERY");
    expect(deltaColour({ k: "ench", word: "fiery" })).toBe(ENCHANT_DEFS.fiery.color);
    expect(deltaColour({ k: "hull", n: 100 })).toBeNull();
    expect(deltaText({ k: "ench", word: "zzz" }, false)).toBe("ZZZ"); // a forged id falls back to its own letters
  });
});

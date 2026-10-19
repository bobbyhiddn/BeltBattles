// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T3): the ASH SHRINE's cards as the event screen draws them: the word's icon and its NAME IN ITS OWN COLOUR on the
// gain chip, whatever part card 2 takes and on every card width the event screen lays out (landscape 138-160, portrait 182-190 logical px). A chip that
// does not fit is dropped by the card's exchange line (cards.ts chip), which would hide the word; this test pins that it is never the word.
// The T6 fix round (words only; E2-01, E2-01b) adds: card 2 names what it takes with a count (`1 TEMPER`, never at the cost of a name the card showed
// before), says where the part comes from (OFFER CARGO PART) and what is missing when it is blocked (NOTHING IN CARGO TO OFFER), both word cards say which
// part gets the word, and every one of those lines fits every card width and the `?` button's corner.
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";

installRaster();

import { ITEMS } from "../src/sim/content";
import { ENCHANT_DEFS, ENCHANT_IDS } from "../src/sim/enchant";
import { chipText, choiceLabel, deltaColour, deltaIcon, deltaText, drawChoiceCard, exchangeForm, itemName } from "../src/screens/event/cards";
import { eventLayout } from "../src/screens/event/layout";
import { infoButton } from "../src/screens/event/wordInfo";
import { SHRINE_HULL, SHRINE_NOTE, SHRINE_NO_PART, SHRINE_NO_TAKER } from "../src/game/shrine";
import { textWidth, drawText } from "../src/render/font";
import { C } from "../src/render/palette";
import { hasGrid } from "../src/ui/shapePic";
import type { Choice, Delta } from "../src/game/eventDefs";

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
        const card: Choice = { label: "OFFER HULL", cost: [{ k: "hull", n: SHRINE_HULL }], gain: [{ k: "ench", word: id }], note: SHRINE_NOTE };
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
          const card: Choice = { label: "OFFER A PART", cost: [{ k: "item", def, uid: 1, from: "cargo" }], gain: [{ k: "ench", word: id }], note: SHRINE_NOTE };
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

describe("T6 fix round (words only): card 2 names what it takes, with a count", () => {
  const temper: Delta = { k: "item", def: "temper", uid: 1, from: "cargo" };
  const card = (def: string, word = "wide"): Choice => ({ label: "OFFER A PART", cost: [{ k: "item", def, uid: 1, from: "cargo" }], gain: [{ k: "ench", word }], note: SHRINE_NOTE });

  it("a card that gains a word reads the part it takes as `1 TEMPER`; every other chip is deltaText, as before", () => {
    expect(chipText(temper, true, 4, false, true)).toBe("1 TEMPER");
    expect(chipText(temper, true, 4, true, true)).toBe(""); // the icon alone (bare): the T3 fallback
    expect(chipText(temper, true, 4, false)).toBe("TEMPER"); // a card that gains no word (the TRADER's, every ENCHANT-off card)
    expect(chipText({ k: "item", def: "temper" }, false, 4, false, true)).toBe("TEMPER"); // a part a card GIVES carries no count
    for (const d of [{ k: "hull", n: SHRINE_HULL }, { k: "gold", n: 3 }, { k: "ench", word: "fiery" }, { k: "belt", n: 2 }] as Delta[]) {
      expect(chipText(d, true, 4, false, true), JSON.stringify(d)).toBe(deltaText(d, true, 4));
      expect(chipText(d, false, 4, false, false), JSON.stringify(d)).toBe(deltaText(d, false, 4));
    }
  });

  it("exchangeForm: a card with no word is null (drawn as before); with a word it is count, then name, then bare as the room shrinks, never skipping a step", () => {
    expect(exchangeForm({ label: "SELL", cost: [temper], gain: [{ k: "gold", n: 3 }] }, 40, 4)).toBeNull();
    expect(exchangeForm({ label: "MOVE ON", cost: [], gain: [] }, 40, 4)).toBeNull();
    const longest = CARGO_PARTS.slice().sort((a, b) => textWidth(itemName(b), "3") - textWidth(itemName(a), "3"))[0];
    const seq: string[] = [];
    for (let w = 40; w <= 260; w++) seq.push(exchangeForm(card(longest, "echoing"), w, 4)!);
    const order = ["bare", "name", "count"];
    expect(seq.map((f) => order.indexOf(f))).toEqual(seq.map((f) => order.indexOf(f)).sort((a, b) => a - b)); // monotone: more room never shows less
    expect(new Set(seq)).toEqual(new Set(order));
    // the count costs exactly its own glyphs: the `name` band is as wide as `1 ` is
    expect(seq.filter((f) => f === "name").length).toBe(textWidth(`1 ${itemName(longest)}`, "3") - textWidth(itemName(longest), "3"));
  });

  it("no card shows a name less than T3 showed: the cards that fall to the icon alone are exactly the ones that did before the count", () => {
    const ic = deltaIcon(temper).width;
    for (const w of [138, 152, 160, 182, 190, 193]) {
      for (const id of ENCHANT_IDS) {
        for (const def of CARGO_PARTS) {
          // T3's rule, written out: the whole line with every part named (no `1 `) must fit in the card's exchange room, else the icon alone
          const was = ic + 2 + textWidth(itemName(def), "3") + 5 + 7 + (deltaIcon({ k: "ench", word: id }).width + 2 + textWidth(ENCHANT_DEFS[id].name, "3") + 5) > w - 10;
          expect(exchangeForm(card(def, id), w - 10, 4) === "bare", `${id}/${def}@${w}`).toBe(was);
        }
      }
    }
  });

  it("on the cards the pictures use (the desk's 152 px and the phone's 193 px) the TEMPER card says `1 TEMPER`, and on the narrowest cards it does too", () => {
    for (const w of [138, 152, 160, 182, 190, 193]) for (const id of ENCHANT_IDS) expect(exchangeForm(card("temper", id), w - 10, 4), `${id}@${w}`).toBe("count");
  });

  it("the count is drawn: the card's exchange band holds the glyph `1` more than the same card one px narrower (name form), nothing else moves", () => {
    // the longest name of a part with no grid plate (a plate takes room from the exchange line, which this test measures by the card's width)
    const longest = CARGO_PARTS.filter((d) => !hasGrid(d)).sort((a, b) => textWidth(itemName(b), "3") - textWidth(itemName(a), "3"))[0];
    // the widest room at which the card is still in its name form, and the narrowest at which it is in its count form (r.w - 10 is the room)
    let wName = 0, wCount = 0;
    for (let room = 40; room <= 260; room++) {
      const f = exchangeForm(card(longest, "wide"), room, 4);
      if (f === "name") wName = room;
      if (f === "count" && !wCount) wCount = room;
    }
    expect(wCount).toBe(wName + 1);
    const draw = (room: number): RasterCanvas => {
      const w = room + 10, c = fresh(w + 8, 60);
      drawChoiceCard(G(c), { x: 3, y: 4, w, h: 50 }, card(longest, "wide"), 1, view);
      return c;
    };
    const redIn = (c: RasterCanvas, w: number): number => colourPx(c, 3, 4, w, C.red);
    const one = fresh(10, 10);
    drawText(G(one), "1", 1, 1, C.red, { font: "3" });
    let glyph = 0;
    for (let i = 0; i < one.px.length; i++) if (one.px[i] === C.red) glyph++;
    expect(glyph).toBeGreaterThan(3);
    expect(redIn(draw(wCount), wCount + 10) - redIn(draw(wName), wName + 10)).toBe(glyph);
  });
});

describe("T6 fix round (words only): the shrine's lines fit every card width the event screen lays out", () => {
  // desk: 138 (W 440), 152 (the 1280x800 desk at scale 2), 160 (the widest); phone portrait: 182 (W 190), 190, 193 (the phone's 402 css px at scale 2: W 201)
  const WIDTHS: [number, number][] = [[138, 50], [152, 50], [160, 50], [182, 42], [190, 42], [193, 42]];
  const hullCard = (id: string): Choice => ({ label: "OFFER HULL", cost: [{ k: "hull", n: SHRINE_HULL }], gain: [{ k: "ench", word: id }], note: SHRINE_NOTE });
  const partCard = (def: string, id: string): Choice => ({ label: "OFFER A PART", cost: [{ k: "item", def, uid: 1, from: "cargo" }], gain: [{ k: "ench", word: id }], note: SHRINE_NOTE });
  const blocked: Choice = { label: "OFFER A PART", cost: [], gain: [], blocked: SHRINE_NO_PART };

  it("the strings are the fix round's", () => {
    expect(SHRINE_NOTE).toBe("YOU CHOOSE WHICH PART GETS IT");
    expect(SHRINE_NO_PART).toBe("NOTHING IN CARGO TO OFFER");
    expect(choiceLabel("OFFER A PART")).toBe("OFFER CARGO PART"); // display only: the Choice's label stays OFFER A PART
    expect(choiceLabel("OFFER HULL")).toBe("OFFER HULL");
    expect(choiceLabel("MOVE ON")).toBe("MOVE ON");
    expect(choiceLabel("PLATING")).toBe("HULL PATCH"); // CARD-3's own entry is untouched
  });

  it("the note and the blocked reasons fit the note line (3x5, card width - 10); the labels end before the ? button's corner (5x7 from x + 16)", () => {
    for (const [w] of WIDTHS) {
      for (const s of [SHRINE_NOTE, SHRINE_NO_PART, SHRINE_NO_TAKER]) expect(textWidth(s, "3"), `${s} @${w}`).toBeLessThanOrEqual(w - 10);
      const btn = infoButton({ x: 0, y: 0, w, h: 50 }).btn;
      for (const label of ["OFFER HULL", "OFFER A PART", "MOVE ON"]) {
        const end = 16 + textWidth(choiceLabel(label), "5") + 1; // the label starts at x + 16; its outline adds a pixel
        expect(end + 2, `${label} @${w}`).toBeLessThanOrEqual(btn.x);
      }
    }
  });

  it("nothing is drawn past a card's right edge: the word cards (every word, the longest parts), the blocked card and MOVE ON, on every width", () => {
    const longest = CARGO_PARTS.slice().sort((a, b) => textWidth(itemName(b), "3") - textWidth(itemName(a), "3")).slice(0, 4);
    const spill: string[] = [];
    for (const [w, h] of WIDTHS) {
      const cards: Choice[] = [blocked, { label: "MOVE ON", cost: [], gain: [] }, ...ENCHANT_IDS.map(hullCard), ...ENCHANT_IDS.flatMap((id) => ["temper", ...longest].map((d) => partCard(d, id)))];
      for (const [i, card] of cards.entries()) {
        const c = fresh(w + 14, h + 10);
        drawChoiceCard(G(c), { x: 3, y: 4, w, h }, card, i % 3, view);
        for (let yy = 0; yy < h + 10; yy++) for (let xx = 3 + w; xx < w + 14; xx++) if ((c.at(xx, yy) ?? null) !== null) spill.push(`${card.label}#${i}@${w}: ${xx},${yy}`);
        expect(c.oob, `${card.label}#${i}@${w} painted outside the canvas`).toBe(0);
      }
    }
    expect(spill.slice(0, 5)).toEqual([]);
  });

  it("the blocked card draws the new reason in red on the note line, and the word cards draw the note in the quiet colour", () => {
    for (const [w, h] of WIDTHS) {
      const noteBand = (c: RasterCanvas, colour: string): number => {
        let n = 0;
        for (let yy = 4 + h - 9; yy < 4 + h - 4; yy++) for (let xx = 3; xx < 3 + w; xx++) if (c.at(xx, yy) === colour) n++;
        return n;
      };
      const cb = fresh(w + 8, h + 10);
      drawChoiceCard(G(cb), { x: 3, y: 4, w, h }, blocked, 1, view);
      expect(noteBand(cb, C.red), `blocked @${w}`).toBeGreaterThan(40);
      const ref = fresh(140, 10);
      drawText(G(ref), SHRINE_NO_PART, 1, 1, C.red, { font: "3" });
      let want = 0;
      for (const p of ref.px) if (p === C.red) want++;
      expect(noteBand(cb, C.red), `blocked @${w}: the whole reason is drawn, none of it cut`).toBe(want);
      const cn = fresh(w + 8, h + 10);
      drawChoiceCard(G(cn), { x: 3, y: 4, w, h }, partCard("temper", "wide"), 1, view);
      const ref2 = fresh(140, 10);
      drawText(G(ref2), SHRINE_NOTE, 1, 1, C.slate4, { font: "3" });
      let want2 = 0;
      for (const p of ref2.px) if (p === C.slate4) want2++;
      expect(noteBand(cn, C.slate4), `note @${w}`).toBe(want2);
    }
  });
});

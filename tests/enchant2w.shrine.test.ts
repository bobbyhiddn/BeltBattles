// ENCHANT-2W (REQ-BFG-085; BRIEF-ENCHANT2W W1, W2): the ASH SHRINE's cards after ENCHANT-2's cold read.
//   W1 (E2-01): card 2 reads the part it takes as `1x TEMPER`, the game's own count form (`3x DMG`), where the line has the room; the three tiers stay (count, else the
//      name, else the icon alone), and no card shows a name less than ENCHANT-2's T3 showed. Fit table: every cargo part x every word x every card width.
//   W2 (E2-01b): the blocked card 2 (nothing in cargo) drew `FREE -> NOTHING`, which is false (the card costs a cargo part and gives word B). It now draws the line the
//      card WOULD have, dimmed as a blocked card's chips are: the crate, `1x CARGO PART`, the arrow, word B's icon and name; the red reason stays. Drawing only: the
//      Choice's data (shrine.ts shrineChoices) is exactly what it was, and every other card draws exactly as before.
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";

installRaster();

import { ITEMS } from "../src/sim/content";
import { ENCHANT_DEFS, ENCHANT_IDS, withEnchant, type EnchantId } from "../src/sim/enchant";
import {
  SHRINE_COUNT, SHRINE_GHOST_PART, chipText, deltaIcon, deltaText, drawChoiceCard, exchangeForm, ghostForm, ghostText, isShrineBlockedPart, itemName, type GhostForm,
} from "../src/screens/event/cards";
import { eventLayout } from "../src/screens/event/layout";
import { infoButton } from "../src/screens/event/wordInfo";
import { SHRINE_HULL, SHRINE_NOTE, SHRINE_NO_PART, SHRINE_NO_TAKER, shrineChoices, shrineOffer } from "../src/game/shrine";
import { makeEvent } from "../src/game/events";
import { newRun } from "../src/game/run";
import { textWidth, drawText } from "../src/render/font";
import { crateIcon } from "../src/render/eventArt";
import { C } from "../src/render/palette";
import { hasGrid } from "../src/ui/shapePic";
import type { Choice, Delta } from "../src/game/eventDefs";

const view = { hover: false, pressed: false, state: "open" as const, won: false, shake: 0, t: 0, flash: false };
/** every card layout the event screen draws: desk 138 (3 cards at W 440), 152 (the 1280x800 desk at scale 2: W 640), 160 (a 2-card event's cap), phone 182 (W 190), 190, 193 (402 css px at scale 2: W 201) */
const WIDTHS: [number, number][] = [[138, 50], [152, 50], [160, 50], [182, 42], [190, 42], [193, 42]];
const CARGO_PARTS = Object.values(ITEMS).filter((d) => d.kind !== "turret" && d.kind !== "supply" && d.merchant).map((d) => d.id);

const partCard = (def: string, word: string): Choice => ({ label: "OFFER A PART", cost: [{ k: "item", def, uid: 1, from: "cargo" }], gain: [{ k: "ench", word }], note: SHRINE_NOTE });
const hullCard = (word: string): Choice => ({ label: "OFFER HULL", cost: [{ k: "hull", n: SHRINE_HULL }], gain: [{ k: "ench", word }], note: SHRINE_NOTE });
const BLOCKED: Choice = { label: "OFFER A PART", cost: [], gain: [], blocked: SHRINE_NO_PART };
const MOVE_ON: Choice = { label: "MOVE ON", cost: [], gain: [] };

/** px of `colour` in the exchange line's band (the rows 20..32 under the card's top, as tests/enchant2.shrine.cards.test.ts reads it). */
function bandPx(c: RasterCanvas, x: number, y: number, w: number, colour: string): number {
  let n = 0;
  for (let yy = y + 20; yy < y + 33; yy++) for (let xx = x; xx < x + w; xx++) if (c.at(xx, yy) === colour) n++;
  return n;
}
/** the glyph pixels of `s` in the 3x5 face, in `colour` */
function glyphPx(s: string, colour: string): number {
  const c = fresh(textWidth(s, "3") + 4, 9);
  drawText(G(c), s, 1, 1, colour, { font: "3" });
  return c.px.filter((p) => p === colour).length;
}

/** PRESENT-3 R (a): the ink of the road card's arrow, the 5x7 face's `→` (cards.ts arrow()): 1 + 1 + 5 + 1 + 1 px. */
const ARROW_INK = 9;

describe("W1: card 2 reads `1x TEMPER` (the game's own count form)", () => {
  const temper: Delta = { k: "item", def: "temper", uid: 1, from: "cargo" };

  it("the count is `1x`: the chip text of a part a word card takes, and nothing else changes", () => {
    expect(SHRINE_COUNT).toBe("1x");
    expect(chipText(temper, true, 4, false, true)).toBe("1x TEMPER");
    expect(chipText(temper, true, 4, true, true)).toBe(""); // the icon alone
    expect(chipText(temper, true, 4, false)).toBe("TEMPER"); // a card with no word (the TRADER's, every ENCHANT-off card)
    for (const d of [{ k: "hull", n: SHRINE_HULL }, { k: "gold", n: 3 }, { k: "ench", word: "fiery" }, { k: "belt", n: 2 }] as Delta[]) expect(chipText(d, true, 4, false, true), JSON.stringify(d)).toBe(deltaText(d, true, 4));
  });

  it("the three tiers keep their order and their rule: the name tier is exactly ENCHANT-2's T3 line, the count costs `1x ` more and never costs a card a name", () => {
    const ic = deltaIcon(temper).width;
    const t3 = (def: string, id: string, w: number): boolean => ic + 2 + textWidth(itemName(def), "3") + 5 + 7 + (deltaIcon({ k: "ench", word: id }).width + 2 + textWidth(ENCHANT_DEFS[id as EnchantId].name, "3") + 5) > w;
    let count = 0, name = 0, bare = 0;
    for (const [cw] of WIDTHS) {
      for (const id of ENCHANT_IDS) {
        for (const def of CARGO_PARTS) {
          const f = exchangeForm(partCard(def, id), cw - 10, 4);
          expect(f === "bare", `${id}/${def}@${cw}: the icon alone exactly where T3's whole line did not fit`).toBe(t3(def, id, cw - 10));
          if (f === "count") {
            count++;
            // the count form fits whole: the line with `1x ` is no wider than the room
            expect(ic + 2 + textWidth(`${SHRINE_COUNT} ${itemName(def)}`, "3") + 5 + 7 + (deltaIcon({ k: "ench", word: id }).width + 2 + textWidth(ENCHANT_DEFS[id as EnchantId].name, "3") + 5), `${id}/${def}@${cw}`).toBeLessThanOrEqual(cw - 10);
          } else if (f === "name") name++;
          else bare++;
        }
      }
    }
    expect(count + name + bare).toBe(WIDTHS.length * 8 * CARGO_PARTS.length);
    console.log(`ENCHANT-2W W1 fit table: ${CARGO_PARTS.length} cargo parts x 8 words (${CARGO_PARTS.length * 8} pairs) a card width: ${WIDTHS.map(([cw]) => {
      const t = { count: 0, name: 0, bare: 0 };
      for (const id of ENCHANT_IDS) for (const def of CARGO_PARTS) t[exchangeForm(partCard(def, id), cw - 10, 4)!]++;
      return `${cw}px: count ${t.count}, name ${t.name}, icon alone ${t.bare}`;
    }).join("; ")}`);
  });

  it("the TEMPER card (the one the pictures use) says `1x TEMPER` with every word on every card width", () => {
    for (const [cw] of WIDTHS) for (const id of ENCHANT_IDS) expect(exchangeForm(partCard("temper", id), cw - 10, 4), `${id}@${cw}`).toBe("count");
  });

  it("the count is drawn: the band holds the glyphs `1x` more than the same card one px narrower (the name form), nothing else moves; and `1x` is two glyphs, not the star mark", () => {
    const longest = CARGO_PARTS.filter((d) => !hasGrid(d)).sort((a, b) => textWidth(itemName(b), "3") - textWidth(itemName(a), "3"))[0];
    let wName = 0, wCount = 0;
    for (let room = 40; room <= 260; room++) {
      const f = exchangeForm(partCard(longest, "wide"), room, 4);
      if (f === "name") wName = room;
      if (f === "count" && !wCount) wCount = room;
    }
    expect(wCount).toBe(wName + 1);
    const draw = (room: number): RasterCanvas => {
      const w = room + 10, c = fresh(w + 8, 60);
      drawChoiceCard(G(c), { x: 3, y: 4, w, h: 50 }, partCard(longest, "wide"), 1, view);
      return c;
    };
    expect(bandPx(draw(wCount), 3, 4, wCount + 10, C.red) - bandPx(draw(wName), 3, 4, wName + 10, C.red)).toBe(glyphPx(SHRINE_COUNT, C.red));
    expect(glyphPx("x", C.red)).toBeGreaterThan(3); // the `x` is drawn (the 3x5 face has it; the font draws lower case as capitals)
    expect(textWidth(`${SHRINE_COUNT} `, "3")).toBe(10);
  });
});

describe("W2: the blocked card 2 draws the line it would have, dimmed, not `FREE -> NOTHING`", () => {
  it("shrine.ts's Choice data is untouched: the blocked card is still {OFFER A PART, no cost, no gain, blocked NOTHING IN CARGO TO OFFER} (the bots and the road-cap model read it)", () => {
    withEnchant(() => {
      const run = newRun("furnace", 4242);
      run.day = 4;
      const ev = makeEvent(4242, 4, "shrine");
      const cards = shrineChoices(run, ev);
      expect(cards[1]).toEqual({ label: "OFFER A PART", cost: [], gain: [], blocked: SHRINE_NO_PART });
      expect(isShrineBlockedPart(cards[1])).toBe(true);
      expect(isShrineBlockedPart(cards[0])).toBe(false);
      expect(isShrineBlockedPart(cards[2])).toBe(false);
      run.inventory.push({ uid: run.nextUid++, def: "temper" });
      const withPart = shrineChoices(run, ev);
      expect(isShrineBlockedPart(withPart[1]), "a card with a part is drawn as it was").toBe(false);
      expect(isShrineBlockedPart({ ...withPart[1], blocked: SHRINE_NO_TAKER }), "a card blocked for NO PART TAKES IT keeps its chips").toBe(false);
    });
  });

  it("the would-be line's text: `1x CARGO PART` (no part is named, none is in cargo), then `CARGO PART`, then the crate alone", () => {
    expect(SHRINE_GHOST_PART).toBe("CARGO PART");
    expect(ghostText("count")).toBe("1x CARGO PART");
    expect(ghostText("name")).toBe("CARGO PART");
    expect(ghostText("bare")).toBe("");
    // the three tiers follow the room: more room never shows less, and each form costs exactly its glyphs
    const seq: GhostForm[] = [];
    for (let w = 40; w <= 260; w++) seq.push(ghostForm("growing", w, 4));
    const order = ["bare", "name", "count"];
    expect(seq.map((f) => order.indexOf(f))).toEqual(seq.map((f) => order.indexOf(f)).sort((a, b) => a - b));
    expect(new Set(seq)).toEqual(new Set(order));
    expect(seq.filter((f) => f === "name").length).toBe(textWidth(ghostText("count"), "3") - textWidth(ghostText("name"), "3"));
    // on every card the event screen lays out, the whole line (the count form) fits with every word
    for (const [cw] of WIDTHS) for (const id of ENCHANT_IDS) expect(ghostForm(id, cw - 10, 4), `${id}@${cw}`).toBe("count");
  });

  it("every card width x every word: the exchange band is the dim line (crate, `1x CARGO PART` in slate, the arrow, the word's icon in its colour and its name dim), the red reason stays, nothing past the card", () => {
    const spill: string[] = [];
    for (const [cw, ch] of WIDTHS) {
      for (const id of ENCHANT_IDS) {
        const c = fresh(cw + 14, ch + 10);
        drawChoiceCard(G(c), { x: 3, y: 4, w: cw, h: ch }, BLOCKED, 1, { ...view, shrineWord: id });
        const tag = `${id}@${cw}`;
        // the word's icon is drawn in its own colour in the band
        expect(bandPx(c, 3, 4, cw, ENCHANT_DEFS[id].color), `${tag}: the word's icon in its colour`).toBeGreaterThanOrEqual(6);
        // the would-be cost and the word's name are dim (slate3), exactly the glyph pixels of both strings (and any slate3 the word's own icon holds)
        const iconSlate = (deltaIcon({ k: "ench", word: id }) as unknown as RasterCanvas).px.filter((p) => p === C.slate3).length;
        // PRESENT-3 R (a) (re-pinned old -> new): the dim arrow is the 5x7 face's now (9 px of ink: tests/present3.arrow.test.ts pins it) in slate3, so it is counted with the dim text (was the 3x5 arrow in slate2)
        const want = glyphPx(ghostText("count"), C.slate3) + glyphPx(ENCHANT_DEFS[id].name, C.slate3) + iconSlate + ARROW_INK;
        expect(bandPx(c, 3, 4, cw, C.slate3), `${tag}: the dim text and the dim arrow`).toBe(want);
        // the cost chip (the crate and its text, from the card's x + 5) holds no live cost colour: it is not the red of a card you could pay
        const costW = crateIcon().width + 2 + textWidth(ghostText("count"), "3");
        for (const live of [C.lime, C.red, C.amber, C.yellow]) expect(bandPx(c, 3 + 5, 4, costW, live), `${tag}: no live colour ${live} in the cost chip`).toBe(0);
        // the arrow is the dim arrow (PRESENT-3 R (a): slate3, counted above; was slate2)
        // the red reason is on the note line, whole
        let red = 0;
        for (let yy = 4 + ch - 9; yy < 4 + ch - 4; yy++) for (let xx = 3; xx < 3 + cw; xx++) if (c.at(xx, yy) === C.red) red++;
        expect(red, `${tag}: the whole red reason`).toBe(glyphPx(SHRINE_NO_PART, C.red));
        // nothing is drawn to the right of the card, nothing outside the canvas
        for (let yy = 0; yy < ch + 10; yy++) for (let xx = 3 + cw; xx < cw + 14; xx++) if (c.at(xx, yy) !== null) spill.push(`${tag}: ${xx},${yy}`);
        expect(c.oob, `${tag}: painted outside the canvas`).toBe(0);
      }
    }
    expect(spill.slice(0, 5)).toEqual([]);
  });

  it("the old false line is gone: with word B given, the blocked card no longer draws FREE or NOTHING (their glyph pixels in the dim colours are not in the band), and the crate is", () => {
    for (const [cw, ch] of WIDTHS) {
      const a = fresh(cw + 14, ch + 10), b = fresh(cw + 14, ch + 10);
      drawChoiceCard(G(a), { x: 3, y: 4, w: cw, h: ch }, BLOCKED, 1, { ...view, shrineWord: "wide" });
      drawChoiceCard(G(b), { x: 3, y: 4, w: cw, h: ch }, BLOCKED, 1, view); // what the card drew before (no word given: the screen of ENCHANT-2)
      // before: FREE in slate3 and NOTHING in slate3, 36 + 24 glyph pixels; after: neither string is on the line
      const before = bandPx(b, 3, 4, cw, C.slate3), after = bandPx(a, 3, 4, cw, C.slate3);
      expect(before, `@${cw} old line`).toBe(glyphPx("FREE", C.slate3) + glyphPx("NOTHING", C.slate3) + ARROW_INK); // PRESENT-3 R (a): + the arrow's 9 px (slate3 now)
      const iconSlate = (deltaIcon({ k: "ench", word: "wide" }) as unknown as RasterCanvas).px.filter((p) => p === C.slate3).length;
      expect(after, `@${cw} new line`).toBe(glyphPx(ghostText("count"), C.slate3) + glyphPx("WIDE", C.slate3) + iconSlate + ARROW_INK);
      // the crate (the run bar's cargo mark) is drawn at the line's start: its wood colours are in the band
      const wood = crateIcon();
      let crate = 0;
      for (let yy = 4 + 20; yy < 4 + 33; yy++) for (let xx = 3; xx < 3 + 12; xx++) { const p = a.at(xx, yy); if (p !== null && p !== C.ink && p === (wood as unknown as RasterCanvas).at(1, 1)) crate++; }
      expect(crate, `@${cw} the crate`).toBeGreaterThan(0);
    }
  });

  it("every other card draws exactly as before: with word B given or not, the pixels are the same for card 1, a card with a part, a card blocked for NO PART TAKES IT, and MOVE ON", () => {
    const others: Choice[] = [hullCard("fiery"), partCard("temper", "wide"), { ...partCard("temper", "wide"), blocked: SHRINE_NO_TAKER }, { ...hullCard("swift"), blocked: SHRINE_NO_TAKER }, MOVE_ON,
      { label: "SELL", cost: [{ k: "item", def: "temper", uid: 1, from: "cargo" }], gain: [{ k: "gold", n: 3 }] }];
    for (const [cw, ch] of WIDTHS) {
      for (const [i, card] of others.entries()) {
        for (const state of ["open", "other"] as const) {
          const a = fresh(cw + 8, ch + 10), b = fresh(cw + 8, ch + 10);
          drawChoiceCard(G(a), { x: 3, y: 4, w: cw, h: ch }, card, i % 3, { ...view, state, shrineWord: "growing" });
          drawChoiceCard(G(b), { x: 3, y: 4, w: cw, h: ch }, card, i % 3, { ...view, state });
          expect(a.px.join(","), `card #${i} ${state}@${cw}`).toBe(b.px.join(","));
        }
      }
    }
  });

  it("the blocked card is the only one that changes: given a word, a blocked card that is not the shrine's (another reason, or a cost) is drawn as it was", () => {
    const cards: Choice[] = [
      { label: "STAKE 3", cost: [{ k: "gold", n: 3 }], gain: [{ k: "bounty", n: 10 }], blocked: "NOT ENOUGH GOLD" },
      { label: "SWAP", cost: [], gain: [], blocked: "NOTHING TO SWAP" },
      { label: "OFFER A PART", cost: [], gain: [], blocked: SHRINE_NO_TAKER },
    ];
    for (const [cw, ch] of WIDTHS) for (const [i, card] of cards.entries()) {
      const a = fresh(cw + 8, ch + 10), b = fresh(cw + 8, ch + 10);
      drawChoiceCard(G(a), { x: 3, y: 4, w: cw, h: ch }, card, 1, { ...view, shrineWord: "growing" });
      drawChoiceCard(G(b), { x: 3, y: 4, w: cw, h: ch }, card, 1, view);
      expect(a.px.join(","), `card #${i}@${cw}`).toBe(b.px.join(","));
    }
  });

  it("word B is the shrine's own offer: the card's word is shrineOffer(seed, day)[1], one of the eight, and never word A", () => {
    withEnchant(() => {
      for (const seed of [1, 7, 4242, 99999]) for (const day of [1, 4, 9, 16]) {
        const [a, b] = shrineOffer(seed, day);
        expect(a).not.toBe(b);
        expect((ENCHANT_IDS as readonly string[]).includes(b)).toBe(true);
      }
    });
  });

  it("the line fits where the `?` button and the label sit: the label ends before the button's corner and the exchange band never reaches the button", () => {
    for (const [cw, ch] of WIDTHS) {
      const btn = infoButton({ x: 0, y: 0, w: cw, h: ch }).btn;
      // the band (rows 20..32) is below the button (rows 6..14), so the two never meet; the word chip ends inside the room the card gives the line
      expect(btn.y + btn.h).toBeLessThan(20);
      for (const id of ENCHANT_IDS) {
        const w = cw - 10, used = crateIcon().width + 2 + textWidth(ghostText("count"), "3") + 5 + 7 + deltaIcon({ k: "ench", word: id }).width + 2 + textWidth(ENCHANT_DEFS[id].name, "3");
        expect(used, `${id}@${cw}`).toBeLessThanOrEqual(w);
      }
    }
  });
});

describe("W2 on the screen's own geometry: the event layouts", () => {
  it("the narrowest layouts hold the whole line: 138 px desk cards and 182 px phone cards", () => {
    expect(eventLayout(440, 250, false, 3).cards[0].w).toBe(138);
    expect(eventLayout(190, 330, true, 3).cards[0].w).toBe(182);
    expect(eventLayout(640, 400, false, 3).cards[0].w).toBe(152); // the 1280x800 desk at scale 2 (160 is a 2-card event's cap)
    expect(eventLayout(201, 345, true, 3).cards[0].w).toBe(193); // the 402x690 phone at scale 2
  });
});

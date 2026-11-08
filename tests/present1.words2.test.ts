// PRESENT-1 (REQ-BFG-081): the cold read's ONE fix round, words only. The first read (O/read, round 2) missed two items:
//  - PR-06, a shop card on sale that can merge: 4 of 6 FULL. Two Haiku readers took the merge mark (▲ over ★2) for the card's own star and
//    left the sale mark (▼) at "can't tell"; nothing said the sale in words: the buy button names the merge (offerLabel: a merge wins the
//    label, and no label says both within 60 px) and the desk tooltip has no button. Fix: `ON SALE: WAS 3G.` in the offer's panel (first
//    line of its body, lime) and first in its desk hover tooltip (inspector.ts offerSaleNote, chrome.ts offerTipItems).
//  - PR-05, the shop's hull pack: 3 of 6 FULL (phone 3 of 3, desk 0 of 3): the desk's 34 px ARMOR PACK slot printed "+550" with no word.
//    Fix: the short face keeps the word without the plus where that fits ("550 HULL", 30 px against "+550 HULL"'s 34): shop.ts packShortAmount.
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { ITEMS, PACK_IDS, PACK_ITEM, buyableModules, type ItemDef } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { C } from "../src/render/palette";
import { textWidth } from "../src/render/font";
import { withHullScale } from "../src/sim/hullScale";
import { buildLayout, packRects } from "../src/screens/build/layout";
import { offerLabel, offerMergeNote, offerPanel, offerSaleNote, planPanel, visibleLines, type PLine, type PanelText } from "../src/screens/build/inspector";
import { offerTipItems } from "../src/screens/build/chrome";
import { offerFace, packAmount, packShortAmount } from "../src/screens/build/shop";

const SHOP = Object.values(ITEMS).filter((d: ItemDef) => d.merchant && d.price > 0);
const MODS = buyableModules().filter((d) => fusible(d.id));
const SUPPLIES = Object.values(ITEMS).filter((d) => d.kind === "supply" && d.price > 0);
/** The narrowest full portrait band (161 x 69) and the 1920x1080 desk's column: tests/abilityPanels.test.ts's two. */
const PHONE = buildLayout(167, 394, true, 5).info;
const DESK = buildLayout(480, 270, false, 5).info;

/** A run whose first offer is `def` at `price`, with `held` copies' stars in cargo (a merge offer: [1] makes ★2, [2, 1] makes ★3). */
function offering(def: string, price: number, held: number[] = [], sold = false): Run {
  const run = newRun("furnace", 5, `present1-words2-${def}`);
  run.gold = 99;
  run.inventory = held.map((st, i) => ({ uid: 900 + i, def, ...(st > 1 ? { stars: st } : {}) }));
  run.shop.wagons = [{ merchant: ITEMS[def].merchant!, offers: [{ def, price, sold }] }] as Run["shop"]["wagons"];
  return run;
}
const off = (run: Run) => run.shop.wagons[0].offers[0];

describe("PRESENT-1 PR-06: a sale is said in words (panel and desk tooltip), whether or not it merges", () => {
  it("offerSaleNote: `ON SALE: WAS nG.` for an unsold offer under its list price, else nothing (the game's own sale test: run.ts priceOf, chrome.ts drawShop, offerLabel)", () => {
    expect(offerSaleNote({ def: "whetstone", price: 2 })).toBe("ON SALE: WAS 3G.");
    expect(offerSaleNote({ def: "whetstone", price: 3 })).toBeNull();
    expect(offerSaleNote({ def: "whetstone", price: 2, sold: true })).toBeNull();
    expect(offerSaleNote({ def: "whetstone", price: 4 })).toBeNull(); // dearer than the list: no sale (the game never prices above it)
    let n = 0;
    for (const d of SHOP) for (let p = 1; p <= d.price; p++) {
      const note = offerSaleNote({ def: d.id, price: p });
      expect(note, `${d.id} at ${p}`).toBe(p < d.price ? `ON SALE: WAS ${d.price}G.` : null);
      // the same test as the buy button's SALE and the card's sale mark (offerLabel / chrome.ts `sale`)
      if (d.kind !== "supply" && d.kind !== "converter") expect(offerLabel(d, p, null).startsWith("SALE: "), `${d.id} at ${p}`).toBe(note !== null);
      if (note) n++;
    }
    expect(n).toBeGreaterThan(100);
  });

  it("the panel: the sale line is the first block of the body, lime, kept; the rest of the body is the plain offer's, line for line; a plain, a sold and a merge-at-list offer have none", () => {
    for (const d of [...MODS, ...SUPPLIES]) {
      const held = fusible(d.id) ? [[], [1], [2, 1]] : [[]];
      for (const h of held) {
        const plain = offerPanel(offering(d.id, d.price, h), 0, 0)!;
        expect(plain.body.some((b) => /^ON SALE/.test(b.text)), `${d.id} held[${h}] at list`).toBe(false);
        if (d.price < 2) continue;
        const run = offering(d.id, d.price - 1, h), t = offerPanel(run, 0, 0)!;
        expect(t.body[0], `${d.id} held[${h}]`).toEqual({ role: "note", text: `ON SALE: WAS ${d.price}G.`, colour: C.lime, keep: true });
        expect(t.body.slice(1), `${d.id} held[${h}]: the rest`).toEqual(plain.body);
        // the button says what it said (a merge wins it; a plain sale says SALE:), the notes are the plain offer's
        const to = /^MERGE ★(\d)/.exec(plain.labels[0]);
        expect(t.labels, `${d.id} held[${h}]`).toEqual([offerLabel(d, d.price - 1, to ? Number(to[1]) : null)]);
        expect(t.notes, `${d.id} held[${h}]: notes`).toEqual(plain.notes);
        const sold = offerPanel(offering(d.id, d.price - 1, h, true), 0, 0)!;
        expect(sold.body.some((b) => /^ON SALE/.test(b.text)), `${d.id} sold`).toBe(false);
      }
    }
  });

  it("the fit: with the line, every shop piece's panel on sale (plain, ★2 and ★3 merge) still fits the phone band and the desk column, every kept line whole (the T6 rule), the line itself shown", () => {
    const tally = { cases: 0, phoneShown: 0, deskShown: 0, phoneFits: 0, deskFits: 0, lostBelow: [] as string[] };
    for (const d of [...MODS, ...SUPPLIES]) {
      if (d.price < 2) continue;
      for (const h of fusible(d.id) ? [[], [1], [2, 1]] : [[]]) {
        const t: PanelText = offerPanel(offering(d.id, d.price - 1, h), 0, 0)!;
        const base: PanelText = offerPanel(offering(d.id, d.price, h), 0, 0)!;
        for (const [name, area] of [["phone", PHONE], ["desk", DESK]] as const) {
          const plan = planPanel(t, area), plain = planPanel(base, area);
          const drawn = new Set<PLine | "rule">(visibleLines(plan).map((v) => v.line));
          const whole = (l: { lines: (PLine | "rule")[] }) => l.lines.every((x) => drawn.has(x));
          const kept = plan.body.shown.filter((l) => l.b.keep);
          const id = `${d.id} held[${h}] ${name}`;
          expect(plan.body.fits, id).toBe(true);
          expect(kept.every(whole), id).toBe(true);
          expect(plan.body.shown.some((l) => l.b.text.startsWith("ON SALE")), `${id}: the sale line shown`).toBe(true);
          // what the line costs: an optional block (the hint, the flavour) that the plain panel showed and this one gives way
          const lost = plain.body.shown.filter((l) => !l.b.keep && !plan.body.shown.some((m) => m.b === l.b || m.b.text === l.b.text)).map((l) => `${l.b.role}`);
          if (lost.length) tally.lostBelow.push(`${id}: ${lost.join("+")}`);
          tally.cases++;
          if (name === "phone") { tally.phoneShown++; tally.phoneFits++; } else { tally.deskShown++; tally.deskFits++; }
        }
      }
    }
    console.log(`PRESENT1-SALELINE fit: ${tally.cases} panels (phone and desk), the line shown in ${tally.phoneShown + tally.deskShown}, every kept line whole in ${tally.phoneFits + tally.deskFits}; optional lines given way for it: ${tally.lostBelow.length}\n${tally.lostBelow.slice(0, 40).join("\n")}`);
    expect(tally.cases).toBeGreaterThan(200);
  });

  it("the desk's hover tooltip: the sale first, then the face, then what a copy held means; a plain or a sold offer shows no sale", () => {
    for (const [def, held] of [["whetstone", []], ["whetstone", [1]], ["whetstone", [2, 1]], ["gantry", []], ["gantry", [1]]] as [string, number[]][]) {
      const list = ITEMS[def].price;
      const run = offering(def, list - 1, held), o = off(run);
      const items = offerTipItems(run, o), face = offerFace(def, {}), own = offerMergeNote(run, def);
      expect(items, `${def} held[${held}]`).toEqual([`ON SALE: WAS ${list}G.`, ...face, ...(own ? [own] : [])]);
      const plain = offering(def, list, held);
      expect(offerTipItems(plain, off(plain)), `${def} held[${held}] at list`).toEqual([...face, ...(offerMergeNote(plain, def) ? [offerMergeNote(plain, def)!] : [])]);
      const sold = offering(def, list - 1, held, true);
      expect(offerTipItems(sold, off(sold)), `${def} held[${held}] sold`).toEqual(face);
    }
  });
});

describe("PRESENT-1 PR-05: the desk's ARMOR PACK slot keeps the word where it fits", () => {
  it("packShortAmount: the whole amount (36 px), else the word without its plus (30 px: a 32-34 px slot), else the number alone; the belt pack unchanged", () => {
    withHullScale(() => {
      expect(textWidth("+250 HULL", "3")).toBe(34);
      expect(textWidth("250 HULL", "3")).toBe(30);
      expect(textWidth("1100 HULL", "3")).toBe(34);
      for (const w of [32, 33, 34]) expect(packShortAmount("+250 HULL", w), `w ${w}`).toBe("250 HULL");
      for (const w of [30, 31]) expect(packShortAmount("+250 HULL", w), `w ${w}`).toBe("+250");
      expect(packShortAmount("+250 HULL", 36)).toBe("+250 HULL");
      for (const w of [30, 31, 32, 33, 34]) expect(packShortAmount("+1100 HULL", w), `w ${w}`).toBe("+1100"); // four digits: 34 px either way
      for (const w of [30, 31, 32, 33, 34]) expect(packShortAmount("+4 BELT", w), `w ${w}`).toBe("+4 BELT");
    }, false);
  });

  it("on every real desk slot (layout.ts packRects, W 430-1000): the word shows for the day's amount while it has three digits (log: which days); four digits keep the number alone, the hover says the rest", () => {
    const days = Array.from({ length: 14 }, (_, i) => i + 1);
    const amounts = withHullScale(() => days.map((d) => [d, packAmount("armor", d)] as const));
    const widths = new Set<number>();
    for (let W = 430; W <= 1000; W++) for (const H of [240, 300, 420, 600]) widths.add(packRects(buildLayout(W, H, false, 5))[1].w);
    const rows: string[] = [];
    for (const w of [...widths].sort((a, b) => a - b)) {
      const shown = amounts.map(([d, a]) => [d, a, packShortAmount(a, w)] as const);
      for (const [, a, s] of shown) expect(textWidth(s, "3"), `${a} in a ${w} px slot`).toBeLessThanOrEqual(w - 2);
      rows.push(`slot ${w} px: ${shown.map(([d, , s]) => `d${d} ${s}`).join(", ")}; word on days ${shown.filter(([, , s]) => /HULL/.test(s)).map(([d]) => d).join(",") || "none"}`);
    }
    console.log(`PRESENT1-PACKWORD\n${rows.join("\n")}`);
    // the cold read's scene: day 4, hull scale on, a 34 px slot: "550 HULL", never the bare "+550"
    const day4 = amounts.find(([d]) => d === 4)![1];
    expect(day4).toBe("+550 HULL");
    expect(packShortAmount(day4, 34)).toBe("550 HULL");
    // the slot's inside is w - 2 px: the 30 px word fits it with a clear pixel each side
    expect(textWidth("550 HULL", "3")).toBeLessThanOrEqual(34 - 2 - 2);
    // the pack ids stay the two the game has
    expect(PACK_IDS.map((id) => ITEMS[PACK_ITEM[id]].id)).toEqual(["beltcrate", "plating"]);
  });
});

// RUNES-1 (REQ-BFG-058, M2): the rune text, the dawn picker's and the rune bar's layouts. Pure: no DOM, no drawing.
// The phone is the operator's op view (402x690 CSS px at DPR 3: the build screen's x5, 241x414 art px); the desk 1280x800.

import { describe, expect, it } from "vitest";
import { textWidth } from "../src/render/font";
import { wrapRich } from "../src/ui/richText";
import { RUNE_HEROES, RUNE_LIST, runeOffer, type RuneDef } from "../src/sim/runes";
import {
  KEYWORD_WORD, PLAIN_REMINDER, RUNE_UNIT_TEXT, runeKeyword, runeLine, runeReminder, runeSpans, runeTag, runeTaken, tierWord,
} from "../src/ui/runeText";
import { readoutW, runeBarLayout, runeCardH, runeCardTextW, runeChip, runeListH, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { pickDawn, pickHint, pickLayout, PICK_TAKE } from "../src/screens/runePicker";
import { buildLayout, buildScale, FOE_H, phoneScreen } from "../src/screens/build/layout";
import { cssK, tapPx, TAP_CSS } from "../src/ui/tap";
import { OFFERS } from "../src/sim/content";

/** A view as computeView frames the build screen: CSS w x h at `dpr`. */
function view(w: number, h: number, dpr: number) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05;
  const scale = buildScale(pw, ph, portrait, dpr);
  return { W: Math.floor(pw / scale), H: Math.floor(ph / scale), scale, dpr, portrait, phone: phoneScreen(pw, ph, dpr) };
}
const OP = view(402, 690, 3);
const DESK = view(1280, 800, 1);
const DECIMAL = /\d+\.\d+/;

describe("rune text (runeText.ts)", () => {
  it("the op view is the build screen's 241x414 at x5", () => {
    expect([OP.W, OP.H, OP.scale, OP.portrait, OP.phone]).toEqual([241, 414, 5, true, true]);
    expect([DESK.W, DESK.H, DESK.scale, DESK.portrait]).toEqual([640, 400, 2, false]);
  });

  it("every token is {N} or a keyword, and no rune text holds a literal number", () => {
    for (const d of RUNE_LIST) {
      expect(d.text, d.id).not.toMatch(/\d/);
      for (const m of d.text.matchAll(/\{\*?([A-Z]+)\}/g)) expect(m[1] === "N" || m[1] in KEYWORD_WORD, `${d.id}: {${m[1]}}`).toBe(true);
      expect(runeLine(d), d.id).not.toMatch(/[{}]/);
      expect(runeKeyword(d), d.id).not.toBeNull();
    }
  });

  it("numbers fill in through one formatter per unit, whole", () => {
    expect(RUNE_UNIT_TEXT.pct(25)).toBe("25%");
    expect(RUNE_UNIT_TEXT.hull(15)).toBe("15");
    const iron = RUNE_LIST.find((d) => d.id === "iron_skin")!;
    expect(runeLine(iron)).toBe(`+${iron.amount.n} HULL.`);
    expect(runeSpans(iron)[0]).toEqual({ t: `+${iron.amount.n}`, c: expect.any(String) });
    for (const d of RUNE_LIST) expect(runeLine(d), d.id).toContain(RUNE_UNIT_TEXT[d.amount.unit](d.amount.n));
  });

  it("every number in every rendered rune text is whole", () => {
    const texts = (d: RuneDef) => [runeLine(d), runeReminder(d), runeTag(d), runeTaken(d, 10), d.name];
    for (const d of RUNE_LIST) for (const t of texts(d)) expect(t, `${d.id}: ${t}`).not.toMatch(DECIMAL);
    for (const t of [pickHint(3), pickHint(2), ...pickDawn(10, "legendary"), PICK_TAKE]) expect(t).not.toMatch(DECIMAL);
  });

  it("names are 14 characters at most; reminders hold no number; the tag and the read-out line", () => {
    for (const d of RUNE_LIST) {
      expect(d.name.length, d.id).toBeLessThanOrEqual(14);
      expect(runeReminder(d), d.id).not.toMatch(/\d/);
    }
    const spare = RUNE_LIST.find((d) => d.id === "spare_hull")!;
    expect(runeTag(spare)).toBe("RARE · ARMOR");
    expect(runeTaken(spare, 4)).toBe("RARE RUNE · TAKEN DAY 4");
    expect(runeReminder(spare)).toBe(PLAIN_REMINDER);
    expect(tierWord("common")).toBe("COMMON");
    // U2c (REQ-BFG-046): the reminders are the glossary's (RUNE_REMINDER), each in "WORD: ..." form, as every other keyword's
    // CARD-3 (REQ-BFG-107): the soak layer's word is SHIELD (was /^PLATE: /)
    expect(runeReminder(RUNE_LIST.find((d) => d.id === "rivet_hoard")!)).toMatch(/^SHIELD: /);
  });

  it("every effect is one line in the 5x7 face on the op view's card (and the desk's), with no '·' chain", () => {
    const opW = runeCardTextW(pickLayout(OP.W, OP.H, ["iron_skin"], -1, 0).cardW);
    const deskW = runeCardTextW(pickLayout(DESK.W, DESK.H, ["iron_skin"], -1, 0).cardW);
    expect(opW).toBe(223);
    for (const d of RUNE_LIST) {
      const line = runeLine(d);
      expect(line, d.id).not.toContain("·");
      expect(textWidth(line, "5"), `${d.id}: ${line}`).toBeLessThanOrEqual(opW);
      expect(wrapRich(runeSpans(d), opW, "5").length, d.id).toBe(1);
      expect(wrapRich(runeSpans(d), deskW, "5").length, d.id).toBe(1);
      // the opened card's reminder, one line in the 3x5 face
      expect(textWidth(runeReminder(d), "3"), d.id).toBeLessThanOrEqual(opW);
    }
  });
});

describe("the rune bar (runeBar.ts)", () => {
  it("chips are at least 44 CSS px on the op view and the desk", () => {
    for (const v of [OP, DESK]) {
      const chip = runeChip(v);
      expect(chip * cssK(v), `${v.W}x${v.H}`).toBeGreaterThanOrEqual(TAP_CSS);
      expect(chip).toBeGreaterThanOrEqual(tapPx(v));
    }
    expect(runeChip(OP)).toBe(27);
    expect(runeRowH(OP, 0)).toBe(0);
  });

  it("with 1-10 runes the row stays on a 402 CSS px phone and on the desk: chips in pick order, +k for the rest", () => {
    for (const v of [OP, DESK]) {
      const chip = runeChip(v);
      for (let n = 1; n <= 10; n++) {
        const B = runeBarLayout(v.W, 14, n, chip);
        const all = [...B.chips, ...(B.more ? [B.more] : [])];
        expect(B.shown + (B.more ? n - B.shown : 0), `${n}`).toBe(n);
        for (const r of all) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w, `${v.W}: ${n} runes`).toBeLessThanOrEqual(v.W);
          expect((r.x + r.w) * cssK(v)).toBeLessThanOrEqual(v.W * cssK(v));
          expect(r.y + r.h).toBeLessThanOrEqual(B.bar.y + B.bar.h);
        }
        for (let i = 1; i < all.length; i++) expect(all[i].x).toBeGreaterThanOrEqual(all[i - 1].x + all[i - 1].w);
      }
    }
    // the op view shows 7 chips; 10 runes: 6 and a "+4" chip; the desk shows all 10
    expect(runeBarLayout(OP.W, 14, 7, runeChip(OP)).more).toBeNull();
    const ten = runeBarLayout(OP.W, 14, 10, runeChip(OP));
    expect([ten.shown, !!ten.more]).toEqual([6, true]);
    expect(runeBarLayout(DESK.W, 14, 10, runeChip(DESK)).more).toBeNull();
  });

  it("the build screen moves down by the row and still fits (op view, desk); with no rune nothing changes", () => {
    for (const v of [OP, DESK]) {
      const tap = v.phone ? Math.ceil(TAP_CSS / cssK(v)) : 0;
      const base = buildLayout(v.W, v.H, v.portrait, OFFERS, v.phone && v.portrait, tap);
      expect(shiftLayout(base, 0, v.H)).toBe(base);
      const row = runeRowH(v, 10);
      const L = shiftLayout(buildLayout(v.W, v.H - row, v.portrait, OFFERS, v.phone && v.portrait, tap), row, v.H);
      const bar = runeBarLayout(v.W, L.bar.y + L.bar.h, 10, runeChip(v)).bar;
      expect(bar.y + bar.h, `${v.W}`).toBeLessThanOrEqual(Math.min(...L.cards.map((c) => c.y - (L.tags ? 8 : 0)), L.reroll.y, ...L.packs.map((p) => p.y)));
      expect(L.bar).toEqual(base.bar);
      expect(Math.max(L.cargo.y + L.cargo.h, L.fight.y + L.fight.h), `${v.W}`).toBeLessThanOrEqual(v.H);
      if (v.portrait) {
        expect(L.info.h).toBeGreaterThanOrEqual(FOE_H);
        expect(L.hull).toEqual(base.hull); // the op phone's hull stays: the band gives up the row
      }
    }
  });

  it("the read-outs fit: one rune's card and the full list of 10 under the bar on the op view", () => {
    const w = readoutW(OP.W), top = 14 + runeRowH(OP, 10) + 2;
    for (const d of RUNE_LIST) expect(top + runeCardH(d, w, { reminder: true }), d.id).toBeLessThanOrEqual(OP.H);
    expect(top + runeListH(10)).toBeLessThanOrEqual(OP.H);
  });
});

describe("the dawn picker (runePicker.ts)", () => {
  const inside = (r: { x: number; y: number; w: number; h: number }, W: number, H: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H;

  it("fits the op view and the desk with 3 cards (each opened in turn) and 2 cards, up to 9 runes held", () => {
    for (const v of [OP, DESK]) {
      for (const hero of RUNE_HEROES.slice(0, 4)) {
        for (let day = 1; day <= 10; day++) {
          for (const seed of [1, 12345, 777]) {
            const o = runeOffer(seed, day, hero, []);
            expect(o.ids.length, `day ${day}`).toBe(day <= 4 ? 3 : 2);
            for (let open = -1; open < o.ids.length; open++) {
              const L = pickLayout(v.W, v.H, o.ids, open, day - 1);
              expect(L.bottom, `${v.W}x${v.H} day ${day} open ${open}`).toBeLessThanOrEqual(v.H);
              for (const r of [...L.cards, ...(L.tray ? [L.tray] : []), ...L.trayChips]) expect(inside(r, v.W, v.H), JSON.stringify(r)).toBe(true);
              for (const c of L.trayChips) expect(inside(c, L.tray!.x + L.tray!.w, L.tray!.y + L.tray!.h)).toBe(true);
              for (let i = 1; i < L.cards.length; i++) expect(L.cards[i].y).toBeGreaterThan(L.cards[i - 1].y + L.cards[i - 1].h);
              // the header's three lines fit the width
              const [a, b] = pickDawn(day, o.tier);
              expect(textWidth(a + b)).toBeLessThanOrEqual(v.W - 8);
              expect(textWidth(pickHint(o.ids.length), "3")).toBeLessThanOrEqual(v.W - 8);
            }
          }
        }
      }
    }
  });

  it("a card is a finger's target on the op view (at least 44 CSS px tall)", () => {
    const L = pickLayout(OP.W, OP.H, ["iron_skin", "tar_barrel", "coin_purse"], -1, 0);
    for (const c of L.cards) expect(c.h * cssK(OP)).toBeGreaterThanOrEqual(TAP_CSS);
  });
});

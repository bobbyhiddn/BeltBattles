// ENDLESS-1 3.5 (REQ-BFG-059; run 2; RULING-RUN1-R1: "YOUR RUNES running off a phone past about 21 runes: DEFERRED TO ENDLESS"): an endless
// run holds about 50 runes (one a dawn; day 64 holds 63), so YOUR RUNES must fit a phone at that count:
//  - the rune bar's full list ("+k"), 19 px a rune, is paged when it does not fit under the bar (runeListLayout; "<" and ">" and
//    "PAGE 2/5", the arrows, PageUp / PageDown and the wheel turn it): as even as can be, never nearly empty;
//  - the picker's tray of held runes goes COMPACT (small chips, the label on its own row) when its full chips would run off the screen.
// Both are only for a run that carries the endless mark: every other run's list and tray are exactly as they were.
import { describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { RUNES } from "../src/sim/runes";
import { pickLayout } from "../src/screens/runePicker";
import { RUNE_LIST_FOOT_MIN, RUNE_LIST_HEAD, RUNE_ROW_H, RUNE_SMALL_H, RUNE_SMALL_W, RuneBar, runeListH, runeListLayout } from "../src/ui/runeBar";

const IDS = Object.keys(RUNES);
const VIEWS: [string, number, number, number][] = [
  ["402x690 @3 (the operator's phone)", 402, 690, 3], ["360x640 @2", 360, 640, 2], ["390x844 @3", 390, 844, 3], ["375x667 @2", 375, 667, 2],
  ["320x548 @2 (the smallest phone tap093 sweeps)", 320, 548, 2], ["320x568 @2", 320, 568, 2],
  ["1920x1080 @1 (the desk)", 1920, 1080, 1], ["1366x768 @1", 1366, 768, 1],
];

describe("ENDLESS-1 3.5: the YOUR RUNES list (the rune bar's)", () => {
  it("whole when it fits, exactly as before: the same height runeListH gives, one page, no foot", () => {
    for (const avail of [300, 414, 1000]) {
      for (let n = 1; n <= 40; n++) {
        const L = runeListLayout(n, avail);
        if (runeListH(n) <= avail) expect(L, `${n} runes in ${avail}`).toEqual({ h: runeListH(n), per: n, pages: 1, foot: 0 });
      }
    }
    expect(runeListLayout(50, Infinity)).toEqual({ h: runeListH(50), per: 50, pages: 1, foot: 0 }); // a run without the mark is handed no limit
    expect(runeListLayout(0, 10)).toEqual({ h: runeListH(0), per: 1, pages: 1, foot: 0 });
  });

  it("paged when it does not fit: every rune on exactly one page, as even as can be, the panel inside the room, the foot in it", () => {
    let paged = 0;
    for (const avail of [140, 200, 260, 340, 380, 407]) {
      for (const foot of [RUNE_LIST_FOOT_MIN, 20, 26]) {
        for (let n = 1; n <= 70; n++) {
          const L = runeListLayout(n, avail, foot);
          if (runeListH(n) <= avail) continue;
          paged++;
          expect(L.pages, `${n} runes, room ${avail}`).toBeGreaterThan(1);
          expect(L.foot).toBe(foot);
          expect(L.h, `${n} runes, room ${avail}, foot ${foot}`).toBe(RUNE_LIST_HEAD + L.per * RUNE_ROW_H + foot + 2);
          if (avail - RUNE_LIST_HEAD - foot - 2 >= RUNE_ROW_H) expect(L.h, `${n} runes, room ${avail}`).toBeLessThanOrEqual(avail);
          expect(L.per * L.pages).toBeGreaterThanOrEqual(n);
          expect(L.per * (L.pages - 1)).toBeLessThan(n); // the last page is not empty
          const last = n - L.per * (L.pages - 1);
          expect(L.per - last, `${n} runes, room ${avail}: pages as even as they can be`).toBeLessThanOrEqual(L.pages - 1);
          // the fewest pages that fit: one fewer would need more rows than fit
          const most = Math.max(1, Math.floor((avail - RUNE_LIST_HEAD - foot - 2) / RUNE_ROW_H));
          expect(L.pages, `${n} runes, room ${avail}`).toBe(Math.ceil(n / most));
          expect(L.per).toBeLessThanOrEqual(most);
        }
      }
    }
    expect(paged).toBeGreaterThan(300);
  });

  it("50 runes on the operator's phone (402x690 @3) under the rune bar: 4 pages of 13, 13, 13 and 11; a 17-rune list still fits whole", () => {
    const v = computeView(402, 690, 3);
    const top = 62; // about the rune bar's bottom on this view (the shots: the list starts under the bar's row)
    const avail = v.H - 4 - top;
    const L = runeListLayout(50, avail, 20);
    expect([L.pages, L.per]).toEqual([4, 13]);
    expect(50 - 13 * 3).toBe(11);
    expect(L.h).toBeLessThanOrEqual(avail);
    // RULING-RUN1-R1: the list ran off this phone past "about 21 runes" (measured under a taller room): here the whole list fits to 17
    // runes under the bar and runs off from 18, so everything from 18 runes up is paged, and everything up to 17 is as it was
    expect(runeListH(17)).toBeLessThanOrEqual(avail);
    expect(runeListH(18)).toBeGreaterThan(avail);
    expect(runeListLayout(17, avail, 20).pages).toBe(1);
    expect(runeListLayout(18, avail, 20).pages).toBe(2);
  });
});

describe("ENDLESS-1 3.5: the rune bar's paging (arrows, PageUp / PageDown, the wheel)", () => {
  const paged = (pages = 4): RuneBar => { const b = new RuneBar(); b.list = true; b.pages = pages; return b; };
  it("turn and keys stay inside the pages; a key it does not use is not taken; no keys with no list or one page", () => {
    const b = paged();
    expect(b.page).toBe(0);
    b.turn(-1);
    expect(b.page).toBe(0);
    expect(b.key("ArrowRight")).toBe(true);
    expect(b.key("PageDown")).toBe(true);
    expect(b.key("ArrowDown")).toBe(true);
    expect(b.page).toBe(3);
    expect(b.key("ArrowRight")).toBe(true); // used (and clamped), so the screen's own arrow keys do not also fire
    expect(b.page).toBe(3);
    expect(b.key("PageUp")).toBe(true);
    expect(b.key("ArrowLeft")).toBe(true);
    expect(b.key("ArrowUp")).toBe(true);
    expect(b.page).toBe(0);
    expect(b.key("f")).toBe(false);
    expect(b.key("Enter")).toBe(false);
    const closed = paged(); closed.list = false;
    expect(closed.key("ArrowRight")).toBe(false);
    expect(paged(1).key("ArrowRight")).toBe(false);
  });
  it("the wheel turns a page a notch, at most one every 0.2 s of the screen's clock, and is taken only while a paged list is up", () => {
    const b = paged();
    expect(b.wheel(100, 1)).toBe(true);
    expect(b.page).toBe(1);
    expect(b.wheel(100, 1.1)).toBe(true); // too soon: taken, not turned
    expect(b.page).toBe(1);
    expect(b.wheel(100, 1.25)).toBe(true);
    expect(b.page).toBe(2);
    expect(b.wheel(-100, 1.6)).toBe(true);
    expect(b.page).toBe(1);
    expect(b.wheel(0, 3)).toBe(false);
    const closed = paged(); closed.list = false;
    expect(closed.wheel(100, 1)).toBe(false);
    expect(paged(1).wheel(100, 1)).toBe(false);
  });
});

/** The logical canvases the picker is laid out on: every real view above (computeView), and three small synthetic ones (the 167 px wide
 *  phone the layout comments name, and two shorter ones), where an endless run's ~50 runes do not fit as full chips. */
const CANVASES: [string, number, number][] = [
  ...VIEWS.map(([name, w, h, dpr]): [string, number, number] => { const v = computeView(w, h, dpr); return [name, v.W, v.H]; }),
  ["167x300 (synthetic)", 167, 300], ["200x260 (synthetic)", 200, 260], ["240x330 (synthetic)", 240, 330],
];

describe("ENDLESS-1 3.5: the picker's tray of held runes (runePicker.ts pickLayout)", () => {
  const ids = IDS.slice(60, 62); // two cards (a day-5+ dawn)
  const held = (n: number): string[] => IDS.slice(0, n);
  const lay = (w: number, h: number, dpr: number, n: number, compactOk: boolean, tap = 0) => {
    const v = computeView(w, h, dpr);
    return { v, L: pickLayout(v.W, v.H, ids, -1, n, held(n), tap, 15, compactOk) };
  };

  it("a run without the mark (compactOk false) draws the tray it always drew: the same layout as the call without the argument, no `compact`", () => {
    for (const [name, W, H] of CANVASES) {
      for (const n of [0, 1, 3, 12, 21, 40, 50, 63]) {
        const a = pickLayout(W, H, ids, -1, n, held(n), 0, 15);
        const b = pickLayout(W, H, ids, -1, n, held(n), 0, 15, false);
        expect(b, `${name}, ${n} runes`).toEqual(a);
        expect(b, `${name}, ${n} runes`).not.toHaveProperty("compact");
      }
    }
  });

  it("with the mark, a tray that fits is the same layout, bit for bit; one that would run off the screen goes compact and then fits", () => {
    let compactCases = 0, fitCases = 0;
    for (const [name, W, H] of CANVASES) {
      const v = { W, H };
      for (let n = 0; n <= 65; n++) {
        const std = pickLayout(W, H, ids, -1, n, held(n), 0, 15, false);
        const on = pickLayout(W, H, ids, -1, n, held(n), 0, 15, true);
        if (!n || std.bottom <= v.H - 4) {
          fitCases++;
          expect(on, `${name}, ${n} runes: it fits, so nothing changes`).toEqual(std);
          continue;
        }
        compactCases++;
        expect(on.compact, `${name}, ${n} runes`).toBe(true);
        expect(on.bottom, `${name}, ${n} runes: shorter than the full tray`).toBeLessThan(std.bottom);
        expect(on.bottom, `${name}, ${n} runes: on the screen`).toBeLessThanOrEqual(v.H - 4);
        expect(on.trayChips).toHaveLength(n);
        const tray = on.tray!;
        expect(tray.x).toBe(std.tray!.x);
        expect(tray.w).toBe(std.tray!.w);
        for (const [i, c] of on.trayChips.entries()) {
          expect([c.w, c.h], `${name}, ${n} runes, chip ${i}`).toEqual([RUNE_SMALL_W, RUNE_SMALL_H]);
          expect(c.x, `${name}, ${n} runes, chip ${i}`).toBeGreaterThanOrEqual(tray.x + 1);
          expect(c.x + c.w, `${name}, ${n} runes, chip ${i}`).toBeLessThanOrEqual(tray.x + tray.w - 1);
          expect(c.y, `${name}, ${n} runes, chip ${i}`).toBeGreaterThanOrEqual(tray.y + 1);
          expect(c.y + c.h, `${name}, ${n} runes, chip ${i}`).toBeLessThanOrEqual(tray.y + tray.h - 1);
          for (let j = 0; j < i; j++) {
            const d = on.trayChips[j];
            expect(c.x < d.x + d.w && d.x < c.x + c.w && c.y < d.y + d.h && d.y < c.y + c.h, `${name}, ${n} runes: chips ${j} and ${i} overlap`).toBe(false);
          }
        }
        // the cards are where they were above the tray (the layout above them is the same function of the same numbers)
        expect(on.cards).toHaveLength(ids.length);
        expect(on.cards[0].y).toBeGreaterThanOrEqual(on.top + 33);
        expect(on.tray!.y).toBeGreaterThan(on.cards[ids.length - 1].y + on.cards[ids.length - 1].h);
      }
    }
    expect(compactCases, "the compact tray is exercised").toBeGreaterThan(60);
    expect(fitCases).toBeGreaterThan(100);
  });

  it("the deepest dawn (day 64 holds 63 runes) fits the operator's phone, compact; 50 runes there already fit full-size", () => {
    const a = lay(402, 690, 3, 63, true);
    expect(a.L.compact).toBe(true);
    expect(a.L.bottom).toBeLessThanOrEqual(a.v.H - 4);
    const b = lay(402, 690, 3, 50, true);
    expect(b.L.compact).toBeUndefined();
    expect(b.L.bottom).toBeLessThanOrEqual(b.v.H - 4);
  });
});

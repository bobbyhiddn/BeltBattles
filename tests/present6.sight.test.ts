// PRESENT-6 N (REQ-BFG-081, REQ-BFG-004; the release lane's F8, STAGE-09151's ruling 14): a MOUSE's first-sight box keeps off its own panel's text rows. In a first run the box that opens by itself for a mouse is the hover tooltip's look under its word
//  (keywords.ts drawKeywordLayer, `s.auto`), which lay over the rows below the word: 402x690's belt 0 in the STAGE's scene (the `sides` deck, its SPLITTER out, a SORTING ARM at (1,5) turned east: COPIES 1.3) had the COPIES note over rows T4-T6 and the
//  readout's first labels (0.9.15 drew the same). N0's sweep (tests/present6.sight.helpers.ts: every panel a finger can open and the showcase decks' belts, eight views, both pointers, both tip states) showed a FINGER's first-sight notes cover no text row on any of
//  them (so N2 has nothing to fix) and a mouse's covered one in 5,247 of 29,000-odd notes. N1 (keywords.ts sightTipPlace, wordTipBox, drawWordTip's `place`; inspector.ts deckAny): the place is the first of: under the word where that covers no text row, header row, button,
//  how-to strip or its own word and is whole on the screen (x moved left only as far as the screen needs); inside the panel's body under its last text row, 2 px clear; off the panel (the landscape column's under, band and corner, never over a hard rect; a phone's band
//  panel: just under the panel and its strip, ending above the deck's top); else today's place (listed below by name). The box keeps its size, look and text; the place is chosen ONCE from its first frame (KwState.sightAt). The player's own hover tip and a rune card's tip are
//  drawWordTip's old place to the pixel (the base's function is copied below as the oracle).
import { describe, expect, it } from "vitest";
import { fresh, G as gOf, installRaster, type RasterCanvas } from "./raster.helpers";
import { C } from "../src/render/palette";
import { rect } from "../src/render/pixel";
import { icons } from "../src/render/font";
import { colourize, drawRich, lineWidth, wrapRich } from "../src/ui/richText";
import type { Rect } from "../src/ui/ui";
import { setTipsForTests } from "../src/ui/tips";
import { drawWordTip, keywordState, keywordsIdle, keywordsPressed, sightTipPlace, wordTipBox, type ColumnSpec } from "../src/screens/build/keywords";
import { visibleLines, type PLine } from "../src/screens/build/inspector";
import { KINDS, SWEEP_VIEWS, allPanels, beltPanels, framed, noteRegion, panelCtx, sweep, tabulate, type Panel, type Pointer, type SweepView, type TipState } from "./present6.sight.helpers";

installRaster();
const BIG = 3_600_000;
const ov = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ------------------------------------------------------------------------------------------------------------ the ladder, on built cases
/** a drawn text row of face `font` at y (the layer's `lines` are visibleLines' { line, y }) */
const row = (y: number, font: "5" | "3" = "5"): { line: PLine; y: number } => ({ line: { font } as unknown as PLine, y });
const PANEL: Rect = { x: 3, y: 106, w: 235, h: 90 }; // 402x690's band panel
const ROWS = [row(131), row(140), row(149), row(163), row(172), row(181)]; // the F8 belt's six rows: the last ends at 188
const BOX: Rect = { x: 61, y: 147, w: 157, h: 22 }; // the COPIES note under its word (a 2-line box)
const BASE = { r: PANEL, bodyY: 131, lines: ROWS, head: [{ x: 3, y: 106, w: 235, h: 25 }], strip: null, own: [{ glyph: { x: 64, y: 140, w: 25, h: 7 } }], screen: { W: 241, H: 414 } } as const;

describe("PRESENT-6 N1: the ladder's order (keywords.ts sightTipPlace), on built cases", () => {
  it("(today) a box already clear of every row, the header, the strip and its word, whole on the screen, is returned as it is", () => {
    const today: Rect = { x: 61, y: 192, w: 157, h: 22 }; // the word on the last row: the box under it is below row 181-188
    expect(sightTipPlace(today, { ...BASE, own: [{ glyph: { x: 64, y: 181, w: 25, h: 7 } }] })).toEqual({ box: today, place: "today" });
  });
  it("(today, moved left) a box past the screen's right edge that is otherwise clear keeps its y and its place under the word: only x moves, as far as the screen needs", () => {
    const today: Rect = { x: 200, y: 192, w: 157, h: 22 };
    const got = sightTipPlace(today, { ...BASE, own: [{ glyph: { x: 203, y: 181, w: 25, h: 7 } }] });
    expect(got.place).toBe("today");
    expect(got.box).toEqual({ x: 241 - 2 - 157, y: 192, w: 157, h: 22 });
  });
  it("(inside) a box over the rows goes inside the panel's body under its last row, 2 px clear, the box and its 2 px shadow whole inside the frame (x moved only as far as the panel needs)", () => {
    const rows = [row(131), row(140), row(149)]; // the text ends at 156: the panel is 90 tall
    const got = sightTipPlace(BOX, { ...BASE, lines: rows, own: [{ glyph: { x: 64, y: 140, w: 25, h: 7 } }] });
    expect(got).toEqual({ box: { x: 61, y: 158, w: 157, h: 22 }, place: "inside" });
    expect(got.box.y + got.box.h + 2).toBeLessThanOrEqual(PANEL.y + PANEL.h);
    // a box wider than the panel's reach from its x: moved left into the frame
    const wide = sightTipPlace({ ...BOX, x: 150 }, { ...BASE, lines: rows });
    expect(wide.place).toBe("inside");
    expect(wide.box.x + wide.box.w + 2).toBeLessThanOrEqual(PANEL.x + PANEL.w);
  });
  it("(below) no room inside: just under the panel (2 px clear) on a phone's band, where it ends above the deck's top; with a how-to strip, just under the strip", () => {
    const deck: Rect = { x: 54, y: 243, w: 133, h: 133 };
    expect(sightTipPlace(BOX, { ...BASE, deck })).toEqual({ box: { x: 61, y: 198, w: 157, h: 22 }, place: "below" });
    const strip: Rect = { x: 3, y: 196, w: 235, h: 12 };
    expect(sightTipPlace(BOX, { ...BASE, deck, strip })).toEqual({ box: { x: 61, y: 210, w: 157, h: 22 }, place: "below" });
  });
  it("(below, flush) where 2 px under the panel is a few px too low for the deck, the box ends flush at the deck's top (whole px), no higher than the panel's foot", () => {
    expect(sightTipPlace(BOX, { ...BASE, deck: { x: 54, y: 219.8, w: 133, h: 133 } })).toEqual({ box: { x: 61, y: 197, w: 157, h: 22 }, place: "below" }); // floor(219.8) = 219: 219 - 22 = 197 >= the foot 196
  });
  it("(fallback) no place: the deck is too close, or the layout gives no deck: today's box, as it is", () => {
    expect(sightTipPlace(BOX, { ...BASE, deck: { x: 54, y: 215, w: 133, h: 133 } })).toEqual({ box: BOX, place: "fallback" });
    expect(sightTipPlace(BOX, { ...BASE })).toEqual({ box: BOX, place: "fallback" });
  });
  it("(column) the landscape column: under the panel (today's x, else the column's left edge) where no hard rect is touched, else the band, else the corner, else today's", () => {
    const col: ColumnSpec = { covers: () => true, top: 102, areaBottom: 398, beside: null, floor: 398, hard: [{ x: 173, y: 138, w: 281, h: 225 }], band: { x: 136, y: 99, w: 200, h: 36 }, corner: { x: 3, y: 44, w: 86, h: 56 } };
    const panel: Rect = { x: 6, y: 102, w: 128, h: 207 }, rows = [row(131), row(140), row(149), row(163), row(172), row(181), row(190), row(199), row(208), row(250)];
    const own = [{ glyph: { x: 26, y: 144, w: 37, h: 9 } }], today: Rect = { x: 23, y: 157, w: 157, h: 22 }; // under COPIES: over rows
    const o = { r: panel, bodyY: 131, lines: rows, head: [{ x: 6, y: 102, w: 128, h: 25 }], strip: null, own, screen: { W: 640, H: 400 }, column: { ...col, hard: [...col.hard, panel] } };
    // the carrier's reach starts at x 173: the box at today's x (23..180) touches it, the column's left edge (8..165) does not
    expect(sightTipPlace(today, o)).toEqual({ box: { x: 8, y: 311, w: 157, h: 22 }, place: "under" });
    // under refused (the column's area ends too soon): the band, as wide as the box needs from the room's left edge
    expect(sightTipPlace(today, { ...o, column: { ...o.column, areaBottom: 320 } })).toEqual({ box: { x: 136, y: 99, w: 157, h: 22 }, place: "band" });
    expect(sightTipPlace(today, { ...o, column: { ...o.column, areaBottom: 320, band: null, corner: { x: 3, y: 44, w: 200, h: 56 } } })).toEqual({ box: { x: 3, y: 78, w: 157, h: 22 }, place: "corner" });
    expect(sightTipPlace(today, { ...o, column: { ...o.column, areaBottom: 320, band: null, corner: { x: 3, y: 44, w: 86, h: 56 } } })).toEqual({ box: today, place: "fallback" }); // the corner is narrower than the box
  });
});

// ------------------------------------------------------------------------------------------------------------ the F8 scene's panel
/** the first note's place on the F8 panel (the `sides` deck at day 5, its SPLITTER out, a SORTING ARM at (1,5) east, belt 1: COPIES 1.3) at each swept view with a mouse, every tip new (the STAGE's state) */
const F8_PLACE: Record<string, string | null> = {
  "op-402x690, no rune": "below", "op-402x690, a rune": null, "phone-390x844": "inside", "phone-390x660": "below", "iphone15pm-430x739": "below", "desk-1280x800": "under", "desk-1366x768": "under", "desk-1920x1080": "fallback",
};
function chainOf(view: SweepView, p: Panel, state: TipState, pointer: Pointer = "mouse") {
  const f = framed(view.w, view.h, view.dpr, view.runes);
  setTipsForTests(state);
  const pc = panelCtx(p.run, p.sel, f, pointer === "finger");
  let fr = pc.draw();
  const notes: { box: Rect; place: string | undefined; word: string | undefined; rows: number; r: Rect }[] = [];
  for (let i = 0; i < 8; i++) {
    const box = noteRegion(fr.ui);
    if (!box || !fr.d) break;
    const st = keywordState(pc.ctx) as unknown as { sightAt: { word: string; place: string } | null };
    const rows = visibleLines(fr.d.plan).filter((v) => v.line !== "rule" && v.y - 1 < box.y + box.h && box.y < v.y + ((v.line as { font: string }).font === "5" ? 7 : 5) + 1).length;
    notes.push({ box: { ...box }, place: st.sightAt?.place, word: st.sightAt?.word, rows, r: { ...fr.d.plan.r } });
    keywordsPressed(pc.ctx, null);
    fr = pc.draw();
  }
  keywordsIdle(pc.ctx);
  return { notes, f };
}
describe("PRESENT-6 N1: the F8 scene's panel (402x690's belt 0 with a SORTING ARM: COPIES 1.3)", () => {
  const f8 = beltPanels()[0];
  it("the COPIES box (and the two notes after it) cover no row of the panel at every swept view where a place exists; 1920x1080 has none (listed); with a rune the phone's band shows the header only (no word, no note)", () => {
    expect(f8.id).toMatch(/^F8/);
    for (const view of SWEEP_VIEWS) for (const state of ["new", "sight"] as const) {
      const { notes } = chainOf(view, f8, state);
      const want = F8_PLACE[view.name];
      if (want === null) { expect(notes.length, `${view.name}: header only`).toBe(0); continue; }
      expect(notes.length, `${view.name} ${state}: COPIES, BURN, SPEED (390x660's panel shows COPIES alone)`).toBeGreaterThanOrEqual(1);
      expect(notes[0].word, `${view.name}: the first sight is COPIES`).toBe("COPIES");
      expect(notes[0].place, `${view.name} ${state}: the first note's place`).toBe(want);
      for (const n of notes) {
        if (want === "fallback") expect(n.rows, `${view.name}: no place (the carrier's reach leaves 153 px under the column, the box is 157-160): today's box, over the rows`).toBeGreaterThan(0);
        else expect(n.rows, `${view.name} ${state}: ${n.word} covers no text row`).toBe(0);
      }
    }
  });
});

// ------------------------------------------------------------------------------------------------------------ the sweep, base -> tip
/** The sample the pins are for: every 5th of the 899 panels a finger can open, and every belt panel (the F8 panel and the showcase decks' belts), at each view, both pointers, both tip states.
 *  Each entry: [belt notes, belt notes covering a text row, all notes, all notes covering a text row, notes over a hard rect (the deck's cells, FIGHT, the cargo bar, the top bar, a shop card, a pack, the foe card), over the header or a button, over the how-to strip],
 *  at present6-base (`base`, measured by this same file's sweep at that tree) and at the tip. A finger's boxes are the same to the px (the whole 24,044 notes of the full sweep, kit/n0cmp.py: 0 moved); a mouse's text-row coverings fall (belts: 0 wherever a place exists), and no count of
 *  a hard rect, the header, a button or the strip rises. */
const PINS: Record<string, { base: number[]; tip: number[] }> = {
  "op-402x690, no rune|new|mouse": { base: [19, 19, 385, 73, 2, 0, 3], tip: [19, 0, 385, 0, 2, 0, 0] },
  "op-402x690, no rune|new|finger": { base: [19, 0, 385, 0, 0, 0, 18], tip: [19, 0, 385, 0, 0, 0, 18] },
  "op-402x690, no rune|sight|mouse": { base: [19, 19, 385, 73, 0, 0, 0], tip: [19, 0, 385, 0, 0, 0, 0] },
  "op-402x690, no rune|sight|finger": { base: [19, 0, 385, 0, 0, 0, 0], tip: [19, 0, 385, 0, 0, 0, 0] },
  "op-402x690, a rune|new|mouse": { base: [1, 1, 349, 39, 109, 0, 223], tip: [1, 0, 349, 15, 109, 0, 59] },
  "op-402x690, a rune|new|finger": { base: [19, 0, 387, 0, 0, 0, 155], tip: [19, 0, 387, 0, 0, 0, 155] },
  "op-402x690, a rune|sight|mouse": { base: [1, 1, 349, 39, 0, 0, 0], tip: [1, 0, 349, 0, 0, 0, 0] },
  "op-402x690, a rune|sight|finger": { base: [19, 0, 387, 0, 0, 0, 0], tip: [19, 0, 387, 0, 0, 0, 0] },
  "phone-390x844|new|mouse": { base: [19, 19, 385, 82, 0, 0, 2], tip: [19, 0, 385, 0, 0, 0, 0] },
  "phone-390x844|new|finger": { base: [19, 0, 385, 0, 0, 0, 0], tip: [19, 0, 385, 0, 0, 0, 0] },
  "phone-390x844|sight|mouse": { base: [19, 19, 385, 82, 0, 0, 0], tip: [19, 0, 385, 0, 0, 0, 0] },
  "phone-390x844|sight|finger": { base: [19, 0, 385, 0, 0, 0, 0], tip: [19, 0, 385, 0, 0, 0, 0] },
  "phone-390x660|new|mouse": { base: [12, 12, 368, 67, 86, 0, 141], tip: [12, 0, 368, 54, 86, 0, 141] },
  "phone-390x660|new|finger": { base: [19, 0, 385, 0, 0, 0, 90], tip: [19, 0, 385, 0, 0, 0, 90] },
  "phone-390x660|sight|mouse": { base: [12, 12, 368, 67, 86, 0, 0], tip: [12, 0, 368, 0, 86, 0, 0] },
  "phone-390x660|sight|finger": { base: [19, 0, 385, 0, 0, 0, 0], tip: [19, 0, 385, 0, 0, 0, 0] },
  "iphone15pm-430x739|new|mouse": { base: [19, 19, 386, 73, 2, 0, 4], tip: [19, 0, 386, 0, 2, 0, 0] },
  "iphone15pm-430x739|new|finger": { base: [19, 0, 386, 0, 0, 0, 2], tip: [19, 0, 386, 0, 0, 0, 2] },
  "iphone15pm-430x739|sight|mouse": { base: [19, 19, 386, 73, 0, 0, 0], tip: [19, 0, 386, 0, 0, 0, 0] },
  "iphone15pm-430x739|sight|finger": { base: [19, 0, 386, 0, 0, 0, 0], tip: [19, 0, 386, 0, 0, 0, 0] },
  "desk-1280x800|new|mouse": { base: [19, 19, 19, 19, 7, 0, 0], tip: [19, 0, 19, 0, 0, 0, 0] },
  "desk-1280x800|new|finger": { base: [19, 0, 19, 0, 0, 0, 0], tip: [19, 0, 19, 0, 0, 0, 0] },
  "desk-1280x800|sight|mouse": { base: [19, 19, 385, 182, 33, 222, 0], tip: [19, 0, 385, 0, 0, 0, 0] },
  "desk-1280x800|sight|finger": { base: [19, 0, 385, 0, 0, 0, 0], tip: [19, 0, 385, 0, 0, 0, 0] },
  "desk-1366x768|new|mouse": { base: [19, 19, 19, 19, 7, 0, 0], tip: [19, 0, 19, 0, 0, 0, 0] },
  "desk-1366x768|new|finger": { base: [19, 0, 19, 0, 0, 0, 0], tip: [19, 0, 19, 0, 0, 0, 0] },
  "desk-1366x768|sight|mouse": { base: [19, 19, 385, 182, 16, 222, 0], tip: [19, 0, 385, 0, 0, 0, 0] },
  "desk-1366x768|sight|finger": { base: [19, 0, 385, 0, 0, 0, 0], tip: [19, 0, 385, 0, 0, 0, 0] },
  "desk-1920x1080|new|mouse": { base: [19, 19, 19, 19, 7, 0, 0], tip: [19, 19, 19, 19, 7, 0, 0] },
  "desk-1920x1080|new|finger": { base: [19, 0, 19, 0, 0, 0, 0], tip: [19, 0, 19, 0, 0, 0, 0] },
  "desk-1920x1080|sight|mouse": { base: [19, 19, 385, 182, 161, 222, 0], tip: [19, 19, 385, 142, 154, 163, 0] },
  "desk-1920x1080|sight|finger": { base: [19, 0, 385, 0, 109, 0, 0], tip: [19, 0, 385, 0, 109, 0, 0] },
};
const STRIDE = 5;
const sample = (): Panel[] => [...allPanels().filter((_, i) => i % STRIDE === 0), ...beltPanels()];
const stats = (notes: ReturnType<typeof sweep>): number[] => {
  const belts = notes.filter((n) => n.kind === "belt");
  return [belts.length, belts.filter((n) => n.textRows).length, notes.length, notes.filter((n) => n.textRows).length, notes.filter((n) => n.hard.length).length, notes.filter((n) => n.head).length, notes.filter((n) => n.strip).length];
};
describe("PRESENT-6 N1: the sweep's counts, base -> tip, per view, pointer and tip state", () => {
  const panels = sample();
  for (const view of SWEEP_VIEWS) it(`${view.name}: a mouse's notes covering a text row fall (a belt's: to 0 wherever a place exists), none rises a count of a hard rect, the header, a button or the strip; a finger's notes are as they were`, () => {
    for (const state of ["new", "sight"] as const) for (const pointer of ["mouse", "finger"] as const) {
      const notes = sweep(view, pointer, panels, state), got = stats(notes), pin = PINS[`${view.name}|${state}|${pointer}`];
      expect(got, `${view.name} ${state} ${pointer}: [belt notes, belt notes over a row, notes, notes over a row, over a hard rect, over the header or a button, over the strip]`).toEqual(pin.tip);
      for (let i = 4; i < 7; i++) expect(pin.tip[i], `${view.name} ${state} ${pointer}: column ${i} never rises`).toBeLessThanOrEqual(pin.base[i]);
      expect(pin.tip[3]).toBeLessThanOrEqual(pin.base[3]);
      expect(pin.tip[1]).toBeLessThanOrEqual(pin.base[1]);
      if (pointer === "finger") { expect(pin.tip, "a finger's first-sight notes are not touched").toEqual(pin.base); expect(got[3], "and cover no text row").toBe(0); }
      else if (view.name !== "desk-1920x1080") expect(got[1], `${view.name} ${state}: no belt note covers a text row (a place exists)`).toBe(0);
      // the table by kind, for the log (notes / over a text row / over a rule row)
      if (pointer === "mouse" && state === "sight") {
        const tab = tabulate(notes);
        console.log(`PRESENT-6 N1 ${view.name} sight mouse: ${KINDS.filter((k) => tab[`${view.name} | mouse | sight | ${k}`]).map((k) => { const c = tab[`${view.name} | mouse | sight | ${k}`]; return `${k} ${c.notes}/${c.text}/${c.rule}`; }).join("; ")}`);
      }
    }
  }, BIG);

  it("1920x1080 keeps today's place for the belts (the carrier's reach leaves 153 px under the 128 px column, the box is 157-160 px): the panels that land at the fallback there are the 19 belt notes, listed", () => {
    const view = SWEEP_VIEWS.find((v) => v.name === "desk-1920x1080")!, notes = sweep(view, "mouse", beltPanels(), "new");
    const left = notes.filter((n) => n.kind === "belt" && n.textRows);
    expect(left.length).toBe(19);
    console.log(`PRESENT-6 N1 desk-1920x1080 belts left at today's place: ${[...new Set(left.map((n) => n.panel))].join("; ")}`);
  });
});

// ------------------------------------------------------------------------------------------------------------ chosen once; the region is the box
describe("PRESENT-6 N1: the place is chosen once, from the box's first frame; SIGHT_REGION's rect is the box drawn", () => {
  it("every later frame of a note is the first frame's box (the region and sightAt), on a phone and on the desk; the next note is placed for its own word", () => {
    for (const name of ["op-402x690, no rune", "desk-1280x800"]) {
      const view = SWEEP_VIEWS.find((v) => v.name === name)!, f = framed(view.w, view.h, view.dpr, view.runes), p = beltPanels()[0];
      setTipsForTests("new");
      const pc = panelCtx(p.run, p.sel, f, false);
      let fr = pc.draw();
      const first = noteRegion(fr.ui)!, st = keywordState(pc.ctx) as unknown as { sightAt: { word: string; box: Rect; place: string } };
      const at = st.sightAt;
      expect(first, `${name}: a note shows in the first frame`).toBeTruthy();
      for (let i = 0; i < 4; i++) {
        fr = pc.draw();
        expect(noteRegion(fr.ui), `${name}: the same box on frame ${i + 2}`).toEqual(first);
        expect((keywordState(pc.ctx) as unknown as { sightAt: unknown }).sightAt, `${name}: the same place on frame ${i + 2}`).toBe(at);
      }
      keywordsPressed(pc.ctx, null);
      fr = pc.draw();
      const next = (keywordState(pc.ctx) as unknown as { sightAt: { word: string } | null }).sightAt;
      expect(next && next.word, `${name}: the next note is placed for its own word`).not.toBe(at.word);
      keywordsIdle(pc.ctx);
    }
  });

  it("the region's rect is the drawn box (the ink frame, the night fill, the top edge in the word's colour) for every note of the F8 chain, on every view that has one", () => {
    for (const view of SWEEP_VIEWS) {
      const f = framed(view.w, view.h, view.dpr, view.runes), p = beltPanels()[0];
      setTipsForTests("new");
      const pc = panelCtx(p.run, p.sel, f, false);
      let fr = pc.draw();
      for (let i = 0; i < 4; i++) {
        const b = noteRegion(fr.ui);
        if (!b) break;
        expect(fr.cv.at(b.x, b.y), `${view.name} note ${i + 1}: ink at the corner`).toBe(C.ink);
        expect(fr.cv.at(b.x + b.w - 1, b.y + b.h - 1), `${view.name}: ink at the far corner`).toBe(C.ink);
        expect(fr.cv.at(b.x + 3, b.y + 3), `${view.name}: the night fill inside`).toBe(C.night);
        keywordsPressed(pc.ctx, null);
        fr = pc.draw();
      }
      keywordsIdle(pc.ctx);
    }
  });
});

// ------------------------------------------------------------------------------------------------------------ the player's own hover tip and a rune card's tip: drawWordTip's old place, to the pixel
/** The base's drawWordTip (present6-base, src/screens/build/keywords.ts :1327-1342), copied whole: the oracle. */
function baseWordTip(g: CanvasRenderingContext2D, text: string, colour: string, glyph: Rect, r: Rect, screen?: { W: number; H: number }, avoid?: Rect | null): Rect {
  const lines = wrapRich(colourize(icons(text), C.bone), 150, "3");
  const w = Math.max(...lines.map((l) => lineWidth(l, "3"))) + 10, h = 8 + lines.length * 7;
  let x = Math.max(2, Math.min(r.x + r.w + 200 - w, glyph.x - 4));
  if (screen) x = Math.max(2, Math.min(screen.W - w - 2, x));
  let y = glyph.y + glyph.h + 4;
  if (avoid && ov({ x, y, w: w + 2, h: h + 2 }, avoid) && glyph.y - 4 - h >= 2) y = glyph.y - 4 - h;
  rect(g, x + 2, y + 2, w, h, C.ink);
  rect(g, x, y, w, h, C.ink);
  rect(g, x + 1, y + 1, w - 2, h - 2, C.night);
  rect(g, x + 1, y + 1, w - 2, 1, colour === C.bone ? C.slate3 : colour);
  lines.forEach((l, i) => drawRich(g, l, x + 5, y + 4 + i * 7, "3"));
  return { x, y, w, h };
}
const same = (a: RasterCanvas, b: RasterCanvas): boolean => a.px.length === b.px.length && a.px.every((p, i) => p === b.px[i]);
describe("PRESENT-6 N1: drawWordTip without a `place` is the base's function to the pixel (the player's own hover tip, a rune card's tip: 0 px)", () => {
  const TEXTS = ["COPIES: SPLITTER AND SORTING ARM TURN A SLUG INTO MORE SLUGS.", "BURN: SETS A SLUG ON FIRE FOR 5 SEC, TAKING DAMAGE EVERY SECOND THE FIRE LASTS; A SECOND BURN ADDS TO THE FIRST AND RESTARTS ITS TIMER.", "RATE: SHOTS A SECOND."];
  it("the same rect and the same pixels for every word position, panel, screen and `avoid` (the rune card's TAP AGAIN bar)", () => {
    let n = 0;
    for (const text of TEXTS) for (const r of [{ x: 3, y: 106, w: 235, h: 90 }, { x: 6, y: 102, w: 128, h: 207 }]) for (const gx of [3, 90, 220]) for (const gy of [20, 190])
      for (const screen of [undefined, { W: 241, H: 414 }, { W: 160, H: 200 }]) for (const avoid of [undefined, null, { x: gx - 4, y: gy + 10, w: 100, h: 14 }]) {
        const glyph: Rect = { x: gx, y: gy, w: 25, h: 7 }, a = fresh(330, 260), b = fresh(330, 260), c = fresh(330, 260);
        const ra = baseWordTip(gOf(a), text, C.yellow, glyph, r, screen, avoid), rb = drawWordTip(gOf(b), text, C.yellow, glyph, r, screen, avoid);
        expect(rb, `${n}: the returned rect`).toEqual(ra);
        expect(same(a, b), `${n}: the pixels`).toBe(true);
        // `place` at the box's own place is the same drawing; wordTipBox is that box
        expect(drawWordTip(gOf(c), text, C.yellow, glyph, r, screen, avoid, { x: ra.x, y: ra.y })).toEqual(ra);
        expect(same(a, c), `${n}: place = its own place`).toBe(true);
        expect(wordTipBox(text, glyph, r, screen, avoid)).toEqual(ra);
        n++;
      }
    expect(n).toBeGreaterThan(300);
  });
  it("`place` moves the box and nothing else: the same size, text and colours at the new place", () => {
    const glyph: Rect = { x: 60, y: 140, w: 25, h: 7 }, r = { x: 3, y: 106, w: 235, h: 90 }, a = fresh(330, 260), b = fresh(330, 260);
    const ra = baseWordTip(gOf(a), TEXTS[0], C.yellow, glyph, r), rb = drawWordTip(gOf(b), TEXTS[0], C.yellow, glyph, r, undefined, undefined, { x: ra.x + 20, y: ra.y + 40 });
    expect([rb.w, rb.h]).toEqual([ra.w, ra.h]);
    expect([rb.x, rb.y]).toEqual([ra.x + 20, ra.y + 40]);
    for (let j = 0; j < ra.h + 2; j++) for (let i = 0; i < ra.w + 2; i++) expect(b.at(rb.x + i, rb.y + j), `(${i}, ${j})`).toBe(a.at(ra.x + i, ra.y + j));
  });
});

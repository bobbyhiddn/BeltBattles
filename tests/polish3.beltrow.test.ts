// POLISH-3 (REQ-BFG-089; BRIEF-POLISH3 Q3, the phone's half; the pieces lane's display list, item 4): A BELT PANEL KEEPS ITS HIT ROWS.
//   ROWS-1's give-way rule (inspector.ts choose, moreNote): whole trailing rows of a belt's timeline give way and `+N MORE HIT TILES (NUMBERED ON THE DECK)` counts them. The list said the phones show
//   every row; they did not once a rune was held, which is the operator's phone in a real run (the rune row takes the band from 90 px to 57): over POLISH-2's corpus (75 belts), 402x690 with a rune
//   gave rows away in 104 of 150 plans (the band and the press), every belt with 2 or more hits, and 320x568 with a rune too. The rows are `trim` blocks, so a plan that dropped them was still
//   fullText (it counted only an ability sentence given way) and keptWhole, and panelFit and panelArea never grew a finger's panel: it stayed in its 57 px band after the press.
//   Now a hit row given way is text given way (inspector.ts fullText): a finger's panel grows, as every other panel does before text gives way. The no-press band keeps the give-way rule.
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { corpus, framed, casesOf, optsFor, type ViewSpec } from "./polish2.guestCorpus";
import { fullText, gapsAtLeast, planPanel, visibleLines, type PanelPlan } from "../src/screens/build/inspector";
import { lineText } from "../src/ui/richText";

installRaster();

const RUNE_402: ViewSpec = { name: "402x690 @3, a rune", w: 402, h: 690, dpr: 3, runes: 1, main: false };
const RUNE_320: ViewSpec = { name: "320x568 @2, a rune", w: 320, h: 568, dpr: 2, runes: 1, main: false };
const PLAIN: ViewSpec[] = [
  { name: "402x690 @3", w: 402, h: 690, dpr: 3, runes: 0, main: true }, { name: "360x640 @2", w: 360, h: 640, dpr: 2, runes: 0, main: true }, { name: "390x844 @3", w: 390, h: 844, dpr: 3, runes: 0, main: false },
];

/** The hit rows a plan gives way (the `trim` blocks that are not JOINS rows: what `+N MORE HIT TILES` counts) and the note's own number, if it is drawn. */
const givenWay = (p: PanelPlan): number => p.body.dropped.filter((b) => b.trim && !b.join).length;
const noteOf = (p: PanelPlan): number | null => {
  for (const v of visibleLines(p)) if (v.line !== "rule") { const m = /^\+(\d+) MORE HIT TILES?\b/.exec(lineText(v.line.spans)); if (m) return +m[1]; }
  return null;
};
/** The timeline rows of the panel's text that a plan draws, and the ones its text has (the guest line aside). */
const rowsDrawn = (p: PanelPlan): number => { const drawn = new Set(visibleLines(p).map((v) => v.line)); return p.body.shown.filter((l) => l.b.trim && !l.b.hold && l.lines.every((ln) => drawn.has(ln))).length; };
const rowsOf = (t: { body: readonly { trim?: boolean; hold?: boolean; join?: boolean }[] }): number => t.body.filter((b) => b.trim && !b.hold).length;

describe("POLISH-3 Q3 (phone): a belt panel keeps every hit row after a press, with a rune held", () => {
  for (const spec of [RUNE_402, RUNE_320]) {
    it(`${spec.name}: every belt of 2 to 6 hits shows every row after a press (the panel grows past the ${"57"}-px band), and the note is gone`, () => {
      const f = framed(spec.w, spec.h, spec.dpr, spec.runes);
      let n = 0, grown = 0;
      for (const b of corpus().filter((x) => x.hits >= 2)) {
        const c = casesOf(b, spec, f).find((x) => x.state === "press")!;
        const p = c.withLine;
        expect(givenWay(p), `${b.label} (${b.hits} hits): rows given way after a press`).toBe(0);
        expect(noteOf(p), `${b.label}: no MORE HIT TILES note`).toBeNull();
        expect(rowsDrawn(p), `${b.label}: every timeline row of the text is drawn`).toBe(rowsOf(c.t));
        expect(fullText(p), `${b.label}: the full text`).toBe(true);
        expect(gapsAtLeast(p, p.gaps.min), `${b.label}: gaps at least min`).toBe(true);
        if (c.area.h > f.L.info.h) grown++;
        n++;
      }
      expect(n, "belts of 2 to 6 hits in the corpus").toBeGreaterThanOrEqual(40);
      expect(grown, "the panel is grown past the band for them").toBe(n);
    });

    it(`${spec.name}: the no-press band keeps the give-way rule, and its note counts only the rows that give way`, () => {
      const f = framed(spec.w, spec.h, spec.dpr, spec.runes);
      let gave = 0;
      for (const b of corpus().filter((x) => x.hits >= 2)) {
        const p = casesOf(b, spec, f).find((x) => x.state === "band")!.withLine;
        const k = givenWay(p);
        if (k > 0) { gave++; expect(noteOf(p), `${b.label}: the note says how many gave way`).toBe(k); }
        else expect(noteOf(p), `${b.label}: no row gave way, no note`).toBeNull();
      }
      expect(gave, `${spec.name}: belts whose band gives rows away`).toBeGreaterThan(40);
    });
  }

  it("402x690 with a rune, over the whole corpus (75 belts): the band gives rows away in 52 plans as before, the press in none (it was 104 of 150 plans)", () => {
    const f = framed(RUNE_402.w, RUNE_402.h, RUNE_402.dpr, RUNE_402.runes);
    let band = 0, press = 0, total = 0;
    for (const b of corpus()) for (const c of casesOf(b, RUNE_402, f)) {
      total++;
      if (noteOf(c.withLine) !== null) { if (c.state === "band") band++; else press++; }
    }
    expect([total, band, press]).toEqual([150, 52, 0]);
  });

  it("no rune: 402x690, 360x640 and 390x844 gave no row away before and give none now (the band holds them whole)", () => {
    for (const spec of PLAIN) {
      const f = framed(spec.w, spec.h, spec.dpr, spec.runes);
      for (const b of corpus()) for (const c of casesOf(b, spec, f)) {
        expect(givenWay(c.withLine), `${spec.name} ${b.label} ${c.state}`).toBe(0);
        expect(noteOf(c.withLine)).toBeNull();
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------- the desk (cap's ruling A)
// 1920x1080 (the build screen's desk column, 126 x 194), 844x390 (128 x 216) and 1280x800 (128 x 324); with the ENCHANTER's row up above the panel the column is 126 x 136. The rows were given way in
// 25 of 75 plans at 1920x1080 (4 hits 5 of 10; 5 and 6 hits all), 15 at 844x390 (5 hits 5 of 10, 6 hits all), none at 1280x800; with the row up 47, 46 and 46 of 75 (2 hits 7 or 6 of 12; 3 hits and more all).
// A column plan that gives hit rows away takes the 3x5 face (the band's own face) where that keeps every row (inspector.ts planRung, inside planIn); every other column panel keeps the 5x7 face.
const DESKS: ViewSpec[] = [
  { name: "desk 1920x1080", w: 1920, h: 1080, dpr: 1, runes: 0, main: false }, { name: "land 844x390 @3", w: 844, h: 390, dpr: 3, runes: 0, main: false }, { name: "desk 1280x800", w: 1280, h: 800, dpr: 1, runes: 0, main: true },
];
/** The belts that give rows away in the 5x7 face (planPanel's `rung: false`) at 1920x1080, 844x390 and 1280x800, and with the ENCHANTER's row up (the brief's numbers: 25, 15, 0 and 47, 46, 46; 16 each now). */
const WAS: Record<string, number> = { "desk 1920x1080": 25, "land 844x390 @3": 15, "desk 1280x800": 0 };
const ROW_UP = 136; // the column's height with the ENCHANTER's row up above the panel (126 x 136)

describe("POLISH-3 Q3 (desk; cap's ruling A): a column belt panel keeps its hit rows in the 3x5 face where that keeps every one", () => {
  for (const spec of DESKS) {
    it(`${spec.name}: no belt of the corpus gives a hit row away in the column (it was ${WAS[spec.name]} of 75); a belt takes the 3x5 face exactly where its 5x7 plan gave rows away`, () => {
      const f = framed(spec.w, spec.h, spec.dpr, spec.runes);
      let rung = 0;
      for (const b of corpus()) {
        const c = casesOf(b, spec, f)[0], opts = optsFor(f, 0, c.t, c.area);
        const on = planPanel(c.t, c.area, [], opts), off = planPanel(c.t, c.area, [], { ...opts, rung: false });
        expect(givenWay(c.withLine), `${b.label}: rows given way`).toBe(0);
        expect(noteOf(c.withLine), `${b.label}: no note`).toBeNull();
        if (givenWay(off) > 0) {
          rung++;
          expect(on.body.font, `${b.label} (${b.hits} hits): the 3x5 face`).toBe("3");
          expect(JSON.stringify(on), `${b.label}: the plan is the 3x5 plan`).toBe(JSON.stringify(planPanel(c.t, c.area, [], { ...opts, small: true })));
          expect(givenWay(on), b.label).toBe(0);
          expect(fullText(on), b.label).toBe(true);
        } else expect(JSON.stringify(on), `${b.label}: a belt that keeps its rows keeps its plan`).toBe(JSON.stringify(off));
      }
      expect(rung, `${spec.name}: belts that take the 3x5 face (the rows the 5x7 face gave way)`).toBe(WAS[spec.name]);
    });

    it(`${spec.name} with the ENCHANTER's row up (${ROW_UP} px of column): only the belts whose 3x5 plan gives rows away too (5 and 6 hits: 16 of 75) still do, and the note counts only those`, () => {
      const f = framed(spec.w, spec.h, spec.dpr, spec.runes);
      const area = { ...f.L.info, h: ROW_UP };
      let gave = 0;
      for (const b of corpus()) {
        const c = casesOf(b, spec, f)[0], opts = optsFor(f, 0, c.t, area);
        const p = planPanel(c.t, area, [], opts), sm = planPanel(c.t, area, [], { ...opts, small: true });
        if (givenWay(sm) === 0) expect(givenWay(p), `${b.label} (${b.hits} hits): the 3x5 plan keeps every row, so the panel does`).toBe(0);
        if (givenWay(p) > 0) {
          gave++;
          expect(b.hits, `${b.label}: only 5 and 6 hits give rows away in the 3x5 face too`).toBeGreaterThanOrEqual(5);
          expect(noteOf(p), `${b.label}: the note counts what still gives way`).toBe(givenWay(p));
        } else expect(noteOf(p), b.label).toBeNull();
        expect(gapsAtLeast(p, p.gaps.min), `${b.label}: gaps at least min`).toBe(true);
      }
      expect(gave, `${spec.name}: belts still giving rows away`).toBe(16);
    });
  }

  it("the desk's belt panel with a rune held on 402x690 (the band, not a column) is not moved by the rung: its plans are the same with and without it", () => {
    const f = framed(RUNE_402.w, RUNE_402.h, RUNE_402.dpr, RUNE_402.runes);
    for (const b of corpus()) for (const c of casesOf(b, RUNE_402, f)) {
      const opts = optsFor(f, 0, c.t, c.area);
      expect(JSON.stringify(planPanel(c.t, c.area, [], opts)), `${b.label} ${c.state}`).toBe(JSON.stringify(planPanel(c.t, c.area, [], { ...opts, rung: false })));
    }
  });
});

describe("POLISH-3 Q3: fullText counts a hit row given way as text given way", () => {
  it("a plan with the note (rows given way) is not the full text; the same belt after a press is", () => {
    const f = framed(RUNE_402.w, RUNE_402.h, RUNE_402.dpr, RUNE_402.runes);
    const b = corpus().find((x) => x.hits === 3)!;
    const [band, press] = casesOf(b, RUNE_402, f);
    expect(band.state).toBe("band");
    expect(press.state).toBe("press");
    expect(givenWay(band.withLine)).toBeGreaterThan(0);
    expect(fullText(band.withLine), "rows given way: not the full text").toBe(false);
    expect(givenWay(press.withLine)).toBe(0);
    expect(fullText(press.withLine), "every row shown: the full text").toBe(true);
    expect(press.area.h, "the panel grew from the band's 57 px").toBeGreaterThan(band.area.h);
    expect(band.area.h).toBe(f.L.info.h);
  });
});

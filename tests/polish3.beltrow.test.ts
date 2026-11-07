// POLISH-3 (REQ-BFG-089; BRIEF-POLISH3 Q3, the phone's half; the pieces lane's display list, item 4): A BELT PANEL KEEPS ITS HIT ROWS.
//   ROWS-1's give-way rule (inspector.ts choose, moreNote): whole trailing rows of a belt's timeline give way and `+N MORE HIT TILES (NUMBERED ON THE DECK)` counts them. The list said the phones show
//   every row; they did not once a rune was held, which is the operator's phone in a real run (the rune row takes the band from 90 px to 57): over POLISH-2's corpus (75 belts), 402x690 with a rune
//   gave rows away in 104 of 150 plans (the band and the press), every belt with 2 or more hits, and 320x568 with a rune too. The rows are `trim` blocks, so a plan that dropped them was still
//   fullText (it counted only an ability sentence given way) and keptWhole, and panelFit and panelArea never grew a finger's panel: it stayed in its 57 px band after the press.
//   Now a hit row given way is text given way (inspector.ts fullText): a finger's panel grows, as every other panel does before text gives way. The no-press band keeps the give-way rule.
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { corpus, framed, casesOf, type ViewSpec } from "./polish2.guestCorpus";
import { fullText, gapsAtLeast, visibleLines, type PanelPlan } from "../src/screens/build/inspector";
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

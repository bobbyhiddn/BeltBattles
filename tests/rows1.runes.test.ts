// ROWS-1 (REQ-BFG-100; F17 of 0.9.13's STAGE, a cut row): YOUR RUNES' list ("+n" chip) shows each rune's first sentence WHOLE. The list drew
// runeTextLines(...)[0], the first line of the first sentence, so a sentence that wraps on a phone showed only its first line: FORGE WARD's
// `EACH SLUG FROM YOUR FACTORY: +104 SHIELD.` read `EACH SLUG FROM YOUR FACTORY:` (and, found here, QUICK LATCH, SCRAP HALO, SCRAP SAINT and
// FINAL NAIL on the 360x640 phone, SCRAP HALO on the 402x690 one). Now every row draws every line of its first sentence (runeRowLines), a
// row is 19 px for one line and 9 more for each further line (runeListRowH), and the pages (runeListPages) hold WHOLE rows by those heights.
// The desk's rows are all one line, so nothing there moves: runeListPages is runeListLayout's answer, field for field, on one-line rows.
// Expectations are written from the rune catalogue's texts and the layout's own rule, never from the drawing code's own numbers.
import { describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { RUNES, type RuneDef } from "../src/sim/runes";
import { lineText } from "../src/ui/richText";
import { textWidth } from "../src/render/font";
import { isPhone, tapPx } from "../src/ui/tap";
import { runeLine, runeSentences } from "../src/ui/runeText";
import {
  RUNE_LIST_FOOT_MIN, RUNE_LIST_HEAD, RUNE_ROW_H, readoutW, runeCardTextW, runeListH, runeListLayout, runeListPages, runeListPlan, runeListRowH,
  runeRowLines, runeTextLines,
} from "../src/ui/runeBar";

const VIEWS: [string, number, number, number][] = [["desk 1280x800", 1280, 800, 1], ["op690 402x690 @3", 402, 690, 3], ["small 360x640 @2", 360, 640, 2]];
const ALL = Object.values(RUNES);
const ENDLESS50 = Object.keys(RUNES).slice(0, 50).map((id) => RUNES[id]); // scripts/shots-endless.mjs RUNES50: bb.runeIds().slice(0, 50)
const DAYS = [1, 10, 50];
const view = (w: number, h: number, dpr: number) => {
  const v = computeView(w, h, dpr), phone = isPhone(v);
  return { v, W: readoutW(v.W), tw: runeCardTextW(readoutW(v.W)), foot: Math.max(RUNE_LIST_FOOT_MIN, phone ? tapPx(v) : 0) };
};
/** A rune's first sentence as plain text: the whole text, or for a two-sentence text up to its first full stop and space. */
const firstSentence = (d: RuneDef, day: number): string => {
  const t = runeLine(d, day);
  return runeSentences(d).length > 1 ? t.slice(0, t.indexOf(". ") + 1) : t;
};

describe("ROWS-1 F17: a row draws its rune's first sentence whole, on every view", () => {
  it("every rune, days 1, 10 and 50, the three views' text widths: the drawn lines, joined, are the whole first sentence, none wider than the text width", () => {
    let rows = 0;
    for (const [name, w, h, dpr] of VIEWS) {
      const { tw } = view(w, h, dpr);
      for (const d of ALL) {
        for (const day of DAYS) {
          const lines = runeRowLines(d, tw, day);
          expect(lines.length, `${name} ${d.id} day ${day}`).toBeGreaterThan(0);
          expect(lines.map((l) => lineText(l)).join(" "), `${name} ${d.id} day ${day}`).toBe(firstSentence(d, day));
          for (const l of lines) expect(textWidth(lineText(l), "5"), `${name} ${d.id} day ${day}: a line wider than ${tw}`).toBeLessThanOrEqual(tw);
          rows++;
        }
      }
    }
    expect(rows).toBe(VIEWS.length * ALL.length * DAYS.length);
    expect(ALL.length).toBe(65);
  });

  it("SEARING's and SHATTER SHOT's second sentence is not in the list (a row is the first sentence), and the card keeps both", () => {
    for (const id of Object.keys(RUNES).filter((k) => runeSentences(RUNES[k]).length > 1)) {
      const d = RUNES[id], { tw } = view(402, 690, 3);
      const row = runeRowLines(d, tw, 1).map((l) => lineText(l)).join(" ");
      expect(runeLine(d, 1).startsWith(`${row} `), id).toBe(true);
      expect(row.endsWith("."), id).toBe(true);
      expect(runeTextLines(d, tw, 1).length, `${id}: the card draws both sentences`).toBeGreaterThan(runeRowLines(d, tw, 1).length - 1);
    }
    expect(Object.keys(RUNES).filter((k) => runeSentences(RUNES[k]).length > 1).sort()).toEqual(["searing", "shatter_shot"]);
  });

  it("which rows wrap: none on the desk at any of the three days; on the phones the ones listed (each is two lines), pinned so a text change shows", () => {
    const wrapped = (w: number, h: number, dpr: number, day: number): string[] => {
      const { tw } = view(w, h, dpr);
      return ALL.filter((d) => runeRowLines(d, tw, day).length > 1).map((d) => `${d.id}:${runeRowLines(d, tw, day).length}`).sort();
    };
    for (const day of DAYS) expect(wrapped(1280, 800, 1, day), `desk day ${day}`).toEqual([]);
    expect(wrapped(402, 690, 3, 1)).toEqual([]);
    expect(wrapped(402, 690, 3, 10)).toEqual(["scrap_halo:2"]);
    expect(wrapped(402, 690, 3, 50)).toEqual(["forge_ward:2", "scrap_halo:2"]);
    expect(wrapped(360, 640, 2, 1)).toEqual(["quick_latch:2", "scrap_halo:2", "scrap_saint:2"]);
    expect(wrapped(360, 640, 2, 10)).toEqual(["quick_latch:2", "scrap_halo:2", "scrap_saint:2"]);
    expect(wrapped(360, 640, 2, 50)).toEqual(["final_nail:2", "forge_ward:2", "quick_latch:2", "scrap_halo:2", "scrap_saint:2"]);
  });

  it("FORGE WARD on the phones at day 50: both lines (the list drew only `EACH SLUG FROM YOUR FACTORY:`); on the desk one line", () => {
    const fw = RUNES.forge_ward;
    for (const [w, h, dpr] of [[402, 690, 3], [360, 640, 2]] as const) {
      const { tw } = view(w, h, dpr);
      const lines = runeRowLines(fw, tw, 50).map((l) => lineText(l));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe("EACH SLUG FROM YOUR FACTORY:");
      expect(lines[1]).toMatch(/^\+\d+ SHIELD\.$/);
      expect(runeTextLines(fw, tw, 50).map((l) => lineText(l))[0], "what the list drew before").toBe(lines[0]);
    }
    const desk = view(1280, 800, 1);
    expect(runeRowLines(fw, desk.tw, 50).map((l) => lineText(l))).toEqual([firstSentence(fw, 50)]);
    expect(firstSentence(fw, 1)).toBe("EACH SLUG FROM YOUR FACTORY: +10 SHIELD."); // day 1's number; the pictures' day (F17: +104) is a later one
  });
});

describe("ROWS-1 F17: a row's height, and the rows of a page never overlap or leave the box", () => {
  it("19 px for one line, 9 more for each further line; the drawn lines sit 9 px apart under the name", () => {
    expect([1, 2, 3, 4].map(runeListRowH)).toEqual([RUNE_ROW_H, RUNE_ROW_H + 9, RUNE_ROW_H + 18, RUNE_ROW_H + 27]);
    expect(RUNE_ROW_H).toBe(19);
    expect(runeListRowH(0)).toBe(19);
  });

  it("the 50-rune ENDLESS list, every page on the three views and the bar's bottom at 30..90: rows follow by their heights, inside the box, over the foot", () => {
    let pages = 0;
    for (const [name, w, h, dpr] of VIEWS) {
      const { v, W, foot } = view(w, h, dpr);
      for (const day of DAYS) {
        for (let y = 30; y <= 90; y += 4) {
          const avail = v.H - 4 - y;
          const first = runeListPlan(ENDLESS50, 4, y, W, avail, foot, 0, day);
          const L = first.layout, seen: number[] = [];
          expect(L.pages, `${name} y ${y} day ${day}`).toBeGreaterThan(1);
          for (let p = 0; p < L.pages; p++) {
            const P = runeListPlan(ENDLESS50, 4, y, W, avail, foot, p, day);
            pages++;
            expect(P.page).toBe(p);
            expect(P.box.h, `${name} p${p}: the panel is as tall on every page`).toBe(first.box.h);
            expect(P.box.y + P.box.h, `${name} y ${y} p${p}: the box is on the screen`).toBeLessThanOrEqual(v.H - 4);
            let at = y + RUNE_LIST_HEAD;
            for (const row of P.rows) {
              const lines = runeRowLines(ENDLESS50[row.index], runeCardTextW(W), day);
              expect(row.y, `${name} p${p} row ${row.index}: starts where the one above ended`).toBe(at);
              expect(row.h, `${name} row ${row.index}`).toBe(RUNE_ROW_H + 9 * (lines.length - 1));
              expect(row.lines.map((l) => lineText(l)).join(" "), `${name} row ${row.index}`).toBe(firstSentence(ENDLESS50[row.index], day));
              at += row.h;
              expect(row.y, `${name} row ${row.index}`).toBeGreaterThanOrEqual(P.box.y + RUNE_LIST_HEAD);
              seen.push(row.index);
            }
            // the rows end above the foot (the page label and the buttons sit in it): the last row's foot is the foot's top at most
            expect(at, `${name} y ${y} p${p}: the last row ends above the foot`).toBeLessThanOrEqual(P.box.y + P.box.h - foot - 2);
          }
          // every rune on exactly one page, in order, none split
          expect(seen, `${name} y ${y} day ${day}`).toEqual(ENDLESS50.map((_, i) => i));
        }
      }
    }
    expect(pages).toBeGreaterThan(300);
  });

  it("the operator's phone (402x690, the list's top at 62) at day 50: 4 pages of 13, 13, 12 and 12 rows, FORGE WARD whole at the foot of the last; 360x640: the same split", () => {
    for (const [w, h, dpr] of [[402, 690, 3], [360, 640, 2]] as const) {
      const { v, W, foot } = view(w, h, dpr), y = 62, avail = v.H - 4 - y;
      const P = runeListPlan(ENDLESS50, 4, y, W, avail, foot, 3, 50);
      expect(P.layout.starts, `${w}x${h}`).toEqual([0, 13, 26, 38, 50]);
      expect(P.rows.map((r) => r.index)).toEqual([38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49]);
      const last = P.rows[P.rows.length - 1];
      expect(ENDLESS50[last.index].id).toBe("forge_ward");
      expect(last.lines.map((l) => lineText(l))).toEqual(["EACH SLUG FROM YOUR FACTORY:", expect.stringMatching(/^\+\d+ SHIELD\.$/)]);
      expect(last.h).toBe(28);
      expect(last.y + last.h, "its second line is inside the box, over the foot").toBeLessThanOrEqual(P.box.y + P.box.h - foot - 2);
    }
    // the desk: as 0.9.13 drew it, 4 pages of 13, 13, 13 and 11 one-line rows
    const d = view(1280, 800, 1);
    expect(runeListPlan(ENDLESS50, 4, 46, d.W, d.v.H - 4 - 46, d.foot, 0, 50).layout.starts).toEqual([0, 13, 26, 39, 50]);
  });

  it("the tap target (the panel's box, region rune-readout) covers every row of the page, the foot too", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const { v, W, foot } = view(w, h, dpr);
      for (let p = 0; p < 4; p++) {
        const P = runeListPlan(ENDLESS50, 4, 62, W, v.H - 4 - 62, foot, p, 50);
        for (const row of P.rows) {
          expect(row.y, name).toBeGreaterThanOrEqual(P.box.y);
          expect(row.y + row.h, name).toBeLessThanOrEqual(P.box.y + P.box.h);
        }
      }
    }
  });
});

describe("ROWS-1 F17: runeListPages is runeListLayout's answer on one-line rows, and holds whole rows on any heights", () => {
  it("one-line rows: the same box height, rows a page, pages and foot as ENDLESS-1's runeListLayout, for 0..70 runes, rooms 140..1000 and three foots", () => {
    let paged = 0;
    for (const avail of [140, 200, 260, 300, 340, 380, 407, 600, 1000, Infinity]) {
      for (const foot of [RUNE_LIST_FOOT_MIN, 20, 26, 30]) {
        for (let n = 0; n <= 70; n++) {
          const old = runeListLayout(n, avail, foot), now = runeListPages(Array(n).fill(RUNE_ROW_H), avail, foot);
          expect({ h: now.h, per: now.per, pages: now.pages, foot: now.foot }, `${n} runes, room ${avail}, foot ${foot}`).toEqual(old);
          expect(now.starts[0]).toBe(0);
          expect(now.starts[now.starts.length - 1]).toBe(n);
          for (let p = 0; p + 1 < now.starts.length; p++) expect(now.starts[p + 1] - now.starts[p]).toBe(Math.min(old.per, n - p * old.per));
          if (old.pages > 1) paged++;
        }
      }
    }
    expect(paged).toBeGreaterThan(500);
    expect(runeListPages([], 100).starts).toEqual([0, 0]);
  });

  it("mixed heights (19, 28, 37): every row on one page in order, each page's rows fit the room, the fewest pages, as even as can be, the box inside the room", () => {
    // a deterministic spread of row heights: mostly one line, some two, a few three
    const heights = (n: number, seed: number): number[] => Array.from({ length: n }, (_, i) => [19, 19, 19, 28, 19, 37, 19, 28, 19, 19][(i * 7 + seed) % 10]);
    // the fewest pages for a room of `cap` px, by greedy filling (the optimum for a run of rows in order)
    const greedy = (hs: number[], cap: number): number => {
      let pages = 1, used = 0;
      for (const x of hs) { if (used > 0 && used + x > cap) { pages++; used = 0; } used += x; }
      return pages;
    };
    let paged = 0;
    for (const avail of [150, 200, 250, 300, 350, 400]) {
      for (const foot of [RUNE_LIST_FOOT_MIN, 27, 30]) {
        for (const n of [5, 12, 18, 25, 33, 50, 63]) {
          for (const seed of [0, 3, 5]) {
            const hs = heights(n, seed), L = runeListPages(hs, avail, foot);
            const label = `${n} rows seed ${seed}, room ${avail}, foot ${foot}`;
            expect(L.starts[0], label).toBe(0);
            expect(L.starts[L.starts.length - 1], label).toBe(n);
            expect(L.pages, label).toBe(L.starts.length - 1);
            const sums = Array.from({ length: L.pages }, (_, p) => hs.slice(L.starts[p], L.starts[p + 1]).reduce((a, b) => a + b, 0));
            for (let p = 0; p < L.pages; p++) expect(L.starts[p + 1], `${label}: page ${p + 1} is not empty`).toBeGreaterThan(L.starts[p]);
            if (RUNE_LIST_HEAD + hs.reduce((a, b) => a + b, 0) + 2 <= avail) {
              expect(L, label).toEqual({ h: RUNE_LIST_HEAD + hs.reduce((a, b) => a + b, 0) + 2, per: n, pages: 1, foot: 0, starts: [0, n] });
              continue;
            }
            paged++;
            const room = avail - RUNE_LIST_HEAD - foot - 2;
            expect(L.foot, label).toBe(foot);
            expect(L.h, label).toBe(RUNE_LIST_HEAD + Math.max(...sums) + foot + 2);
            expect(L.per, label).toBe(Math.max(...Array.from({ length: L.pages }, (_, p) => L.starts[p + 1] - L.starts[p])));
            if (room >= 37) {
              expect(Math.max(...sums), `${label}: every page's rows fit the room`).toBeLessThanOrEqual(room);
              expect(L.h, `${label}: the box fits the room`).toBeLessThanOrEqual(avail);
            }
            // the fewest pages that fit, and no fewer with the least room that gives them (as even as can be)
            expect(L.pages, label).toBe(greedy(hs, Math.max(room, 1)));
            if (Math.max(...sums) > Math.max(...hs)) expect(greedy(hs, Math.max(...sums) - 1), `${label}: one px less room needs more pages`).toBeGreaterThan(L.pages);
          }
        }
      }
    }
    expect(paged).toBeGreaterThan(200);
  });

  it("a row taller than the room stands alone on its page (nothing is dropped)", () => {
    const L = runeListPages([19, 28, 19], 16 + 14 + 2 + 10, 14);
    expect(L.starts).toEqual([0, 1, 2, 3]);
    expect(L.pages).toBe(3);
  });
});

describe("ROWS-1 F17: on the desk nothing moves", () => {
  it("every list of 1..65 runes on the desk's text width: one line a row, the box and the rows as ENDLESS-1 drew them, whole or paged", () => {
    const desk = view(1280, 800, 1);
    for (const n of [1, 5, 10, 17, 21, 30, 50, 65]) {
      const defs = ALL.slice(0, n);
      for (const avail of [Infinity, desk.v.H - 4 - 46, 260]) {
        for (const day of DAYS) {
          const P = runeListPlan(defs, 4, 46, desk.W, avail, desk.foot, 0, day), old = runeListLayout(n, avail, desk.foot);
          expect({ h: P.layout.h, per: P.layout.per, pages: P.layout.pages, foot: P.layout.foot }, `${n} runes room ${avail} day ${day}`).toEqual(old);
          expect(P.box.h).toBe(old.h);
          if (old.pages === 1) expect(P.box.h).toBe(runeListH(n));
          P.rows.forEach((row, j) => {
            expect(row.h).toBe(RUNE_ROW_H);
            expect(row.y, `${n} runes row ${j}`).toBe(46 + RUNE_LIST_HEAD + j * RUNE_ROW_H); // the old draw's `r.y + 16 + j * 19`
            expect(row.index).toBe(j);
          });
        }
      }
    }
  });

  it("a list that is not paged (a run without the endless mark: no room limit) is runeListH(n) taller by 9 px for each wrapped row, nothing else", () => {
    const op = view(402, 690, 3);
    const defs = [RUNES.forge_ward, RUNES.scrap_halo, ...ALL.slice(0, 8)];
    const P = runeListPlan(defs, 4, 46, op.W, Infinity, op.foot, 0, 50);
    expect(P.layout.pages).toBe(1);
    expect(P.box.h).toBe(runeListH(defs.length) + 9 * 2);
    expect(P.rows.map((r) => r.index)).toEqual(defs.map((_, i) => i));
  });
});

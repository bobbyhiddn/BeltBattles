// HITMARK-1E (REQ-BFG-100, C7; BRIEF-HITMARK1E): the mark on the "hits on you" chip. ICON.CRACK keeps its name, its code point U+E013
// and its place outside ICON's keys, and counters.ts HITS_CHIP still draws it in red (with SCALE_RIGS on; nothing else draws it).
// Only its drawing changed: SCALE-2c's lone jagged line, which all four round-M readers took for FRAY (REPORT-SCALE2f 5), is an
// arrow driving into a wall, a hit that landed on your ship. This file pins both drawings (5x7 and 3x5), draws them through
// drawText as the chip does (the icon alone, in the chip's colour, 1 px ink outline) to prove each stays in its cell, and measures
// each against every other glyph of its face, FRAY's pair of Vs above all, with the pixel distance tests/icons.test.ts uses (Hamming,
// the narrower bitmap padded to the wider's width at every placement, the smallest kept). A pixel distance is a floor for "not that
// glyph"; whether the mark reads as a hit is the cold read's question (output-hitmark1e REPORT).
import { describe, expect, it } from "vitest";
import { C } from "../src/render/palette";
import { ICON, ICON_BASE, drawText, faceChars, glyphRows, isIcon, textWidth, type FontId } from "../src/render/font";
import { HITS_CHIP, STATUS_H } from "../src/game/counters";
import { G, fresh, installRaster } from "./raster.helpers";

/** The two drawings, as pinned: an arrow with a solid head (5x7) or its chevron head (3x5), the point on a full-height wall. */
const FIVE = ["....#", ".#..#", ".##.#", "#####", ".##.#", ".#..#", "....#"];
const THREE = ["#.#", ".##", "..#", ".##", "#.#"];
/** SCALE-2c's crack as it was at 6645b6184db1: the mark the round-M readers took for FRAY. */
const OLD: Record<FontId, string[]> = {
  "5": ["#.#..", ".#.#.", "..#..", ".##..", "...#.", "..#.#", ".#..."],
  "3": ["#.#", ".#.", ".##", "..#", ".#."],
};

/** Per face: the cell, icons.test.ts's rules (letters and digits, punctuation, other icons), and this job's floor under every glyph. */
const FACES: { font: FontId; name: string; w: number; h: number; rule: { text: number; punct: number; icon: number }; floor: number; fray: number; old: number }[] = [
  { font: "5", name: "5x7", w: 5, h: 7, rule: { text: 6, punct: 4, icon: 4 }, floor: 10, fray: 14, old: 14 },
  { font: "3", name: "3x5", w: 3, h: 5, rule: { text: 3, punct: 2, icon: 2 }, floor: 4, fray: 6, old: 5 },
];

/** Pixel Hamming distance; the narrower bitmap padded to the wider's width at every offset, the smallest kept (icons.test.ts). */
function dist(a: string[], b: string[]): number {
  if (a[0].length < b[0].length) [a, b] = [b, a];
  const wa = a[0].length, wb = b[0].length;
  let best = Infinity;
  for (let off = 0; off <= wa - wb; off++) {
    let d = 0;
    for (let y = 0; y < a.length; y++) {
      const pb = ".".repeat(off) + b[y] + ".".repeat(wa - wb - off);
      for (let x = 0; x < wa; x++) if (a[y][x] !== pb[x]) d++;
    }
    best = Math.min(best, d);
  }
  return best;
}

const rowsOf = (ch: string, font: FontId): string[] => {
  const r = glyphRows(ch, font);
  if (!r) throw new Error(`no ${font} glyph for U+${ch.charCodeAt(0).toString(16)}`);
  return r;
};
const NAMES: Record<string, string> = { [ICON.POISON]: "POISON", [ICON.CRACK]: "CRACK" };
for (const [k, v] of Object.entries(ICON)) NAMES[v] = k;
const nameOf = (ch: string): string => NAMES[ch] ?? ch;
const isLetterOrDigit = (ch: string): boolean => /^[A-Z0-9]$/.test(ch);
const isIconChar = (ch: string): boolean => ch.charCodeAt(0) >= ICON_BASE || ch === ICON.HULL || ch === ICON.STAR;

describe("HITMARK-1E: ICON.CRACK, the hits chip's mark: the name and the code point stay", () => {
  it("U+E013, one UTF-16 unit, not enumerable (ICON's keys stay the 19 shipped names), an icon to textWidth and wrap", () => {
    expect(ICON.CRACK).toBe("");
    expect(ICON.CRACK.charCodeAt(0)).toBe(0xe013);
    expect(ICON.CRACK.length).toBe(1);
    expect(Object.keys(ICON)).not.toContain("CRACK");
    expect(Object.values(ICON)).not.toContain(ICON.CRACK);
    expect(Object.getOwnPropertyDescriptor(ICON, "CRACK")).toEqual({ value: "", writable: false, enumerable: false, configurable: false });
    expect(isIcon(ICON.CRACK)).toBe(true);
    for (const f of FACES) expect(textWidth(ICON.CRACK, f.font), f.name).toBe(f.w);
  });

  it("the hits chip still draws it, in C.red", () => {
    expect([HITS_CHIP.icon, HITS_CHIP.colour, HITS_CHIP.key]).toEqual([ICON.CRACK, C.red, "hits"]);
  });
});

describe("HITMARK-1E: both drawings are pinned", () => {
  it("5x7: an arrow's chevron head, its point on a full-height wall; 3x5: the head's twin on the same wall", () => {
    expect(glyphRows(ICON.CRACK, "5")).toEqual(FIVE);
    expect(glyphRows(ICON.CRACK, "3")).toEqual(THREE);
  });

  it("each stays inside its cell: the right rows of the right width, with ink, the wall on the right edge", () => {
    for (const f of FACES) {
      const r = rowsOf(ICON.CRACK, f.font);
      expect(r.length, f.name).toBe(f.h);
      for (const row of r) expect(row, f.name).toMatch(new RegExp(`^[.#]{${f.w}}$`));
      expect(r.join("").includes("#"), f.name).toBe(true);
      expect(r.every((row) => row[f.w - 1] === "#"), `${f.name}: the wall, the whole right edge`).toBe(true);
    }
  });

  it("drawText paints exactly those cells and nothing round them; with the chip's 1 px ink outline it paints only the cell's outline box, inside the tab's rows", () => {
    installRaster();
    for (const f of FACES) {
      const r = rowsOf(ICON.CRACK, f.font), ox = 3, oy = 2; // the chip draws its icon 2 px down in a tab STATUS_H tall
      // the icon alone, in the chip's colour (mono: true), as counters.ts tabImage draws it
      const plain = fresh(f.w + 2 * ox, STATUS_H);
      drawText(G(plain), ICON.CRACK, ox, oy, C.red, { font: f.font, mono: true });
      for (let y = 0; y < STATUS_H; y++) for (let x = 0; x < f.w + 2 * ox; x++) {
        const inCell = x >= ox && x < ox + f.w && y >= oy && y < oy + f.h;
        expect(plain.at(x, y), `${f.name} (${x},${y})`).toBe(inCell && r[y - oy][x - ox] === "#" ? C.red : null);
      }
      expect(plain.oob, f.name).toBe(0);
      // and with its outline
      const outlined = fresh(f.w + 2 * ox, STATUS_H);
      drawText(G(outlined), ICON.CRACK, ox, oy, C.red, { font: f.font, mono: true, outline: C.ink });
      for (let y = 0; y < STATUS_H; y++) for (let x = 0; x < f.w + 2 * ox; x++) {
        const inBox = x >= ox - 1 && x < ox + f.w + 1 && y >= oy - 1 && y < oy + f.h + 1;
        const px = outlined.at(x, y);
        if (!inBox) expect(px, `${f.name} outside the outline box (${x},${y})`).toBeNull();
        else if (x >= ox && x < ox + f.w && y >= oy && y < oy + f.h && r[y - oy][x - ox] === "#") expect(px, `${f.name} ink (${x},${y})`).toBe(C.red);
        else expect([C.ink, null], `${f.name} (${x},${y})`).toContain(px);
      }
      // the tab's frame rows (y = 0 and STATUS_H - 1) stay clear (5x7: the outline reaches row 1 and row STATUS_H - 2)
      for (let x = 0; x < f.w + 2 * ox; x++) expect([outlined.at(x, 0), outlined.at(x, STATUS_H - 1)], `${f.name} frame rows`).toEqual([null, null]);
      expect(outlined.oob, f.name).toBe(0);
    }
  });
});

describe("HITMARK-1E: each differs from every other glyph at its size, FRAY's above all", () => {
  for (const f of FACES) {
    it(`${f.name}: no other glyph is the same, none is under ${f.floor} px away, and icons.test.ts's rules hold (${f.rule.text} from a letter or digit, ${f.rule.punct} from punctuation, ${f.rule.icon} from another icon)`, () => {
      const mark = rowsOf(ICON.CRACK, f.font);
      let seen = 0;
      for (const ch of faceChars(f.font)) {
        if (ch === ICON.CRACK || ch === " ") continue;
        seen++;
        const d = dist(mark, rowsOf(ch, f.font));
        const need = isLetterOrDigit(ch) ? f.rule.text : isIconChar(ch) ? f.rule.icon : f.rule.punct;
        expect(d, `${nameOf(ch)}: the rule`).toBeGreaterThanOrEqual(need);
        expect(d, `${nameOf(ch)}: the floor`).toBeGreaterThanOrEqual(f.floor);
      }
      expect(seen).toBeGreaterThan(60); // every letter, digit, punctuation mark and icon of the face was looked at
    });

    it(`${f.name}: at least ${f.fray} px from FRAY's glyph (the two Vs it was taken for), and from BURN's flame, POISON's drop, STUN's bolt and the HULL heart`, () => {
      const mark = rowsOf(ICON.CRACK, f.font);
      expect(dist(mark, rowsOf(ICON.FRAY, f.font)), "FRAY").toBeGreaterThanOrEqual(f.fray);
      const others = f.font === "5" ? 11 : 4;
      for (const ch of [ICON.BURN, ICON.POISON, ICON.STUN, ICON.HULL]) expect(dist(mark, rowsOf(ch, f.font)), nameOf(ch)).toBeGreaterThanOrEqual(others);
    });

    it(`${f.name}: not SCALE-2c's crack, and not a retouch of it (${f.old} px or more away)`, () => {
      const mark = rowsOf(ICON.CRACK, f.font);
      expect(mark).not.toEqual(OLD[f.font]);
      expect(dist(mark, OLD[f.font])).toBeGreaterThanOrEqual(f.old);
    });
  }
});

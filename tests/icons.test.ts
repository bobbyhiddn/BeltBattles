// U1 (REQ-BFG-046): the icon set (render/font.ts ICON, MEMO R1 C2), its markup (icons: "{NAME}" the icon alone, "{*NAME}"
// a keyword in panel style, "alone" mode), its colours (ICON_COLOUR, TextOpts.mono), the keyword style in rich text
// (richText.ts colourize) and the stat row (ui/icons.ts statRow). The confusability thresholds are output-u1's REPORT
// section 4 (its tools/confusability.ts prints every distance): a pixel Hamming distance, the narrower glyph padded to
// the wider one's width at every placement and the smallest distance kept.
import { describe, expect, it } from "vitest";
import { C } from "../src/render/palette";
import {
  ICON, ICON_BASE, ICON_COLOUR, KEYWORDS, drawText, faceChars, glyphRows, icons, isIcon, keywordColour, stripIcons, textWidth, wrap,
  type FontId, type IconName,
} from "../src/render/font";
import { KEYWORD_COLOUR, NUMBER_COLOUR, PERK_COLOUR, colourize, lineText, wrapRich, wrapText, type Span } from "../src/ui/richText";
import { STAT_ROW_MAX, statRow } from "../src/ui/icons";
import { G, fresh, installRaster } from "./raster.helpers";

const NAMES = Object.keys(ICON) as IconName[];
const PUA = NAMES.filter((n) => ICON[n].charCodeAt(0) >= ICON_BASE);
const ALL_ICONS = new Set(NAMES.map((n) => ICON[n] as string));
const FACES: { font: FontId; w: number; h: number; text: number; punct: number; icon: number }[] = [
  { font: "5", w: 5, h: 7, text: 6, punct: 4, icon: 4 },
  { font: "3", w: 3, h: 5, text: 3, punct: 2, icon: 2 },
];

/** Pixel Hamming distance; the narrower bitmap padded to the wider's width at every offset, the smallest kept. */
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

const rows = (ch: string, font: FontId): string[] => {
  const r = glyphRows(ch, font);
  if (!r) throw new Error(`no ${font} glyph for U+${ch.charCodeAt(0).toString(16)}`);
  return r;
};

describe("U2b F1: the DMG glyph is a sword (U1's burst read as an asterisk beside a number; CRIT-1's U+E00E is the burst)", () => {
  it("DMG keeps U+E000 and draws white (no ICON_COLOUR entry): a thick blade up to the right over a crossguard, 5x7 and 3x5", () => {
    expect(ICON.DMG.charCodeAt(0)).toBe(0xe000);
    expect(ICON_COLOUR[ICON.DMG]).toBeUndefined();
    expect(glyphRows(ICON.DMG, "5")).toEqual(["...##", "..###", ".###.", "#.#..", ".#...", "#.#..", "....."]);
    expect(glyphRows(ICON.DMG, "3")).toEqual(["..#", "..#", ".#.", "###", "#.."]);
  });
});

describe("U1 icons: the set", () => {
  it("16 icons: DMG .. PAIR at U+E000 .. U+E00D in the brief's order, one UTF-16 unit each, then HULL ♥ and STAR ★", () => {
    expect(NAMES).toEqual(["DMG", "SEC", "RATE", "SLUG", "BELT", "GEAR", "GOLD", "UP", "BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "HULL", "STAR"]);
    PUA.forEach((n, i) => {
      expect(ICON[n].length, n).toBe(1);
      expect(ICON[n].charCodeAt(0), n).toBe(0xe000 + i);
    });
    expect(PUA.length).toBe(14);
    expect([ICON.HULL, ICON.STAR]).toEqual(["♥", "★"]);
    expect(KEYWORDS).toEqual(["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR"]);
  });

  for (const f of FACES) {
    it(`every icon has a ${f.font === "5" ? "5x7" : "3x5"} bitmap: ${f.h} rows of ${f.w} px, with ink`, () => {
      for (const n of NAMES) {
        const r = rows(ICON[n], f.font);
        expect(r.length, n).toBe(f.h);
        for (const row of r) expect(row, n).toMatch(new RegExp(`^[.#]{${f.w}}$`));
        expect(r.join("").includes("#"), n).toBe(true);
      }
    });

    it(`no two glyphs in the ${f.font === "5" ? "5x7" : "3x5"} face are identical`, () => {
      const seen = new Map<string, string>();
      for (const ch of faceChars(f.font)) {
        const key = rows(ch, f.font).join("|");
        expect(seen.get(key), `${ch} = ${seen.get(key)}`).toBeUndefined();
        seen.set(key, ch);
      }
    });

    it(`${f.font === "5" ? "5x7" : "3x5"}: each icon at least ${f.text} px from every digit and letter, ${f.punct} from every punctuation glyph, ${f.icon} from every other icon (♥ ★ included)`, () => {
      const chars = faceChars(f.font).filter((ch) => ch !== " ");
      for (const n of PUA) {
        const me = rows(ICON[n], f.font);
        for (const ch of chars) {
          if (ch === ICON[n]) continue;
          const d = dist(me, rows(ch, f.font));
          const min = ALL_ICONS.has(ch) ? f.icon : /^[A-Z0-9]$/.test(ch) ? f.text : f.punct;
          expect(d, `${n} vs ${ch}`).toBeGreaterThanOrEqual(min);
        }
      }
    });

    it(`textWidth counts an icon as one glyph (${f.w + 1} px with its advance in ${f.font === "5" ? "5x7" : "3x5"})`, () => {
      for (const n of NAMES) {
        expect(textWidth(ICON[n], f.font), n).toBe(f.w);
        expect(textWidth(`${ICON[n]}4`, f.font) - textWidth("4", f.font), n).toBe(f.w + 1);
      }
      expect(textWidth(statRow([["SEC", 1.25], ["DMG", 4], ["BELT", 1]]), f.font)).toBe(textWidth("1.25S D4 B1", f.font));
    });
  }

  it("neither face has a brace glyph, so no player text holds the markup (a brace would draw as ?)", () => {
    for (const f of FACES) for (const ch of "{}") expect(glyphRows(ch, f.font)).toBeUndefined();
  });
});

describe("U1 icons: wrap", () => {
  const row = statRow([["SEC", 1.25], ["DMG", 4], ["BELT", 1]]);
  const pairs = row.split(" ");

  it("wrapText, wrapRich and font.ts wrap never split a pair of the stat row", () => {
    for (const font of ["5", "3"] as FontId[]) {
      for (let w = 1; w <= textWidth(row, font) + 2; w++) {
        const a = wrapText(row, w, font), b = wrapRich(colourize(row, C.bone), w, font).map(lineText), c = wrap(row, w, font);
        for (const lines of [a, b, c]) {
          expect(lines.join(" "), `${font} at ${w}`).toBe(row);
          for (const l of lines) for (const t of l.split(" ")) expect(pairs, `${font} at ${w}`).toContain(t);
        }
      }
    }
  });

  it("a number keeps the icon after it on its line (\"+2\" then BURN), as it keeps a word", () => {
    const text = icons("HIT: ADD +2 {BURN} TO IT");
    for (const font of ["5", "3"] as FontId[]) {
      for (let w = textWidth(icons("+2 {BURN}"), font); w <= textWidth(text, font); w++) {
        const lines = wrapText(text, w, font);
        expect(lines.some((l) => l.includes(icons("+2 {BURN}"))), `${font} at ${w}: ${lines.join(" / ")}`).toBe(true);
      }
    }
  });
});

describe("U1 icons: markup", () => {
  it("{NAME} is the icon alone; an unknown name, or a lower-case one, stays as written", () => {
    expect(icons("{SEC}1.25 {DMG}4 {BELT}1")).toBe(`${ICON.SEC}1.25 ${ICON.DMG}4 ${ICON.BELT}1`);
    expect(icons("1.25{SEC}")).toBe(`1.25${ICON.SEC}`);
    expect(icons("{HULL}3 NEXT {STAR}2")).toBe("♥3 NEXT ★2");
    expect(icons("{NOPE} {burn} {*} {}")).toBe("{NOPE} {burn} {*} {}");
    expect(icons("NO MARKUP: 2.75 SECONDS, 25% FASTER.")).toBe("NO MARKUP: 2.75 SECONDS, 25% FASTER.");
  });

  it("{*NAME} is a keyword in panel style: its icon, then its word; \"alone\" mode gives the icon alone", () => {
    for (const k of KEYWORDS) {
      expect(icons(`{*${k}}`), k).toBe(ICON[k] + k);
      expect(icons(`{*${k}}`, "alone"), k).toBe(ICON[k]);
      expect(icons(`{${k}}`, "alone"), k).toBe(ICON[k]);
    }
    expect(icons("HIT: 2 {*STUN}")).toBe(`HIT: 2 ${ICON.STUN}STUN`);
    expect(icons("LOOM SLUGS HAVE {*FRAY} 1.", "alone")).toBe(`LOOM SLUGS HAVE ${ICON.FRAY} 1.`);
    // a stat icon is no keyword: "{*DMG}" stays as written
    expect(icons("{*DMG} {*SEC} {*HULL}")).toBe("{*DMG} {*SEC} {*HULL}");
  });

  it("isIcon and stripIcons know the 14 private-use icons; ♥ and ★ stay text", () => {
    for (const n of PUA) expect(isIcon(ICON[n]), n).toBe(true);
    expect(isIcon("♥") || isIcon("★") || isIcon("A")).toBe(false);
    expect(stripIcons(icons("{DMG}4"))).toBe("4");
    expect(stripIcons("★2")).toBe("★2");
  });
});

describe("U1 icons: colour", () => {
  const colourOf = (spans: Span[], t: string): string | undefined => spans.find((s) => s.t.includes(t))?.c;

  it("colourize: a number glued to an icon is a number (white); a lone icon takes the text's colour; ★2 stays brass", () => {
    const s = colourize(statRow([["SEC", 1.25], ["DMG", 4], ["BELT", 1]]), C.bone);
    expect(colourOf(s, `1.25${ICON.SEC}`)).toBe(NUMBER_COLOUR);
    expect(colourOf(s, `${ICON.DMG}4`)).toBe(NUMBER_COLOUR);
    const t = colourize(icons("NEXT ★2: +2 {BURN}"), C.bone);
    expect(colourOf(t, "★2")).toBe(PERK_COLOUR);
    expect(colourOf(t, "+2")).toBe(NUMBER_COLOUR);
    expect(t[t.length - 1]).toEqual({ t: ` ${ICON.BURN}`, c: C.bone }); // drawText draws it fire3 (ICON_COLOUR)
  });

  it("colourize: a keyword in panel style takes the keyword's colour; the bare words colour as today", () => {
    for (const k of KEYWORDS) {
      const s = colourize(icons(`HIT: 2 {*${k}}.`), C.bone);
      expect(colourOf(s, ICON[k] + k), k).toBe(ICON_COLOUR[ICON[k]]);
      expect(keywordColour(ICON[k] + k), k).toBe(ICON_COLOUR[ICON[k]]);
    }
    expect(keywordColour(`${ICON.STUN}BURN`)).toBeUndefined();
    expect(keywordColour(ICON.BURN)).toBeUndefined();
    // today's words: BURN and SHOCK keep their battle colours, the new keywords stay plain without their icon
    const bare = colourize("BURN SHOCK FASTER STUN HEAT FRAY PLATE PAIR PAIRS", C.bone);
    expect(colourOf(bare, "BURN")).toBe(KEYWORD_COLOUR.burn);
    expect(colourOf(bare, "SHOCK")).toBe(KEYWORD_COLOUR.shock);
    expect(colourOf(bare, "FASTER")).toBe(KEYWORD_COLOUR.faster);
    expect(colourOf(bare, "STUN HEAT FRAY PLATE PAIR PAIRS")).toBe(C.bone);
  });

  it("ICON_COLOUR: the brief's colours; DMG, SEC, SLUG, BELT, GEAR, UP, ♥ and ★ have none", () => {
    expect(ICON_COLOUR).toEqual({
      [ICON.RATE]: KEYWORD_COLOUR.faster, [ICON.GOLD]: C.yellow, [ICON.BURN]: KEYWORD_COLOUR.burn, [ICON.STUN]: C.cyan,
      [ICON.HEAT]: C.amber, [ICON.FRAY]: C.plum4, [ICON.PLATE]: C.plate3, [ICON.PAIR]: C.blue,
    });
  });

  it("drawText draws each icon's bitmap in its own colour, or the text's; TextOpts.mono draws every icon in the text's", () => {
    installRaster();
    for (const font of ["5", "3"] as FontId[]) {
      for (const n of NAMES) {
        const ch = ICON[n], r = rows(ch, font);
        for (const mono of [false, true]) {
          const cv = fresh(8, 8);
          drawText(G(cv), ch, 0, 0, C.bone, { font, mono });
          const want = mono ? C.bone : ICON_COLOUR[ch] ?? C.bone;
          for (let y = 0; y < r.length; y++) for (let x = 0; x < r[0].length; x++) {
            expect(cv.at(x, y), `${n} ${font} mono=${mono} (${x},${y})`).toBe(r[y][x] === "#" ? want : null);
          }
        }
      }
    }
  });
});

describe("U1 icons: statRow", () => {
  it("builds the C4 rows from pairs: each icon glued before its value, SEC after its number", () => {
    expect(statRow([["SEC", 1.25], ["DMG", 4], ["BELT", 1]])).toBe(icons("1.25{SEC} {DMG}4 {BELT}1"));
    expect(statRow([["SEC", 0.8], ["SLUG", 4], ["GEAR", 4]])).toBe(icons("0.8{SEC} {SLUG}4 {GEAR}4"));
    expect(statRow([["BURN", "+1"]])).toBe(icons("{BURN}+1"));
    expect(statRow([["PAIR", "+25%"], ["UP", "1/4"]])).toBe(icons("{PAIR}+25% {UP}1/4"));
    expect(statRow([])).toBe("");
  });

  it(`refuses more than ${STAT_ROW_MAX} pairs (C2)`, () => {
    expect(() => statRow([["SEC", 1], ["DMG", 2], ["BELT", 3], ["GEAR", 4]])).toThrow(/at most 3/);
  });
});

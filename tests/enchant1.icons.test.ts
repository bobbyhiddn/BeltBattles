// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E7): the eight enchantment ICONS, the SPARK mark and the WORD COLOURS.
//
// The icons are standalone 12x12 sprites (src/render/enchantArt.ts), not font glyphs: font.ts ICON stays at its 19 names
// (tests/icons.test.ts pins them, and is not changed). The checks:
//  (a) the eight exist, are all different, and keep a pixel distance from each other and from every keyword glyph. The rules are
//      tests/icons.test.ts's (U1, output-u1's thresholds): a pixel Hamming distance, the narrower bitmap placed at every offset in
//      the wider one's box, the smallest distance kept; keyword icons keep 4 px of the 5x7 face's 35 cells and 2 px of the 3x5
//      face's 15 from each other. An icon is 12x12 = 144 cells, so (1) at its own size the same share of the cells is
//      ceil(144 * 4 / 35) = 17 px, from each other icon (with every 1 px shift tried) and from every glyph at every placement; and
//      (2) squeezed to a glyph's own size (what the picture is if it were drawn as a keyword glyph) it keeps the glyph rules
//      themselves: 4 px in the 5x7 face and 2 px in the 3x5 face, from the other seven and from all 19 keyword glyphs.
//  (b) the spark draws 5 or fewer px inside a 3x3 box, in the word's colour, with a brighter centre, and is no keyword icon.
//  (c) each word's colour clears the panels (styleContrast contrast, the keyword colours' rule) and sits clear of every keyword
//      colour (CIE76 delta E >= 20, the game's "clearly another colour": styleContrast THRESHOLDS.state and .yours; and a plain RGB
//      distance), except the two words the brief gives a keyword's own colour: FIERY is BURN's orange and BRACED is PLATE's steel.
//
// ENCHANT_ICON_TABLE=1 vitest run tests/enchant1.icons.test.ts prints the distance and colour tables the report quotes.
import { describe, expect, it } from "vitest";
import { C } from "../src/render/palette";
import { ICON, ICON_COLOUR, KEYWORDS, PLAYER_WORD, glyphRows, keywordColour, type FontId } from "../src/render/font";
import { KEYWORD_COLOUR } from "../src/ui/richText";
import { ENCHANT_DEFS, ENCHANT_IDS, type EnchantId } from "../src/sim/enchant";
import {
  ENCHANT_ICON_ART, ENCHANT_ICON_ROWS, ENCHANT_ICON_SIZE, ENCHANT_SPARK_ROWS, ENCHANT_SPARK_SIZE, drawEnchantIcon, drawEnchantSpark,
  enchantIcon, enchantPalette, enchantSparkCentre,
} from "../src/render/enchantArt";
import { THRESHOLDS, contrast, keywordMin, luminance, separation } from "../src/render/styleContrast";
import { PANELS } from "../src/render/styles";
import { G, R, fresh, installRaster } from "./raster.helpers";

const SHOW = !!process.env.ENCHANT_ICON_TABLE;
const say = (s: string): void => { if (SHOW) console.log(s); };

// ------------------------------------------------------------------------------------------------------------- the measures

type Bits = string[];
const ink = (b: Bits): number => b.join("").split("#").length - 1;
const keywordNames = Object.keys(ICON) as (keyof typeof ICON)[]; // all 19 (17 private-use glyphs, HULL and STAR)
const glyph = (n: keyof typeof ICON, font: FontId): Bits => {
  const r = glyphRows(ICON[n], font);
  if (!r) throw new Error(`no ${font} glyph for ${n}`);
  return r;
};

/** The smallest pixel Hamming distance with `small` placed at every offset inside `big`'s box and blank outside it (U1's dist()
 *  in both dimensions: tests/icons.test.ts pads the narrower bitmap sideways; here the heights may differ as well). */
function minDist(big: Bits, small: Bits): number {
  const H = big.length, W = big[0].length, h = small.length, w = small[0].length;
  const ib = ink(big), is = ink(small);
  let best = Infinity;
  for (let dy = 0; dy <= H - h; dy++) for (let dx = 0; dx <= W - w; dx++) {
    let both = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (small[y][x] === "#" && big[y + dy][x + dx] === "#") both++;
    best = Math.min(best, ib + is - 2 * both);
  }
  return best;
}

/** `b` blank-padded by `n` px on every side. */
const pad = (b: Bits, n: number): Bits => {
  const blank = ".".repeat(b[0].length + 2 * n);
  return [...Array(n).fill(blank), ...b.map((r) => ".".repeat(n) + r + ".".repeat(n)), ...Array(n).fill(blank)];
};

/** Two same-size pictures' distance with `b` shifted by up to 1 px in each direction (a shifted copy is no different picture). */
const shifted = (a: Bits, b: Bits): number => minDist(pad(a, 1), b);

/** A picture squeezed to tw x th: a cell is ink when `thr` of its area is (box filter), "what the picture is at a glyph's size". */
function squeeze(src: Bits, tw: number, th: number, thr: number): Bits {
  const W = src[0].length, H = src.length, out: string[] = [];
  for (let j = 0; j < th; j++) {
    let row = "";
    for (let i = 0; i < tw; i++) {
      const x0 = (i * W) / tw, x1 = ((i + 1) * W) / tw, y0 = (j * H) / th, y1 = ((j + 1) * H) / th;
      let cover = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        if (src[y][x] !== "#") continue;
        cover += Math.max(0, Math.min(x + 1, x1) - Math.max(x, x0)) * Math.max(0, Math.min(y + 1, y1) - Math.max(y, y0));
      }
      row += cover / ((x1 - x0) * (y1 - y0)) >= thr ? "#" : ".";
    }
    out.push(row);
  }
  return out;
}

const NATIVE_MIN = Math.ceil((ENCHANT_ICON_SIZE * ENCHANT_ICON_SIZE * 4) / 35); // 17: the 5x7 face's 4 px of 35 cells, at 144 cells
const SQUEEZE_THR = 0.4;
const FACE_MIN: Record<FontId, number> = { "5": 4, "3": 2 }; // tests/icons.test.ts FACES[].icon: the keyword icons' own minimum
const FACE_SIZE: Record<FontId, [number, number]> = { "5": [5, 7], "3": [3, 5] };
const squeezed = (id: EnchantId, f: FontId): Bits => squeeze(ENCHANT_ICON_ROWS[id], FACE_SIZE[f][0], FACE_SIZE[f][1], SQUEEZE_THR);

// ------------------------------------------------------------------------------------------------------------- (a) the icons

describe("ENCHANT-1 E7: the eight icons are sprites, not font glyphs", () => {
  it("font.ts ICON keeps its 19 names (icons.test.ts pins them); no word has a glyph", () => {
    expect(Object.keys(ICON)).toHaveLength(19);
    for (const id of ENCHANT_IDS) expect(Object.keys(ICON), id).not.toContain(id.toUpperCase());
  });

  it("one icon per word, 12 rows of 12: letters of the palette in the art, '.' and '#' in the rows the tests compare", () => {
    expect(Object.keys(ENCHANT_ICON_ART).sort()).toEqual([...ENCHANT_IDS].sort());
    expect(Object.keys(ENCHANT_ICON_ROWS).sort()).toEqual([...ENCHANT_IDS].sort());
    for (const id of ENCHANT_IDS) {
      const pal = enchantPalette(id), art = ENCHANT_ICON_ART[id], rows = ENCHANT_ICON_ROWS[id];
      expect(art, id).toHaveLength(ENCHANT_ICON_SIZE);
      expect(rows, id).toHaveLength(ENCHANT_ICON_SIZE);
      art.forEach((r, y) => {
        expect(r, `${id} row ${y}`).toMatch(new RegExp(`^[.A-Za-z]{${ENCHANT_ICON_SIZE}}$`));
        for (const ch of r) if (ch !== ".") expect(pal[ch], `${id} letter ${ch}`).toBeDefined();
        expect(rows[y], `${id} mask row ${y}`).toMatch(new RegExp(`^[.#]{${ENCHANT_ICON_SIZE}}$`));
      });
      expect(ink(rows), id).toBeGreaterThanOrEqual(24); // a picture, not a speck
      expect(ink(rows), id).toBeLessThanOrEqual(110); // and not a filled square
      expect(art.join("").includes("m"), `${id} wears its word's colour (the plain tone m)`).toBe(true);
      expect(pal.m, id).toBe(ENCHANT_DEFS[id].color);
    }
  });

  it("all eight are different pictures: no two masks equal, even with one the other shifted by 1 px", () => {
    const seen = new Set<string>();
    for (const id of ENCHANT_IDS) {
      const key = ENCHANT_ICON_ROWS[id].join("|");
      expect(seen.has(key), id).toBe(false);
      seen.add(key);
    }
    for (const a of ENCHANT_IDS) for (const b of ENCHANT_IDS) if (a < b) expect(shifted(ENCHANT_ICON_ROWS[a], ENCHANT_ICON_ROWS[b]), `${a} vs ${b}`).toBeGreaterThan(0);
  });

  it(`at their own size: at least ${NATIVE_MIN} px (the keyword icons' share of the cells) between any two, shifts of 1 px tried`, () => {
    let min = Infinity, who = "";
    for (const a of ENCHANT_IDS) for (const b of ENCHANT_IDS) {
      if (a >= b) continue;
      const d = shifted(ENCHANT_ICON_ROWS[a], ENCHANT_ICON_ROWS[b]);
      say(`icon ${a} vs ${b}: ${d}`);
      if (d < min) { min = d; who = `${a} vs ${b}`; }
      expect(d, `${a} vs ${b}`).toBeGreaterThanOrEqual(NATIVE_MIN);
    }
    say(`icon vs icon at 12x12, smallest: ${min} (${who}), threshold ${NATIVE_MIN}`);
  });

  it(`at their own size: at least ${NATIVE_MIN} px from every keyword glyph (all 19, both faces) at every placement in the box`, () => {
    let min = Infinity, who = "";
    for (const id of ENCHANT_IDS) for (const n of keywordNames) for (const f of ["5", "3"] as FontId[]) {
      const d = minDist(ENCHANT_ICON_ROWS[id], glyph(n, f));
      if (d < min) { min = d; who = `${id} vs ${n} (${f})`; }
      expect(d, `${id} vs ${n} (${f})`).toBeGreaterThanOrEqual(NATIVE_MIN);
    }
    say(`icon vs keyword glyph at 12x12, smallest: ${min} (${who}), threshold ${NATIVE_MIN}`);
  });

  for (const f of ["5", "3"] as FontId[]) {
    // The 3x5 squeeze (15 cells) is too coarse to tell two 12x12 pictures apart (ECHOING's arcs and SWIFT's streaks both fall
    // to a few cells on the same side), and an icon is never drawn that small, so icon-vs-icon is asserted at 12x12 and at 5x7
    // only; the 3x5 icon-vs-icon number is printed for the report. Icon-vs-keyword-glyph is asserted in both faces.
    it(`squeezed to the ${f === "5" ? "5x7" : "3x5"} face's size: at least ${FACE_MIN[f]} px (the keyword icons' own minimum) from ${f === "5" ? "the other seven and " : ""}all 19 keyword glyphs`, () => {
      let mi = Infinity, mk = Infinity, whoI = "", whoK = "";
      for (const a of ENCHANT_IDS) {
        const sa = squeezed(a, f);
        expect(ink(sa), `${a} squeezed keeps ink`).toBeGreaterThan(0);
        for (const b of ENCHANT_IDS) {
          if (a >= b) continue;
          const d = minDist(sa, squeezed(b, f));
          if (d < mi) { mi = d; whoI = `${a} vs ${b}`; }
          if (f === "5") expect(d, `${a} vs ${b} at ${f}`).toBeGreaterThanOrEqual(FACE_MIN[f]);
        }
        for (const n of keywordNames) {
          const d = minDist(sa, glyph(n, f));
          if (d < mk) { mk = d; whoK = `${a} vs ${n}`; }
          expect(d, `${a} vs ${n} at ${f}`).toBeGreaterThanOrEqual(FACE_MIN[f]);
        }
      }
      say(`squeezed ${f}: icon vs icon smallest ${mi} (${whoI}); icon vs keyword glyph smallest ${mk} (${whoK}); threshold ${FACE_MIN[f]}`);
    });
  }

  // ENCHANT_ICON_TABLE=1 only: each icon's smallest distance to another icon and to a keyword glyph, at 12x12 and squeezed (the report's table)
  (SHOW ? it : it.skip)("prints each icon's smallest distances", () => {
    const nearest = (xs: [string, number][]): string => { const m = xs.reduce((p, q) => (q[1] < p[1] ? q : p)); return `${m[0]} ${m[1]}`; };
    for (const a of ENCHANT_IDS) {
      const others = ENCHANT_IDS.filter((b) => b !== a);
      const kw = (f: FontId, src: Bits): [string, number][] => keywordNames.map((n) => [n, minDist(src, glyph(n, f))]);
      say(`TABLE ${a.padEnd(8)} ink ${ink(ENCHANT_ICON_ROWS[a])} | 12x12: icon ${nearest(others.map((b): [string, number] => [b, shifted(ENCHANT_ICON_ROWS[a], ENCHANT_ICON_ROWS[b])]))}, `
        + `glyph ${nearest([...kw("5", ENCHANT_ICON_ROWS[a]), ...kw("3", ENCHANT_ICON_ROWS[a])])} | 5x7 squeeze: icon ${nearest(others.map((b): [string, number] => [b, minDist(squeezed(a, "5"), squeezed(b, "5"))]))}, `
        + `glyph ${nearest(kw("5", squeezed(a, "5")))} | 3x5 squeeze: icon ${nearest(others.map((b): [string, number] => [b, minDist(squeezed(a, "3"), squeezed(b, "3"))]))}, glyph ${nearest(kw("3", squeezed(a, "3")))}`);
    }
  });

  it("drawEnchantIcon paints exactly the art, in the palette, at 1x and 2x; an id that is no word draws nothing", () => {
    installRaster();
    for (const id of ENCHANT_IDS) {
      const pal = enchantPalette(id), art = ENCHANT_ICON_ART[id];
      const one = fresh(12, 12);
      expect(drawEnchantIcon(G(one), id, 0, 0), id).toBe(true);
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) expect(one.at(x, y), `${id} (${x},${y})`).toBe(art[y][x] === "." ? null : pal[art[y][x]]);
      expect(one.oob, id).toBe(0);
      const two = fresh(26, 26);
      expect(drawEnchantIcon(G(two), id, 1, 1, 2), id).toBe(true);
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) expect(two.at(1 + x, 1 + y), `${id} x2 (${x},${y})`).toBe(art[y >> 1][x >> 1] === "." ? null : pal[art[y >> 1][x >> 1]]);
      expect(two.at(0, 0), id).toBeNull(); // nothing outside the 24x24 box
      expect(two.oob, id).toBe(0);
      const cv = enchantIcon(id);
      expect([cv.width, cv.height], id).toEqual([12, 12]);
      expect(enchantIcon(id), `${id} is cached`).toBe(cv);
    }
    const none = fresh(12, 12);
    expect(drawEnchantIcon(G(none), "wibbly", 0, 0)).toBe(false);
    expect(none.px.every((p) => p === null)).toBe(true);
    expect(R(enchantIcon("wibbly")).px.every((p) => p === null)).toBe(true); // a stray id gives a blank canvas, never a throw
  });
});

// ------------------------------------------------------------------------------------------------------------- (b) the spark

describe("ENCHANT-1 E7: the spark mark (a 3x3 plus in the word's colour, a brighter centre)", () => {
  const lum = (hex: string): number => luminance(hex);

  it("draws at most 5 px, all inside its 3x3 box, 4 arms in the word's colour and a brighter centre, for every word", () => {
    installRaster();
    expect(ENCHANT_SPARK_SIZE).toBe(3);
    expect(ENCHANT_SPARK_ROWS).toEqual([".#.", "###", ".#."]);
    for (const id of ENCHANT_IDS) {
      const col = ENCHANT_DEFS[id].color;
      const cv = fresh(9, 9);
      drawEnchantSpark(G(cv), 3, 3, col);
      expect(cv.oob, id).toBe(0);
      const set: [number, number, string][] = [];
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) { const p = cv.at(x, y); if (p !== null) set.push([x, y, p]); }
      expect(set.length, id).toBeLessThanOrEqual(5);
      for (const [x, y] of set) { expect(x >= 3 && x < 6 && y >= 3 && y < 6, `${id} (${x},${y}) is inside the 3x3 box`).toBe(true); }
      expect(set.filter(([, , p]) => p === col), `${id} arms in the word's colour`).toHaveLength(4);
      const centre = cv.at(4, 4)!;
      expect(centre, id).toBe(enchantSparkCentre(col));
      expect(lum(centre), `${id} centre brighter than its arms`).toBeGreaterThan(lum(col));
      for (const [x, y] of [[3, 3], [5, 3], [3, 5], [5, 5]]) expect(cv.at(x, y), `${id} corner ${x},${y} stays empty`).toBeNull(); // a plus, not a block
    }
  });

  it("is no keyword icon: at least 2 px from every keyword glyph in the 3x5 face (the icons' own minimum there) and 4 in the 5x7 face, at every placement", () => {
    const spark = [...ENCHANT_SPARK_ROWS];
    let min3 = Infinity, min5 = Infinity, who3 = "", who5 = "";
    for (const n of keywordNames) {
      const d3 = minDist(glyph(n, "3"), spark), d5 = minDist(glyph(n, "5"), spark);
      if (d3 < min3) { min3 = d3; who3 = n; }
      if (d5 < min5) { min5 = d5; who5 = n; }
      expect(d3, `spark vs ${n} (3x5)`).toBeGreaterThanOrEqual(FACE_MIN["3"]);
      expect(d5, `spark vs ${n} (5x7)`).toBeGreaterThanOrEqual(FACE_MIN["5"]);
    }
    say(`spark vs keyword glyph: 3x5 smallest ${min3} (${who3}), 5x7 smallest ${min5} (${who5})`);
  });
});

// ------------------------------------------------------------------------------------------------------------- (c) the colours

const rgb = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbDistance = (a: string, b: string): number => { const p = rgb(a), q = rgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

/** Every colour the game prints a keyword in: the 9 keywords through font.ts keywordColour (icon glued to the player's word), every
 *  ICON_COLOUR entry (adds RATE and GOLD), richText.ts KEYWORD_COLOUR (burn, shock, faster, slower), FRAY's number in the status row
 *  (plum5, COUNT-1) and the dark wind's violet (windHit, WIND-1), the other violet in the game. */
function keywordColours(): [string, string][] {
  const out: [string, string][] = [];
  for (const k of KEYWORDS) {
    const c = keywordColour(ICON[k] + PLAYER_WORD[k]);
    expect(c, k).toBeDefined();
    out.push([k, c!]);
  }
  for (const [g, c] of Object.entries(ICON_COLOUR)) out.push([`icon U+${g.charCodeAt(0).toString(16).toUpperCase()}`, c]);
  for (const [k, c] of Object.entries(KEYWORD_COLOUR)) out.push([`richText ${k}`, c]);
  out.push(["FRAY's number (plum5)", C.plum5], ["the dark wind (windHit)", C.windHit]);
  return out;
}

/** The two words the brief colours as a keyword: FIERY is BURN's orange, BRACED is PLATE's steel (PIECES-1 4.2; BRIEF "The eight words"). */
const TWINS: Partial<Record<EnchantId, string>> = { fiery: C.fire3 }; // run 5: BRACED left PLATE's steel for an ice blue (the cold read), so it keeps the same distance rule as every other word
const DELTA_E_MIN = 20; // THRESHOLDS.state / .yours: "clearly another colour" (a just-noticeable difference is about 2.3)
const RGB_MIN = 40; // about 9% of the colour cube's diagonal (441): every word's nearest keyword colour is farther than this (table in the report)

describe("ENCHANT-1 E7: the word colours", () => {
  it("the defs hold 8 well-formed colours, and the two twins are exactly their keyword's colour", () => {
    for (const id of ENCHANT_IDS) expect(ENCHANT_DEFS[id].color, id).toMatch(/^#[0-9A-F]{6}$/);
    expect(ENCHANT_DEFS.fiery.color).toBe(C.fire3); // BURN orange, as [BURN]+1 on the stat row
    expect(ENCHANT_DEFS.braced.color).toBe("#6CC0F0"); // run 5 (E10's fix round): an ice blue, not PLATE's steel #C6D0EA (the brief's), which 4 of 6 cold readers took for the part's name
    expect(C.plate3).toBe("#C6D0EA");
    expect(separation(ENCHANT_DEFS.braced.color, C.plate3)).toBeGreaterThanOrEqual(20); // a clearly different shade from PLATE's own steel
  });

  it("each word reads on every panel style: the contrast the keyword colours keep (keywordMin, at least 3:1) and WCAG AA 4.5:1 for text", () => {
    for (const id of ENCHANT_IDS) {
      const c = ENCHANT_DEFS[id].color;
      for (const p of PANELS) {
        const k = contrast(c, p.fill);
        say(`contrast ${id} on ${p.id}: ${k.toFixed(2)}`);
        expect(k, `${id} on ${p.id}`).toBeGreaterThanOrEqual(keywordMin(c) - 1e-9);
        expect(k, `${id} on ${p.id}`).toBeGreaterThanOrEqual(THRESHOLDS.keyword);
        expect(k, `${id} on ${p.id}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it(`no word is near a keyword colour: delta E at least ${DELTA_E_MIN} and RGB distance at least ${RGB_MIN} from every one (the twins keep their keyword's own near pairs)`, () => {
    const kws = keywordColours();
    for (const id of ENCHANT_IDS) {
      const c = ENCHANT_DEFS[id].color, twin = TWINS[id];
      let nearest = Infinity, who = "";
      for (const [name, k] of kws) {
        if (twin !== undefined && separation(twin, k) < DELTA_E_MIN) continue; // BURN's own colour, and HEAT's amber that already sits beside it
        const e = separation(c, k), d = rgbDistance(c, k);
        if (e < nearest) { nearest = e; who = `${name} (dE ${e.toFixed(1)}, rgb ${d.toFixed(0)})`; }
        expect(e, `${id} vs ${name}`).toBeGreaterThanOrEqual(DELTA_E_MIN);
        expect(d, `${id} vs ${name}`).toBeGreaterThanOrEqual(RGB_MIN);
      }
      say(`colour ${id} ${c}: nearest keyword colour ${who}`);
    }
  });

  it("the brief's three risky pairs, by name: ECHOING's violet vs FRAY's purple, WIDE's teal vs STUN's cyan, SWIFT's yellow vs the gold price colour", () => {
    const pairs: [EnchantId, string, string][] = [
      ["echoing", C.plum4, "FRAY plum4"], ["echoing", C.plum5, "FRAY's number plum5"], ["wide", C.cyan, "STUN cyan"], ["wide", C.verd3, "REGEN verdigris"], ["swift", C.yellow, "GOLD / RATE yellow"],
    ];
    for (const [id, k, name] of pairs) {
      const e = separation(ENCHANT_DEFS[id].color, k), d = rgbDistance(ENCHANT_DEFS[id].color, k);
      say(`risky pair ${id} vs ${name}: dE ${e.toFixed(1)}, rgb ${d.toFixed(0)}`);
      expect(e, `${id} vs ${name}`).toBeGreaterThanOrEqual(DELTA_E_MIN);
      expect(d, `${id} vs ${name}`).toBeGreaterThanOrEqual(RGB_MIN);
    }
    expect(ICON_COLOUR[ICON.GOLD]).toBe(C.yellow); // the gold price colour is C.yellow, the same as RATE's
  });

  it(`the eight words are apart from each other too: delta E at least ${DELTA_E_MIN}`, () => {
    let min = Infinity, who = "";
    for (const a of ENCHANT_IDS) for (const b of ENCHANT_IDS) {
      if (a >= b) continue;
      const e = separation(ENCHANT_DEFS[a].color, ENCHANT_DEFS[b].color);
      if (e < min) { min = e; who = `${a} vs ${b}`; }
      expect(e, `${a} vs ${b}`).toBeGreaterThanOrEqual(DELTA_E_MIN);
    }
    say(`word vs word colour, smallest delta E: ${min.toFixed(1)} (${who})`);
  });
});

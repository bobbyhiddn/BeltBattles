// Bitmap fonts: a 5x7 main face and a 3x5 micro face. Glyphs are cached per colour.
//
// R1 mock (REQ-BFG-046; branch r1-mock only, never shipped; display only): ICON GLYPHS. Each icon is one private-use code
// point (U+E000.., one UTF-16 unit, so textWidth, wrap, wrapRich and every wrap rule count it as one glyph) with a bitmap
// in both faces: 5 px wide in the 5x7 face (+1 advance: 6 px, as a letter) and 3 px wide in the 3x5 face (+1: 4 px).
// - Write one into any string: `+1 ${ICON.BURN}`, or the {NAME} markup through icons("+1 {BURN}") (same string).
// - Colour: drawText draws an icon in its own colour (ICON_COLOUR: BURN fire3, SHOCK cyan, POISON lime, PLATE plate3)
//   wherever the string is drawn (panel bodies, cards, hero select, titles, buttons); an icon with no entry there (DMG,
//   SEC) takes the colour of its text, as a letter does. TextOpts.mono draws every icon in the text's colour. A drop
//   shadow stays the shadow's colour; an outline stays the outline's.
// - The bitmaps are placeholders (R1 brief): DMG burst, SEC clock (3x5: an hourglass), BURN flame, SHOCK bolt, PLATE
//   shield, POISON drop (3x5: a flask).

import { C } from "./palette";
import { makeCanvas, type G } from "./pixel";

type GlyphMap = Record<string, string>;

/** R1 mock: the first icon code point (U+E000, private use) and the nth icon's one-unit string. */
export const ICON_BASE = 0xe000;
const pua = (n: number): string => String.fromCharCode(ICON_BASE + n);
/** R1 mock: the icon glyphs, each one private-use code point (DMG U+E000 .. POISON U+E005), one UTF-16 unit. */
export const ICON = {
  DMG: pua(0),
  SEC: pua(1),
  BURN: pua(2),
  SHOCK: pua(3),
  PLATE: pua(4),
  POISON: pua(5),
} as const;
export type IconName = keyof typeof ICON;

// 5x7: rows joined with "|"
const F5: GlyphMap = {
  A: ".###.|#...#|#...#|#####|#...#|#...#|#...#",
  B: "####.|#...#|#...#|####.|#...#|#...#|####.",
  C: ".###.|#...#|#....|#....|#....|#...#|.###.",
  D: "####.|#...#|#...#|#...#|#...#|#...#|####.",
  E: "#####|#....|#....|####.|#....|#....|#####",
  F: "#####|#....|#....|####.|#....|#....|#....",
  G: ".###.|#...#|#....|#.###|#...#|#...#|.####",
  H: "#...#|#...#|#...#|#####|#...#|#...#|#...#",
  I: ".###.|..#..|..#..|..#..|..#..|..#..|.###.",
  J: "..###|...#.|...#.|...#.|...#.|#..#.|.##..",
  K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
  L: "#....|#....|#....|#....|#....|#....|#####",
  M: "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
  N: "#...#|#...#|##..#|#.#.#|#..##|#...#|#...#",
  O: ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
  P: "####.|#...#|#...#|####.|#....|#....|#....",
  Q: ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#",
  R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
  S: ".####|#....|#....|.###.|....#|....#|####.",
  T: "#####|..#..|..#..|..#..|..#..|..#..|..#..",
  U: "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
  V: "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
  W: "#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.",
  X: "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
  Y: "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..",
  Z: "#####|....#|...#.|..#..|.#...|#....|#####",
  "0": ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.",
  "1": "..#..|.##..|..#..|..#..|..#..|..#..|.###.",
  "2": ".###.|#...#|....#|...#.|..#..|.#...|#####",
  "3": "####.|....#|....#|.###.|....#|....#|####.",
  "4": "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.",
  "5": "#####|#....|####.|....#|....#|#...#|.###.",
  "6": "..##.|.#...|#....|####.|#...#|#...#|.###.",
  "7": "#####|....#|...#.|..#..|.#...|.#...|.#...",
  "8": ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
  "9": ".###.|#...#|#...#|.####|....#|...#.|.##..",
  ".": ".|.|.|.|.|.|#",
  ",": "..|..|..|..|..|.#|#.",
  ":": ".|#|.|.|.|#|.",
  ";": "..|.#|..|..|..|.#|#.",
  "!": "#|#|#|#|#|.|#",
  "?": ".###.|#...#|....#|...#.|..#..|.....|..#..",
  "'": "#|#|.|.|.|.|.",
  '"': "#.#|#.#|...|...|...|...|...",
  "-": "....|....|....|####|....|....|....",
  "+": ".....|..#..|..#..|#####|..#..|..#..|.....",
  "=": ".....|.....|#####|.....|#####|.....|.....",
  "/": "....#|....#|...#.|..#..|.#...|#....|#....",
  "%": "##..#|##..#|...#.|..#..|.#...|#..##|#..##",
  "(": "..#|.#.|#..|#..|#..|.#.|..#",
  ")": "#..|.#.|..#|..#|..#|.#.|#..",
  "[": "###|#..|#..|#..|#..|#..|###",
  "]": "###|..#|..#|..#|..#|..#|###",
  "<": "...#|..#.|.#..|#...|.#..|..#.|...#",
  ">": "#...|.#..|..#.|...#|..#.|.#..|#...",
  "#": ".#.#.|#####|.#.#.|.#.#.|#####|.#.#.|.....",
  "&": ".##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#",
  "_": ".....|.....|.....|.....|.....|.....|#####",
  "*": ".....|#...#|.#.#.|..#..|.#.#.|#...#|.....",
  x: ".....|.....|#...#|.#.#.|..#..|.#.#.|#...#",
  "→": ".....|..#..|...#.|#####|...#.|..#..|.....",
  "←": ".....|..#..|.#...|#####|.#...|..#..|.....",
  "↑": "..#..|.###.|#.#.#|..#..|..#..|..#..|..#..",
  "↓": "..#..|..#..|..#..|..#..|#.#.#|.###.|..#..",
  "·": ".|.|.|#|.|.|.",
  "♥": ".....|.#.#.|#####|#####|.###.|..#..|.....",
  "★": "..#..|..#..|#####|.###.|.#.#.|#...#|.....",
  "▶": "#....|##...|###..|####.|###..|##...|#....",
  "❚": "##.##|##.##|##.##|##.##|##.##|##.##|##.##",
  " ": "...|...|...|...|...|...|...",
  // R1 mock (REQ-BFG-046): the icon glyphs, 5 wide (placeholder bitmaps from the R1 brief)
  [ICON.DMG]: ".....|#.#.#|.###.|#####|.###.|#.#.#|.....",
  [ICON.SEC]: ".###.|#.#.#|#.#.#|#.###|#...#|#...#|.###.",
  [ICON.BURN]: "..#..|..##.|.###.|.####|#####|##.##|.###.",
  [ICON.SHOCK]: "...##|..##.|.##..|#####|..##.|.##..|##...",
  [ICON.PLATE]: "#####|##.##|#...#|#...#|.#.#.|.#.#.|..#..",
  [ICON.POISON]: "..#..|..#..|.###.|.###.|##.##|#####|.###.",
};

// 3x5
const F3: GlyphMap = {
  A: ".#.|#.#|###|#.#|#.#",
  B: "##.|#.#|##.|#.#|##.",
  C: ".##|#..|#..|#..|.##",
  D: "##.|#.#|#.#|#.#|##.",
  E: "###|#..|##.|#..|###",
  F: "###|#..|##.|#..|#..",
  G: ".##|#..|#.#|#.#|.##",
  H: "#.#|#.#|###|#.#|#.#",
  I: "###|.#.|.#.|.#.|###",
  J: "..#|..#|..#|#.#|.#.",
  K: "#.#|#.#|##.|#.#|#.#",
  L: "#..|#..|#..|#..|###",
  M: "#.#|###|###|#.#|#.#",
  N: "##.|#.#|#.#|#.#|#.#",
  O: ".#.|#.#|#.#|#.#|.#.",
  P: "##.|#.#|##.|#..|#..",
  Q: ".#.|#.#|#.#|##.|.##",
  R: "##.|#.#|##.|#.#|#.#",
  S: ".##|#..|.#.|..#|##.",
  T: "###|.#.|.#.|.#.|.#.",
  U: "#.#|#.#|#.#|#.#|###",
  V: "#.#|#.#|#.#|#.#|.#.",
  W: "#.#|#.#|###|###|#.#",
  X: "#.#|#.#|.#.|#.#|#.#",
  Y: "#.#|#.#|.#.|.#.|.#.",
  Z: "###|..#|.#.|#..|###",
  "0": "###|#.#|#.#|#.#|###",
  "1": ".#.|##.|.#.|.#.|###",
  "2": "###|..#|###|#..|###",
  "3": "###|..#|###|..#|###",
  "4": "#.#|#.#|###|..#|..#",
  "5": "###|#..|###|..#|###",
  "6": "###|#..|###|#.#|###",
  "7": "###|..#|..#|.#.|.#.",
  "8": "###|#.#|###|#.#|###",
  "9": "###|#.#|###|..#|###",
  ".": ".|.|.|.|#",
  ":": ".|#|.|#|.",
  "-": "...|...|###|...|...",
  "+": "...|.#.|###|.#.|...",
  "/": "..#|..#|.#.|#..|#..",
  "%": "#.#|..#|.#.|#..|#.#",
  x: "...|#.#|.#.|#.#|...",
  "!": "#|#|#|.|#",
  "?": "##.|..#|.#.|...|.#.",
  "(": ".#|#.|#.|#.|.#",
  ")": "#.|.#|.#|.#|#.",
  "'": "#|#|.|.|.",
  ",": "..|..|..|.#|#.",
  ";": "..|.#|..|.#|#.",
  '"': "#.#|#.#|...|...|...",
  "=": "...|###|...|###|...",
  "<": "..#|.#.|#..|.#.|..#",
  ">": "#..|.#.|..#|.#.|#..",
  "&": ".#.|#.#|.#.|#.#|.##",
  "·": ".|.|#|.|.",
  // PACKS M2 (REQ-BFG-063): the name tag on the dusk intro (ANNA#3F) is drawn in this face. PACKS run 2 (the lead's
  // ruling R1): a classic five-column hash (was three columns, "#.#|###|#.#|###|#.#", which read like an "H" at 100%:
  // "MIRA#2C" as "MIRAH2C"); the face holds other widths already ("·" one column, " " two)
  "#": ".#.#.|#####|.#.#.|#####|.#.#.",
  "→": "...|..#|###|..#|...",
  "♥": "#.#|###|###|.#.|...",
  // 0.6.1d (ARSENAL.md §8.2): the MERGE badge and star pips need a ★ that fits a 3x5 cell.
  "★": "#.#|.#.|###|.#.|#.#",
  " ": "..|..|..|..|..",
  // R1 mock (REQ-BFG-046): the icon glyphs' 3x5 twins, 3 wide (each unlike every other 3x5 glyph, ★ included)
  [ICON.DMG]: "#.#|###|.#.|###|#.#",
  [ICON.SEC]: "###|#.#|.#.|#.#|###",
  [ICON.BURN]: ".#.|.##|###|###|.#.",
  [ICON.SHOCK]: "..#|.#.|###|.#.|#..",
  [ICON.PLATE]: "###|#.#|#.#|#.#|.#.",
  [ICON.POISON]: ".#.|.#.|###|#.#|###",
};

/** R1 mock: an icon's own colour, where it has one (BURN, SHOCK and POISON are richText.ts KEYWORD_COLOUR's, PLATE is
 *  BASTION's plating); an icon without an entry (DMG, SEC) takes its text's colour. drawText applies it (TextOpts.mono:
 *  not). */
export const ICON_COLOUR: Readonly<Record<string, string>> = {
  [ICON.BURN]: C.fire3,
  [ICON.SHOCK]: C.cyan,
  [ICON.POISON]: C.lime,
  [ICON.PLATE]: C.plate3,
};

const ICON_CHARS: ReadonlySet<string> = new Set(Object.values(ICON));

/** R1 mock: whether `ch` (one UTF-16 unit) is an icon glyph. */
export const isIcon = (ch: string): boolean => ICON_CHARS.has(ch);

/** R1 mock: `s` without its icon glyphs (richText.ts colourize: "4" and the DMG icon is still a number). */
export const stripIcons = (s: string): string => {
  for (let i = 0; i < s.length; i++) if (ICON_CHARS.has(s[i])) return [...s].filter((ch) => !ICON_CHARS.has(ch)).join("");
  return s;
};

/** R1 mock: the {NAME} markup to icon glyphs: icons("+1 {BURN}") === `+1 ${ICON.BURN}`. An unknown name stays as written. */
export function icons(s: string): string {
  return s.replace(/\{([A-Z]+)\}/g, (m: string, name: string) => (Object.prototype.hasOwnProperty.call(ICON, name) ? ICON[name as IconName] : m));
}

export type FontId = "5" | "3";

interface Face {
  map: GlyphMap;
  h: number;
  adv: number; // spacing after glyph
}

const FACES: Record<FontId, Face> = {
  "5": { map: F5, h: 7, adv: 1 },
  "3": { map: F3, h: 5, adv: 1 },
};

// Hot path: HUD labels and damage numbers draw every frame. Widths are memoised per
// glyph and outlined glyphs are cached as one sprite (outline + body), so drawing a
// string is one drawImage per character with no per-call allocation.

function source(font: FontId, ch: string): string | undefined {
  const face = FACES[font];
  let src = face.map[ch];
  if (src === undefined) src = face.map[ch.toUpperCase()];
  if (src === undefined) src = face.map["?"];
  return src;
}

const widths: Record<FontId, Map<string, number>> = { "5": new Map(), "3": new Map() };

function glyphWidth(font: FontId, ch: string): number {
  const m = widths[font];
  let w = m.get(ch);
  if (w === undefined) {
    const src = source(font, ch) ?? "...";
    w = src.split("|")[0].length;
    m.set(ch, w);
  }
  return w;
}

// font -> colour -> outline colour ("" = none) -> char -> sprite
const sprites: Record<FontId, Map<string, Map<string, Map<string, HTMLCanvasElement | null>>>> = { "5": new Map(), "3": new Map() };
const OUTLINE_D = [-1, 0, 1, 0, 0, -1, 0, 1, -1, -1, 1, -1, -1, 1, 1, 1];

function glyph(font: FontId, ch: string, color: string, outline: string): HTMLCanvasElement | null {
  let byColor = sprites[font].get(color);
  if (!byColor) sprites[font].set(color, (byColor = new Map()));
  let byOutline = byColor.get(outline);
  if (!byOutline) byColor.set(outline, (byOutline = new Map()));
  let c = byOutline.get(ch);
  if (c !== undefined) return c;
  const src = source(font, ch);
  if (src === undefined) {
    byOutline.set(ch, null);
    return null;
  }
  const rows = src.split("|");
  const w = rows[0].length, h = FACES[font].h;
  const pad = outline ? 1 : 0;
  const [cv, g] = makeCanvas(w + pad * 2, h + pad * 2);
  const paint = (col: string, dx: number, dy: number) => {
    g.fillStyle = col;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === "#") g.fillRect(x + pad + dx, y + pad + dy, 1, 1);
    });
  };
  if (outline) for (let i = 0; i < OUTLINE_D.length; i += 2) paint(outline, OUTLINE_D[i], OUTLINE_D[i + 1]);
  paint(color, 0, 0);
  byOutline.set(ch, cv);
  return cv;
}

export function textWidth(s: string, font: FontId = "5"): number {
  if (!s.length) return 0;
  const adv = FACES[font].adv;
  let w = 0;
  for (let i = 0; i < s.length; i++) w += glyphWidth(font, s[i]) + adv;
  return w - adv;
}

export function fontHeight(font: FontId = "5"): number {
  return FACES[font].h;
}

export interface TextOpts {
  font?: FontId;
  align?: "left" | "center" | "right";
  shadow?: string | null; // 1px drop shadow colour
  outline?: string | null; // 1px outline colour (8-way)
  scale?: number; // integer
  /** R1 mock: draw icon glyphs in the text's colour too (default: each icon in its own colour, ICON_COLOUR). */
  mono?: boolean;
}

/** One pass of a string. R1 mock: `tint`, each icon glyph in its own colour (ICON_COLOUR) where it has one. */
function pass(g: G, s: string, font: FontId, color: string, outline: string, ox: number, oy: number, scale: number, tint = false): void {
  const adv = FACES[font].adv;
  const pad = outline ? scale : 0;
  let cx = ox;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const gl = glyph(font, ch, tint && ch.charCodeAt(0) >= ICON_BASE ? ICON_COLOUR[ch] ?? color : color, outline);
    if (gl) {
      if (scale === 1) g.drawImage(gl, cx - pad, oy - pad);
      else g.drawImage(gl, 0, 0, gl.width, gl.height, cx - pad, oy - pad, gl.width * scale, gl.height * scale);
    }
    cx += (glyphWidth(font, ch) + adv) * scale;
  }
}

const NO_OPTS: TextOpts = {};

export function drawText(g: G, s: string, x: number, y: number, color: string, opts: TextOpts = NO_OPTS): number {
  const font = opts.font ?? "5";
  const scale = Math.max(1, Math.floor(opts.scale ?? 1));
  const w = textWidth(s, font) * scale;
  let ox = Math.round(x);
  if (opts.align === "center") ox = Math.round(x - w / 2);
  else if (opts.align === "right") ox = Math.round(x - w);
  const oy = Math.round(y);
  if (opts.shadow) pass(g, s, font, opts.shadow, "", ox + scale, oy + scale, scale);
  pass(g, s, font, color, opts.outline ?? "", ox, oy, scale, !opts.mono); // R1 mock: icons in their own colours
  return w;
}

/** Greedy word wrap to a pixel width. */
export function wrap(s: string, maxW: number, font: FontId = "5"): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textWidth(t, font) <= maxW || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

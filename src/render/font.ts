// Bitmap fonts: a 5x7 main face and a 3x5 micro face. Glyphs are cached per colour.
//
// U1 (REQ-BFG-046, MEMO R1 C2): THE ICON SET, the stat language the piece faces are written in. 16 icons: 14 private-use
// code points, U+E000 DMG .. U+E00D PAIR (ICON; one UTF-16 unit each, so textWidth, wrap, wrapRich and every wrap rule
// count one as one glyph), plus HULL and STAR, today's ♥ and ★ (unchanged). Each has a bitmap in both faces: 5 px wide in
// the 5x7 face (+1 advance: 6 px, as a letter) and 3 px wide in the 3x5 face (+1: 4 px). The bitmaps keep a pixel
// distance from every digit, letter, punctuation glyph and other icon (output-u1/REPORT.md section 4; tests/icons.test.ts).
// - Write one into any string: `+1 ${ICON.BURN}`, or the markup through icons(): "{BURN}" is the icon alone (stat rows,
//   shop chips, the board), "{*BURN}" a keyword in panel style, the icon then its word (icons(s, "alone"): the icon alone).
//   SEC is a unit after its number: "1.25{SEC}" (U1's cold read). src/ui/icons.ts statRow builds a stat row.
// - Colour: drawText draws an icon in its own colour (ICON_COLOUR) wherever the string is drawn (panel bodies, cards, hero
//   select, titles, buttons); an icon with no entry (DMG, SEC, SLUG, BELT, GEAR, UP; ♥ and ★ as today) takes the colour of
//   its text, as a letter does. TextOpts.mono draws every icon in the text's colour. A drop shadow stays the shadow's
//   colour; an outline stays the outline's. Text without an icon draws exactly as before.

import { C } from "./palette";
import { makeCanvas, type G } from "./pixel";

type GlyphMap = Record<string, string>;

/** U1: the first icon code point (U+E000, private use) and the nth icon's one-unit string. */
export const ICON_BASE = 0xe000;
const pua = (n: number): string => String.fromCharCode(ICON_BASE + n);
/** U1 (MEMO C2): the 16 icons. DMG U+E000 .. PAIR U+E00D are private-use code points, one UTF-16 unit each; HULL and STAR
 *  are today's ♥ and ★, so "{HULL}" and "{STAR}" work in the markup. */
export const ICON = {
  DMG: pua(0), // damage
  SEC: pua(1), // seconds: a unit after its number, "1.25" then SEC (a small s)
  RATE: pua(2), // faster: folds WORKS FASTER, FIRE RATE and SPEED
  SLUG: pua(3), // a slug, or a turret's loads
  BELT: pua(4), // a belt tile
  GEAR: pua(5), // a gear slot
  GOLD: pua(6), // gold
  UP: pua(7), // a level
  BURN: pua(8), // keyword
  STUN: pua(9), // keyword
  HEAT: pua(10), // keyword (FURNACE)
  FRAY: pua(11), // keyword (WEAVER)
  PLATE: pua(12), // keyword (BASTION)
  PAIR: pua(13), // keyword (FOUNDRY)
  HULL: "♥",
  STAR: "★",
} as const;
export type IconName = keyof typeof ICON;
/** U1 (MEMO C1): the 6 keywords. "{*NAME}" draws one as its icon then its word, both in the keyword's colour. */
export const KEYWORDS = ["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR"] as const;
export type KeywordName = (typeof KEYWORDS)[number];

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
  // U1 (REQ-BFG-046): the icons, 5 wide (MEMO C2's bitmaps; SEC, GOLD and HEAT redrawn, REPORT section 2)
  [ICON.DMG]: "..#..|#.#.#|.###.|#####|.###.|#.#.#|..#..", // a burst
  [ICON.SEC]: ".....|.....|.####|#....|.###.|....#|####.", // a small s on the baseline
  [ICON.RATE]: ".....|#.#..|.#.#.|..#.#|.#.#.|#.#..|.....", // a double chevron
  [ICON.SLUG]: ".....|.###.|#####|#####|#####|.###.|.....", // a slug
  [ICON.BELT]: "#####|.....|#.#.#|.#.#.|#.#.#|.....|#####", // a belt tile between its rails
  [ICON.GEAR]: ".#.#.|#####|##.##|#...#|##.##|#####|.#.#.", // a cog with a hole
  [ICON.GOLD]: ".###.|###.#|##.##|#####|#####|#####|.###.", // a coin with its glint (a ring reads as a 0)
  [ICON.UP]: ".....|..#..|.###.|#####|.....|#####|.....", // an arrow over a bar
  [ICON.BURN]: "..#..|..##.|.###.|.####|#####|##.##|.###.", // a flame
  [ICON.STUN]: "...##|..##.|.##..|#####|..##.|.##..|##...", // a bolt
  [ICON.HEAT]: "..#..|.##..|..#..|.##..|.###.|#####|.###.", // a thermometer: a stem with 2 ticks, a bulb
  [ICON.FRAY]: "#...#|.#.#.|..#..|.....|#...#|.#.#.|..#..", // a shred mark
  [ICON.PLATE]: "#####|##.##|#...#|#...#|.#.#.|.#.#.|..#..", // a riveted shield
  [ICON.PAIR]: ".....|.....|##.##|#####|##.##|.....|.....", // a linked pair
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
  // U1 (REQ-BFG-046): the icons' 3x5 twins, 3 wide (each the same object as its 5x7, apart from every other 3x5 glyph)
  [ICON.DMG]: "..#|###|.#.|###|#..", // a burst (a spinning one: the 3x5 star ★ is the plain burst)
  [ICON.SEC]: "...|.##|#..|..#|##.", // a small s on the baseline
  [ICON.RATE]: "##.|.##|..#|.##|##.", // a double chevron
  [ICON.SLUG]: "...|###|###|###|...", // a slug
  [ICON.BELT]: "###|...|#.#|...|###", // a belt tile between its rails
  [ICON.GEAR]: "#.#|###|#.#|###|...", // a cog with a hole, 2 teeth
  [ICON.GOLD]: ".#.|###|##.|###|.#.", // a coin with its shine
  [ICON.UP]: ".#.|###|...|...|###", // an arrow over a bar
  [ICON.BURN]: "..#|.##|###|#.#|.#.", // a flame
  [ICON.STUN]: "..#|.#.|###|.#.|#..", // a bolt
  [ICON.HEAT]: ".#.|##.|.#.|###|.#.", // a thermometer: a stem with a tick, a bulb
  [ICON.FRAY]: "#.#|.#.|...|#.#|.#.", // a shred mark
  [ICON.PLATE]: "###|###|#.#|.#.|.#.", // a shield
  [ICON.PAIR]: "...|#.#|###|#.#|...", // a linked pair
};

/** U1: an icon's own colour, where it has one. RATE is KEYWORD_COLOUR's FASTER (richText.ts), GOLD the shop's price colour
 *  (shop.ts), BURN KEYWORD_COLOUR's burn, STUN SHOCK's cyan, HEAT amber, FRAY violet (plum4: the game gives FRAY and the
 *  LOOM's thread no violet; its hull pip is ice, STUN's neighbour), PLATE BASTION's plating, PAIR the TWIN family's blue
 *  (ui/families.ts). An icon without an entry takes its text's colour. drawText applies it (TextOpts.mono: not). */
export const ICON_COLOUR: Readonly<Record<string, string>> = {
  [ICON.RATE]: C.yellow,
  [ICON.GOLD]: C.yellow,
  [ICON.BURN]: C.fire3,
  [ICON.STUN]: C.cyan,
  [ICON.HEAT]: C.amber,
  [ICON.FRAY]: C.plum4,
  [ICON.PLATE]: C.plate3,
  [ICON.PAIR]: C.blue,
};

/** The private-use icons (HULL ♥ and STAR ★ are ordinary text: "★2" stays a star mark, as today). */
const ICON_CHARS: ReadonlySet<string> = new Set(Object.values(ICON).filter((ch) => ch.charCodeAt(0) >= ICON_BASE));
const KEYWORD_SET: ReadonlySet<string> = new Set(KEYWORDS);

/** U1: whether `ch` (one UTF-16 unit) is a private-use icon glyph (DMG .. PAIR). */
export const isIcon = (ch: string): boolean => ICON_CHARS.has(ch);

/** U1: `s` without its icon glyphs (richText.ts colourize: "4" and the DMG icon is still a number). */
export const stripIcons = (s: string): string => {
  for (let i = 0; i < s.length; i++) if (ICON_CHARS.has(s[i])) return [...s].filter((ch) => !ICON_CHARS.has(ch)).join("");
  return s;
};

/** U1: how icons() writes a keyword token "{*NAME}": "word", the panel style (the icon, then its word); "alone", the icon
 *  alone (shop chips, the board). */
export type IconMode = "word" | "alone";

/**
 * U1: the markup to glyphs. "{NAME}" is the icon alone: icons("+1 {BURN}") === `+1 ${ICON.BURN}`. "{*NAME}" (one of the 6
 * KEYWORDS) is the keyword: its icon then its word, icons("HIT: 2 {*STUN}") === `HIT: 2 ${ICON.STUN}STUN`; in "alone"
 * mode, the icon alone. An unknown name, or "{*NAME}" on an icon that is no keyword, stays as written. No player text
 * holds a brace (neither face has a brace glyph).
 */
export function icons(s: string, mode: IconMode = "word"): string {
  return s.replace(/\{(\*?)([A-Z]+)\}/g, (m: string, kw: string, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(ICON, name)) return m;
    const ch = ICON[name as IconName];
    if (!kw) return ch;
    if (!KEYWORD_SET.has(name)) return m;
    return mode === "alone" ? ch : ch + name;
  });
}

/** U1: the colour of a keyword in panel style (`word` is a keyword's icon glued to its word, as icons() writes "{*NAME}"),
 *  else undefined. richText.ts colourize colours the word with it; a bare word ("PAIRS", "HEAT JACKET") is untouched. */
export function keywordColour(word: string): string | undefined {
  if (word.length < 2) return undefined;
  const name = word.slice(1);
  return KEYWORD_SET.has(name) && word[0] === ICON[name as KeywordName] ? ICON_COLOUR[word[0]] : undefined;
}

/** U1 (tests, tools): a glyph's bitmap rows in a face ("#" ink, "." blank), or undefined where the face has none. */
export function glyphRows(ch: string, font: FontId = "5"): string[] | undefined {
  const src = FACES[font].map[ch];
  return src === undefined ? undefined : src.split("|");
}

/** U1 (tests, tools): every character a face has a glyph for (the space included). */
export function faceChars(font: FontId = "5"): string[] {
  return Object.keys(FACES[font].map);
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
  /** U1: draw icon glyphs in the text's colour too (default: each icon in its own colour, ICON_COLOUR). */
  mono?: boolean;
}

/** One pass of a string. U1: `tint`, each icon glyph in its own colour (ICON_COLOUR) where it has one. */
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
  pass(g, s, font, color, opts.outline ?? "", ox, oy, scale, !opts.mono); // U1: icons in their own colours
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

// Bitmap fonts: a 5x7 main face and a 3x5 micro face. Glyphs are cached per colour.

import { makeCanvas, type G } from "./pixel";

type GlyphMap = Record<string, string>;

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
  "→": "...|..#|###|..#|...",
  "♥": "#.#|###|###|.#.|...",
  " ": "..|..|..|..|..",
};

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
}

function pass(g: G, s: string, font: FontId, color: string, outline: string, ox: number, oy: number, scale: number): void {
  const adv = FACES[font].adv;
  const pad = outline ? scale : 0;
  let cx = ox;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const gl = glyph(font, ch, color, outline);
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
  pass(g, s, font, color, opts.outline ?? "", ox, oy, scale);
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

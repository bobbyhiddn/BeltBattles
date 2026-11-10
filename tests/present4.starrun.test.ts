// PRESENT-4 S2 (REQ-BFG-081; STAGE-0915's F14, the release lane's packet 4228a395): a run of small stars reads whole in OUTLINED 3x5 text (src/render/font.ts pass()).
//  Before: PRESENT-3 S draws every ★ of the 3x5 face as the 5x5 star STAR5_ROWS over its own 3-wide slot plus the 2 columns to its left, and the advance stays the 3-wide ★'s (4 px).
//  glyph() caches an outlined glyph as ONE sprite (its 8-way outline first, its body over it) and pass() drew the sprites left to right, so star k+1's outline (its column -1, rows 1-3)
//  landed on star k's column 3 and cut it: `DRAG CHAIN FOUNDRY ★★★` read half, half, whole. The same outline cut the letter or bracket just before a ★ (`NEXT★2`'s T stem, `(★2)`'s bracket).
//  Now: when the face is 3x5, the text has an outline and holds a ★, every glyph's body is drawn once more after every glyph's outline (same colour, tint included, same place):
//  every ★ of a run is whole (two stars touch at one arm pixel, as in plain text), no letter is cut, no width or advance moves, and every other string draws as before.
//  This file is the guard: the new draw against an oracle built from the glyph maps (all outlines, then all bodies), against a copy of the OLD pass kept here (strings with no ★ are
//  byte for byte the old draw; the old draw cuts the stars and the letters named above), the widths, and the number of drawImage calls.
import { describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf, diffPx, type RasterCanvas } from "./raster.helpers";
import { C } from "../src/render/palette";
import { ICON, ICON_BASE, ICON_COLOUR, STAR5_ROWS, drawText, faceChars, glyphRows, textWidth, type FontId } from "../src/render/font";

installRaster();

const TEXT = C.bone, EDGE = C.ink, SHADE = C.red;
const OUT8: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const STAR_ROWS = STAR5_ROWS.split("|");
const STAR_INK: [number, number][] = STAR_ROWS.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "#" ? [[x, y] as [number, number]] : [])));

/** The rows a glyph draws: the 3x5 face's ★ is the 5x5 star; anything the face has no glyph for is `?` (font.ts source()). */
const rowsOf = (ch: string, font: FontId): string[] => (font === "3" && ch === "★" ? STAR_ROWS : (glyphRows(ch, font) ?? glyphRows(ch.toUpperCase(), font) ?? glyphRows("?", font)!));
/** The glyph's advance in art px: the map's glyph width (the 3x5 ★'s is 3: the star's width reference) + the face's 1 px. */
const advOf = (ch: string, font: FontId): number => (glyphRows(ch, font) ?? glyphRows("?", font)!)[0].length + 1;
/** The text colour of a glyph: an icon takes its own colour unless `mono` (drawText's U1 tint). */
const colourOf = (ch: string, mono: boolean): string => (!mono && ch.charCodeAt(0) >= ICON_BASE ? ICON_COLOUR[ch] ?? TEXT : TEXT);

interface Placed { ch: string; rows: string[]; left: number; big: boolean }
/** Every glyph of `s` in art px from x0: where its body's left edge goes (the ★ of the 3x5 face 2 columns left of its slot). */
function place(s: string, font: FontId, x0: number): Placed[] {
  const out: Placed[] = [];
  let cx = x0;
  for (const ch of s) {
    const big = font === "3" && ch === "★";
    out.push({ ch, rows: rowsOf(ch, font), left: cx - (big ? 2 : 0), big });
    cx += advOf(ch, font);
  }
  return out;
}
const bodyOf = (p: Placed): [number, number][] => p.rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === "#" ? [[p.left + x, y] as [number, number]] : [])));

interface Spec { font: FontId; outline: boolean; scale: number; mono?: boolean; shadow?: boolean }
const X0 = 4, Y0 = 3; // art px; the device origin is x scale

/** A blank raster for `s` with room for the star's overhang, the outline and a shadow. */
const canvasFor = (s: string, sp: Spec): RasterCanvas => fresh((textWidth(s, sp.font) + 2 * X0 + 4) * sp.scale, (Y0 + (sp.font === "3" ? 5 : 7) + 4) * sp.scale);
const drawn = (s: string, sp: Spec): { c: RasterCanvas; w: number } => {
  const c = canvasFor(s, sp);
  const w = drawText(gOf(c), s, X0 * sp.scale, Y0 * sp.scale, TEXT, { font: sp.font, scale: sp.scale, outline: sp.outline ? EDGE : null, mono: !!sp.mono, shadow: sp.shadow ? SHADE : null });
  return { c, w };
};

/** The oracle: the shadow's bodies (one art px down and right), then EVERY glyph's outline, then EVERY glyph's body over them, each art px a scale x scale block. */
function oracle(s: string, sp: Spec): RasterCanvas {
  const want = canvasFor(s, sp), W = want.width, S = sp.scale;
  const put = (ax: number, ay: number, col: string): void => {
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const x = ax * S + dx, y = ay * S + dy;
      if (x >= 0 && y >= 0 && x < W && y < want.height) want.px[y * W + x] = col;
    }
  };
  const glyphs = place(s, sp.font, X0);
  if (sp.shadow) for (const p of glyphs) for (const [x, y] of bodyOf(p)) put(x + 1, y + Y0 + 1, SHADE);
  if (sp.outline) for (const p of glyphs) for (const [x, y] of bodyOf(p)) for (const [dx, dy] of OUT8) put(x + dx, y + Y0 + dy, EDGE);
  for (const p of glyphs) for (const [x, y] of bodyOf(p)) put(x, y + Y0, colourOf(p.ch, !!sp.mono));
  return want;
}

/** A copy of the OLD pass (PRESENT-3's, present4-base): one sprite per glyph (its 8-way outline painted first, its body over it), drawn left to right: later outlines land on earlier bodies. */
function oldDraw(c: RasterCanvas, s: string, sp: Spec): void {
  const g = gOf(c), S = sp.scale, pad = sp.outline ? S : 0;
  let cx = X0 * S;
  for (const ch of s) {
    const big = sp.font === "3" && ch === "★";
    const rows = rowsOf(ch, sp.font), p = sp.outline ? 1 : 0, w = rows[0].length, h = rows.length;
    const sprite = fresh(w + 2 * p, h + 2 * p), sg = gOf(sprite);
    const paint = (col: string, dx: number, dy: number): void => {
      sg.fillStyle = col;
      rows.forEach((row, y) => [...row].forEach((c2, x) => { if (c2 === "#") sg.fillRect(x + p + dx, y + p + dy, 1, 1); }));
    };
    if (sp.outline) for (const [dx, dy] of OUT8) paint(EDGE, dx, dy);
    paint(colourOf(ch, !!sp.mono), 0, 0);
    const left = cx - pad - (big ? 2 * S : 0), top = Y0 * S - pad;
    const img = sprite as unknown as HTMLCanvasElement;
    if (S === 1) g.drawImage(img, left, top);
    else g.drawImage(img, 0, 0, sprite.width, sprite.height, left, top, sprite.width * S, sprite.height * S);
    cx += advOf(ch, sp.font) * S;
  }
}

/** Every body pixel (art px at scale 1; device px otherwise: the block's origin) of `s` that is NOT its glyph's colour in `c`: a cut. */
function cuts(c: RasterCanvas, s: string, sp: Spec): { star: number; letter: number } {
  let star = 0, letter = 0;
  for (const p of place(s, sp.font, X0)) {
    for (const [x, y] of bodyOf(p)) {
      if (c.at(x * sp.scale, (y + Y0) * sp.scale) !== colourOf(p.ch, !!sp.mono)) { if (p.big) star++; else letter++; }
    }
  }
  return { star, letter };
}

const RUNS = [
  "★★", "★★★", "★",
  "DRAG CHAIN FOUNDRY ★★★", // F14's own title (the desk's narrow column)
  "FROSTBITE FOUNDRY ★★", "PRESSURE BREECH ★★", "BRACED TEMPER ★★", // the release lane's other titles; RATCHET's TEMPER face on a desk
  "NEXT★2", "(★2)", // a letter or a bracket right before a ★
  "MERGE★2", "(★2/★3)", "CORE ANVIL BREECH ★★",
];

describe("PRESENT-4 S2: a run of small stars reads whole in outlined 3x5 text", () => {
  it("every string, with an outline and without one, at scale 1 and 2: the draw is the oracle's (all outlines, then all bodies): no pixel but the glyphs' bodies in the text colour, the outline only off the bodies", () => {
    for (const scale of [1, 2]) for (const outline of [true, false]) for (const s of RUNS) {
      const sp: Spec = { font: "3", outline, scale };
      const { c } = drawn(s, sp);
      expect(diffPx(c, oracle(s, sp)), `${s} ${outline ? "outlined" : "plain"} @${scale}`).toEqual([]);
    }
  });

  it("every ★ of every run has its 17 body pixels in the text colour (the 5x5 star at its slot minus 2), every letter its own body pixels, and nothing of the text is cut", () => {
    for (const scale of [1, 2]) for (const outline of [true, false]) for (const s of RUNS) {
      const sp: Spec = { font: "3", outline, scale };
      const { c } = drawn(s, sp);
      expect(cuts(c, s, sp), `${s} ${outline ? "outlined" : "plain"} @${scale}`).toEqual({ star: 0, letter: 0 });
      // the stars by hand: each ★'s slot, from the advances
      let cx = X0;
      let stars = 0;
      for (const ch of s) {
        if (ch === "★") {
          stars++;
          for (const [x, y] of STAR_INK) {
            for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
              expect(c.at((cx - 2 + x) * scale + dx, (Y0 + y) * scale + dy), `${s}: star ${stars} (${x}, ${y})`).toBe(TEXT);
            }
          }
        }
        cx += advOf(ch, "3");
      }
      expect(stars, s).toBe([...s].filter((ch) => ch === "★").length);
    }
  });

  it("the outline colour shows only off the bodies; a star's outline is whole round the run (the first star's left, the last star's right, above and below every star)", () => {
    for (const scale of [1, 2]) for (const s of ["★★★", "DRAG CHAIN FOUNDRY ★★★", "BRACED TEMPER ★★"]) {
      const sp: Spec = { font: "3", outline: true, scale };
      const { c } = drawn(s, sp);
      const bodies = new Set<string>();
      for (const p of place(s, "3", X0)) for (const [x, y] of bodyOf(p)) bodies.add(`${x},${y + Y0}`);
      let edge = 0;
      for (let j = 0; j < c.height / scale; j++) for (let i = 0; i < c.width / scale; i++) {
        const px = c.at(i * scale, j * scale);
        if (px === EDGE) { edge++; expect(bodies.has(`${i},${j}`), `${s} @${scale}: an outline px on a body at (${i}, ${j})`).toBe(false); }
        if (bodies.has(`${i},${j}`)) expect(px, `${s} @${scale}: body at (${i}, ${j})`).not.toBe(EDGE);
      }
      expect(edge, `${s} @${scale}: some outline`).toBeGreaterThan(20);
      const last = [...place(s, "3", X0)].filter((p) => p.big).pop()!;
      expect(c.at((last.left + 5) * scale, (Y0 + 2) * scale), `${s}: the last star's right outline`).toBe(EDGE);
      expect(c.at((last.left + 2) * scale, (Y0 - 1) * scale), `${s}: above the last star's tip`).toBe(EDGE);
    }
  });

  it("the old pass cut them (the bug this fixes, kept as a copy): ★★★ and the titles lose star pixels, NEXT★2 its T's stem, (★2) its bracket; the new draw loses none", () => {
    const sp: Spec = { font: "3", outline: true, scale: 1 };
    const old = (s: string): { star: number; letter: number } => { const c = canvasFor(s, sp); oldDraw(c, s, sp); return cuts(c, s, sp); };
    expect(old("★★★").star).toBeGreaterThanOrEqual(6); // star 1 and 2 each lose their column 3, rows 1-3
    expect(old("DRAG CHAIN FOUNDRY ★★★").star).toBeGreaterThanOrEqual(6);
    expect(old("BRACED TEMPER ★★").star).toBeGreaterThanOrEqual(3);
    expect(old("FROSTBITE FOUNDRY ★★").star).toBeGreaterThanOrEqual(3);
    expect(old("NEXT★2").letter).toBeGreaterThanOrEqual(3); // the T's stem, rows 1-3
    expect(old("(★2)").letter).toBeGreaterThanOrEqual(3); // the bracket's left column, rows 1-3
    for (const s of ["★★★", "DRAG CHAIN FOUNDRY ★★★", "BRACED TEMPER ★★", "FROSTBITE FOUNDRY ★★", "NEXT★2", "(★2)"]) expect(cuts(drawn(s, sp).c, s, sp), s).toEqual({ star: 0, letter: 0 });
  });

  it("no width or advance moves: textWidth is the glyph widths + 1 px a glyph (the ★ is the 3-wide glyph), drawText returns it, in the outlined and the plain draw, at scale 1 and 2", () => {
    // by hand: a letter or digit 3 + 1, a space 2 + 1, a bracket 2 + 1, the ★ 3 + 1; minus the last glyph's 1 px gap (the numbers at present4-base too: no glyph map row or advance moved)
    const pins: Record<string, number> = { "★★": 7, "★★★": 11, "BRACED TEMPER ★★": 61, "DRAG CHAIN FOUNDRY ★★★": 84, "NEXT★2": 23, "(★2)": 13 };
    for (const s of RUNS) {
      let n = -1;
      for (const ch of s) n += advOf(ch, "3");
      expect(textWidth(s, "3"), s).toBe(n);
      if (s in pins) expect(n, `${s}: pinned`).toBe(pins[s]);
      for (const scale of [1, 2]) for (const outline of [true, false]) {
        const { w } = drawn(s, { font: "3", outline, scale });
        expect(w, `${s} @${scale}`).toBe(n * scale);
      }
    }
    expect(glyphRows("★", "3")!.join("|")).toBe("#.#|.#.|###|.#.|#.#"); // the glyph map's ★ is still the 3-wide width reference
  });

  it("a string with no ★, a plain string, the shadow pass and the 5x7 face draw exactly as the old pass did (the copy kept here), one drawImage per glyph", () => {
    const TITLES = ["DRAG CHAIN FOUNDRY", "BRACED TEMPER", "FROSTBITE FOUNDRY", "THUNDERER", "SCRAP CANNON", "NEXT 2", "(2)", "MERGE 7G", "CORE ANVIL BREECH", "HEAVY TURRET IN SLOT 1"];
    const face3 = faceChars("3").filter((ch) => ch !== "★"), face5 = faceChars("5");
    const same = (s: string, sp: Spec, what: string): void => {
      const a = canvasFor(s, sp), b = canvasFor(s, sp);
      drawText(gOf(a), s, X0 * sp.scale, Y0 * sp.scale, TEXT, { font: sp.font, scale: sp.scale, outline: sp.outline ? EDGE : null, mono: !!sp.mono });
      oldDraw(b, s, sp);
      expect(diffPx(a, b), `${what}: ${s.length > 30 ? s.slice(0, 30) + "..." : s} ${JSON.stringify(sp)}`).toEqual([]);
    };
    for (const scale of [1, 2]) for (const outline of [true, false]) for (const mono of [false, true]) {
      for (const s of TITLES) same(s, { font: "3", outline, scale, mono }, "title");
      same(face3.join(""), { font: "3", outline, scale, mono }, "the whole 3x5 map");
      for (const ch of face3) same(ch, { font: "3", outline, scale, mono }, "one 3x5 glyph");
      same(face5.join(""), { font: "5", outline, scale, mono }, "the whole 5x7 map (its ★ included)");
      same("NEXT ★2", { font: "5", outline, scale, mono }, "the 5x7 face's ★");
      same("DRAG CHAIN FOUNDRY ★★★", { font: "5", outline, scale, mono }, "the 5x7 face's star run");
      // plain 3x5 text with a ★: the old draw (no outline: only an arm pixel is shared)
      if (!outline) for (const s of RUNS) same(s, { font: "3", outline, scale, mono }, "plain 3x5 ★ run");
    }
    // one drawImage per glyph; the ★ string in outlined 3x5 text draws every glyph's body once more, the shadow pass stays one per glyph
    const count = (s: string, opts: Parameters<typeof drawText>[5]): number => {
      const c = fresh(200, 20), ctx = gOf(c) as unknown as { drawImage: (...a: unknown[]) => void };
      const real = ctx.drawImage.bind(ctx);
      let n = 0;
      ctx.drawImage = (...a: unknown[]) => { n++; real(...a); };
      drawText(ctx as unknown as CanvasRenderingContext2D, s, 4, 4, TEXT, opts);
      return n;
    };
    expect(count("DRAG CHAIN", { font: "3", outline: EDGE })).toBe(10);
    expect(count("DRAG CHAIN", { font: "3" })).toBe(10);
    expect(count("DRAG CHAIN", { font: "3", outline: EDGE, shadow: SHADE })).toBe(20);
    expect(count("BRACED ★★", { font: "3" })).toBe(9);
    expect(count("BRACED ★★", { font: "3", shadow: SHADE })).toBe(18);
    expect(count("BRACED ★★", { font: "5", outline: EDGE })).toBe(9);
    expect(count("BRACED ★★", { font: "3", outline: EDGE })).toBe(18);
    expect(count("BRACED ★★", { font: "3", outline: EDGE, shadow: SHADE })).toBe(27);
  });

  it("icons keep their own colour in the second loop (tint), and a mono string draws every body in the text colour; the shadow stays under the outline", () => {
    const s = `7${ICON.GOLD} ★2 ${ICON.DMG}★`;
    for (const scale of [1, 2]) for (const mono of [false, true]) for (const shadow of [false, true]) {
      const sp: Spec = { font: "3", outline: true, scale, mono, shadow };
      const { c } = drawn(s, sp);
      expect(diffPx(c, oracle(s, sp)), `${scale} ${mono} ${shadow}`).toEqual([]);
    }
    const plain = drawn(s, { font: "3", outline: true, scale: 1 }).c;
    const gold = place(s, "3", X0).find((p) => p.ch === ICON.GOLD)!;
    const [gx, gy] = bodyOf(gold)[0];
    expect(plain.at(gx, gy + Y0)).toBe(ICON_COLOUR[ICON.GOLD]); // the coin keeps its colour
  });
});

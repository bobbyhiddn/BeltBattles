// PRESENT-3 S (REQ-BFG-081; the cold read's S-01; backlog #498 (7)): the 3x5 face's small ★ reads as a star EVERYWHERE, fixed once in the face (src/render/font.ts pass()).
//  Before: only a button's label, LAST CHANCE's PART card and the victory drop card drew the 5x5 star (TextOpts.star5, a ★ after a space); every other small ★ drew the
//  3-wide glyph `#.#|.#.|###|.#.|#.#` (an X with a bar): the notes' `MERGES INTO ★2: +68` (faces.ts faceMerge; drawn in the notes and the desk's hover tooltip), `NEXT ★2:`,
//  LEVELS' `★2 HARDENED DIES`, the cards' `MERGE ★2` badge, the help card, and any ★ with no space before it.
//  Now: every ★ the 3x5 face draws is STAR5_ROWS over its own slot and the 2 columns to its left; the glyph map keeps the 3-wide ★ as the star's WIDTH, so no textWidth,
//  wrap or layout size moves. The option is gone (tests/shopcard1f.test.ts pins that no `star5` is left in src).
import { describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf, diffPx } from "./raster.helpers";
import { C } from "../src/render/palette";
import { STAR5_ROWS, drawText, glyphRows, textWidth, wrap } from "../src/render/font";
import { ITEMS } from "../src/sim/content";
import { faceMerge, faceNext } from "../src/ui/faces";

installRaster();

const STAR_INK: [number, number][] = STAR5_ROWS.split("|").flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "#" ? [[x, y] as [number, number]] : [])));

/** The string as the game should draw it: every glyph but the ★ drawn alone at the x its advance puts it (a glyph is one drawImage, so a string is the sum of its glyphs), then the
 *  5x5 star painted in the text colour 2 px (x scale) left of each ★'s slot. `stars` is where each ★'s slot starts. */
function expectedDraw(s: string, x0: number, y0: number, scale: number, W: number, H: number): { want: ReturnType<typeof fresh>; stars: number[] } {
  const want = fresh(W, H), stars: number[] = [];
  let cx = x0;
  for (const ch of s) {
    if (ch === "★") stars.push(cx);
    else drawText(gOf(want), ch, cx, y0, C.ink, { font: "3", scale });
    cx += (textWidth(ch, "3") + 1) * scale;
  }
  for (const sx of stars) for (const [x, y] of STAR_INK) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) want.px[(y0 + y * scale + dy) * W + (sx - 2 * scale + x * scale + dx)] = C.ink;
  return { want, stars };
}

describe("PRESENT-3 S: every ★ the 3x5 face draws is the 5x5 star", () => {
  const STRINGS = [
    "MERGES INTO ★2: +68", // the notes and the desk tooltip (faces.ts faceMerge); S-01's line
    "MERGES INTO ★3: +4 RATE, +20 DMG.",
    "NEXT ★2: +4 RATE", // faceNext
    "★2 HARDENED DIES", // LEVELS: a ★ at the start of a line
    "UP TO ★3 · ★2/★3", // after a space, a slash
    "(★2/★3)", // after a bracket, after a slash
    "MERGE ★2: 7G", // the shop card's badge and the button's label
    "MERGE★2", // no space before it
    "NEXT★", // a ★ at the end, no space before it
    "RARE PART ★2 · TO CARGO · FREE", // LAST CHANCE's PART card
    "DROP · TO CARGO · ★1", // the victory drop card
    "TO CARGO AT ★2", // the road's drop list header
  ];

  it("each string: the star's ink is STAR5_ROWS at its slot minus 2, every other pixel is the glyphs' own, at scale 1 and 2; the returned width is textWidth", () => {
    for (const scale of [1, 2]) for (const s of STRINGS) {
      const W = (textWidth(s, "3") + 14) * scale, H = 12 * scale, x0 = 4 * scale, y0 = 2 * scale;
      const a = fresh(W, H);
      const w = drawText(gOf(a), s, x0, y0, C.ink, { font: "3", scale });
      expect(w, `${s} @${scale}: width`).toBe(textWidth(s, "3") * scale);
      const { want, stars } = expectedDraw(s, x0, y0, scale, W, H);
      expect(stars.length, s).toBeGreaterThan(0);
      expect(diffPx(a, want), `${s} @${scale}`).toEqual([]);
    }
  });

  it("no width moves: the ★'s advance is the 3-wide glyph's (3 + the 1 px gap) in every string, so wrap, centring and every fit read the sizes they read before", () => {
    expect(glyphRows("★", "3")!.join("|")).toBe("#.#|.#.|###|.#.|#.#"); // the glyph map still holds the 3-wide ★ (the width)
    expect(textWidth("★", "3")).toBe(3);
    expect(textWidth("MERGE ★2: 7G", "3")).toBe(43);
    expect(textWidth("★★", "3")).toBe(7);
    for (const s of STRINGS) {
      let n = 0;
      for (const ch of s) n += (ch === "★" ? 3 : textWidth(ch, "3")) + 1;
      expect(textWidth(s, "3"), s).toBe(n - 1);
    }
    expect(wrap("MERGES INTO ★2: +4 RATE, +20 DMG AND MORE WORDS HERE", 100, "3").length).toBeGreaterThan(1);
  });

  it("a centred and a right-aligned string keep their box (the star's overhang is 2 px into the blank to its left, never past the measured width on the right)", () => {
    const s = "NEXT ★2";
    for (const align of ["left", "center", "right"] as const) {
      const W = 60, a = fresh(W, 10), x = align === "left" ? 5 : align === "center" ? 30 : 55;
      const w = drawText(gOf(a), s, x, 2, C.ink, { font: "3", align });
      const x0 = align === "left" ? x : align === "center" ? Math.round(x - w / 2) : Math.round(x - w);
      let minX = 99, maxX = -1;
      for (let j = 0; j < 10; j++) for (let i = 0; i < W; i++) if (a.at(i, j) === C.ink) { minX = Math.min(minX, i); maxX = Math.max(maxX, i); }
      expect(minX, `${align}: left ink`).toBeGreaterThanOrEqual(x0);
      expect(maxX, `${align}: right ink`).toBeLessThanOrEqual(x0 + w - 1);
    }
  });

  it("the game's own star lines (faces.ts faceMerge, faceNext) over every piece with a face: each ★ in them is drawn as the star, and no line is wider than its textWidth", () => {
    let lines = 0, stars = 0;
    for (const def of Object.keys(ITEMS)) {
      const cand: string[] = [];
      for (const to of [2, 3]) { const m = faceMerge(def, to); if (m) cand.push(m); }
      for (const st of [1, 2]) { const n = faceNext(def, st); if (n) cand.push(n.text); }
      for (const s of cand) {
        if (!s.includes("★")) continue;
        const clean = s.replace(/\{\*?[A-Z]+\}/g, "").replace(/[^\x20-\x7e★·]/g, "?");
        const W = textWidth(clean, "3") + 14, a = fresh(W, 12);
        drawText(gOf(a), clean, 4, 2, C.ink, { font: "3" });
        const { want, stars: at } = expectedDraw(clean, 4, 2, 1, W, 12);
        expect(diffPx(a, want), `${def}: ${clean}`).toEqual([]);
        lines++; stars += at.length;
      }
    }
    expect(lines).toBeGreaterThan(100);
    expect(stars).toBe(lines); // one ★ a line
  });

  it("the 5x7 face's ★ is its own glyph, untouched, and a string with no ★ is the glyphs' own", () => {
    const a = fresh(80, 12), want = fresh(80, 12), x0 = 3, sx = x0 + textWidth("NEXT ", "5") + 1;
    drawText(gOf(a), "NEXT ★2", x0, 2, C.ink, { font: "5" });
    drawText(gOf(want), "NEXT ", x0, 2, C.ink, { font: "5" });
    drawText(gOf(want), "2", x0 + textWidth("NEXT ★", "5") + 1, 2, C.ink, { font: "5" });
    glyphRows("★", "5")!.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") want.px[(2 + y) * 80 + sx + x] = C.ink; }));
    expect(diffPx(a, want)).toEqual([]);
    const b = fresh(60, 9), c = fresh(60, 9);
    drawText(gOf(b), "BUY 7G", 3, 2, C.ink, { font: "3" });
    for (const [i, ch] of [..."BUY 7G"].entries()) drawText(gOf(c), ch, 3 + textWidth("BUY 7G".slice(0, i), "3") + (i ? 1 : 0), 2, C.ink, { font: "3" });
    expect(diffPx(b, c)).toEqual([]);
  });
});

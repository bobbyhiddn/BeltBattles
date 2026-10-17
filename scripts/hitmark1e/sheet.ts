// HITMARK-1E (REQ-BFG-100, C7; BRIEF-HITMARK1E step 1) picture tool, not shipped: the glyph sheet for the hits-on-you chip's mark.
// For SCALE-2c's old crack, each candidate (candidates.ts) and, if font.ts has moved, the real ICON.CRACK now, it draws:
//   - the status row as the game draws it (screens/battleCounters.ts tabImage: the box chrome, each chip's 5x7 icon in its colour with
//     a 1 px ink outline, 1 px, its number, 6 px apart) with BURN 24, POISON 3, FRAY 15/15, STUN 1 and the hits chip 58, so the
//     mark sits beside FRAY's chip and every other status-row icon, at 1x, 4x and 8x (nearest neighbour, every art px a whole
//     number of screen px);
//   - the 3x5 twin as a counter box draws a glyph (boxImage: the 3x5 face, 2 px in, 2 px down, ink outline), at the same scales;
//   - the two bitmaps as a pixel grid.
// And it prints each drawing's nearest glyphs in both faces (the pixel distance font icons are held to: tests/icons.test.ts's
// Hamming distance, the narrower bitmap padded to the wider one's width at every placement, the smallest kept).
// Node has no canvas: scripts/art1e/raster.ts is the software raster the render code draws into.
// Build: npx vite build --ssr scripts/hitmark1e/sheet.ts --outDir <W>/tmp/hitmark1e-sheet --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/hitmark1e-sheet/sheet.js <out.png> [round r1|r2|..|none] [rows.txt: also write the glyph rows here]
import { writeFileSync } from "node:fs";
import { C } from "../../src/render/palette";
import { ICON, drawText, faceChars, glyphRows, textWidth, type FontId } from "../../src/render/font";
import { makeCanvas, rect, type G } from "../../src/render/pixel";
import { BOX_H, STATUS_H, STATUS_CHIPS, boxW, statusTab, type StatusChip } from "../../src/game/counters";
import { BattleCounters } from "../../src/screens/battleCounters";
import { withScaleRigs } from "../../src/sim/scale";
import { Img, R, RasterCanvas, installDocument, rgb, sigOf } from "../art1e/raster";
import { OLD, ROUNDS, type Candidate } from "./candidates";

installDocument();

const OUT = process.argv[2] ?? "hitmark-sheet.png";
const ROUND = process.argv[3] ?? "r1";
const ROWS_OUT = process.argv[4];

// ------------------------------------------------------------------------------------------------ pixel distances

/** tests/icons.test.ts's distance: Hamming over the rows, the narrower bitmap padded to the wider's width at every offset, the least. */
export function dist(a: string[], b: string[]): number {
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

const NAMES: Record<string, string> = {};
for (const [k, v] of Object.entries(ICON)) NAMES[v] = k;
NAMES[ICON.POISON] = "POISON";
NAMES[ICON.CRACK] = "CRACK";
const nameOf = (ch: string): string => NAMES[ch] ?? ch;
const isIconCh = (ch: string): boolean => ch.charCodeAt(0) >= 0xe000 || ch === "♥" || ch === "★";

/** Every glyph of a face except the blank and ICON.CRACK itself (the drawing under test), with its distance to `rows`. */
function neighbours(rows: string[], font: FontId): { ch: string; name: string; d: number }[] {
  const out: { ch: string; name: string; d: number }[] = [];
  for (const ch of faceChars(font)) {
    if (ch === " " || ch === ICON.CRACK) continue;
    const r = glyphRows(ch, font);
    if (!r) continue;
    out.push({ ch, name: nameOf(ch), d: dist(rows, r) });
  }
  return out.sort((x, y) => x.d - y.d || (x.name < y.name ? -1 : 1));
}

function report(c: Candidate): string[] {
  const lines: string[] = [];
  for (const [font, str] of [["5", c.five], ["3", c.three]] as [FontId, string][]) {
    const rows = str.split("|");
    const nb = neighbours(rows, font);
    const kind = (f: (n: { ch: string }) => boolean) => nb.filter(f).reduce((m, n) => Math.min(m, n.d), Infinity);
    const letters = kind((n) => /^[A-Z0-9]$/.test(n.ch)), icons = kind((n) => isIconCh(n.ch)), punct = kind((n) => !/^[A-Z0-9]$/.test(n.ch) && !isIconCh(n.ch));
    const fray = nb.find((n) => n.name === "FRAY")!.d, oldD = dist(rows, (font === "5" ? OLD.five : OLD.three).split("|"));
    lines.push(`${c.id} ${c.name} ${font === "5" ? "5x7" : "3x5"} [${str}] ink ${str.replace(/[^#]/g, "").length}: min to letters/digits ${letters}, punctuation ${punct}, icons ${icons}; FRAY ${fray}; OLD CRACK ${oldD}`);
    lines.push(`    nearest: ${nb.slice(0, 7).map((n) => `${n.name} ${n.d}`).join(", ")}`);
  }
  return lines;
}

// ------------------------------------------------------------------------------------------------ the drawing

const OUTLINE_D = [-1, 0, 1, 0, 0, -1, 0, 1, -1, -1, 1, -1, -1, 1, 1, 1];

/** font.ts's glyph(): a bitmap in `col` with a 1 px outline in `outline` ("" none), drawn at (x, y) straight into `g`. */
function drawRows(g: G, rows: string[], x: number, y: number, col: string, outline: string): void {
  const paint = (colour: string, dx: number, dy: number) => {
    g.fillStyle = colour;
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") g.fillRect(x + i + dx, y + j + dy, 1, 1); });
  };
  if (outline) for (let i = 0; i < OUTLINE_D.length; i += 2) paint(outline, OUTLINE_D[i], OUTLINE_D[i + 1]);
  paint(col, 0, 0);
}

interface Shown { chip: StatusChip; n: number }

/** battleCounters.ts tabImage, with the hits chip's icon optionally drawn from `hits` rows instead of font.ts's. */
function tabCanvas(shown: Shown[], hits?: string[]): RasterCanvas {
  const texts = shown.map((s) => s.chip.text(s.n));
  const tab = statusTab({ x: 0, y: 0, w: 0, h: 0 }, true, texts.map((t) => textWidth(t.num + t.tail, "5")))!;
  const [c, cg] = makeCanvas(tab.w, STATUS_H);
  rect(cg, 0, 0, tab.w, STATUS_H, C.ink);
  rect(cg, 1, 1, tab.w - 2, STATUS_H - 2, C.navy);
  shown.forEach((s, i) => {
    const b = tab.chips[i], x = b.x - tab.x;
    if (hits && s.chip.key === "hits") drawRows(cg, hits, x, 2, s.chip.colour, C.ink);
    else drawText(cg, s.chip.icon, x, 2, s.chip.colour, { mono: true, outline: C.ink });
    const nx = b.numX - tab.x + drawText(cg, texts[i].num, b.numX - tab.x, 2, s.chip.numColour, { outline: C.ink }) + 1;
    if (texts[i].tail) drawText(cg, texts[i].tail, nx, 2, C.slate4, { outline: C.ink });
  });
  rect(cg, 1, 1, tab.w - 2, 1, C.slate2);
  return R(c);
}

/** battleCounters.ts boxImage (C5, C6): the 3x5 icon, 1 px, the text in the 3x5 face; `rows` the icon's bitmap. */
function boxCanvas(rows: string[], text: string, col: string): RasterCanvas {
  const w = boxW(3 + 1 + textWidth(text, "3"));
  const [c, cg] = makeCanvas(w, BOX_H);
  rect(cg, 0, 0, w, BOX_H, C.ink);
  rect(cg, 1, 1, w - 2, BOX_H - 2, C.navy);
  drawRows(cg, rows, 2, 2, col, C.ink);
  drawText(cg, text, 2 + 3 + 1, 2, col, { font: "3", outline: C.ink });
  rect(cg, 1, 1, w - 2, 1, C.slate2);
  return R(c);
}

/** The row as the stills show it: BURN 24, POISON 3, FRAY 15/15, STUN 1, then the hits chip (switch on). */
function rowChips(n: number): Shown[] {
  return withScaleRigs(() => {
    const by = (key: string): StatusChip => STATUS_CHIPS.find((c) => c.key === key)!;
    return [{ chip: by("burn"), n: 24 }, { chip: by("poison"), n: 3 }, { chip: by("fray"), n: 15 }, { chip: by("stun"), n: 1 }, { chip: by("hits"), n }];
  });
}

// ------------------------------------------------------------------------------------------------ the fidelity check

/** Does tabCanvas draw the row exactly as the game's own tabImage does (with font.ts's glyph)? */
function fidelity(): string {
  const shown = rowChips(58);
  const mine = tabCanvas(shown);
  const real = withScaleRigs(() => R((new BattleCounters() as unknown as { tabImage(s: unknown): unknown }).tabImage(shown)));
  const same = sigOf(mine) === sigOf(real);
  return `fidelity: this sheet's row (${mine.width}x${mine.height}) vs BattleCounters.tabImage with font.ts's glyph: ${same ? "pixel-identical" : "DIFFERENT"}`;
}

// ------------------------------------------------------------------------------------------------ the sheet

const ground = rgb(C.night), hi = rgb(C.fire4), dim = rgb(C.slate3), ink = rgb(C.slate4), white = rgb(C.white);
const entries: Candidate[] = [OLD, ...(ROUND === "none" ? [] : ROUNDS[ROUND] ?? [])];
const nowFive = glyphRows(ICON.CRACK, "5")!.join("|"), nowThree = glyphRows(ICON.CRACK, "3")!.join("|");
if (nowFive !== OLD.five || nowThree !== OLD.three) {
  entries.push({ id: "NOW", name: "FONT.TS ICON.CRACK NOW", five: nowFive, three: nowThree, idea: "the drawing font.ts holds now (the pick, once it is in)" });
}

const X0 = 8, BLOCK_H = 204, HEAD_H = 26;
const rowW = tabCanvas(rowChips(58)).width;
const W = X0 + rowW * 8 + 16 + 15 * 8 + 20 + 5 * 12 + 16 + 3 * 12 + 12;
const H = HEAD_H + entries.length * BLOCK_H + 8;
const img = new Img(W, H, ground);
img.text("HITMARK-1E: THE HITS CHIP MARK, AS THE STATUS ROW DRAWS IT (5X7) AND AS A COUNTER BOX DRAWS A GLYPH (3X5)", X0, 6, hi, 1);
img.text(`ROW: BURN 24, POISON 3, FRAY 15/15, STUN 1, HITS 58.   SCALES 1X, 4X, 8X.   HITS CHIP COLOUR C.RED ${C.red}`, X0, 16, dim, 1);

const gridAt = (rows: string[], x: number, y: number, s: number) => {
  img.rect(x, y, rows[0].length * s, rows.length * s, rgb(C.navy));
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") img.rect(x + i * s, y + j * s, s, s, rgb(C.red)); else img.rect(x + i * s + Math.floor(s / 2), y + j * s + Math.floor(s / 2), 1, 1, rgb(C.slate1)); });
};

const text: string[] = [];
entries.forEach((e, k) => {
  const y0 = HEAD_H + k * BLOCK_H;
  const five = e.five.split("|"), three = e.three.split("|");
  img.text(`${e.id}  ${e.name}`, X0, y0, white, 2);
  img.text(e.idea.toUpperCase(), X0, y0 + 17, dim, 1);
  const chips = rowChips(58);
  const t5 = tabCanvas(chips, five);
  const b3 = boxCanvas(three, "58", C.red);
  // line 1: 1x and 4x
  const y1 = y0 + 28;
  img.blit(t5, X0, y1, 1);
  img.blit(t5, X0 + t5.width + 17, y1, 4);
  const bx = X0 + t5.width + 17 + t5.width * 4 + 24;
  img.blit(b3, bx, y1 + 1, 1);
  img.blit(b3, bx + b3.width + 14, y1, 4);
  // line 2: 8x
  const y2 = y1 + STATUS_H * 4 + 8;
  img.blit(t5, X0, y2, 8);
  img.blit(b3, X0 + t5.width * 8 + 16, y2, 8);
  gridAt(five, X0 + t5.width * 8 + 16 + b3.width * 8 + 20, y2, 12);
  gridAt(three, X0 + t5.width * 8 + 16 + b3.width * 8 + 20 + 5 * 12 + 16, y2, 12);
  img.text(e.id === "OLD" ? "THE CRACK THE READERS TOOK FOR FRAY" : "", X0, y2 + STATUS_H * 8 + 6, ink, 1);
  text.push(...report(e));
});

writeFileSync(OUT, img.png());
console.log(`${OUT}: ${W}x${H} px, ${entries.length} blocks (${entries.map((e) => e.id).join(" ")})`);

// The readers' sheet (informal pre-reads only: never the score): every entry's row at 5x, in a seeded shuffled order, numbered, no
// names or hints. Only the mark before 58 differs between rows. The key (number -> id) is written beside it.
const READERS = process.argv[5], KEY = process.argv[6];
if (READERS) {
  let seed = 20261017;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const order = entries.map((_, i) => i).sort(() => rnd() - 0.5);
  const sc = 5, rowH = STATUS_H * sc + 22, gutter = 56;
  const w = gutter + rowW * sc + 24, h = 12 + order.length * rowH;
  const rd = new Img(w, h, ground);
  order.forEach((ei, k) => {
    const e = entries[ei], y = 10 + k * rowH;
    rd.text(String(k + 1), 14, y + 14, white, 3);
    rd.blit(tabCanvas(rowChips(58), e.five.split("|")), gutter, y, sc);
  });
  writeFileSync(READERS, rd.png());
  console.log(`${READERS}: ${w}x${h} px, rows ${order.map((ei, k) => `${k + 1}=${entries[ei].id}`).join(" ")}`);
  if (KEY) writeFileSync(KEY, order.map((ei, k) => `${k + 1}\t${entries[ei].id}\t${entries[ei].name}`).join("\n") + "\n");
}
console.log(fidelity());
console.log(text.join("\n"));
if (ROWS_OUT) writeFileSync(ROWS_OUT, entries.map((e) => `${e.id}\t${e.name}\t5x7 ${e.five}\t3x5 ${e.three}`).join("\n") + "\n");

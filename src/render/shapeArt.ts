// SHAPES-1 (REQ-BFG-086 S8): the deck art of a shaped piece (a rig of 2+ cells, a factory whose foot is not 2x2), drawn
// as ONE body across its cells, never the 12x12 sprite repeated per cell. A body is built for the piece's screen box
// (frame.ts boxRect of foot.ts footBox at its own rot), so it lies the right way for the frame's facing: the art is drawn
// with its length along screen x and transposed (which keeps the house's top-left light) when the box stands upright.
// Same palette and helpers as sprites.ts and factoryArt.ts; cached; no randomness. Nothing here is reached with SHAPES
// off: machinery.ts branches on isShaped(def), and with the switch off no piece is shaped.

import { CELL } from "../sim/content";
import { defOf, kx, ky, rotOf, type Placed } from "../sim/deck";
import { footBox, footprintCells } from "../sim/foot";
import { C } from "./palette";
import { bevel, flipX, hline, line, makeCanvas, px, rect, rot90, silhouette, vline, type G } from "./pixel";
import { boxRect, footX, footY, type DeckFrame } from "./frame";
import { factorySprite, itemIcon } from "./sprites";
import { gear } from "./factoryArt";
import { SHAPES2_ANIMATED, shapes2BodyH } from "./shapes2Art"; // SHAPES-2 (REQ-BFG-114): the six more shaped rigs' bodies
import { isShapes2Piece } from "../sim/shapes2";

type Cv = HTMLCanvasElement;
const cache = new Map<string, Cv>();
function cached(k: string, make: () => Cv): Cv {
  let c = cache.get(k);
  if (!c) {
    c = make();
    cache.set(k, c);
  }
  return c;
}

/** (x, y) -> (y, x): rot90 then flipX. A bevel lit from the top-left stays lit from the top-left. */
function transpose(c: Cv): Cv {
  return flipX(rot90(c));
}

/** A placed piece's screen box: its turned footprint's bounding box (footBox at its own rot) on frame `f`. A 1-cell rig
 *  gives footX/footY's 12x12 and a 2x2 factory footX/footY(size 2)'s 24x24. */
export function pieceRect(f: DeckFrame, p: Placed): { x: number; y: number; w: number; h: number } {
  const b = footBox(defOf(p), rotOf(p));
  return boxRect(f, p.x, p.y, b.w, b.h);
}

/** The screen cells a piece covers inside its box `r`, as rows of "1"/"0" joined by "/" ("" when every cell of the box is
 *  covered, as for every I and 2x3 foot). */
export function screenMask(f: DeckFrame, p: Placed, r: { x: number; y: number; w: number; h: number }): string {
  const cols = Math.round(r.w / CELL), rows = Math.round(r.h / CELL);
  const cells = footprintCells(defOf(p), p.x, p.y, rotOf(p));
  if (cells.length >= cols * rows) return "";
  const m: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => "0"));
  for (const k of cells) {
    const cx = Math.round((footX(f, kx(k), ky(k)) - r.x) / CELL), cy = Math.round((footY(f, kx(k), ky(k)) - r.y) / CELL);
    if (cy >= 0 && cy < rows && cx >= 0 && cx < cols) m[cy][cx] = "1";
  }
  return m.map((row) => row.join("")).join("/");
}

/** The mask's cells [cx, cy] (every cell of a cols x rows box for ""), transposed when `tr`. */
function maskCells(mask: string, cols: number, rows: number, tr: boolean): [number, number][] {
  const out: [number, number][] = [];
  if (!mask) {
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.push([x, y]);
  } else {
    mask.split("/").forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "1") out.push([x, y]); }));
  }
  return tr ? out.map(([x, y]) => [y, x]) : out;
}

/** The plate under a body: one bevel over the whole box, or (a foot with holes) one per cell with its seams filled. */
function plate(g: G, W: number, H: number, cells: [number, number][], full: boolean, fill: string, hi: string, lo: string): void {
  if (full) {
    bevel(g, 1, 1, W - 2, H - 2, fill, hi, lo, C.ink);
    return;
  }
  const has = new Set(cells.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of cells) bevel(g, x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2, fill, hi, lo, C.ink);
  for (const [x, y] of cells) {
    if (has.has(`${x + 1},${y}`)) rect(g, x * CELL + 10, y * CELL + 2, 4, CELL - 4, fill);
    if (has.has(`${x},${y + 1}`)) rect(g, x * CELL + 2, y * CELL + 10, CELL - 4, 4, fill);
  }
}

/** One cell's share of a rig body's length decoration (drawn lying along x; cell top-left at ox, oy). */
function rigCell(g: G, id: string, ox: number, oy: number, f: number, active: boolean): void {
  switch (id) {
    case "nailstrip": { // two nail heads per cell down the plank's middle, lit top-left
      for (const u of [3, 8]) {
        rect(g, ox + u, oy + 5, 2, 2, C.steel2);
        px(g, ox + u, oy + 5, active ? C.white : C.steel3);
        px(g, ox + u + 1, oy + 6, C.steel0);
        px(g, ox + u + 2, oy + 6, C.wood0);
      }
      break;
    }
    case "embertrough": { // coals glowing in the trough, flickering with the frame
      const heat = [C.fire1, C.fire2, C.fire3];
      for (let u = 3; u < 11; u++) for (let v = 4; v < 8; v++) {
        if ((u + v) % 2) continue;
        const n = (u * 5 + v * 3 + ox + f) % 7;
        px(g, ox + u - (u === 10 ? 1 : 0), oy + v, active ? C.fire4 : n === 0 ? C.fire4 : heat[n % 3]);
      }
      break;
    }
    case "spikerail": { // a spike out of each long side at two points per cell, a brass rivet on the rail between
      for (const u of [3, 8]) {
        const tip = active ? C.yellow : C.white;
        px(g, ox + u, oy + 1, tip); hline(g, ox + u - 1, oy + 2, 3, C.steel3); px(g, ox + u, oy + 3, C.steel1);
        px(g, ox + u, oy + 10, tip); hline(g, ox + u - 1, oy + 9, 3, C.steel2); px(g, ox + u, oy + 8, C.steel0);
      }
      px(g, ox + 6, oy + 5, C.brass4); px(g, ox + 6, oy + 6, C.brass1);
      break;
    }
    default: { // any other shaped rig: its own icon on each cell
      g.drawImage(itemIcon(id), ox, oy);
    }
  }
}

/** A rig body drawn lying along x, W x H px (cells: the covered cells in this orientation). */
function drawRigBodyH(id: string, W: number, H: number, cells: [number, number][], full: boolean, f: number, active: boolean): Cv {
  if (isShapes2Piece(id)) return shapes2BodyH(id, W, H, cells, full, f, active); // SHAPES-2 (REQ-BFG-114): the six more shaped rigs' own bodies (shapes2Art.ts)
  const [c, g] = makeCanvas(W, H);
  if (id === "nailstrip") {
    plate(g, W, H, cells, full, C.wood1, C.wood3, C.wood0);
    if (full) { hline(g, 2, 3, W - 4, C.wood2); hline(g, 2, 8, W - 4, C.wood0); }
  } else if (id === "embertrough") {
    plate(g, W, H, cells, full, C.steel1, C.steel2, C.steel0);
    if (full) {
      rect(g, 2, 3, W - 4, H - 6, C.ink);
      rect(g, 3, 4, W - 6, H - 8, C.fire0);
    } else {
      for (const [x, y] of cells) { rect(g, x * CELL + 2, y * CELL + 3, CELL - 4, CELL - 6, C.ink); rect(g, x * CELL + 3, y * CELL + 4, CELL - 6, CELL - 8, C.fire0); }
    }
  } else if (id === "spikerail") {
    plate(g, W, H, cells, full, C.steel0, C.steel1, C.ink);
    // the rail down the middle of the body's length
    if (full) {
      hline(g, 1, 4, W - 2, C.steel3); rect(g, 1, 5, W - 2, 2, C.steel2); hline(g, 1, 7, W - 2, C.steel1);
    } else {
      for (const [x, y] of cells) { hline(g, x * CELL + 1, y * CELL + 4, CELL - 2, C.steel3); rect(g, x * CELL + 1, y * CELL + 5, CELL - 2, 2, C.steel2); hline(g, x * CELL + 1, y * CELL + 7, CELL - 2, C.steel1); }
    }
  } else {
    plate(g, W, H, cells, full, C.steel1, C.steel2, C.steel0);
  }
  for (const [x, y] of cells) rigCell(g, id, x * CELL, y * CELL, f, active);
  return c;
}

/**
 * The body of a shaped rig `id` for a screen box w x h px (whole cells; `mask`: screenMask's, "" for a full box) at
 * frame `frameIdx` (mod 8; EMBER TROUGH's coals flicker), `active` while a hit applies. NAIL STRIP: a wooden plank with
 * a row of nail heads down its length; EMBER TROUGH: an iron trough full of glowing coals; SPIKE RAIL: a steel rail with
 * spikes out of both long sides. Its nozzles are drawn over it per arrow (machinery.ts).
 */
export function shapedRigBody(id: string, w: number, h: number, frameIdx: number, active: boolean, mask = ""): Cv {
  const f = ((frameIdx % 8) + 8) % 8;
  const fr = id === "embertrough" || SHAPES2_ANIMATED.includes(id) ? f : 0; // the trough animates, and (SHAPES-2) the spark, the ember and the jaws
  return cached(`srig:${id}:${w}x${h}:${mask}:${fr}:${active ? 1 : 0}`, () => {
    const tr = h > w;
    const W = tr ? h : w, H = tr ? w : h;
    const cells = maskCells(mask, Math.round(w / CELL), Math.round(h / CELL), tr);
    const c = drawRigBodyH(id, W, H, cells, !mask, fr, active);
    return tr ? transpose(c) : c;
  });
}

/** The white silhouette of a shaped rig's body (its hit flash, as gateSil). */
export function shapedRigSil(id: string, w: number, h: number, mask = ""): Cv {
  return cached(`srigS:${id}:${w}x${h}:${mask}`, () => silhouette(shapedRigBody(id, w, h, 0, false, mask), C.white));
}

// ------------------------------------------------------------------ factories

/** GANTRY PRESS as a 2x3 (36x24 lying along x): factoryArt.ts drawGantry's press bed, beams and trolley over a wider bed,
 *  three chutes at 1 star and four at 2-3 (it feeds 4/5/6 belts). f >> 1 picks the chute, even frames (and flash) press. */
function gantryWide(W: number, H: number, f: number, flash: boolean, stars: number): Cv {
  const [c, g] = makeCanvas(W, H);
  const n = stars >= 2 ? 4 : 3;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs.push(Math.round(((i + 0.5) * W) / n) - 2); // chute left edges (4 wide) along the bottom
  const at = xs[(f >> 1) % xs.length];
  const down = flash || (f & 1) === 0;
  rect(g, 0, 0, W, H, C.ink);
  bevel(g, 1, 1, W - 2, H - 2, C.steel1, C.steel2, C.steel0);
  // the extension seams: the bed is plated in 12 px panels
  for (let x = 12; x < W - 1; x += 12) { vline(g, x, 2, H - 8, C.steel0); vline(g, x + 1, 2, H - 8, C.steel2); }
  for (const x of xs) {
    rect(g, x, H - 7, 4, 7, C.ink);
    rect(g, x + 1, H - 6, 2, 4, C.steel0);
    hline(g, x + 1, H - 6, 2, x === at && down ? C.steel3 : C.steel1);
  }
  const hx = Math.max(0, Math.min(W - 8, at - 2));
  if (down) {
    bevel(g, hx + 1, 7, 6, 5, C.steel0, C.steel1, C.ink, C.ink);
    if (flash) { px(g, hx, 8, C.yellow); px(g, hx + 7, 10, C.fire4); }
  } else {
    bevel(g, hx, 5, 8, 9, C.steel2, C.steel3, C.steel0, C.ink);
    rect(g, hx + 2, 7, 4, 5, C.steel1);
    px(g, hx + 2, 7, C.white);
  }
  for (const y of [2, 13]) {
    hline(g, 1, y + 3, W - 2, C.steel0);
    bevel(g, 0, y, W, 3, C.brass2, C.brass4, C.brass1);
    px(g, 0, y + 1, C.ink); px(g, W - 1, y + 1, C.ink);
    bevel(g, hx + 2, y - 1, 4, 5, C.brass1, C.brass3, C.brass0, C.ink);
  }
  return c;
}

/** ASSEMBLY LINE as an I3 (36x12 lying along x): two steel housings (the gear emblem on the intake end, a hatch on the
 *  output end) and the mini belt between them, a gear part riding it two pixels a frame; the brass arms dip at each end
 *  (setting it down at f 0-1, taking it at f 6-7); flash: sparks at the working claw. */
function assemblyLong(W: number, H: number, f: number, flash: boolean): Cv {
  const [c, g] = makeCanvas(W, H);
  rect(g, 0, 0, W, H, C.ink);
  bevel(g, 1, 1, W - 2, H - 2, C.steel1, C.steel2, C.steel0);
  const bx = 8, bw = W - 16; // the belt bay
  rect(g, bx, 3, bw, 6, C.ink);
  for (let x = bx + 1; x < bx + bw - 1; x++) vline(g, x, 4, 4, (x - f * 2) % 4 === 0 ? C.belt3 : C.belt1);
  hline(g, bx + 1, 4, bw - 2, C.belt2);
  const gx = bx + 1 + Math.min(f * 2 * Math.max(1, Math.floor((bw - 7) / 14)), bw - 7);
  gear(g, gx, 4);
  // the housings
  bevel(g, 1, 1, 7, H - 2, C.steel2, C.steel3, C.steel1, C.ink);
  gear(g, 2, 4);
  bevel(g, W - 8, 1, 7, H - 2, C.steel2, C.steel3, C.steel1, C.ink);
  rect(g, W - 6, 4, 3, 4, C.ink); px(g, W - 5, 5, C.brass4);
  // the arms over the belt ends
  const ldown = f < 2, rdown = f >= 6;
  line(g, 7, 2, 10, ldown ? 4 : 3, C.brass3); px(g, 10, ldown ? 5 : 4, C.steel3);
  line(g, W - 8, 2, W - 11, rdown ? 4 : 3, C.brass3); px(g, W - 11, rdown ? 5 : 4, C.steel3);
  if (flash) {
    if (ldown) { px(g, 9, 9, C.white); px(g, 12, 9, C.yellow); }
    if (rdown) { px(g, W - 13, 9, C.white); px(g, W - 10, 9, C.yellow); }
  }
  return c;
}

/** Any other shaped factory: a steel plate over the box with its 24x24 art in the middle (or its icon if that won't fit). */
function genericWide(id: string, W: number, H: number, f: number, flash: boolean, stars: number): Cv {
  const [c, g] = makeCanvas(W, H);
  rect(g, 0, 0, W, H, C.ink);
  bevel(g, 1, 1, W - 2, H - 2, C.steel1, C.steel2, C.steel0);
  if (W >= 24 && H >= 24) g.drawImage(factorySprite(id, f, flash, stars), (W - 24) >> 1, (H - 24) >> 1);
  else g.drawImage(itemIcon(id), (W - 12) >> 1, (H - 12) >> 1);
  return c;
}

/**
 * The body of a shaped factory `id` for a screen box w x h px at frame `frameIdx` (mod 8; machinery.ts factoryFrame's
 * index), `flash` right after a stamp, `stars` 1..3: GANTRY PRESS's 2x3 is 36x24 (24x36 turned), ASSEMBLY LINE's I3
 * 36x12 (12x36 turned).
 */
export function shapedFactorySprite(id: string, frameIdx: number, flash: boolean, stars: number, w: number, h: number): Cv {
  const f = ((frameIdx % 8) + 8) % 8;
  const s = Number.isFinite(stars) ? Math.min(3, Math.max(1, Math.floor(stars))) : 1;
  return cached(`sfac:${id}:${w}x${h}:${f}:${flash ? 1 : 0}:${s}`, () => {
    const tr = h > w;
    const W = tr ? h : w, H = tr ? w : h;
    const c = id === "gantry" && H >= 24 ? gantryWide(W, H, f, flash, s)
      : id === "assembly" ? assemblyLong(W, H, f, flash)
      : genericWide(id, W, H, f, flash, s);
    return tr ? transpose(c) : c;
  });
}

/** The white silhouette of a shaped factory's body (its stamp flash, as factoryFlashSil). */
export function shapedFactorySil(id: string, stars: number, w: number, h: number): Cv {
  const s = Number.isFinite(stars) ? Math.min(3, Math.max(1, Math.floor(stars))) : 1;
  return cached(`sfacS:${id}:${w}x${h}:${s}`, () => silhouette(shapedFactorySprite(id, 0, false, s, w, h), C.white));
}

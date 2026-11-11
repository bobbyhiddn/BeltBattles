// SHAPES-1 (REQ-BFG-086.1 "Each card shows its shape"; BRIEF-SHAPES1 S8; the mock ref/pieces1/cards-phone.png): a shaped
// piece's shape picture, its footprint at rot 0 as small tiles in one outline, and for a rig each arrow as a lime tick on
// every outside edge it shines from (rule set B, R2).
// - shapePic: the panel face's picture, in the panel header's 16x16 box (inspector.ts drawDetails draws `icon` there): 4 px
//   a cell, so every shape of this release fits the box's 14x14 inside (a 2x3 is 12x8, SPIKE RAIL 8x12 with its arrows);
// - (miniShape, the shop card's 3 px corner mark, was removed by SHOPCARD-1: the card draws G1's grid, below.)
// Only shaped pieces (foot.ts isShaped) have one; nothing else draws them, so with SHAPES off nothing changes.

import { ITEMS } from "../sim/content";
import { rigArrowCells } from "../sim/deck";
import { footCount, footOffsets, isShaped } from "../sim/foot";
import { C } from "../render/palette";
import { makeCanvas, rect, type G } from "../render/pixel";

const CACHE = new Map<string, HTMLCanvasElement>();

/** The cells of `defId`'s foot at rot 0 as [dx, dy] (bounding box at 0, 0). */
function cellsAt0(defId: string): readonly (readonly [number, number])[] {
  return footOffsets(ITEMS[defId], 0);
}

/** SHAPES-2 (REQ-BFG-114): the panel header's box holds 14x14 px inside; PICKAXE's T with its seven arrows is 16 wide at 4 px a
 *  cell, so the panel picture takes 3 px a cell where 4 would not fit (every other shape of this and the last release fits
 *  at 4). */
const PIC_BOX = 14;
function picCell(defId: string): number {
  const cells = cellsAt0(defId), [mt, mr, mb, ml] = margins(defId, true);
  const w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
  return w * 4 + ml + mr > PIC_BOX || h * 4 + mt + mb > PIC_BOX ? 3 : 4;
}

/** The picture: `s` px a cell, `m` px of margin for the arrow ticks; tiles in the kind's colours (a rig the wood plate of
 *  the house's rigs, a factory steel), a 1 px ink outline round the shape and the seams between cells. */
/** The arrow margins (px) on each side, in direction order (0 top, 1 right, 2 bottom, 3 left): 2 where an arrow points. */
function margins(defId: string, arrows: boolean): number[] {
  const out = [0, 0, 0, 0];
  if (arrows && ITEMS[defId].kind === "gate") for (const a of rigArrowCells(defId, 0, 0, 0)) out[a.dir] = 2;
  return out;
}

function draw(defId: string, s: number, arrows: boolean): HTMLCanvasElement {
  const cells = cellsAt0(defId);
  const d = ITEMS[defId];
  const [mt, mr, mb, ml] = margins(defId, arrows);
  const w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
  const [cv, g] = makeCanvas(w * s + ml + mr, h * s + mt + mb);
  const rig = d.kind === "gate";
  const [fill, hi, seam] = rig ? [C.wood2, C.wood3, C.wood0] : [C.steel2, C.steel3, C.steel0];
  const at = new Set(cells.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of cells) {
    const px = ml + x * s, py = mt + y * s;
    rect(g, px, py, s, s, fill);
    rect(g, px + 1, py + 1, s - 2, 1, hi);
    // the outline round the whole shape; a seam where two cells meet
    rect(g, px, py, s, 1, at.has(`${x},${y - 1}`) ? seam : C.ink);
    rect(g, px, py + s - 1, s, 1, at.has(`${x},${y + 1}`) ? fill : C.ink);
    rect(g, px, py, 1, s, at.has(`${x - 1},${y}`) ? seam : C.ink);
    rect(g, px + s - 1, py, 1, s, at.has(`${x + 1},${y}`) ? fill : C.ink);
  }
  if (arrows && rig) {
    // one lime tick per arrow, outside the edge it shines from (direction 0 forward = up the picture, 1 right, 2 down, 3 left)
    for (const a of rigArrowCells(defId, 0, 0, 0)) {
      if (a.from < 0) continue;
      const x = a.from % 10, y = Math.floor(a.from / 10);
      const px = ml + x * s, py = mt + y * s, mid = Math.floor(s / 2) - 1;
      if (a.dir === 0) rect(g, px + mid, py - 2, 2, 2, C.lime);
      else if (a.dir === 2) rect(g, px + mid, py + s, 2, 2, C.lime);
      else if (a.dir === 1) rect(g, px + s, py + mid, 2, 2, C.lime);
      else rect(g, px - 2, py + mid, 2, 2, C.lime);
    }
  }
  return cv;
}

/** SHAPES-1: the panel face's shape picture (4 px a cell, a rig's arrows as ticks), cached per def. */
export function shapePic(defId: string): HTMLCanvasElement {
  const k = `pic:${defId}`;
  let c = CACHE.get(k);
  if (!c) CACHE.set(k, (c = draw(defId, picCell(defId), true)));
  return c;
}

/** The panel picture's size in px, without drawing (tests, layout): w x h cells at picCell's px (4, or 3 for PICKAXE; SHAPES-2)
 *  plus the arrow margin. SHOPCARD-1 (G5): miniShape, the shop card's 3 px corner mark, is gone (the card draws G1's grid below),
 *  and with it the `mini` flag SHAPES-1 gave this function (SC-0912: no caller passes it); the panel's own picture stays (picCell
 *  px a cell, its arrows as ticks): G1's grid at 5 px a cell is 16 px wide for GANTRY PRESS and ASSEMBLY LINE and 16 px tall for
 *  SPIKE RAIL, past the header box's 14x14 inside. */
export function shapePicSize(defId: string): { w: number; h: number } {
  const cells = cellsAt0(defId), s = picCell(defId), [mt, mr, mb, ml] = margins(defId, true);
  return { w: (Math.max(...cells.map((c) => c[0])) + 1) * s + ml + mr, h: (Math.max(...cells.map((c) => c[1])) + 1) * s + mt + mb };
}

// ------------------------------------------------------------------------------------------------ SHOPCARD-1: THE GRID
// SHOPCARD-1 (REQ-BFG-113; BRIEF-SHOPCARD1 G1): ONE function draws a piece's footprint as the grid every card shows: the
// footprint at rot 0, square tiles in the kind's colours (a rig the house's wood, a factory steel), a 1 px seam between two
// cells, a 1 px ink outline round the whole shape and, for a rig, one lime arrowhead for each arrow (deck.ts rigArrowCells),
// outside the edge it shines from and pointing out the way the board's placement cue points it (cues.ts drawShapeGhost:
// forward is up the picture, 1 right, 2 down, 3 left). It works for any footprint (the tests draw I2, I3 both ways, L, T, 2x2
// and 2x3 with arrows on every side: GridSpec is plain data), not only the shaped pieces of this release.

/** G2: the grid's cell pitch in art px: a 4 px tile and a 1 px seam at 5. The build screen draws an art px at 1.667 CSS px on
 *  a portrait phone at dpr 3 (402x690, 360x640: x5), 1.5 at dpr 2 (x3) and 1.333 on a landscape phone at dpr 3 (844x390: x4),
 *  so a cell of 4 would be 5.33 CSS px there (under the 6 of REQ-BFG-113): 5 art px is the least that gives at least 6 CSS px
 *  a cell on all three of the brief's views (8.33, 7.50 and 6.67 CSS px; REPORT section 6 holds the whole table, with the
 *  small landscape views at dpr 2 where even 5 falls under 6). */
export const GRID_CELL = 5;
/** G1: an arrowhead's length in art px (at least 3), measured out from the edge of the cell it shines from. */
export const HEAD_LEN = 3;
/** PRESENT-2 K (REQ-BFG-113; backlog #492 (2)): a surface WITH ROOM (the grid drawn at the piece's own cell: shapeGrid, shapeGridSize and drawShapePlate called without a `cell`; the wide shop
 *  card, LAST CHANCE's plate, the drop card and list, the road cards, the warlord pick) draws every rig's arrowheads 4 px long, an arrow: the tip, the head's full width, then a 2 px shaft
 *  (headRowsBig). In PRESENT-1's re-read the PICKAXE's T (4 cells, 7 arrows) read right 4 of 6 on the shop card and on the SWAP card (readers miscounted the arrows or saw one pointing down):
 *  its 3 px heads were a block with a 2 px nub. An icon-sized surface (the cargo slot, the icon rows, a corner over an icon: a `cell` given, iconCell) keeps HEAD_LEN. PRESENT-5 A (REQ-BFG-113; #537 (2)): the narrow phone shop card asks for HEAD_BIG at its icon-sized cell (shapeGrid's `headLen`): the plate's room under the card's marks holds it (tests/present5.narrowhead.test.ts). */
export const HEAD_BIG = 4;

/** One arrow of a piece: the cell it shines from, as [dx, dy] in the footprint, and its direction in the picture
 *  (0 up, 1 right, 2 down, 3 left, as deck.ts rigArrowCells' `dir` at rot 0). */
export interface GridArrow { cell: readonly [number, number]; dir: number }
/** A footprint to draw: its cells ([dx, dy], bounding box at 0, 0), its arrows, and whether it is a rig (wood tiles). */
export interface GridSpec { cells: readonly (readonly [number, number])[]; arrows: readonly GridArrow[]; rig: boolean }
/** Where the grid's parts fall in its own box, in px from the box's top-left (tests, layout). */
export interface GridGeom {
  w: number;
  h: number;
  /** The first cell's tile top-left (the margin the outline and any arrowhead take above and left of it). */
  ox: number;
  oy: number;
  /** Each cell's tile (cell - 1 px square), in `cells` order. */
  tiles: { x: number; y: number; w: number; h: number }[];
  /** Each arrowhead's bounding box (HEAD_LEN long, its base the tile's width) and direction, in `arrows` order. */
  heads: { x: number; y: number; w: number; h: number; dir: number }[];
}

/** G1: a piece's footprint and arrows as plain data (its foot at rot 0: foot.ts footOffsets; a rig's arrows: rigArrowCells). */
export function gridSpecOf(defId: string): GridSpec {
  const d = ITEMS[defId];
  const rig = d.kind === "gate";
  const arrows: GridArrow[] = [];
  if (rig) for (const a of rigArrowCells(defId, 0, 0, 0)) if (a.from >= 0) arrows.push({ cell: [a.from % 10, Math.floor(a.from / 10)], dir: a.dir });
  return { cells: cellsAt0(defId), arrows, rig };
}

/** G1: the geometry of `spec` drawn at `cell` px a cell. The tile is cell - 1 px; the last px of a cell's block is the seam
 *  (or the outline where no cell lies beyond). A side with an arrow takes HEAD_LEN px of margin, any other 1 px (the outline). */
export function gridGeom(spec: GridSpec, cell: number, head = HEAD_LEN): GridGeom {
  const W = Math.max(...spec.cells.map((c) => c[0])) + 1, H = Math.max(...spec.cells.map((c) => c[1])) + 1;
  const has = [false, false, false, false];
  for (const a of spec.arrows) has[a.dir] = true;
  const ox = has[3] ? head : 1, oy = has[0] ? head : 1, t = cell - 1;
  const w = ox + W * cell + (has[1] ? head - 1 : 0), h = oy + H * cell + (has[2] ? head - 1 : 0);
  const tiles = spec.cells.map(([cx, cy]) => ({ x: ox + cx * cell, y: oy + cy * cell, w: t, h: t }));
  const heads = spec.arrows.map(({ cell: [cx, cy], dir }) => {
    const x = ox + cx * cell, y = oy + cy * cell;
    if (dir === 0) return { x, y: y - head, w: t, h: head, dir };
    if (dir === 2) return { x, y: y + t, w: t, h: head, dir };
    if (dir === 1) return { x: x + t, y, w: head, h: t, dir };
    return { x: x - head, y, w: head, h: t, dir };
  });
  return { w, h, ox, oy, tiles, heads };
}

/** G1: the arrowhead's rows from the tip to the base: the tip is 1 px (2 on an even tile), then the tile's whole width twice
 *  (a pointer 3 px long that never passes its tile, so two cells' heads side by side keep the seam's px between them). */
function headRows(t: number): number[] {
  return [t % 2 ? 1 : 2, t, t];
}

/** PRESENT-2 K: the 4 px arrow's rows from the tip to the base: the tip (1 px on an odd tile, 2 on an even one), the tile's whole width (the head's base), then a shaft as wide as the tip, twice
 *  (so two cells' arrows side by side keep the seam's px between their heads, and a lone arrow reads as an arrow: a head on a shaft, not a block with a nub). */
function headRowsBig(t: number): number[] {
  const s = t % 2 ? 1 : 2;
  return [s, t, s, s];
}

/** G1: draw `spec` at (x, y), the box's top-left, `cell` px a cell. No background: the caller puts a plate under it (the
 *  shop card's ink plate, drawShapePlate). PRESENT-2 K: `head`, the arrowhead's length (HEAD_LEN, or HEAD_BIG: a surface with room). */
export function drawGrid(g: G, spec: GridSpec, x: number, y: number, cell: number, head = HEAD_LEN): { w: number; h: number } {
  const geom = gridGeom(spec, cell, head), t = cell - 1;
  const [fill, hi, seam] = spec.rig ? [C.wood2, C.wood3, C.wood0] : [C.steel2, C.steel3, C.steel0];
  const at = new Set(spec.cells.map(([cx, cy]) => `${cx},${cy}`));
  const has = (cx: number, cy: number): boolean => at.has(`${cx},${cy}`);
  // the outline: each cell's block grown 1 px up and left (the seams and tiles go over it)
  for (const tl of geom.tiles) rect(g, x + tl.x - 1, y + tl.y - 1, cell + 1, cell + 1, C.ink);
  spec.cells.forEach(([cx, cy], i) => {
    const tl = geom.tiles[i], px = x + tl.x, py = y + tl.y;
    rect(g, px, py, t, t, fill);
    rect(g, px, py, t, 1, hi);
    const r = has(cx + 1, cy), d = has(cx, cy + 1);
    rect(g, px + t, py, 1, t, r ? seam : C.ink); // the block's last column: a seam, or the outline
    rect(g, px, py + t, t, 1, d ? seam : C.ink); // ... and last row
    rect(g, px + t, py + t, 1, 1, r && d && has(cx + 1, cy + 1) ? seam : C.ink); // the corner px: a seam only inside the shape
  });
  // the arrowheads: lime, base on the tile's edge, tip outward
  spec.arrows.forEach((a, i) => {
    const hd = geom.heads[i], rows = head === HEAD_BIG ? headRowsBig(t) : headRows(t);
    for (let k = 0; k < head; k++) { // k = 0 at the tile's edge (the base), head - 1 at the tip
      const run = rows[head - 1 - k], off = Math.floor((t - run) / 2);
      if (a.dir === 0) rect(g, x + hd.x + off, y + hd.y + (head - 1 - k), run, 1, C.lime);
      else if (a.dir === 2) rect(g, x + hd.x + off, y + hd.y + k, run, 1, C.lime);
      else if (a.dir === 1) rect(g, x + hd.x + k, y + hd.y + off, 1, run, C.lime);
      else rect(g, x + hd.x + (head - 1 - k), y + hd.y + off, 1, run, C.lime);
    }
  });
  return { w: geom.w, h: geom.h };
}

/** SC-0912 (cap's answer to the PICKAXE question, oracle 0ab73cb56a4abcbf): the smallest cell pitch a grid is ever drawn at. Never
 *  below 4: the arrowheads (HEAD_LEN 3 px long, a 3 px tile) stay readable. */
export const GRID_CELL_MIN = 4;
/** The cargo slot's face (ui.ts itemSlot: 16 px inside its 18 px box), the biggest box GRID_CELL's grids fill: the widest and tallest of
 *  the other ten shaped pieces are 16 px (GANTRY PRESS, ASSEMBLY LINE, SAW BAR wide; SPIKE RAIL tall). */
export const CARGO_FACE = 16;
const CELLS = new Map<string, number>();
/** SC-0912: the cell pitch `defId`'s grid is drawn at: GRID_CELL, or GRID_CELL_MIN where the grid at GRID_CELL is wider or taller than
 *  the surface's `face`, the biggest box it offers (the cargo slot's 16 px face: CARGO_FACE). Today that is SHAPES2's PICKAXE alone
 *  (a T of three cells with seven arrows: 20 x 13 at 5 px, 17 x 11 at 4); the other ten fit at 5. The way picCell gives the panel
 *  picture 3 px a cell where 4 would not fit the header's box. Any other id (no ITEMS entry): GRID_CELL.
 *  PRESENT-1 (S1 (d), REQ-BFG-113 (2); was ONE size for the piece on every surface: the 16 px face's): a surface with room (the wide shop
 *  card, LAST CHANCE, the drop card and list, the road cards, the warlord's pick) passes no `face` and takes 5 px for PICKAXE too, 6.67 CSS px
 *  a cell on a landscape phone's x4 where 4 px was 5.33; the surfaces whose box is an icon's (the cargo slot, the narrow phone shop card, the
 *  icon rows of the drops, the fork and the scout deck, a corner fallback over an icon) pass CARGO_FACE and keep 4. */
export function gridCell(defId: string, face = Infinity): number {
  const k = `${defId}:${face}`;
  let c = CELLS.get(k);
  if (c === undefined) {
    if (!Object.prototype.hasOwnProperty.call(ITEMS, defId)) return GRID_CELL;
    const geom = gridGeom(gridSpecOf(defId), GRID_CELL);
    CELLS.set(k, (c = geom.w > face || geom.h > face ? GRID_CELL_MIN : GRID_CELL));
  }
  return c;
}
/** PRESENT-1 (S1 (d)): the cell of a grid over an icon's corner or in an icon-sized box (the cargo slot, the icon rows, a corner fallback): the 16 px face's. */
export const iconCell = (defId: string): number => gridCell(defId, CARGO_FACE);

/** G1: the grid as a canvas (cached per piece and cell): its box is gridGeom's. Only for a shaped piece. SC-0912: at the piece's own
 *  cell (gridCell: GRID_CELL, or 4 for PICKAXE) unless a cell is given. */
export function shapeGrid(defId: string, cell?: number, headLen?: number): HTMLCanvasElement {
  const head = headLen ?? headOf(cell), cl = cell ?? gridCell(defId); // PRESENT-2 K: no `cell` given = a surface with room: the 4 px arrow; PRESENT-5 A: `headLen`, the arrowhead's length a caller asks for (the narrow phone shop card: HEAD_BIG at its icon-sized cell)
  const k = `grid:${defId}:${cl}:${head}`;
  let c = CACHE.get(k);
  if (!c) {
    const spec = gridSpecOf(defId), geom = gridGeom(spec, cl, head), [cv, g] = makeCanvas(geom.w, geom.h);
    drawGrid(g, spec, 0, 0, cl, head);
    CACHE.set(k, (c = cv));
  }
  return c;
}

/** PRESENT-2 K: the arrowhead's length for a grid drawn with `cell` (undefined: the piece's own cell on a surface with room: HEAD_BIG; a given cell, an icon-sized surface's: HEAD_LEN). */
const headOf = (cell: number | undefined): number => (cell === undefined ? HEAD_BIG : HEAD_LEN);

/** G1: the grid's box in px, without drawing (tests, layout). SC-0912: at the piece's own cell (gridCell) unless a cell is given. PRESENT-2 K: with no `cell` (a surface with room) the arrowheads are HEAD_BIG. */
export function shapeGridSize(defId: string, cell?: number, headLen?: number): { w: number; h: number } {
  const geom = gridGeom(gridSpecOf(defId), cell ?? gridCell(defId), headLen ?? headOf(cell)); // PRESENT-5 A: `headLen` as shapeGrid's
  return { w: geom.w, h: geom.h };
}

/** G4: does `defId`'s card show the grid? A rig or a factory whose foot is not its 1-cell or 2x2 default (foot.ts isShaped:
 *  shapeEdit.ts shapedPiece's rule, here so the drawing layers need not import a screen). False for an unknown id.
 *  PRESENT-1 (S1, REQ-BFG-113 (1); backlog #471): and every other piece bigger than one cell, a plain 2x2 factory and a size-2 turret
 *  (foot.ts footOf: "2x2"), whose grid has no arrows (gridSpecOf: only a rig has any). A core, a gear, a supply and a gate (1 cell) none. */
export function hasGrid(defId: string): boolean {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, defId) ? ITEMS[defId] : undefined;
  return !!d && (((d.kind === "gate" || d.kind === "factory") && isShaped(d)) || ((d.kind === "factory" || d.kind === "turret") && footCount(d) > 1));
}

/**
 * PRESENT-4 G (REQ-BFG-113; STAGE-0915's F9): the footprint MARK, a small cells-only grid for a surface whose box is the icon's own and has no room beside it: the road's drop row (a 14 x 14 box on a
 * 19 px pitch, the odds under it). G1's grid over that box's corner (iconCell: 11 x 11 for a 2x2) covered the icon whole: PRESENT-3 C's carriage gun showed there as a grey grid. The mark is that grid's
 * own drawing (drawGrid: the footprint at rot 0, a 1 px seam between two cells, a 1 px ink outline, the kind's colours) with no arrowheads (a rig's arrows are on its card, in its panel and in the
 * ⓘ list's row), at 3 px a cell where the footprint is 2 cells either way and at 2 px for 3: 7 x 7 px at the most (a 2x2 is 7 x 7, a 3x1 7 x 3, SPIKE RAIL's 1x3 3 x 7). The caller puts it in the
 * box's bottom-right corner (the diagonal carriage gun and the wheel stay clear there), over the icon's corner.
 */
export function markCell(defId: string): number {
  const cells = gridSpecOf(defId).cells;
  return Math.max(...cells.map((c) => Math.max(c[0], c[1]))) + 1 <= 2 ? 3 : 2;
}
const markSpec = (defId: string): GridSpec => ({ ...gridSpecOf(defId), arrows: [] });
/** PRESENT-4 G: the mark as a canvas (cached per piece and cell). Only for a shaped piece (hasGrid). */
export function shapeMark(defId: string): HTMLCanvasElement {
  const cl = markCell(defId), k = `mark:${defId}:${cl}`;
  let c = CACHE.get(k);
  if (!c) {
    const spec = markSpec(defId), geom = gridGeom(spec, cl), [cv, g] = makeCanvas(geom.w, geom.h);
    drawGrid(g, spec, 0, 0, cl);
    CACHE.set(k, (c = cv));
  }
  return c;
}
/** PRESENT-4 G: the mark's box in px, without drawing (tests, layout). */
export function shapeMarkSize(defId: string): { w: number; h: number } {
  const geom = gridGeom(markSpec(defId), markCell(defId));
  return { w: geom.w, h: geom.h };
}

/**
 * PRESENT-5 G2a (REQ-BFG-113; backlog #537 (1), (5)): the ONE place a surface puts the footprint mark over its icon's box. The box is `boxSize` px square with its top-left at (boxX, boxY); the mark
 * (shapeMark) goes in its bottom-right corner, flush with the box's edges (PRESENT-4 G's place: the road's drop row passed its 14 x 14 box, the icon's carriage gun and wheel stay clear there). Returns the
 * rect the mark covers. G2a moves no pixel (tests/present5.dropmark.test.ts compares the drop row with PRESENT-4's drawing). PRESENT-5 G2b (variant (a): a 1 px ink backing under the mark, to part it from the icon's own pale wheel patch) was tried (50eca68a) and PUT BACK (9d29624d): its cold read's K-03 missed the bar (cells four strict 2 of 6 after the fix round; a cannon or a gun named 4 of 6): the mark is PRESENT-4's again. A later variant changes this function alone, so every surface that calls it follows.
 */
export function drawIconMark(g: G, defId: string, boxX: number, boxY: number, boxSize: number): { x: number; y: number; w: number; h: number } {
  const m = shapeMarkSize(defId), x = boxX + boxSize - m.w, y = boxY + boxSize - m.h;
  g.drawImage(shapeMark(defId), x, y);
  return { x, y, w: m.w, h: m.h };
}

/** G4: a shaped piece's grid (no plate) at the right end of a row `x`..`x + w` whose top is `y`, where it clears `left` (the row's
 *  own words end there) and ends above `floor` (a badge's top): the warlord's pick buttons. Returns whether it drew.
 *  PRESENT-1 (S1 (a), REQ-BFG-113 (1)): `corner`, where the footprint goes when the words leave the grid no room at the row's end: over the
 *  piece's icon, as every other surface shows one over an icon (the row's own picture); it was dropped.
 *  PRESENT-6 G6 (REQ-BFG-113; backlog #583 (1)): `corner` is now the icon's BOX ({ x, y, size }: its top-left and its side) and the fallback is drawIconMark's mark in that box's bottom-right
 *  corner, the icon whole (it drew G1's grid at iconCell over the icon's top-left: the icon showed as a grey grid). The plate case (the grid at the row's end) is unchanged. */
export function drawGridRight(g: G, defId: string, x: number, y: number, w: number, left: number, floor = Infinity, corner?: { x: number; y: number; size: number }): boolean {
  if (!hasGrid(defId)) return false;
  const sz = shapeGridSize(defId), px = x + w - 3 - sz.w;
  if (px < left || y + sz.h > floor) {
    if (!corner) return false;
    drawIconMark(g, defId, corner.x, corner.y, corner.size);
    return true;
  }
  g.drawImage(shapeGrid(defId), px, y);
  return true;
}

/**
 * PRESENT-6 A2 (REQ-BFG-115, REQ-BFG-113; backlog #583 (2); cap's ruling 5 on PRESENT-5's Q5): the narrow phone shop card's plate, shaped. Since PRESENT-5 A (4 px heads) PICKAXE's plate, the grid in a 1 px ink margin, was a 21 x 14 box that hid 128 of its icon's 336 opaque
 * px (38.1%; the guide is 25%). The plate's ink is now only where the grid draws a px (tiles, seams, outline, arrowheads) and 1 px round it, up, down, left and right (a cross: the 3 x 3 square hid 91, 27.1%): the box's empty corners show the icon (82 of 336, 24.4%;
 * 111 px of the plate lie on the icon's 24 x 24 box where the whole box had 168). The grid's own px are drawn over it as ever, so the tiles and the 4 px heads keep their backing; the rect (shapeGridSize + 2) is the box's.
 * Computed from the game's own drawGrid (its fillRect calls recorded; no pixel readback), at the plate's offset (1, 1), and cached per piece, cell and head.
 */
function gridRects(spec: GridSpec, cell: number, head: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const rec = { fillStyle: "", fillRect: (x: number, y: number, w: number, h: number): void => { out.push([x, y, w, h]); } } as unknown as G;
  drawGrid(rec, spec, 0, 0, cell, head);
  return out;
}
export function shapePlateInk(defId: string, cell?: number, headLen?: number): HTMLCanvasElement {
  const head = headLen ?? headOf(cell), cl = cell ?? gridCell(defId), k = `plate:${defId}:${cl}:${head}`;
  let c = CACHE.get(k);
  if (!c) {
    const spec = gridSpecOf(defId), geom = gridGeom(spec, cl, head), [cv, g] = makeCanvas(geom.w + 2, geom.h + 2);
    for (const [x, y, w, h] of gridRects(spec, cl, head)) for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) rect(g, x + 1 + dx, y + 1 + dy, w, h, C.ink);
    CACHE.set(k, (c = cv));
  }
  return c;
}

/** G3: the grid on an ink plate (a 1 px ink margin round its box: an arrowhead stays readable over an icon's corner) with the
 *  plate's top-left at (x, y). Returns the plate's rect. `alpha` dims it (a sold card). SC-0912: at the piece's own cell (gridCell)
 *  unless a cell is given (or `undefined`, as event/cards.ts passes it). */
export function drawShapePlate(g: G, defId: string, x: number, y: number, cell?: number, alpha = 1, headLen?: number, trim = false): { x: number; y: number; w: number; h: number } {
  const { w, h } = shapeGridSize(defId, cell, headLen); // PRESENT-5 A: `headLen`, the arrowhead's length (default: headOf(cell), as before)
  if (alpha < 1) g.globalAlpha = alpha;
  // PRESENT-6 A2: `trim`, the narrow phone shop card's plate: ink only behind the grid's own px and 1 px round them (a shaped plate, shapePlateInk), not its whole box; the rect returned is the box's, as ever
  if (trim) g.drawImage(shapePlateInk(defId, cell, headLen), x, y);
  else rect(g, x, y, w + 2, h + 2, C.ink);
  g.drawImage(shapeGrid(defId, cell, headLen), x + 1, y + 1);
  if (alpha < 1) g.globalAlpha = 1;
  return { x, y, w: w + 2, h: h + 2 };
}

// SHAPES-1 (REQ-BFG-086.1 "Each card shows its shape"; BRIEF-SHAPES1 S8; the mock ref/pieces1/cards-phone.png): a shaped
// piece's shape picture, its footprint at rot 0 as small tiles in one outline, and for a rig each arrow as a lime tick on
// every outside edge it shines from (rule set B, R2).
// - shapePic: the panel face's picture, in the panel header's 16x16 box (inspector.ts drawDetails draws `icon` there): 4 px
//   a cell, so every shape of this release fits the box's 14x14 inside (a 2x3 is 12x8, SPIKE RAIL 8x12 with its arrows);
// - miniShape: the shop card's corner mark (shop.ts drawCard), 3 px a cell, no arrows.
// Only shaped pieces (foot.ts isShaped) have one; nothing else draws them, so with SHAPES off nothing changes.

import { ITEMS } from "../sim/content";
import { rigArrowCells } from "../sim/deck";
import { footOffsets } from "../sim/foot";
import { C } from "../render/palette";
import { makeCanvas, rect } from "../render/pixel";

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

/** SHAPES-1: the shop card's mini shape (3 px a cell, no arrows), cached per def. */
export function miniShape(defId: string): HTMLCanvasElement {
  const k = `mini:${defId}`;
  let c = CACHE.get(k);
  if (!c) CACHE.set(k, (c = draw(defId, 3, false)));
  return c;
}

/** The pictures' sizes in px, without drawing (tests, layout): w x h cells at `s` px plus the arrow margin. */
export function shapePicSize(defId: string, mini = false): { w: number; h: number } {
  const cells = cellsAt0(defId), s = mini ? 3 : picCell(defId), [mt, mr, mb, ml] = margins(defId, !mini);
  return { w: (Math.max(...cells.map((c) => c[0])) + 1) * s + ml + mr, h: (Math.max(...cells.map((c) => c[1])) + 1) * s + mt + mb };
}

// SHAPES-2 (REQ-BFG-114, REQ-BFG-084; BRIEF-SHAPES2 S5): the art of the six more shaped plain stat rigs, 12x12 icons and deck
// bodies, in the house's pixel style (the light from the top-left; the palette and helpers of sprites.ts and shapeArt.ts).
//  - ELBOW GUARD (L3, SHIELD on the slug): a bent length of blue plate with a boss in the bend;
//  - SAW BAR (I3, DMG): a steel bar with a row of saw teeth along both long edges and brass end caps;
//  - SPARK COMB (I2, STUN): a copper comb of prongs with a spark jumping from tip to tip;
//  - CINDER HOOK (L3, BURN): a rust-black bent iron with a hook of steel round a glowing ember;
//  - JAW CRUSHER (2x2, DMG): two steel jaws, their teeth meeting along the middle seam, brass bolts at the corners;
//  - PICKAXE (T4, DMG): a steel head across the top and a wooden handle down the middle.
// The icon is the idle 12x12 picture every rig has (sprites.ts drawGate asks here from its default branch, itemIcon is its
// frame 0); the body is the piece drawn as ONE body across its cells (shapeArt.ts shapedRigBody asks here), never the icon
// repeated per cell. A body is drawn lying along screen x (shapeArt transposes an upright one), so it must read both ways
// up: ELBOW GUARD, CINDER HOOK and PICKAXE find their bend, corner and stem from the cells they are handed. Answers only for
// the six ids (false for anything else); with SHAPES2 off no ITEMS entry carries these ids, so nothing reaches them.

import { CELL } from "../sim/content";
import { C } from "./palette";
import { bevel, disc, hline, makeCanvas, px, rect, vline, type G } from "./pixel";

type Cv = HTMLCanvasElement;
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

// ------------------------------------------------------------------------------------------------------------- icons

const RIG_ART: Record<string, (g: G, f: number, active: boolean) => void> = {
  elbowguard: (g, _f, active) => {
    // an L of blue plate: an upright arm and a foot, ink outline, lit on its left and top, a boss in the bend
    rect(g, 1, 0, 6, 11, C.ink);
    rect(g, 1, 6, 10, 5, C.ink);
    rect(g, 2, 1, 4, 9, C.plate1);
    rect(g, 2, 7, 8, 3, C.plate1);
    vline(g, 2, 1, 9, C.plate3); hline(g, 2, 1, 4, C.plate3); hline(g, 3, 7, 7, C.plate2);
    vline(g, 5, 2, 5, C.plate0); hline(g, 3, 9, 7, C.plate0); vline(g, 9, 8, 2, C.plate0);
    disc(g, 4, 8, 1.6, C.plate2); px(g, 3, 7, C.plate3); px(g, 4, 8, active ? C.white : C.brass3); // the boss in the bend
    px(g, 3, 2, C.brass3); px(g, 8, 8, C.brass3); // a rivet at each end
    if (active) { px(g, 4, 3, C.white); px(g, 7, 9, C.white); }
  },
  sawbar: (g, _f, active) => {
    // a steel bar lying across with a saw's teeth along its top, a brass cap at each end
    rect(g, 0, 3, 12, 6, C.ink);
    rect(g, 1, 4, 10, 4, C.steel1);
    hline(g, 1, 4, 10, C.steel2); hline(g, 1, 7, 10, C.steel0); hline(g, 0, 3, 1, C.ink);
    for (const x of [2, 5, 8]) { px(g, x, 1, active ? C.white : C.steel3); hline(g, x - 1, 2, 3, C.steel3); px(g, x + 1, 2, C.steel2); hline(g, x - 1, 3, 3, C.steel2); } // the teeth, pointing up
    rect(g, 0, 4, 1, 4, C.brass2); rect(g, 11, 4, 1, 4, C.brass2);
    px(g, 0, 4, C.brass3); px(g, 11, 7, C.brass1);
    hline(g, 3, 6, 6, C.steel3); // the sheen along the blade
  },
  sparkcomb: (g, f, active) => {
    // a copper comb: the spine along the bottom, five prongs up, a spark hopping between their tips
    rect(g, 0, 7, 12, 4, C.ink);
    rect(g, 1, 8, 10, 2, C.cop2);
    hline(g, 1, 8, 10, C.cop3); hline(g, 1, 9, 10, C.cop1);
    for (const x of [1, 3, 5, 7, 9]) { vline(g, x, 2, 5, C.ink); vline(g, x + 1, 2, 5, C.ink); vline(g, x, 3, 5, C.cop2); px(g, x, 3, C.cop3); px(g, x + 1, 4, C.cop1); }
    const at = [1, 3, 5, 7, 9];
    for (const x of at) px(g, x, 2, C.cop3);
    const i = f % 4;
    px(g, at[i] + (i === 0 ? 0 : 0), 1, active ? C.white : C.ice); px(g, at[i + 1], 1, active ? C.white : C.cyan); // the spark: a pair of tips lit
    px(g, at[i] + 1, 0, C.ice);
    if (active) { px(g, 11, 4, C.ice); px(g, 0, 5, C.ice); }
  },
  cinderhook: (g, f, active) => {
    // a hook of steel round an ember: a shaft down the right, the bend along the bottom, the point up at the left
    rect(g, 0, 0, 12, 12, C.stone1);
    hline(g, 0, 0, 12, C.stone2); vline(g, 0, 0, 12, C.stone2); hline(g, 0, 11, 12, C.stone0); vline(g, 11, 0, 12, C.stone0);
    vline(g, 8, 1, 7, C.ink); vline(g, 9, 1, 7, C.ink); vline(g, 7, 1, 1, C.ink);
    rect(g, 3, 8, 7, 2, C.ink); vline(g, 2, 4, 6, C.ink); // the hook's outline: shaft, bend, point
    vline(g, 8, 1, 7, C.steel2); hline(g, 3, 8, 6, C.steel2); vline(g, 3, 5, 3, C.steel2); // its body, lit
    px(g, 8, 1, C.steel3); px(g, 3, 5, C.steel3); hline(g, 4, 9, 5, C.steel1);
    const glow = [C.fire1, C.fire2, C.fire3];
    disc(g, 5.5, 6, 1.7, glow[f % 3]); px(g, 5, 6, active ? C.white : C.fire4); px(g, 6, 5, C.fire3); // the ember in the bend
    px(g, 4 + (f % 2), 3, C.fire3); px(g, 6, 2 - (f % 2 ? 0 : 1) + 1, C.fire4); // sparks rising off it
  },
  jawcrusher: (g, f, active) => {
    // two jaws seen from above, their teeth meeting along the middle seam; brass bolts at the four corners
    rect(g, 0, 0, 12, 12, C.ink);
    bevel(g, 1, 1, 4, 10, C.steel1, C.steel3, C.steel0); bevel(g, 7, 1, 4, 10, C.steel1, C.steel3, C.steel0);
    const open = f % 4 < 2 ? 0 : 1; // the jaws work: a pixel apart, a pixel closer
    for (const y of [2, 5, 8]) { // the teeth of the left jaw point right, those of the right point left, interlocked
      rect(g, 5, y, 2 - open, 2, C.steel3); px(g, 6 - open, y, active ? C.white : C.steel3);
      rect(g, 6 + open, y + 1 - (y === 5 ? 3 : 0) + 0, 2 - open, 2, C.steel2);
    }
    vline(g, 6, 1, 10, C.ink);
    px(g, 2, 2, C.brass3); px(g, 9, 2, C.brass3); px(g, 2, 9, C.brass3); px(g, 9, 9, C.brass3);
    if (active) { px(g, 5, 6, C.yellow); px(g, 6, 5, C.fire4); }
  },
  pickaxe: (g, _f, active) => {
    // a steel head across the top, bowed, with a point down at each end; the wooden handle down its middle
    rect(g, 4, 3, 4, 9, C.ink); // the handle's outline
    rect(g, 5, 4, 2, 7, C.wood2); vline(g, 5, 4, 7, C.wood3); vline(g, 6, 5, 6, C.wood1); px(g, 5, 11, C.wood1); px(g, 6, 11, C.wood0);
    rect(g, 2, 0, 8, 5, C.ink); rect(g, 0, 2, 12, 3, C.ink); px(g, 0, 5, C.ink); px(g, 11, 5, C.ink); px(g, 1, 5, C.ink); px(g, 10, 5, C.ink);
    rect(g, 3, 1, 6, 3, C.steel1); // the bowed head
    rect(g, 1, 3, 2, 2, C.steel1); rect(g, 9, 3, 2, 2, C.steel1);
    hline(g, 3, 1, 6, active ? C.white : C.steel3); hline(g, 1, 3, 2, C.steel2); hline(g, 9, 3, 2, C.steel2); // lit along the top
    hline(g, 3, 3, 6, C.steel0);
    px(g, 1, 5, C.steel2); px(g, 10, 5, C.steel1); // the two points, down
    px(g, 6, 2, C.brass3); px(g, 5, 2, C.brass2); // the collar where the handle meets the head
    if (active) { px(g, 0, 6, C.yellow); px(g, 11, 6, C.fire4); }
  },
};

/** The six ids with art here. */
export const SHAPES2_ART_IDS: readonly string[] = Object.keys(RIG_ART);

/** Draw shaped rig `id`'s 12x12 icon (frame f 0-7, the hit flash `active`) on a 12x12 G; false for any other id. */
export function drawShapes2Gate(g: G, id: string, f: number, active: boolean): boolean {
  if (!own(RIG_ART, id)) return false;
  RIG_ART[id](g, ((f % 8) + 8) % 8, active);
  return true;
}

// ------------------------------------------------------------------------------------------------------------- bodies

type Cell = [number, number];

/** The plate under a body: one bevel over the whole box, or (a foot with holes: an L, a T) ONE plate over the union of its
 *  cells, outlined in ink round the whole shape only, lit on the edges that face up and left and shaded on those that face
 *  down and right, so the piece reads as one body and not as cells joined by bridges. */
function plate(g: G, W: number, H: number, cells: Cell[], full: boolean, fill: string, hi: string, lo: string): void {
  if (full) {
    bevel(g, 1, 1, W - 2, H - 2, fill, hi, lo, C.ink);
    return;
  }
  const has = new Set(cells.map(([x, y]) => `${x},${y}`));
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && has.has(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`);
  // an inset of one pixel from the cells' border (as the bevel's outline sits one pixel in), so two bodies side by side keep a gap
  const body = (x: number, y: number): boolean => {
    if (!inside(x, y)) return false;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), u = x - cx * CELL, v = y - cy * CELL;
    if (u === 0 && !has.has(`${cx - 1},${cy}`)) return false;
    if (u === CELL - 1 && !has.has(`${cx + 1},${cy}`)) return false;
    if (v === 0 && !has.has(`${cx},${cy - 1}`)) return false;
    if (v === CELL - 1 && !has.has(`${cx},${cy + 1}`)) return false;
    return true;
  };
  const edge = (x: number, y: number): boolean => body(x, y) && !(body(x - 1, y) && body(x + 1, y) && body(x, y - 1) && body(x, y + 1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!body(x, y)) continue;
    if (edge(x, y)) { px(g, x, y, C.ink); continue; }
    const lit = (body(x - 1, y) && edge(x - 1, y)) || (body(x, y - 1) && edge(x, y - 1));
    const shade = (body(x + 1, y) && edge(x + 1, y)) || (body(x, y + 1) && edge(x, y + 1));
    px(g, x, y, lit ? hi : shade ? lo : fill);
  }
}

const neighbours = (cells: Cell[], [x, y]: Cell): number =>
  cells.filter(([a, b]) => Math.abs(a - x) + Math.abs(b - y) === 1).length;

/** The ids whose body animates (the frame index matters): the spark and the ember. */
export const SHAPES2_ANIMATED: readonly string[] = ["sparkcomb", "cinderhook", "jawcrusher"];

/**
 * A shaped rig `id`'s body for a box of W x H px lying along x, `cells` the covered cells in this orientation ([cx, cy] in
 * whole cells; every cell of the box when `full`), at frame `f` (0-7), `active` while a hit applies. The arrows' nozzles are
 * drawn over it per arrow (machinery.ts).
 */
export function shapes2BodyH(id: string, W: number, H: number, cells: Cell[], full: boolean, f: number, active: boolean): Cv {
  const [c, g] = makeCanvas(W, H);
  const ox = (cell: Cell): number => cell[0] * CELL, oy = (cell: Cell): number => cell[1] * CELL;
  switch (id) {
    case "elbowguard": { // blue plate; a boss in the bend (the cell with two neighbours) and a rivet at each end
      plate(g, W, H, cells, full, C.plate1, C.plate3, C.plate0);
      for (const cell of cells) {
        const n = neighbours(cells, cell), x0 = ox(cell), y0 = oy(cell);
        if (n >= 2) { // the bend: a round boss, lit top-left, a brass rivet in its middle
          disc(g, x0 + 6, y0 + 6, 4.4, C.ink); disc(g, x0 + 6, y0 + 6, 3.6, C.plate2); px(g, x0 + 4, y0 + 4, C.plate3); px(g, x0 + 5, y0 + 4, C.plate3);
          px(g, x0 + 6, y0 + 6, active ? C.white : C.brass3); px(g, x0 + 7, y0 + 7, C.plate0);
        } else {
          for (const [u, v] of [[3, 3], [8, 8]]) px(g, x0 + u, y0 + v, C.brass3);
          hline(g, x0 + 3, y0 + 6, 6, C.plate2);
        }
      }
      break;
    }
    case "sawbar": { // a steel bar, teeth along both long edges, brass end caps
      plate(g, W, H, cells, full, C.steel1, C.steel2, C.steel0);
      const x0 = Math.min(...cells.map((q) => q[0])) * CELL, x1 = (Math.max(...cells.map((q) => q[0])) + 1) * CELL;
      for (let x = x0 + 4; x < x1 - 5; x += 4) { // saw teeth along the top edge: a lit point, a three-pixel base
        px(g, x + 1, 1, active ? C.white : C.steel3); hline(g, x, 2, 3, C.steel3); px(g, x + 2, 2, C.steel2);
        hline(g, x, H - 3, 3, C.steel0); px(g, x + 1, H - 2, C.ink); // the bottom edge's, shaded and blunt
      }
      hline(g, x0 + 3, 5, x1 - x0 - 6, C.steel3); hline(g, x0 + 3, 6, x1 - x0 - 6, C.ink);
      rect(g, x0 + 1, 1, 2, H - 2, C.brass2); rect(g, x1 - 3, 1, 2, H - 2, C.brass2);
      px(g, x0 + 1, 1, C.brass3); px(g, x1 - 3, 1, C.brass3);
      break;
    }
    case "sparkcomb": { // a copper comb: the spine along the bottom, prongs up, a spark hopping between the tips
      plate(g, W, H, cells, full, C.cop1, C.cop3, C.cop0);
      const x0 = Math.min(...cells.map((q) => q[0])) * CELL, x1 = (Math.max(...cells.map((q) => q[0])) + 1) * CELL;
      const tips: number[] = [];
      for (let x = x0 + 3; x < x1 - 2; x += 4) { vline(g, x, 2, 6, C.cop2); px(g, x, 2, C.cop3); vline(g, x + 1, 3, 5, C.ink); tips.push(x); }
      hline(g, x0 + 2, 8, x1 - x0 - 4, C.cop3); hline(g, x0 + 2, 9, x1 - x0 - 4, C.ink);
      const i = f % tips.length, j = (i + 1) % tips.length;
      px(g, tips[i], 1, active ? C.white : C.ice); px(g, tips[j], 1, active ? C.white : C.cyan);
      if (tips[j] > tips[i]) hline(g, tips[i] + 1, 0, tips[j] - tips[i] - 1, C.ice);
      break;
    }
    case "cinderhook": { // blackened iron; in the bend a hook of steel round a glowing ember, coals along the arms
      plate(g, W, H, cells, full, C.rust1, C.rust3, C.rust0);
      const glow = [C.fire1, C.fire2, C.fire3];
      for (const cell of cells) {
        const n = neighbours(cells, cell), x0 = ox(cell), y0 = oy(cell);
        if (n >= 2) {
          disc(g, x0 + 6, y0 + 6, 4.6, C.ink); disc(g, x0 + 6, y0 + 6, 3.8, C.steel1);
          disc(g, x0 + 6, y0 + 6, 2.6, C.ink); disc(g, x0 + 6, y0 + 6, 1.8, glow[f % 3]);
          px(g, x0 + 6, y0 + 6, active ? C.white : C.fire4); px(g, x0 + 4, y0 + 3, C.steel3); px(g, x0 + 5, y0 + 3, C.steel2);
        } else {
          for (const [u, v, k] of [[3, 4, 0], [7, 6, 1], [5, 8, 2]]) px(g, x0 + u, y0 + v, active ? C.fire4 : glow[(k + f) % 3]);
          hline(g, x0 + 3, y0 + 2, 6, C.rust2);
        }
      }
      break;
    }
    case "jawcrusher": { // two jaws, teeth meeting along the middle seam, brass bolts at the corners
      plate(g, W, H, cells, full, C.steel1, C.steel2, C.steel0);
      const mid = W >> 1, gap = f % 4 < 2 ? 0 : 1;
      for (let y = 3; y < H - 3; y += 6) { // interlocked teeth, the left jaw's pointing right, the right jaw's left
        rect(g, mid - 4, y, 4 - gap, 3, C.steel3); px(g, mid - 1 - gap, y, active ? C.white : C.steel3);
        rect(g, mid + gap, y + 3, 4 - gap, 3, C.steel2);
      }
      vline(g, mid, 2, H - 4, C.ink);
      for (const [x, y] of [[3, 3], [W - 4, 3], [3, H - 4], [W - 4, H - 4]]) { px(g, x, y, C.brass3); px(g, x + 1, y + 1, C.brass1); }
      if (active) { px(g, mid - 1, H >> 1, C.yellow); px(g, mid, (H >> 1) - 1, C.fire4); }
      break;
    }
    case "pickaxe": { // a steel head along the row of three, the wooden handle down the stem
      plate(g, W, H, cells, full, C.steel1, C.steel3, C.steel0);
      const rows = new Map<number, number>();
      for (const [, y] of cells) rows.set(y, (rows.get(y) ?? 0) + 1);
      const headY = [...rows.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const x0 = Math.min(...cells.filter((q) => q[1] === headY).map((q) => q[0])) * CELL, x1 = (Math.max(...cells.filter((q) => q[1] === headY).map((q) => q[0])) + 1) * CELL;
      const stem = cells.find((q) => q[1] !== headY)!, down = stem[1] > headY;
      const hy = headY * CELL;
      // the stem cell: a wooden handle, grain along it
      const sx = ox(stem), sy = oy(stem);
      rect(g, sx + 2, sy + 1, CELL - 4, CELL - 2, C.wood1); vline(g, sx + 3, sy + 1, CELL - 2, C.wood3); vline(g, sx + 8, sy + 1, CELL - 2, C.wood0);
      px(g, sx + 5, sy + 4, C.wood3); px(g, sx + 6, sy + 8, C.wood3);
      // the head: a darker steel band along the cells of the head row, sharpening to a point at each end (away from the stem)
      const edge = down ? hy + 2 : hy + CELL - 3; // the outer edge's row of highlights
      hline(g, x0 + 3, hy + 5, x1 - x0 - 6, C.steel2); hline(g, x0 + 3, hy + 6, x1 - x0 - 6, C.steel0);
      hline(g, x0 + 2, edge, x1 - x0 - 4, active ? C.white : C.steel3);
      px(g, x0 + 1, down ? hy + 9 : hy + 2, C.steel3); px(g, x1 - 2, down ? hy + 9 : hy + 2, C.steel3); // the points
      px(g, x0 + 1, down ? hy + 10 : hy + 1, C.ink); px(g, x1 - 2, down ? hy + 10 : hy + 1, C.ink);
      px(g, (x0 + x1) >> 1, hy + 6, C.brass3); // the collar where the handle meets the head
      break;
    }
    default: plate(g, W, H, cells, full, C.steel1, C.steel2, C.steel0);
  }
  return c;
}

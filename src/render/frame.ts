// Deck frames: where a cruiser's deck sits on screen and which way its bow points.
// Deck-local space (sim space): lx across the deck (0..120, column axis), ly from the
// forward row (0) toward the stern (120); the bow and turrets sit at ly < 0.
// Portrait battles stack the cruisers (player bow N, enemy bow S); landscape battles put
// them side by side (player bow E on the left, enemy bow W on the right). Enemy frames
// are mirrors, so column 0 is always on the left (portrait) or top (landscape).

import { CELL, GRID } from "../sim/content";

export type Facing = 0 | 1 | 2 | 3; // bow points N, E, S, W on screen

export interface DeckFrame {
  facing: Facing;
  dx: number; // screen x of the 120x120 deck rect's left edge
  dy: number; // screen y of its top edge
}

export const DECK = GRID * CELL; // 120
/** MOTION-1 (REQ-BFG-071): the deck's tile size and count for render code that imports no sim value (the tap's hit test). */
export const TILE = CELL;
export const TILES = GRID;

/** Hull geometry around the deck (hull-local: hx across 0..A-1, hy bow edge 0 .. stern L-1). */
export const SIDE = 18; // skirt + tread + walkway on each side of the deck
export const BOW = 14; // bow armour band (turret mounts)
export const STERN = 6; // engine block
export const HULL_A = DECK + 2 * SIDE; // 156 across
export const HULL_L = BOW + DECK + STERN; // 140 bow to stern
export const TURRET_LY = -9; // turret pivot row (matches the sim's turret target y)

export function frame(facing: Facing, dx: number, dy: number): DeckFrame {
  return { facing, dx, dy };
}

/** Deck-local point -> screen x. */
export function sx(f: DeckFrame, lx: number, ly: number): number {
  switch (f.facing) {
    case 0:
    case 2:
      return f.dx + lx;
    case 1:
      return f.dx + DECK - ly;
    default:
      return f.dx + ly;
  }
}

/** Deck-local point -> screen y. */
export function sy(f: DeckFrame, lx: number, ly: number): number {
  switch (f.facing) {
    case 0:
      return f.dy + ly;
    case 2:
      return f.dy + DECK - ly;
    default:
      return f.dy + lx;
  }
}

/** Screen top-left of a size x size footprint whose local top-left cell is (cx, cy). */
export function footX(f: DeckFrame, cx: number, cy: number, size = 1): number {
  switch (f.facing) {
    case 0:
    case 2:
      return f.dx + cx * CELL;
    case 1:
      return f.dx + DECK - (cy + size) * CELL;
    default:
      return f.dx + cy * CELL;
  }
}

export function footY(f: DeckFrame, cx: number, cy: number, size = 1): number {
  switch (f.facing) {
    case 0:
      return f.dy + cy * CELL;
    case 2:
      return f.dy + DECK - (cy + size) * CELL;
    default:
      return f.dy + cx * CELL;
  }
}

/** SHAPES-1 (REQ-BFG-086 R1): the screen rect of a deck box `w` cells along x and `h` along y with its top-left cell at
 *  (cx, cy) (a turned footprint's bounding box, foot.ts footBox): footX/footY read `size` as the box's depth in y, so they
 *  place any box; facing 1 and 3 swap its screen width and height. A size x size box is footX/footY's square. */
export function boxRect(f: DeckFrame, cx: number, cy: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const across = f.facing === 0 || f.facing === 2;
  return { x: footX(f, cx, cy, h), y: footY(f, cx, cy, h), w: (across ? w : h) * CELL, h: (across ? h : w) * CELL };
}

/** Screen point -> deck-local lx / ly (inverse of sx/sy). */
export function localX(f: DeckFrame, x: number, y: number): number {
  return f.facing === 0 || f.facing === 2 ? x - f.dx : y - f.dy;
}

export function localY(f: DeckFrame, x: number, y: number): number {
  switch (f.facing) {
    case 0:
      return y - f.dy;
    case 2:
      return f.dy + DECK - y;
    case 1:
      return f.dx + DECK - x;
    default:
      return x - f.dx;
  }
}

/** Deck cell under a screen point (may be outside the grid). */
export function cellAt(f: DeckFrame, x: number, y: number): { cx: number; cy: number } {
  return { cx: Math.floor(localX(f, x, y) / CELL), cy: Math.floor(localY(f, x, y) / CELL) };
}

const S_MAP: number[] = [2, 1, 0, 3];

/** Local deck direction (0 fwd, 1 +lx, 2 back, 3 -lx) -> screen direction (0 N, 1 E, 2 S, 3 W). */
export function sdir(f: DeckFrame, d: number): number {
  switch (f.facing) {
    case 0:
      return d;
    case 2:
      return S_MAP[d];
    case 1:
      return (d + 1) % 4;
    default:
      return 3 - d;
  }
}

/** Unit screen vector of the bow direction. */
export function fwdX(f: DeckFrame): number {
  return f.facing === 1 ? 1 : f.facing === 3 ? -1 : 0;
}

export function fwdY(f: DeckFrame): number {
  return f.facing === 0 ? -1 : f.facing === 2 ? 1 : 0;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Screen rect of the whole hull (without decorative margin). */
export function hullBox(f: DeckFrame): Box {
  switch (f.facing) {
    case 0:
      return { x: f.dx - SIDE, y: f.dy - BOW, w: HULL_A, h: HULL_L };
    case 2:
      return { x: f.dx - SIDE, y: f.dy - STERN, w: HULL_A, h: HULL_L };
    case 1:
      return { x: f.dx - STERN, y: f.dy - SIDE, w: HULL_L, h: HULL_A };
    default:
      return { x: f.dx - BOW, y: f.dy - SIDE, w: HULL_L, h: HULL_A };
  }
}

/** Deck frame whose hull box has its top-left at (x, y). */
export function frameForHull(facing: Facing, x: number, y: number): DeckFrame {
  switch (facing) {
    case 0:
      return { facing, dx: x + SIDE, dy: y + BOW };
    case 2:
      return { facing, dx: x + SIDE, dy: y + STERN };
    case 1:
      return { facing, dx: x + STERN, dy: y + SIDE };
    default:
      return { facing, dx: x + BOW, dy: y + SIDE };
  }
}

/** Screen rect covering the deck-local rect [lx, lx+w) x [ly, ly+h). Writes into `out`. */
export function localRect(f: DeckFrame, lx: number, ly: number, w: number, h: number, out: Box): Box {
  switch (f.facing) {
    case 0:
      out.x = f.dx + lx; out.y = f.dy + ly; out.w = w; out.h = h;
      break;
    case 2:
      out.x = f.dx + lx; out.y = f.dy + DECK - ly - h; out.w = w; out.h = h;
      break;
    case 1:
      out.x = f.dx + DECK - ly - h; out.y = f.dy + lx; out.w = h; out.h = w;
      break;
    default:
      out.x = f.dx + ly; out.y = f.dy + lx; out.w = h; out.h = w;
  }
  return out;
}

/** Turret-local offset (u across, v along the bow axis, forward = -v) -> screen delta. */
export function turnX(f: DeckFrame, u: number, v: number): number {
  return f.facing === 0 || f.facing === 2 ? u : f.facing === 1 ? -v : v;
}

export function turnY(f: DeckFrame, u: number, v: number): number {
  return f.facing === 0 ? v : f.facing === 2 ? -v : u;
}

/** Hull-local (hx across, hy from bow edge) -> screen. */
export function hullX(f: DeckFrame, hx: number, hy: number): number {
  return sx(f, hx - SIDE, hy - BOW);
}

export function hullY(f: DeckFrame, hx: number, hy: number): number {
  return sy(f, hx - SIDE, hy - BOW);
}

// SHAPES-1 (REQ-BFG-086; ref/pieces1/REPORT.md section 5.3, rule set B; BRIEF-SHAPES1 R1-R3): THE FOOTPRINT ENGINE.
//
// A piece's shape is def data: ItemDef.foot, a FootId, defaulting from `size` (1 for a rig, 2x2 for a factory: footOf).
// footprintCells(def, x, y, rot) is the one footprint every reader takes (placement, belts, the validator, the renderer,
// the editor and the bots): the deck cells of `def` turned `rot` clockwise quarter turns, with (x, y) the top-left of the
// turned footprint's bounding box (as for a 2x2 today), row by row. It replaces footprint()'s `size x size` (deck.ts keeps
// footprint as its alias for the tests and tools that import it).
//
// Turning (R1): a rig takes rot 0-3 and its arrows turn with its cells, so the piece turns whole. At rot 0 a rig's cells
// run at right angles to its first arrow: a rig whose shape's first arrow points sideways (the II shape: left and right)
// starts its foot a quarter turn round (footBaseTurn), so NAIL STRIP (I2, forward) lies along x and SPIKE RAIL (I3, left
// and right) along y. A factory's rot is stored in its lowest form that gives the same cells (canonicalRot): a 2x3 or I3
// factory has rot 0 or 1 and a 2x2 none; footTurns is that count (1, 2 or 4).
//
// The slots (R3): every 2 cells beyond 4 add one belt slot (footSlots), on top of stars.ts outputsAt's: a 2x3 +1, a 3x3 +2,
// a SMALL (3-cell) factory +0.
//
// Pure and dependency-light (no DOM; content.ts only, which imports this file's types only): the client, the server, the
// harness and the tests read the same geometry. Nothing here reads the SHAPES switch (shapes.ts): with it off every def
// keeps its 0.9.9 foot (1 or 2x2), so every answer below is 0.9.9's.

import { GRID, SHAPE_ARROWS, rigShape, type ItemDef } from "./content";

/** R1: the nine footprint shapes. In this release only I2, I3 and 2x3 pieces exist (shapes.ts); the engine and its
 *  tests support all nine. */
export type FootId = "1" | "I2" | "I3" | "L3" | "T4" | "L4" | "2x2" | "2x3" | "3x3";
export const FOOT_IDS: readonly FootId[] = ["1", "I2", "I3", "L3", "T4", "L4", "2x2", "2x3", "3x3"];

/** Each foot's cells at rot 0, as [dx, dy] from the top-left of its bounding box, row by row. x runs right (+x, direction
 *  1), y runs back (+y, direction 2; row 0 touches the turrets). A 2x3 at rot 0 is 3 cells wide and 2 deep (the mock). */
export const FOOT_CELLS: Readonly<Record<FootId, readonly (readonly [number, number])[]>> = {
  "1": [[0, 0]],
  I2: [[0, 0], [1, 0]],
  I3: [[0, 0], [1, 0], [2, 0]],
  L3: [[0, 0], [0, 1], [1, 1]],
  T4: [[0, 0], [1, 0], [2, 0], [1, 1]],
  L4: [[0, 0], [0, 1], [0, 2], [1, 2]],
  "2x2": [[0, 0], [1, 0], [0, 1], [1, 1]],
  "2x3": [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  "3x3": [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
};

/** A def's foot: its own `foot`, else from `size` (1 -> "1", 2 -> "2x2"). */
export function footOf(def: ItemDef): FootId {
  return def.foot ?? (def.size === 2 ? "2x2" : "1");
}

/** The number of cells in a def's foot. */
export function footCount(def: ItemDef): number {
  return FOOT_CELLS[footOf(def)].length;
}

/** One clockwise quarter turn of a cell list (deck-local: x right, y back), moved so its bounding box starts at (0, 0) and
 *  listed row by row. */
function turnOnce(cells: readonly (readonly [number, number])[]): [number, number][] {
  const t = cells.map(([x, y]) => [-y, x] as [number, number]);
  const mx = Math.min(...t.map((c) => c[0])), my = Math.min(...t.map((c) => c[1]));
  return t.map(([x, y]) => [x - mx, y - my] as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** FOOT_TURNED[foot][t]: the foot turned t (0-3) clockwise quarter turns, bounding box at (0, 0), row by row. */
const FOOT_TURNED: Readonly<Record<FootId, readonly (readonly [number, number])[][]>> = Object.fromEntries(
  FOOT_IDS.map((f) => {
    const out: [number, number][][] = [FOOT_CELLS[f].map(([x, y]) => [x, y] as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0])];
    for (let t = 1; t < 4; t++) out.push(turnOnce(out[t - 1]));
    return [f, out];
  }),
) as Record<FootId, [number, number][][]>;

const sameCells = (a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]): boolean =>
  a.length === b.length && a.every((c, i) => c[0] === b[i][0] && c[1] === b[i][1]);

/** How many different footprints a foot has under quarter turns: 1 (1, 2x2, 3x3), 2 (I2, I3, 2x3) or 4 (L3, T4, L4). */
export function footTurns(foot: FootId): 1 | 2 | 4 {
  const t = FOOT_TURNED[foot];
  if (sameCells(t[0], t[1])) return 1;
  if (sameCells(t[0], t[2])) return 2;
  return 4;
}

/** A turn count as 0..3 (floor, then mod 4; anything not finite is 0). */
const quarter = (rot: number): number => (Number.isFinite(rot) ? ((Math.floor(rot) % 4) + 4) % 4 : 0);

/** R1: the quarter turns a rig's foot starts with at rot 0: 1 when its shape's first arrow points sideways (the II shape),
 *  so its cells run at right angles to its arrows; 0 for every other rig and for anything that is not a rig. */
export function footBaseTurn(def: ItemDef): number {
  const shape = rigShape(def);
  return shape ? SHAPE_ARROWS[shape][0] % 2 : 0;
}

/**
 * R1: the rot to store for a piece of `def` (absent means 0): a rig's 0-3, as today (an X rig's 0 while its foot is one
 * cell: it ignores rotation); a factory's (and any other piece's) lowest rot that gives the same cells, rot mod
 * footTurns: a 2x3 or I3 factory 0 or 1, a 2x2 0.
 */
export function canonicalRot(def: ItemDef, rot: number): number {
  const r = quarter(rot);
  const shape = rigShape(def);
  if (shape && shape !== "X") return r;
  return r % footTurns(footOf(def));
}

/** The foot's cell offsets for `def` at `rot`, bounding box at (0, 0), row by row. */
export function footOffsets(def: ItemDef, rot = 0): readonly (readonly [number, number])[] {
  return FOOT_TURNED[footOf(def)][(quarter(rot) + footBaseTurn(def)) % 4];
}

/** The turned footprint's bounding box: its width (x) and depth (y) in cells. */
export function footBox(def: ItemDef, rot = 0): { w: number; h: number } {
  const c = footOffsets(def, rot);
  return { w: Math.max(...c.map((q) => q[0])) + 1, h: Math.max(...c.map((q) => q[1])) + 1 };
}

/** THE footprint (R1): the cell keys (y * GRID + x) of `def` at (x, y) turned `rot`, row by row. Like footprint() before
 *  it, it doesn't clip: a cell off the deck gives an off-deck key (callers test footOnDeck or bound the keys). */
export function footprintCells(def: ItemDef, x: number, y: number, rot = 0): number[] {
  return footOffsets(def, rot).map(([dx, dy]) => (y + dy) * GRID + (x + dx));
}

/** Is every cell of `def` at (x, y) turned `rot` on the deck? */
export function footOnDeck(def: ItemDef, x: number, y: number, rot = 0): boolean {
  const { w, h } = footBox(def, rot);
  return x >= 0 && y >= 0 && x + w <= GRID && y + h <= GRID;
}

/** R3: the belt slots a factory's size adds on top of outputsAt's: one for every 2 cells beyond 4 (a 2x3 1, a 3x3 2;
 *  a 1-cell, 3-cell or 4-cell foot 0). */
export function footSlots(def: ItemDef): number {
  return Math.floor(Math.max(0, footCount(def) - 4) / 2);
}

/** Is `def` a shaped piece: a foot other than its kind's 0.9.9 one (a multi-cell rig, or a factory that isn't 2x2)? */
export function isShaped(def: ItemDef): boolean {
  const f = footOf(def);
  return def.kind === "factory" ? f !== "2x2" : f !== "1";
}

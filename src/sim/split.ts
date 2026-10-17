// GATES-1 (REQ-BFG-057; BRIEF-GATES1 G3): WHERE A GATE MAY STAND. A converter (FUSER, SCATTER MILL, SMELTER; gates.ts) goes
// only ON a belt tile; the belt is then split around it with no redrawing (the route stays ONE RouteDef: the tiles before
// the gate are its input, the tiles after it its own output path). splitProblem is the one rule: deck.ts canPlaceItem asks
// it for kind "converter" (the editor's carried ghost, the harness and the validator all go through canPlaceItem).
// Refusals, each a short reason the carried ghost shows:
//  - off a belt:                        DROP IT ON A BELT;
//  - a route's first tile (next to its factory), its last tile (the turret intake, or a joining belt's end), or a tile right
//    next to another gate on the same belt (no belt between them):  NEEDS BELT ON BOTH SIDES.
// A corner is fine (in from one side, out the other). Belts never cross, so there is no crossing case. A join tile is fine
// too (a belt that joins here feeds the gate's buffer: convert.ts). The preview (previewSplit: the tiles in and out, the rig
// arrows that go idle) reads the rig hits, so it lives with the editor (splitPreview.ts): this file is a leaf, which deck.ts
// imports (a cycle otherwise). Pure and dependency-light (content.ts and foot.ts only; deck.ts types).

import { GRID, ITEMS } from "./content";
import { footprintCells } from "./foot";
import type { Build, Placed } from "./deck";

/** A converter dropped off a belt. */
export const SPLIT_OFF_BELT = "DROP IT ON A BELT";
/** A converter on a route's first or last tile, or next to another converter on the same belt. */
export const SPLIT_NO_BELT = "NEEDS BELT ON BOTH SIDES";

const cellKey = (x: number, y: number): number => y * GRID + x;

/** The belt tile k as [route index, tile index] (the first route holding it), or null off a belt. */
export function beltTile(b: Pick<Build, "routes">, k: number): [number, number] | null {
  for (let ri = 0; ri < b.routes.length; ri++) {
    const ti = b.routes[ri].cells.indexOf(k);
    if (ti >= 0) return [ri, ti];
  }
  return null;
}

/** Is `p` a placed converter? (A def the switch has taken out of ITEMS is none.) */
export function isConverterItem(p: Pick<Placed, "def">): boolean {
  return (Object.prototype.hasOwnProperty.call(ITEMS, p.def) ? ITEMS[p.def] : undefined)?.kind === "converter";
}

/** The cells piece `p` covers (a 1x1 converter: its one cell), without deck.ts. */
function coverOf(p: Placed): number[] {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, p.def) ? ITEMS[p.def] : undefined;
  if (!d) return [];
  const r = typeof p.rot === "number" && Number.isInteger(p.rot) && p.rot >= 0 && p.rot <= 3 ? p.rot : 0;
  return footprintCells(d, p.x, p.y, r);
}

/**
 * Why a converter `defId` can't stand on cell `k` of `b`, or null when it can (BRIEF-GATES1 G3; REQ-BFG-057). `ignoreUid`:
 * the piece being moved or checked in place (its own cell is its own). The reasons are player text.
 */
export function splitProblem(b: Pick<Build, "items" | "routes">, defId: string, k: number, ignoreUid = -1): string | null {
  if (!Number.isInteger(k) || k < 0 || k >= GRID * GRID) return "OFF THE DECK";
  const at = beltTile(b, k);
  if (!at) return SPLIT_OFF_BELT;
  for (const p of b.items) {
    if (p.uid !== ignoreUid && coverOf(p).includes(k)) return "OCCUPIED";
  }
  const [ri, ti] = at;
  const cells = b.routes[ri].cells;
  if (ti <= 0 || ti >= cells.length - 1) return SPLIT_NO_BELT;
  for (const nb of [cells[ti - 1], cells[ti + 1]]) {
    if (b.items.some((p) => p.uid !== ignoreUid && isConverterItem(p) && cellKey(p.x, p.y) === nb)) return SPLIT_NO_BELT;
  }
  return null;
}

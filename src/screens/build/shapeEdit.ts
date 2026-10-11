// SHAPES-1 (REQ-BFG-086.2, .4; BRIEF-SHAPES1 S2, S3; ref/pieces1/REPORT.md 5.3 "Rotation and the preview", "The phone UI"):
// the editor's rules for shaped pieces, pure (no DOM, no drawing) so the tests read them directly.
//
// - Turning (S2): a quarter turn turns the footprint around its anchor (x, y stay: the top-left of the turned box). If the
//   turned footprint doesn't fit there, the next turn is tried; if none fits, the piece stays put and the reason shows.
// - The snap (S3): a deck cell is 16-28 CSS px on a phone, under a finger's 44, so a touch drop of a shaped piece snaps its
//   anchor to the nearest legal placement within 1 cell.
// - The carried ghost's tag (S2): `2 HITS`, `IDLE: NO BELT IN REACH`, and `1 ARROW IDLES` when an arrow points at
//   machinery.
//
// Only shaped pieces (foot.ts isShaped: a rig of 2+ cells, a factory not 2x2) take these paths. A 1-cell rig and a 2x2
// factory keep 0.9.9's editor exactly, so with SHAPES off (no shaped piece exists) nothing here runs.

import { ITEMS, rigShape } from "../../sim/content";
import { canPlaceItem, itemByUid, occupancy, rigArrowCells, rotOf, type Build } from "../../sim/deck";
import { beltIndex, hitsIfPlaced } from "../../sim/beltside";
import { footOf, footTurns, isShaped } from "../../sim/foot";

/** A placement the editor may make: an anchor and a rot. */
export interface Spot {
  x: number;
  y: number;
  rot: number;
}

const defOrNull = (defId: string) => (Object.prototype.hasOwnProperty.call(ITEMS, defId) ? ITEMS[defId] : undefined);

/** Is `defId` a shaped piece (a rig of 2+ cells, a factory not 2x2)? The editor's S2/S3 paths are for these only. */
export function shapedPiece(defId: string): boolean {
  const d = defOrNull(defId);
  return !!d && (d.kind === "gate" || d.kind === "factory") && isShaped(d);
}

/** How many different placements quarter turns give a piece of `defId` at one anchor: a rig 4 (an X rig 1, its one cell
 *  faces every side; a shaped X rig's foot turns: footTurns), a factory footTurns (2x2: 1, so it never turns; 2x3 and I3:
 *  2). */
export function turnsOf(defId: string): number {
  const d = defOrNull(defId);
  if (!d) return 1;
  const shape = rigShape(d);
  if (shape && shape !== "X") return 4;
  return footTurns(footOf(d));
}

/** Can a piece of `defId` turn (a ROTATE button, a tap on it selected, R, the wheel)? */
export function canTurn(defId: string): boolean {
  return turnsOf(defId) > 1;
}

/**
 * S2: the turn a placed piece takes: rot + 1, else rot + 2, ... (within turnsOf), the first whose footprint fits at the
 * same anchor (canPlaceItem with the piece itself ignored, so it may stand on its own cells and, for a factory, cover its
 * own belts, which the move drops). None fits: `ok` false and the first turn's reason; the piece stays put.
 */
export function turnFit(b: Build, uid: number): { ok: true; rot: number } | { ok: false; reason: string } {
  const p = itemByUid(b, uid);
  if (!p) return { ok: false, reason: "UNKNOWN" };
  const n = turnsOf(p.def), r0 = rotOf(p);
  if (n <= 1) return { ok: false, reason: "THIS PIECE DOESN'T TURN" };
  let first = "";
  for (let i = 1; i < n; i++) {
    const rot = (r0 + i) % n;
    const chk = canPlaceItem(b, p.def, p.x, p.y, uid, rot);
    if (chk.ok) return { ok: true, rot };
    if (!first) first = chk.reason ?? "CAN'T TURN THERE";
  }
  return { ok: false, reason: first };
}

/**
 * S2, carried: the rot a carried piece takes on R, the wheel or the floating ROTATE button: the next turn whose
 * footprint fits at the anchor it would take there (`anchorAt(rot)`: null when the pointer is off the deck, which
 * accepts any turn); none fits: the rot stays and `reason` says why.
 */
export function carryTurn(b: Build, defId: string, rot: number, anchorAt: (rot: number) => { x: number; y: number } | null, ignoreUid = -1): { rot: number; reason?: string } {
  const n = turnsOf(defId);
  if (n <= 1) return { rot };
  let first = "";
  for (let i = 1; i < n; i++) {
    const r = (rot + i) % n;
    const a = anchorAt(r);
    if (!a) return { rot: r };
    const chk = canPlaceItem(b, defId, a.x, a.y, ignoreUid, r);
    if (chk.ok) return { rot: r };
    if (!first) first = chk.reason ?? "CAN'T TURN THERE";
  }
  return { rot, reason: first };
}

/**
 * S3: a touch drop's anchor: (x, y) when the piece fits there at `rot`, else the nearest legal anchor within 1 cell
 * (each of the 8 neighbours, nearest first: the 4 sides before the 4 corners, then row order), else null (the drop is
 * refused with (x, y)'s reason).
 */
export function snapAnchor(b: Build, defId: string, x: number, y: number, rot: number, ignoreUid = -1): { x: number; y: number } | null {
  if (canPlaceItem(b, defId, x, y, ignoreUid, rot).ok) return { x, y };
  const near: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) near.push([dx, dy]);
  near.sort((a, c) => Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(c[0]) + Math.abs(c[1])) || a[1] - c[1] || a[0] - c[0]);
  for (const [dx, dy] of near) if (canPlaceItem(b, defId, x + dx, y + dy, ignoreUid, rot).ok) return { x: x + dx, y: y + dy };
  return null;
}

/** S2: how many of a rig's arrows at (x, y, rot) point at machinery (a deck cell holding another piece): they idle
 *  (DESIGN-beltside R5). The piece being moved (`ignoreUid`) is not machinery to itself. */
export function machineryArrows(b: Build, defId: string, x: number, y: number, rot: number, ignoreUid = -1): number {
  const occ = occupancy(b);
  return rigArrowCells(defId, x, y, rot).filter((a) => a.to >= 0 && occ[a.to].item >= 0 && occ[a.to].item !== ignoreUid).length;
}

/** S2: the carried ghost's tag: `2 HITS`; with an arrow at machinery `2 HITS · 1 ARROW IDLES`; no hit at all
 *  `IDLE: NO BELT IN REACH`. Words: docs/TEXT-STYLE.md (capitals, a few words, `·` between two notes). */
export function shapeTag(hits: number, atMachinery: number): string {
  if (!hits) return "IDLE: NO BELT IN REACH";
  const h = `${hits} HIT${hits > 1 ? "S" : ""}`;
  return atMachinery ? `${h} · ${atMachinery} ARROW${atMachinery > 1 ? "S IDLE" : " IDLES"}` : h;
}

/**
 * S2 (B1's auto-aim, extended): the rot a carried shaped rig aims itself at: the turn whose placement (its anchor at that
 * turn, `anchorAt`) is legal and makes the most hits; ties keep `prefer`, else the lower rot. No legal turn: `prefer`.
 */
export function aimShaped(b: Build, defId: string, prefer: number, anchorAt: (rot: number) => { x: number; y: number } | null, ignoreUid = -1): number {
  const n = turnsOf(defId);
  const belts = beltIndex(b);
  const order = [prefer % n, ...Array.from({ length: n }, (_, r) => r).filter((r) => r !== prefer % n)];
  let best = { rot: prefer, hits: -1 };
  for (const rot of order) {
    const a = anchorAt(rot);
    if (!a || !canPlaceItem(b, defId, a.x, a.y, ignoreUid, rot).ok) continue;
    const n2 = hitsIfPlaced(b, defId, a.x, a.y, rot, belts).length;
    if (n2 > best.hits) best = { rot, hits: n2 };
  }
  return best.rot;
}

/** S2: a shaped factory's rot as the editor carries it (0 or 1 for a 2x3 or I3: canonical, foot.ts canonicalRot). */
export function carriedRot(defId: string, rot: number | undefined): number {
  const n = turnsOf(defId);
  return (((rot ?? 0) % n) + n) % n;
}

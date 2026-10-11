// Drag feedback and contextual onboarding cues: the lifted item with its shadow, the snap
// preview on deck cells (green on a belt, amber off-belt, red refused), a ghost at the
// suggested drop cell for a selected card, and an arrow at FIGHT once something is placed.

import { GRID, ITEMS } from "../../sim/content";
import { canFitGear, canPlaceItem, defOf, hero, isRig, kx, ky, rigArrows, turretSlots, type Build } from "../../sim/deck";
import { beltIndex, bestSpot, hitsIfPlaced, stokeSpots, stokesIfPlaced } from "../../sim/beltside";
import { C, RARITY_COLOR } from "../../render/palette";
import { bevel, frame, rect, type G } from "../../render/pixel";
import { drawText } from "../../render/font";
import { footX, footY, hullBox, sdir } from "../../render/frame";
import { factorySprite, gateSprite, itemIcon, rigNozzle, rigTip, type ArrowState } from "../../render/sprites";
import { arrowDir } from "../../render/fxsprites";
import { turretPivotX, turretPivotY } from "../../render/cruiser";
import { inside, type Rect } from "../../ui/ui";
import { dropCell, type Carry } from "./actions";
import type { BuildLayout } from "./layout";
import { inCarrier } from "./layout"; // ZOOM-1 (REQ-BFG-080): the carrier's own zoom
// SHAPES-1 (REQ-BFG-086 S2, S3): the shaped ghost, its tag and the floating ROTATE button
import { carryTarget } from "./actions";
import { screenRect } from "./layout";
import { rigArrowCells } from "../../sim/deck";
import { footBox, footprintCells } from "../../sim/foot";
import { boxRect } from "../../render/frame";
import { disc, ring } from "../../render/pixel";
import { canTurn, machineryArrows, shapedPiece, shapeTag, turnsOf } from "./shapeEdit";
import { pieceRect, screenMask, shapedFactorySprite, shapedRigBody } from "../../render/shapeArt"; // SHAPES-1: the ghost's body

/** A deck cell; for a rig, with the rotation it would take there. */
type Cell = { x: number; y: number; rot?: number };

/** Best cell to suggest for a card: 0.6.2 BELTSIDE: for a rig, the free cell beside a belt and the rotation
 *  that land the most arrows on belts (H2, beltside.ts bestSpot), else any free cell; free space for factories. */
export function suggestCell(b: Build, defId: string): Cell | null {
  const def = ITEMS[defId];
  if (def.kind === "gate") {
    // 0.8.0 P1 (E3): a STOKER works factories, so it is suggested beside the most of them
    const s = def.gate?.stoke ? stokeSpots(b, defId)[0] ?? null : bestSpot(b, defId);
    if (s) return { x: s.x, y: s.y, rot: s.rot };
    for (let k = 0; k < GRID * GRID; k++) if (canPlaceItem(b, defId, kx(k), ky(k)).ok) return { x: kx(k), y: ky(k), rot: 0 };
    return null;
  }
  if (def.kind === "factory" && shapedPiece(defId)) {
    // SHAPES-1 (REQ-BFG-086 S2): a shaped factory: the same scan (back rows first) at each of its turns
    for (let y = GRID - 1; y >= 0; y--) for (let x = 0; x < GRID; x++) for (let rot = 0; rot < turnsOf(defId); rot++) {
      if (canPlaceItem(b, defId, x, y, -1, rot).ok) return { x, y, rot };
    }
    return null;
  }
  if (def.kind === "factory") {
    for (let y = GRID - def.size; y >= 0; y--) for (let x = 0; x <= GRID - def.size; x++) if (canPlaceItem(b, defId, x, y).ok) return { x, y };
  }
  return null;
}

/** SHAPES-1 (S2): what a shaped ghost drew: its hits, its arrows at machinery and its box (carrier space). */
export interface ShapeGhost {
  hits: number;
  machinery: number;
  box: Rect;
}

/**
 * SHAPES-1 (REQ-BFG-086 S2; the mock ref/pieces1/img/board-3-rotate-preview.png): a shaped piece's ghost at (x, y) turned
 * `rot`, in the carrier's space: its footprint as one body at `alpha` (70%), its one icon in the middle (never one per
 * cell), the footprint's outline white where it fits and red (blinking) where refused, and for a rig every arrow on each
 * edge it shines from (bright on a hit tile, dim when idle) with its lit hit tiles.
 */
export function drawShapeGhost(g: G, L: BuildLayout, b: Build, defId: string, x: number, y: number, rot: number, ok: boolean, ignoreUid: number, t: number, alpha = 0.7): ShapeGhost {
  const f = L.frame, d = ITEMS[defId];
  const pts = footprintCells(d, x, y, rot).map((k) => ({ x: Math.round(footX(f, kx(k), ky(k))), y: Math.round(footY(f, kx(k), ky(k))) }));
  const at = new Set(pts.map((p) => `${p.x},${p.y}`));
  const bx = footBox(d, rot), box = boxRect(f, x, y, bx.w, bx.h);
  // its body as the deck draws it (render/shapeArt.ts: one body over the turned box), at the ghost's alpha
  g.globalAlpha = alpha;
  const pl = { uid: -1, def: defId, x, y, ...(rot ? { rot } : {}) };
  const pr = pieceRect(L.frame, pl);
  const body = d.kind === "factory" ? shapedFactorySprite(defId, 0, false, 1, pr.w, pr.h) : shapedRigBody(defId, pr.w, pr.h, 0, false, screenMask(L.frame, pl, pr));
  g.drawImage(body, Math.round(pr.x), Math.round(pr.y));
  g.globalAlpha = 1;
  let hits: { dir: number; cell: number; from?: number }[] = [], machinery = 0;
  if (isRig(defId)) {
    hits = ok ? hitsIfPlaced(b, defId, x, y, rot, beltIndex(b)) : [];
    machinery = ok ? machineryArrows(b, defId, x, y, rot, ignoreUid) : 0;
    const pulse = Math.floor(t * 6) % 2 === 1;
    for (const h of hits) {
      const tx = Math.round(footX(f, kx(h.cell), ky(h.cell))), ty = Math.round(footY(f, kx(h.cell), ky(h.cell)));
      g.globalAlpha = 0.3;
      rect(g, tx, ty, 12, 12, C.yellow);
      g.globalAlpha = 1;
      frame(g, tx, ty, 12, 12, pulse ? C.yellow : C.fire4);
      g.drawImage(rigTip(sdir(f, h.dir), 1), tx, ty);
    }
    for (const a of rigArrowCells(defId, x, y, rot)) {
      if (a.from < 0) continue;
      const lit = hits.some((h) => h.dir === a.dir && h.from === a.from);
      g.drawImage(rigNozzle(sdir(f, a.dir), lit ? 1 : 0), Math.round(footX(f, kx(a.from), ky(a.from))), Math.round(footY(f, kx(a.from), ky(a.from))));
    }
  }
  // the footprint's outline: each cell side with no cell of the piece beyond it (the screen's own sides, any facing)
  const col = ok ? C.white : Math.floor(t * 8) % 2 === 1 ? C.red : C.maroon;
  for (const p of pts) {
    if (!at.has(`${p.x},${p.y - 12}`)) rect(g, p.x - 1, p.y - 1, 14, 1, col);
    if (!at.has(`${p.x},${p.y + 12}`)) rect(g, p.x - 1, p.y + 12, 14, 1, col);
    if (!at.has(`${p.x - 12},${p.y}`)) rect(g, p.x - 1, p.y - 1, 1, 14, col);
    if (!at.has(`${p.x + 12},${p.y}`)) rect(g, p.x + 12, p.y - 1, 1, 14, col);
  }
  return { hits: hits.length, machinery, box };
}

/** SHAPES-1 (S2): a shaped ghost's tag above its box: the refusal's reason (red), a rig's `2 HITS` (lime; with an arrow
 *  at machinery `2 HITS · 1 ARROW IDLES`) or `IDLE: NO BELT IN REACH` (amber); a factory that fits has none. */
function drawShapeTag(g: G, defId: string, sg: ShapeGhost, ok: boolean, reason: string | undefined): void {
  const label = !ok ? reason ?? "" : isRig(defId) ? shapeTag(sg.hits, sg.machinery) : "";
  if (!label) return;
  const color = !ok ? C.red : sg.hits ? C.lime : C.amber;
  drawText(g, label, sg.box.x + sg.box.w / 2, sg.box.y - 7, color, { font: "3", align: "center", outline: C.ink });
}

/**
 * SHAPES-1 (REQ-BFG-086 S3): the floating ROTATE button a touch carry shows: a round button at least TAP_CSS (44 CSS
 * px) across (`tap`: TAP_CSS in logical px; drawn 50 CSS px, the mock's), beside the ghost's box (`box`, on screen), on
 * the side away from the finger at `fx` (a finger under the box's middle: the side away from the nearer screen edge),
 * level with the box's middle, kept on screen (`W`). A second finger presses it (game.ts pointerExtra).
 */
export function rotateButtonRect(box: Rect, fx: number, W: number, tap: number): Rect {
  const d = Math.max(tap, Math.ceil((tap * 50) / 44));
  const mid = box.x + box.w / 2;
  const left = fx > mid + 2 || (Math.abs(fx - mid) <= 2 && mid > W / 2);
  const x = Math.max(0, Math.min(W - d, left ? box.x - 4 - d : box.x + box.w + 4));
  const y = Math.max(0, Math.round(box.y + box.h / 2 - d / 2));
  return { x: Math.round(x), y, w: d, h: d };
}

/** SHAPES-1 (S3): the floating ROTATE button drawn: a slate disc with an ink rim and a light ring, ROTATE across it. */
export function drawRotateButton(g: G, r: Rect): void {
  const cx = Math.round(r.x + r.w / 2), cy = Math.round(r.y + r.h / 2), rad = Math.floor(r.w / 2);
  disc(g, cx, cy, rad, C.ink);
  disc(g, cx, cy, rad - 1, C.slate2);
  ring(g, cx, cy, rad - 2, C.slate4);
  drawText(g, "ROTATE", cx, cy - 2, C.white, { font: "3", align: "center", outline: C.ink });
}

function ghostSprite(defId: string, t: number): HTMLCanvasElement {
  const d = ITEMS[defId];
  return d.kind === "factory" ? factorySprite(d.id, Math.floor(t * 6), false) : gateSprite(d.id, 0, false);
}

/**
 * 0.6.2 BELTSIDE (B1): a rig's arrows as they would stand at `cell` at rotation `rot`: for every arrow that
 * would work a belt tile, a bright nozzle and arrowhead, and that tile shaded and pulsing; a dim nozzle for
 * every idle arrow. Returns the number of hits.
 */
export function drawRigPreview(g: G, L: BuildLayout, b: Build, defId: string, cell: Cell, rot: number, t: number): number {
  const f = L.frame;
  // 0.8.0 P1 (E3): a STOKER's arrows work the factories they point at (its belt arrows do nothing)
  const hits: { dir: number; cell: number }[] = ITEMS[defId]?.gate?.stoke
    ? stokesIfPlaced(b, defId, cell.x, cell.y, rot) : hitsIfPlaced(b, defId, cell.x, cell.y, rot, beltIndex(b));
  const pulse = Math.floor(t * 6) % 2 === 1;
  for (const h of hits) {
    const tx = Math.round(footX(f, kx(h.cell), ky(h.cell))), ty = Math.round(footY(f, kx(h.cell), ky(h.cell)));
    g.globalAlpha = 0.3;
    rect(g, tx, ty, 12, 12, C.yellow);
    g.globalAlpha = 1;
    frame(g, tx, ty, 12, 12, pulse ? C.yellow : C.fire4);
    g.drawImage(rigTip(sdir(f, h.dir), 1), tx, ty);
  }
  const x = Math.round(footX(f, cell.x, cell.y)), y = Math.round(footY(f, cell.x, cell.y));
  for (const d of rigArrows(defId, rot)) g.drawImage(rigNozzle(sdir(f, d), hits.some((h) => h.dir === d) ? 1 : 0), x, y);
  return hits.length;
}

/** Ghost of an item at a deck cell with a bracket: lime = works here, amber = inert (a rig: IDLE, no arrow
 *  reaches a belt), red = refused. A rig shows its arrows at `cell.rot` (drawRigPreview). */
export function drawGhostAt(g: G, L: BuildLayout, b: Build, defId: string, cell: Cell, ignoreUid: number, t: number, alpha = 0.75, lift = 0): boolean {
  if (shapedPiece(defId)) { // SHAPES-1 (REQ-BFG-086 S2): its whole footprint, outlined, with its arrows and tag
    const rot = cell.rot ?? 0;
    const chk = canPlaceItem(b, defId, cell.x, cell.y, ignoreUid, rot);
    drawShapeTag(g, defId, drawShapeGhost(g, L, b, defId, cell.x, cell.y, rot, chk.ok, ignoreUid, t, alpha), chk.ok, chk.reason);
    return chk.ok;
  }
  const d = ITEMS[defId];
  const ok = canPlaceItem(b, defId, cell.x, cell.y, ignoreUid).ok;
  const x = Math.round(footX(L.frame, cell.x, cell.y, d.size)), y = Math.round(footY(L.frame, cell.x, cell.y, d.size));
  const s = d.size * 12;
  if (lift > 0) {
    // lifted over the snap cell: contact shadow on the deck, item hovering above it
    g.globalAlpha = 0.55;
    rect(g, x + 1, y + 2, s - 1, s - 2, C.ink);
    g.globalAlpha = 1;
  }
  g.globalAlpha = alpha;
  g.drawImage(ghostSprite(defId, t), x, y - lift);
  g.globalAlpha = 1;
  const works = !isRig(defId) || (ok && drawRigPreview(g, L, b, defId, cell, cell.rot ?? 0, t) > 0);
  const blink = Math.floor(t * 8) % 2 === 1;
  const col = !ok ? (blink ? C.red : C.maroon) : works ? C.lime : C.amber;
  frame(g, x - 1, y - 1, s + 2, s + 2, col);
  // corner ticks make the snap read as a bracket
  rect(g, x - 2, y - 2, 3, 1, col); rect(g, x - 2, y - 2, 1, 3, col);
  rect(g, x + s - 1, y + s + 1, 3, 1, col); rect(g, x + s + 1, y + s - 1, 1, 3, col);
  return ok;
}

/** Lifted item tile (logical px): the 12 px icon at 2x, a 2 px rarity strip, bevel and outline. */
export const LIFT_W = 28;
export const LIFT_H = 30;

/** 0.6.2 BELTSIDE: a rig's arrows on the lifted tile (screen dirs and looks) and the label above it. */
interface LiftedArrows {
  dirs: number[];
  states: ArrowState[];
  label: string;
  color: string;
}

/** The arrows a lifted rig shows for `cell` (or, off the deck, all dim at its rotation): "2 HITS", "IDLE" or
 *  why the cell is refused. */
function liftedArrows(L: BuildLayout, b: Build, c: Carry, cell: Cell | null): LiftedArrows {
  const rot = cell?.rot ?? c.rot ?? 0;
  const dirs = rigArrows(c.def, rot);
  const chk = cell ? canPlaceItem(b, c.def, cell.x, cell.y, c.src.from === "deck" ? c.uid : -1) : null;
  const stoker = !!ITEMS[c.def]?.gate?.stoke; // 0.8.0 P1 (E3): its hits are the factories its arrows work
  const hits: { dir: number }[] = !cell || !chk?.ok ? []
    : stoker ? stokesIfPlaced(b, c.def, cell.x, cell.y, rot) : hitsIfPlaced(b, c.def, cell.x, cell.y, rot, beltIndex(b));
  const states = dirs.map((d): ArrowState => (hits.some((h) => h.dir === d) ? 1 : 0));
  const sd = dirs.map((d) => sdir(L.frame, d));
  if (!cell) return { dirs: sd, states, label: "", color: C.slate4 };
  if (!chk?.ok) return { dirs: sd, states, label: chk?.reason ?? "", color: C.red };
  return hits.length ? { dirs: sd, states, label: `${hits.length} HIT${hits.length > 1 ? "S" : ""}`, color: C.lime } : { dirs: sd, states, label: "IDLE", color: C.amber };
}

/** The picked-up item at 2x: a bolted tile (1 px ink outline, bevel, rarity strip) with the
 *  icon doubled, hovering `lift` px above the contact point (x, y), which gets an ink shadow.
 *  0.6.2 BELTSIDE: a rig shows its arrows at 2x on the tile, and its hits (or IDLE) above it. */
export function drawLifted(g: G, defId: string, x: number, y: number, lift: number, alpha = 1, arrows?: LiftedArrows): void {
  const ix = Math.round(x - LIFT_W / 2), iy = Math.round(y - lift - LIFT_H);
  // contact shadow on the ground under the item (tighter and darker than the tile)
  g.globalAlpha = 0.5 * alpha;
  rect(g, Math.round(x - 9), Math.round(y - 1), 18, 3, C.ink);
  rect(g, Math.round(x - 6), Math.round(y - 2), 12, 5, C.ink);
  g.globalAlpha = alpha;
  bevel(g, ix, iy, LIFT_W, LIFT_H, C.slate1, C.slate3, C.slate0, C.ink);
  rect(g, ix + 2, iy + LIFT_H - 4, LIFT_W - 4, 2, RARITY_COLOR[ITEMS[defId].rarity] ?? C.slate3);
  const icon = itemIcon(defId);
  g.drawImage(icon, 0, 0, icon.width, icon.height, ix + 2, iy + 2, icon.width * 2, icon.height * 2);
  if (arrows) {
    arrows.dirs.forEach((d, k) => g.drawImage(rigNozzle(d, arrows.states[k]), 0, 0, 12, 12, ix + 2, iy + 2, 24, 24));
    if (arrows.label) drawText(g, arrows.label, x, iy - 7, arrows.color, { font: "3", align: "center", outline: C.ink });
  }
  g.globalAlpha = 1;
}

/** Carried item: the 2x lifted tile above the pointer; over the deck it hovers above the snap
 *  cell, which keeps its bracket and a faint 1x ghost of the exact footprint. 0.6.2 BELTSIDE (B1): a
 *  carried rig shows its arrows at the snap cell (drawRigPreview) at the rotation the editor aims it to,
 *  and hovers one cell higher, so the tile its forward arrow would work stays in sight. */
export function drawCarry(g: G, L: BuildLayout, b: Build, c: Carry, px: number, py: number, t: number, turretAt: (x: number, y: number) => number, screen?: { W: number; tap: number }): Rect | null {
  const def = ITEMS[c.def];
  const bob = Math.floor(t * 4) % 2;
  const lift = Math.min(8, Math.round(3 + 30 * Math.min(0.15, t)));
  const rig = isRig(c.def);
  // SHAPES-1 (REQ-BFG-086 S2, S3): a shaped piece over the deck: its ghost (70%, white frame; red and the reason where
  // refused) where carryTarget says it lands (above a finger), its tag, and on touch the floating ROTATE button (returned:
  // the screen registers it as a target a second finger presses)
  if (shapedPiece(c.def) && inside(L.hull, px, py)) {
    const tg = carryTarget(L, b, c, px, py);
    if (tg) {
      let sg: ShapeGhost | null = null;
      inCarrier(g, L, () => {
        sg = drawShapeGhost(g, L, b, c.def, tg.x, tg.y, tg.rot, tg.ok, c.src.from === "deck" ? c.uid : -1, t, 0.7);
        drawShapeTag(g, c.def, sg, tg.ok, tg.reason);
      });
      if (c.touch && screen && sg && canTurn(c.def)) {
        const r = rotateButtonRect(screenRect(L, (sg as ShapeGhost).box), px, screen.W, screen.tap);
        drawRotateButton(g, r);
        return r;
      }
      return null;
    }
  }
  // ZOOM-1 (REQ-BFG-080): what snaps to the deck (the ghost, the lifted tile over its cell, the turret brackets) draws in
  // the carrier's space at its zoom (inCarrier); the tile under the pointer, off the deck, at the UI's scale
  if ((def.kind === "gate" || def.kind === "factory") && inside(L.hull, px, py)) {
    const cell = dropCell(L, px, py, def.size);
    if (cell) {
      const at: Cell = rig ? { ...cell, rot: c.rot ?? 0 } : cell;
      inCarrier(g, L, () => {
        drawGhostAt(g, L, b, c.def, at, c.src.from === "deck" ? c.uid : -1, t, 0.55);
        const half = (def.size * 12) / 2;
        drawLifted(g, c.def, footX(L.frame, cell.x, cell.y, def.size) + half, footY(L.frame, cell.x, cell.y, def.size) + half,
          half + 4 + bob + (rig ? 12 : 0), 1, rig ? liftedArrows(L, b, c, at) : undefined);
      });
      return null;
    }
  }
  if (def.kind === "mod" || def.kind === "core") {
    const ti = turretAt(px, py);
    if (ti >= 0) {
      const s = turretSlots(b)[ti]; // 0.6.2s (REQ-BFG-031 S9): the build's slot
      const x = Math.round(turretPivotX(L.frame, s.col0, s.width)), y = Math.round(turretPivotY(L.frame, s.col0, s.width));
      // 0.6.1b: gear needs a free hardpoint; a core always fits its socket (a bought core there swaps to cargo).
      // 0.6.2s (S4): a free GEAR SLOT and no second copy of the def; an empty slot takes neither
      const taken = !s.turret || (def.kind === "mod" && !canFitGear(b, ti, c.def, c.uid).ok);
      inCarrier(g, L, () => frame(g, x - 13, y - 13, 26, 26, taken ? C.red : C.lime));
    }
  }
  if (def.kind === "turret") {
    // 0.6.2s (REQ-BFG-031 S5, S10): every TURRET SLOT is a target (amber brackets); the one under the pointer shows
    // what the drop does: lime installs in an empty slot, yellow swaps with the turret there
    const ti = turretAt(px, py);
    inCarrier(g, L, () => turretSlots(b).forEach((s, i) => {
      const x = Math.round(turretPivotX(L.frame, s.col0, s.width)), y = Math.round(turretPivotY(L.frame, s.col0, s.width));
      const here = i === ti;
      frame(g, x - 13, y - 13, 26, 26, here ? (s.turret && !(c.src.from === "mount" && c.src.index === i) ? C.yellow : C.lime) : C.amber);
      if (here) frame(g, x - 14, y - 14, 28, 28, C.ink);
    }));
  }
  if (def.kind === "supply" && inside(L.hull, px, py)) frame(g, L.hull.x - 2, L.hull.y - 2, L.hull.w + 4, L.hull.h + 4, C.lime);
  // lifted: the 2x tile above the pointer, contact shadow under the pointer
  drawLifted(g, c.def, px, py, 4 + lift + bob, 1, rig ? liftedArrows(L, b, c, null) : undefined);
  return null;
}

/** Ghost preview + bouncing arrow at the suggested cell for the selected card / cargo item. */
export function drawSuggestion(g: G, L: BuildLayout, b: Build, defId: string, t: number): void {
  const def = ITEMS[defId];
  if (def.kind === "mod" || def.kind === "core") {
    const h = hero(b); // 0.6.2s (REQ-BFG-031 S9): the build's slots; an empty one takes no gear or core
    // 0.6.1b: gear goes to a free hardpoint, a core to a turret still on its signature core. 0.6.2s (S4): a turret
    // with a free GEAR SLOT and no copy of this gear yet
    const ti = h.turrets.findIndex((tt, i) => !tt.empty && (def.kind === "core"
      ? !b.mods.some((m) => m.turret === i && ITEMS[m.def]?.kind === "core")
      : canFitGear(b, i, defId).ok));
    if (ti < 0) return;
    const td = h.turrets[ti];
    const x = Math.round(turretPivotX(L.frame, td.col0, td.width)), y = Math.round(turretPivotY(L.frame, td.col0, td.width));
    if (Math.floor(t * 4) % 2) frame(g, x - 13, y - 13, 26, 26, C.amber);
    drawLifted(g, defId, x, y, 15 + hoverBob(t), 0.92);
    return;
  }
  if (def.kind === "supply") {
    // ZOOM-1 (REQ-BFG-080): drawn in the carrier's space (chrome.ts inCarrier): the hull box there, not L.hull (on screen)
    const hb = hullBox(L.frame);
    if (Math.floor(t * 3) % 2) frame(g, hb.x - 2, hb.y - 2, hb.w + 4, hb.h + 4, C.amber);
    return;
  }
  const cell = suggestCell(b, defId);
  if (!cell) return;
  const pulse = 0.35 + 0.25 * Math.sin(t * 6);
  drawGhostAt(g, L, b, defId, cell, -1, t, pulse);
  if (shapedPiece(defId)) return; // SHAPES-1 (S2): a shaped ghost is its own preview (its body, arrows and tag)
  // the selected item is "picked up": the same 2x lifted tile bobs over the suggested cell (0.6.2: a rig with
  // its arrows, one cell higher)
  const half = (def.size * 12) / 2;
  const rig = isRig(defId);
  drawLifted(g, defId, footX(L.frame, cell.x, cell.y, def.size) + half, footY(L.frame, cell.x, cell.y, def.size) + half,
    half + 4 + hoverBob(t) + (rig ? 12 : 0), 0.92, rig ? liftedArrows(L, b, { src: { from: "cell", k: -1 }, def: defId, uid: -1, rot: cell.rot }, cell) : undefined);
}

/** 0-3 px bob of a hovering tile (it dips toward its drop point). */
function hoverBob(t: number): number {
  return 3 - Math.round(Math.abs(Math.sin(t * 5)) * 3);
}

/** Chunky arrow pointing in screen dir, bobbing toward its target at (x, y). */
export function drawArrowAt(g: G, x: number, y: number, dir: number, t: number): void {
  const a = arrowDir(C.yellow, dir);
  const bob = Math.round(Math.abs(Math.sin(t * 5)) * 3);
  const dx = dir === 1 ? -bob : dir === 3 ? bob : 0, dy = dir === 2 ? -bob : dir === 0 ? bob : 0;
  const ox = dir === 1 ? -a.width : dir === 3 ? 0 : -a.width / 2;
  const oy = dir === 2 ? -a.height : dir === 0 ? 0 : -a.height / 2;
  g.drawImage(a, Math.round(x + ox + dx), Math.round(y + oy + dy));
}

/** Arrow at FIGHT (beside it in landscape, above it in portrait). */
export function drawFightCue(g: G, r: Rect, portrait: boolean, t: number): void {
  if (portrait) drawArrowAt(g, r.x + r.w / 2, r.y - 2, 2, t);
  else drawArrowAt(g, r.x + r.w / 2, r.y - 2, 2, t);
}

export function defKind(defId: string): string {
  return defOf({ def: defId }).kind;
}

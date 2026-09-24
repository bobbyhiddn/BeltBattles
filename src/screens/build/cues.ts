// Drag feedback and contextual onboarding cues: the lifted item with its shadow, the snap
// preview on deck cells (green on a belt, amber off-belt, red refused), a ghost at the
// suggested drop cell for a selected card, and an arrow at FIGHT once something is placed.

import { GRID, HEROES, ITEMS } from "../../sim/content";
import { canPlaceItem, defOf, key, kx, ky, occupancy, type Build } from "../../sim/deck";
import { C, RARITY_COLOR } from "../../render/palette";
import { bevel, frame, rect, type G } from "../../render/pixel";
import { footX, footY } from "../../render/frame";
import { factorySprite, gateSprite, itemIcon } from "../../render/sprites";
import { arrowDir } from "../../render/fxsprites";
import { turretPivotX, turretPivotY } from "../../render/cruiser";
import { inside, type Rect } from "../../ui/ui";
import { dropCell, type Carry } from "./actions";
import type { BuildLayout } from "./layout";

type Cell = { x: number; y: number };

/** Best cell to suggest for a card: a free belt tile mid-route for gates, free space for factories. */
export function suggestCell(b: Build, defId: string): Cell | null {
  const def = ITEMS[defId];
  if (def.kind === "gate") {
    const occ = occupancy(b);
    for (const r of b.routes) {
      for (let i = Math.floor(r.cells.length / 2); i < r.cells.length + Math.floor(r.cells.length / 2); i++) {
        const k = r.cells[i % r.cells.length];
        if (occ[k].item < 0) return { x: kx(k), y: ky(k) };
      }
    }
    for (let k = 0; k < GRID * GRID; k++) if (canPlaceItem(b, defId, kx(k), ky(k)).ok) return { x: kx(k), y: ky(k) };
    return null;
  }
  if (def.kind === "factory") {
    for (let y = GRID - def.size; y >= 0; y--) for (let x = 0; x <= GRID - def.size; x++) if (canPlaceItem(b, defId, x, y).ok) return { x, y };
  }
  return null;
}

function ghostSprite(defId: string, t: number): HTMLCanvasElement {
  const d = ITEMS[defId];
  return d.kind === "factory" ? factorySprite(d.id, Math.floor(t * 6), false) : gateSprite(d.id, 0, false);
}

/** Ghost of an item at a deck cell with a bracket: lime = works here, amber = inert, red = refused. */
export function drawGhostAt(g: G, L: BuildLayout, b: Build, defId: string, cell: Cell, ignoreUid: number, t: number, alpha = 0.75, lift = 0): boolean {
  const d = ITEMS[defId];
  const ok = canPlaceItem(b, defId, cell.x, cell.y, ignoreUid).ok;
  const belt = d.kind !== "gate" || occupancy(b)[key(cell.x, cell.y)].route >= 0;
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
  const blink = Math.floor(t * 8) % 2 === 1;
  const col = !ok ? (blink ? C.red : C.maroon) : belt ? C.lime : C.amber;
  frame(g, x - 1, y - 1, s + 2, s + 2, col);
  // corner ticks make the snap read as a bracket
  rect(g, x - 2, y - 2, 3, 1, col); rect(g, x - 2, y - 2, 1, 3, col);
  rect(g, x + s - 1, y + s + 1, 3, 1, col); rect(g, x + s + 1, y + s - 1, 1, 3, col);
  return ok;
}

/** Lifted item tile (logical px): the 12 px icon at 2x, a 2 px rarity strip, bevel and outline. */
export const LIFT_W = 28;
export const LIFT_H = 30;

/** The picked-up item at 2x: a bolted tile (1 px ink outline, bevel, rarity strip) with the
 *  icon doubled, hovering `lift` px above the contact point (x, y), which gets an ink shadow. */
export function drawLifted(g: G, defId: string, x: number, y: number, lift: number, alpha = 1): void {
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
  g.globalAlpha = 1;
}

/** Carried item: the 2x lifted tile above the pointer; over the deck it hovers above the snap
 *  cell, which keeps its bracket and a faint 1x ghost of the exact footprint. */
export function drawCarry(g: G, L: BuildLayout, b: Build, c: Carry, px: number, py: number, t: number, turretAt: (x: number, y: number) => number): void {
  const def = ITEMS[c.def];
  const bob = Math.floor(t * 4) % 2;
  const lift = Math.min(8, Math.round(3 + 30 * Math.min(0.15, t)));
  if ((def.kind === "gate" || def.kind === "factory") && inside(L.hull, px, py)) {
    const cell = dropCell(L, px, py, def.size);
    if (cell) {
      drawGhostAt(g, L, b, c.def, cell, c.src.from === "deck" ? c.uid : -1, t, 0.55);
      const half = (def.size * 12) / 2;
      drawLifted(g, c.def, footX(L.frame, cell.x, cell.y, def.size) + half, footY(L.frame, cell.x, cell.y, def.size) + half, half + 4 + bob);
      return;
    }
  }
  if (def.kind === "mod" || def.kind === "core") {
    const ti = turretAt(px, py);
    if (ti >= 0) {
      const td = HEROES[b.hero].turrets[ti];
      const x = Math.round(turretPivotX(L.frame, td.col0, td.width)), y = Math.round(turretPivotY(L.frame, td.col0, td.width));
      // 0.6.1b: gear needs a free hardpoint; a core always fits its socket (a bought core there swaps to cargo)
      const taken = def.kind === "mod" && b.mods.some((m) => m.turret === ti && m.uid !== c.uid && ITEMS[m.def]?.kind !== "core");
      frame(g, x - 13, y - 13, 26, 26, taken ? C.red : C.lime);
    }
  }
  if (def.kind === "supply" && inside(L.hull, px, py)) frame(g, L.hull.x - 2, L.hull.y - 2, L.hull.w + 4, L.hull.h + 4, C.lime);
  // lifted: the 2x tile above the pointer, contact shadow under the pointer
  drawLifted(g, c.def, px, py, 4 + lift + bob);
}

/** Ghost preview + bouncing arrow at the suggested cell for the selected card / cargo item. */
export function drawSuggestion(g: G, L: BuildLayout, b: Build, defId: string, t: number): void {
  const def = ITEMS[defId];
  if (def.kind === "mod" || def.kind === "core") {
    const h = HEROES[b.hero];
    // 0.6.1b: gear goes to a free hardpoint, a core to a turret still on its signature core
    const ti = h.turrets.findIndex((_, i) => !b.mods.some((m) => m.turret === i && (ITEMS[m.def]?.kind === "core") === (def.kind === "core")));
    if (ti < 0) return;
    const td = h.turrets[ti];
    const x = Math.round(turretPivotX(L.frame, td.col0, td.width)), y = Math.round(turretPivotY(L.frame, td.col0, td.width));
    if (Math.floor(t * 4) % 2) frame(g, x - 13, y - 13, 26, 26, C.amber);
    drawLifted(g, defId, x, y, 15 + hoverBob(t), 0.92);
    return;
  }
  if (def.kind === "supply") {
    if (Math.floor(t * 3) % 2) frame(g, L.hull.x - 2, L.hull.y - 2, L.hull.w + 4, L.hull.h + 4, C.amber);
    return;
  }
  const cell = suggestCell(b, defId);
  if (!cell) return;
  const pulse = 0.35 + 0.25 * Math.sin(t * 6);
  drawGhostAt(g, L, b, defId, cell, -1, t, pulse);
  // the selected item is "picked up": the same 2x lifted tile bobs over the suggested cell
  const half = (def.size * 12) / 2;
  drawLifted(g, defId, footX(L.frame, cell.x, cell.y, def.size) + half, footY(L.frame, cell.x, cell.y, def.size) + half, half + 4 + hoverBob(t), 0.92);
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

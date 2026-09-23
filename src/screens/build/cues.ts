// Drag feedback and contextual onboarding cues: the lifted item with its shadow, the snap
// preview on deck cells (green on a belt, amber off-belt, red refused), a ghost at the
// suggested drop cell for a selected card, and an arrow at FIGHT once something is placed.

import { GRID, HEROES, ITEMS } from "../../sim/content";
import { canPlaceItem, defOf, key, kx, ky, occupancy, type Build } from "../../sim/deck";
import { C } from "../../render/palette";
import { frame, rect, type G } from "../../render/pixel";
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

/** Carried item: snapped to the deck when over it, otherwise lifted under the pointer. */
export function drawCarry(g: G, L: BuildLayout, b: Build, c: Carry, px: number, py: number, t: number, turretAt: (x: number, y: number) => number): void {
  const def = ITEMS[c.def];
  if ((def.kind === "gate" || def.kind === "factory") && inside(L.hull, px, py)) {
    const cell = dropCell(L, px, py, def.size);
    if (cell) {
      drawGhostAt(g, L, b, c.def, cell, c.src.from === "deck" ? c.uid : -1, t, 1, 3 + (Math.floor(t * 4) % 2));
      return;
    }
  }
  if (def.kind === "mod") {
    const ti = turretAt(px, py);
    if (ti >= 0) {
      const td = HEROES[b.hero].turrets[ti];
      const x = Math.round(turretPivotX(L.frame, td.col0, td.width)), y = Math.round(turretPivotY(L.frame, td.col0, td.width));
      const taken = b.mods.some((m) => m.turret === ti && m.uid !== c.uid);
      frame(g, x - 13, y - 13, 26, 26, taken ? C.red : C.lime);
    }
  }
  if (def.kind === "supply" && inside(L.hull, px, py)) frame(g, L.hull.x - 2, L.hull.y - 2, L.hull.w + 4, L.hull.h + 4, C.lime);
  // lifted: raised above the pointer, shadow on the ground below it
  const bob = Math.floor(t * 4) % 2;
  const lift = Math.min(8, Math.round(c ? 3 + 30 * Math.min(0.15, t) : 0));
  g.globalAlpha = 0.5;
  rect(g, Math.round(px - 5), Math.round(py + 2), 10, 3, C.ink);
  g.globalAlpha = 1;
  const ix = Math.round(px - 6), iy = Math.round(py - 6 - lift - bob);
  rect(g, ix - 2, iy - 2, 16, 16, C.ink);
  rect(g, ix - 1, iy - 1, 14, 14, C.slate1);
  g.drawImage(itemIcon(c.def), ix, iy);
}

/** Ghost preview + bouncing arrow at the suggested cell for the selected card / cargo item. */
export function drawSuggestion(g: G, L: BuildLayout, b: Build, defId: string, t: number): void {
  const def = ITEMS[defId];
  if (def.kind === "mod") {
    const h = HEROES[b.hero];
    const ti = h.turrets.findIndex((_, i) => !b.mods.some((m) => m.turret === i));
    if (ti < 0) return;
    const td = h.turrets[ti];
    const x = Math.round(turretPivotX(L.frame, td.col0, td.width)), y = Math.round(turretPivotY(L.frame, td.col0, td.width));
    if (Math.floor(t * 4) % 2) frame(g, x - 13, y - 13, 26, 26, C.amber);
    drawArrowAt(g, x, y - 16, 2, t);
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
  const x = footX(L.frame, cell.x, cell.y, def.size) + (def.size * 12) / 2;
  const y = footY(L.frame, cell.x, cell.y, def.size);
  drawArrowAt(g, x, y - 6, 2, t);
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

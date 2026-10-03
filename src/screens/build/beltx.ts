// shoptap (D3, REQ-BFG-036): the belt X. A touch tap on a belt selects it and puts up an X button on that belt, beside
// the tile tapped (edit.ts Editor.beltX). A tap on the X removes the whole belt through REMOVE BELT's own path
// (actions.ts deleteRoute); any other press takes the X down, and that press then does what it would have done. A mouse
// never sees it.
//
// The X is a button as big as its tap target: at least TAP_CSS (44) CSS px square (beltXSide). It sits beside the tapped
// tile, never on it (a second tap there must not remove the belt), fully on screen, clear of the details panel, the shop,
// the cargo tray, FIGHT, the top bar and the next-battle card; of the places that allows (placeBeltX), the one that
// covers least: no turret, then no other part, then fewer other belts' tiles; this belt's own tiles are free to cover.

import { defOf, kx, ky, type Build } from "../../sim/deck";
import { footX, footY } from "../../render/frame";
import { C } from "../../render/palette";
import { frame, type G } from "../../render/pixel";
import { button, type Rect } from "../../ui/ui";
import { TAP_CSS } from "../../ui/tap";
import type { BuildLayout } from "./layout";
import type { BeltX } from "./edit";

/** The X's side in logical px: a TAP_CSS CSS px target (`cssPerPx`: the view's CSS px per logical px), at least 14. */
export function beltXSide(cssPerPx: number): number {
  return Math.max(14, Math.ceil(TAP_CSS / cssPerPx));
}

const hits = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Where the X goes for belt X `x`: a `side` px square beside the tapped tile, in screen (logical) px. Candidates: one
 * step out from the tile's centre (above, right, left, below, then the diagonals), then a second ring further out. A
 * candidate must lie on screen (under the top bar) and clear of every panel and control of the layout; of those, the one
 * with the lowest cost wins (a turret 100, another part 10, another belt's tile 1; this belt's own tiles 0), ties in that
 * order. Null only when none fits (never on the phone views). `turrets`: the TURRET SLOTS' hit boxes. Pure (tests).
 */
export function placeBeltX(L: BuildLayout, b: Build, x: BeltX, side: number, turrets: readonly Rect[]): Rect | null {
  const f = L.frame;
  const tx = Math.round(footX(f, kx(x.cell), ky(x.cell))), ty = Math.round(footY(f, kx(x.cell), ky(x.cell)));
  const tile: Rect = { x: tx, y: ty, w: 12, h: 12 };
  const cx = tx + 6, cy = ty + 6;
  const d1 = 6 + Math.ceil(side / 2) + 1, d2 = d1 + Math.ceil(side / 2);
  const dirs: [number, number][] = [[0, -1], [1, 0], [-1, 0], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];
  const keep: Rect[] = [L.bar, L.info, L.cargo, L.fight, L.reroll, ...L.cards, ...(L.foe ? [L.foe] : [])];
  const items = b.items.map((p) => {
    const s = defOf(p).size;
    return { x: Math.round(footX(f, p.x, p.y, s)), y: Math.round(footY(f, p.x, p.y, s)), w: s * 12, h: s * 12 };
  });
  const tiles = b.routes.flatMap((r, i) => (i === x.index ? [] : r.cells.map((k) => ({ x: Math.round(footX(f, kx(k), ky(k))), y: Math.round(footY(f, kx(k), ky(k))), w: 12, h: 12 }))));
  let best: Rect | null = null, bestCost = Infinity;
  for (const d of [d1, d2]) {
    for (const [ux, uy] of dirs) {
      const r: Rect = { x: Math.round(cx + ux * d - side / 2), y: Math.round(cy + uy * d - side / 2), w: side, h: side };
      if (r.x < 0 || r.y < L.bar.h || r.x + r.w > L.W || r.y + r.h > L.H || hits(r, tile) || keep.some((k) => hits(r, k))) continue;
      // the far ring only where it covers strictly less than the best near place
      const cost = turrets.filter((t) => hits(r, t)).length * 100 + items.filter((t) => hits(r, t)).length * 10
        + tiles.filter((t) => hits(r, t)).length + (d === d2 ? 0.5 : 0);
      if (cost < bestCost) {
        best = r;
        bestCost = cost;
      }
    }
  }
  return best;
}

/** Draw the X (a danger button, its own tap target) and ring the tapped tile in red; `onTap` removes the belt. */
export function drawBeltX(g: G, ui: Parameters<typeof button>[0], L: BuildLayout, x: BeltX, r: Rect, onTap: () => void): void {
  const f = L.frame;
  frame(g, Math.round(footX(f, kx(x.cell), ky(x.cell))), Math.round(footY(f, kx(x.cell), ky(x.cell))), 12, 12, C.red);
  button(ui, g, "beltx", r, "X", { danger: true, onTap });
}

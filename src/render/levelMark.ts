// bb-0.8.3 (REQ-BFG-043 D11): the board's level marks. The hero's FACTORY level shows on its signature factory and its
// TURRET SPEED level on each starting turret (an installed turret holding the free starting copy, BuildTurret.free), from
// level 2 up: the level's numeral (ui/upgradeText.ts levelMark) in the 3x5 face, yellow on a 5x7 ink plate, as the
// board writes its other small numbers (a selected belt's tile numbers, yellow 3x5 on ink). Level 1 draws nothing, so a
// deck without upgrades draws exactly as before.
//  - The factory: where a bought factory's star pips go, its sprite's bottom-left corner, 1 px in (a signature factory
//    has no stars, so nothing else is drawn there).
//  - A turret: just off the bow edge at the head of its chamber-pip column, beside the barrel and clear of the gun's
//    base (the gun's other side holds its gear boxes, its core's pips and FOUNDRY's SYNC mark). It turns with the hull's
//    facing as every turret-local mark does; the numeral stays upright.
// One source for where a mark goes (levelMarks): cruiser.ts and machinery.ts draw from it, and the build screen's tooling
// (BuildScreen.levelMarks, scripts/touchcheck.mjs) and tests/belts.marker.test.ts read it.

import { CELL, type UpgradeTrack } from "../sim/content";
import { defOf, hero, turretSlots, type Build } from "../sim/deck";
import { isSignatureFactory, upgradeLevel } from "../sim/stars";
import { levelMark } from "../ui/upgradeText";
import { C } from "./palette";
import { rect, type G } from "./pixel";
import { drawText } from "./font";
import { TURRET_LY, footX, footY, sx, sy, type DeckFrame } from "./frame";
import { pipColumn } from "./raceArt";

/** A level mark's plate, screen px: the 3x5 numeral and a 1 px ink margin. */
export const MARK_W = 5, MARK_H = 7;
/** A turret's plate, turret-local (u across, v along the bow axis, forward = -v): ahead of the head of its chamber-pip
 *  column, its forward edge at v = -14 and its foot two rows off the bow edge (v = -5; the first pip's top is at -4), so
 *  clear of every gun's base, brackets and barrels and of a neighbouring gun's in the next slot. With the bow up or
 *  down it is 5 across from the pips' first column (u = pip column, outside the build screen's selection frame round the
 *  gun) and 7 along; with the bow sideways 7 across, centred on the 4 px pips (u = pip column - 1), and 5 along. */
const TURRET_MARK_V = -14;

export interface LevelMark {
  track: UpgradeTrack;
  level: number;
  text: string; // the numeral drawn
  x: number; // the plate's top-left, screen px
  y: number;
  w: number;
  h: number;
  uid?: number; // FACTORY: the signature factory's uid
  slot?: number; // TURRET SPEED: the starting turret's slot
}

const NONE: readonly LevelMark[] = [];

/** A turret-local rect (u, v, w across, h along) on screen for pivot (px, py), as cruiser.ts maps the gun's marks (its
 *  chamber pips, gear boxes, core socket), so the plate lands on the same pixel grid as the art for every facing. */
function onScreen(f: DeckFrame, px: number, py: number, u: number, v: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  switch (f.facing) {
    case 0: return { x: px + u, y: py + v, w, h };
    case 2: return { x: px + u, y: py - v - h, w, h };
    case 1: return { x: px - v - h, y: py + u, w: h, h: w };
    default: return { x: px + v, y: py + u, w: h, h: w };
  }
}

/** Every level mark build `b` shows on frame `f` (none at level 1 on both tracks); `hideItem`: a part lifted off the deck
 *  (the build screen's carry), which draws no mark. */
export function levelMarks(b: Build, f: DeckFrame, hideItem = -1): readonly LevelMark[] {
  const fl = upgradeLevel(b, "factory"), tl = upgradeLevel(b, "turret");
  if (fl < 2 && tl < 2) return NONE;
  const out: LevelMark[] = [];
  if (fl >= 2) {
    for (const p of b.items) {
      if (p.uid === hideItem || !isSignatureFactory(p.def)) continue;
      const size = defOf(p).size;
      const x = Math.round(footX(f, p.x, p.y, size)), y = Math.round(footY(f, p.x, p.y, size));
      out.push({ track: "factory", level: fl, text: levelMark(fl), uid: p.uid, x: x + 1, y: y + size * CELL - 1 - MARK_H, w: MARK_W, h: MARK_H });
    }
  }
  if (tl >= 2) {
    const h = hero(b);
    // upright on screen: 5 across and 7 along the bow axis with the bow up or down, 7 across and 5 along with it sideways
    const side = f.facing === 1 || f.facing === 3, lw = side ? MARK_H : MARK_W, lh = side ? MARK_W : MARK_H, du = side ? -1 : 0;
    turretSlots(b).forEach((s, i) => {
      const td = h.turrets[i];
      if (!s.turret?.free || !td || td.empty) return;
      // the pivot as drawTurrets rounds it (cruiser.ts turretPivotX / turretPivotY)
      const lx = (td.col0 + td.width / 2) * CELL, px = Math.round(sx(f, lx, TURRET_LY)), py = Math.round(sy(f, lx, TURRET_LY));
      const r = onScreen(f, px, py, pipColumn(td.kind, h.faction) + du, TURRET_MARK_V, lw, lh);
      out.push({ track: "turret", level: tl, text: levelMark(tl), slot: i, ...r });
    });
  }
  return out;
}

/** Draw one mark: its ink plate, then its numeral (yellow, the 3x5 face). */
export function drawLevelMark(g: G, m: LevelMark): void {
  if (!m.text) return;
  rect(g, m.x, m.y, m.w, m.h, C.ink);
  drawText(g, m.text, m.x + 1, m.y + 1, C.yellow, { font: "3" });
}

/** Draw the marks of `track` that build `b` shows on frame `f` (cruiser.ts: TURRET SPEED; machinery.ts: FACTORY). */
export function drawLevelMarks(g: G, b: Build, f: DeckFrame, track: UpgradeTrack, hideItem = -1): void {
  const list = levelMarks(b, f, hideItem);
  for (let i = 0; i < list.length; i++) if (list[i].track === track) drawLevelMark(g, list[i]);
}

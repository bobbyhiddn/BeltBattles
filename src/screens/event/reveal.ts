// SCOUT's reveal (0.6.0b, decision 5): after SPY the scene panel becomes a scout report of
// tonight's dusk foe, the stored deck dusk will fight: its captain (portrait + STAND-IN) or GHOST,
// hero, hull and belt, and every part on its deck as icons with counts.

import type { DuskFoe } from "../../game/run";
import { HEROES } from "../../sim/content";
import { hullShown } from "../../sim/hullScale"; // HULL-1a (REQ-BFG-079): the foe's hull on the day's hull
import { C } from "../../render/palette";
import { rect, type G } from "../../render/pixel";
import { drawText } from "../../render/font";
import { itemIcon } from "../../render/sprites";
import { drawIconMark, hasGrid } from "../../ui/shapePic"; // SHOPCARD-1 (REQ-BFG-113, G4): a shaped part's footprint on its deck icon; PRESENT-5 G5: as the drop row's mark (drawIconMark)
import { panel, type Rect } from "../../ui/ui";
import { drawPortrait, tag } from "../../ui/captain";

/** Distinct parts of a deck (deck items, then turret gear) with how many of each. */
export function deckParts(foe: DuskFoe): { def: string; n: number }[] {
  const out: { def: string; n: number }[] = [];
  for (const def of [...foe.build.items.map((p) => p.def), ...foe.build.mods.map((m) => m.def)]) {
    const e = out.find((q) => q.def === def);
    if (e) e.n++;
    else out.push({ def, n: 1 });
  }
  return out;
}

/** HULL-1a (REQ-BFG-079): the scout report's line "FURNACE · HULL 2100 · BELT 14": the foe's hull on the fight's day (the
 *  day's number with HULL_SCALE on). */
export const revealLine = (foe: Pick<DuskFoe, "hero" | "build" | "day">): string =>
  `${HEROES[foe.hero].name} · HULL ${hullShown(HEROES[foe.hero].hull + foe.build.hullBonus, foe.day)} · BELT ${foe.build.beltCap}`;

export function drawReveal(g: G, r: Rect, foe: DuskFoe): void {
  panel(g, r, "dark");
  drawText(g, "SCOUT REPORT · TONIGHT'S DUSK", r.x + 5, r.y + 5, C.yellow, { font: "3" });
  const big = r.h >= 70;
  const ps = big ? 24 : 16;
  let x = r.x + 5;
  const y = r.y + 14;
  if (foe.rival) {
    drawPortrait(g, foe.rival, x, y, ps);
    x += ps + 5;
  }
  const nw = drawText(g, foe.name, x, y + 1, foe.kind === "ghost" ? C.ice : C.red, { outline: C.ink });
  tag(g, foe.kind === "ghost" ? "GHOST" : "STAND-IN", x + nw + 4, y + 2, foe.kind === "ghost" ? C.ice : C.slate3);
  const h = HEROES[foe.hero];
  drawText(g, revealLine(foe), x, y + 12, C.bone, { font: "3" }); // HULL-1a: the foe's hull on the day's hull
  // the deck: one icon per distinct part, its count beside it
  let ix = r.x + 5, iy = y + Math.max(ps, 20) + 4;
  for (const p of deckParts(foe)) {
    if (ix + 24 > r.x + r.w - 4) {
      ix = r.x + 5;
      iy += 17;
    }
    if (iy + 15 > r.y + r.h - 2) break;
    const ic = itemIcon(p.def);
    rect(g, ix, iy, 14, 14, C.ink);
    rect(g, ix + 1, iy + 1, 12, 12, C.slate0);
    g.drawImage(ic, ix + 7 - Math.floor(ic.width / 2), iy + 7 - Math.floor(ic.height / 2));
    // PRESENT-5 G5 (REQ-BFG-113; backlog #537 (5)): the drop row's footprint MARK in this 14 x 14 box's corner (shapePic.ts drawIconMark), where it was G1's grid at iconCell over the box's top-left (11 x 11 for a 2x2 part, which covered
    // the icon whole: SHOPCARD-1 G4, PRESENT-1 S1 (d)); the box, the 17 px row pitch and the count's `x2` (at ix + 15, outside the box) are as they were
    if (hasGrid(p.def)) drawIconMark(g, p.def, ix, iy, 14);
    if (p.n > 1) drawText(g, `x${p.n}`, ix + 15, iy + 8, C.white, { font: "3" });
    ix += p.n > 1 ? 26 : 17;
  }
}

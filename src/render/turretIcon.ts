// 0.6.2s (REQ-BFG-031 S10): the 12x12 icon of a TURRET module (shop card, cargo slot, inspector, drag): a
// round mount with a rarity rim and a barrel by class (light one thin barrel, medium one thick barrel, heavy two
// barrels, adaptable a barrel on a brass swivel yoke). sprites.ts itemIcon draws it for every turret def.

import { ITEMS } from "../sim/content";
import { C, RARITY_COLOR } from "./palette";
import { rect, type G } from "./pixel";

/** Draws turret def `id`'s icon; false (nothing drawn) when `id` is not a turret. */
export function drawTurretIcon(g: G, id: string): boolean {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : undefined;
  if (!d || d.kind !== "turret" || !d.turret) return false;
  const cls = d.turret.class;
  // the mount: ink ring, steel plate, a rarity rim along its foot
  rect(g, 1, 6, 10, 6, C.ink);
  rect(g, 2, 7, 8, 4, C.steel1);
  rect(g, 2, 10, 8, 1, RARITY_COLOR[d.rarity]);
  // the gun body
  rect(g, 3, 5, 6, 5, C.ink);
  rect(g, 4, 6, 4, 3, C.steel3);
  rect(g, 5, 7, 2, 1, C.steel0);
  const barrel = (x: number, w: number, len: number) => {
    rect(g, x, 6 - len, w + 2, len + 1, C.ink);
    rect(g, x + 1, 7 - len, w, len - 1, C.steel2);
    rect(g, x + 1, 7 - len, w, 1, C.white);
  };
  if (cls === "heavy") {
    barrel(2, 1, 6);
    barrel(7, 1, 6);
  } else if (cls === "medium") barrel(4, 2, 6);
  else if (cls === "adaptable") {
    barrel(4, 2, 5);
    rect(g, 2, 5, 1, 4, C.brass3);
    rect(g, 9, 5, 1, 4, C.brass3);
  } else barrel(4, 1, 6); // light: one thin barrel
  return true;
}

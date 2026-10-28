// 0.6.2s (REQ-BFG-031 S10): the 12x12 icon of a TURRET module (shop card, cargo slot, inspector, drag): a
// round mount with a rarity rim and a barrel by class (light one thin barrel, medium one thick barrel, heavy a carriage gun
// (PRESENT-3 C), adaptable a barrel on a brass swivel yoke). sprites.ts itemIcon draws it for every turret def.

import { ITEMS } from "../sim/content";
import { C, RARITY_COLOR } from "./palette";
import { rect, type G } from "./pixel";

/**
 * PRESENT-3 C, the fix round (REQ-BFG-113 (1); backlog #498 (5); cap's RULINGS-RUN1 item 3, V3 of O/img/c/cannon-candidates.png): the heavy class's icon is a CARRIAGE GUN: a wheel and a carriage, and a barrel
 * turned up to the right on the diagonal, 3 px thick, a white edge along its top and a white muzzle. The class's own icon (every heavy turret: the SCRAP CANNON, the RAMPART CANNON ...), the same 12x12 box, the
 * same palette (ink, steel1, steel3, white, and the rarity colour: the rim keeps its place at the wheel's foot, so a heavy turret's rarity still shows on its icon). History: PRESENT-2's K-02 read the SCRAP CANNON
 * 0 of 6 (two 1 px barrels of steel2 between ink lines: a dim grey picture); PRESENT-3's first fix, two fat upright barrels, read as a face or a robot (the bare control of run 2's cold read: no seat called it a gun).
 */
function carriageGun(g: G, rim: string): void {
  // the wheel (ink ring, steel plate, a steel3 hub, the rarity rim along its foot) and the carriage over it
  rect(g, 2, 7, 6, 5, C.ink);
  rect(g, 3, 8, 4, 3, C.steel1);
  rect(g, 4, 9, 2, 1, C.steel3);
  rect(g, 3, 10, 4, 1, rim);
  rect(g, 1, 6, 9, 2, C.ink);
  rect(g, 2, 6, 7, 1, C.steel1);
  // the barrel: a stair of 2 px steps from the carriage up to the right, ink round it (clipped at the top edge), steel3 inside with a white edge, then the muzzle
  for (let k = 0; k < 7; k++) {
    const y = 5 - k, top = Math.max(0, y);
    rect(g, 1 + k, top, 4, 3 - (top - y), C.ink);
  }
  for (let k = 0; k < 7; k++) {
    rect(g, 2 + k, 6 - k, 2, 1, C.steel3);
    if (k > 1) rect(g, 2 + k, 5 - k, 1, 1, C.white);
  }
  rect(g, 9, 0, 3, 2, C.ink);
  rect(g, 10, 0, 1, 1, C.white);
}

/** Draws turret def `id`'s icon; false (nothing drawn) when `id` is not a turret. */
export function drawTurretIcon(g: G, id: string): boolean {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : undefined;
  if (!d || d.kind !== "turret" || !d.turret) return false;
  const cls = d.turret.class;
  if (cls === "heavy") {
    carriageGun(g, RARITY_COLOR[d.rarity]);
    return true;
  }
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
  if (cls === "medium") barrel(4, 2, 6);
  else if (cls === "adaptable") {
    barrel(4, 2, 5);
    rect(g, 2, 5, 1, 4, C.brass3);
    rect(g, 9, 5, 1, 4, C.brass3);
  } else barrel(4, 1, 6); // light: one thin barrel
  return true;
}

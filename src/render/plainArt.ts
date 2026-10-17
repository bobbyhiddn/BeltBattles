// PLAIN-1 (REQ-BFG-084; BRIEF-PLAIN1 step 4): the six plain stat rigs' art, 12x12 like every rig (sprites.ts drawGate
// asks here from its default branch, after wave 3's; the icon is the idle frame, as every rig's: sprites.ts itemIcon). Each
// draws its own picture, so no two share one, and none is WHETSTONE's or another rig's:
//  - RASP: a toothed steel file with an ember at its tip (DMG and BURN);
//  - SPARK GAP: two copper electrodes and the spark that jumps between them (STUN);
//  - SCALE GUARD: overlapping armour scales round a blade (PLATE and DMG);
//  - BALLAST: an iron ballast weight with a red heart (MAX HULL);
//  - GRINDSTONE: a big stone wheel on a brass axle throwing sparks to both sides (its two arrows, left and right);
//  - BRANDING IRON: an L-shaped brand, glowing, on a wooden grip (its two arrows, forward and right).
// What matters sits in the corners and the centre: an arrow nozzle covers the middle of the edge it leaves by. Same
// helpers and palette as the rest of the render code; light from the top-left; `f` the 8-frame clock, `active` the hit
// flash every rig has; no randomness. Answers only for the six ids (false for anything else), so every other rig draws
// exactly as before, and with PLAIN_RIGS off no ITEMS entry carries these ids, so nothing in the game reaches them.

import { C } from "./palette";
import { bevel, disc, hline, line, px, rect, ring, vline, type G } from "./pixel";

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

const RIG_ART: Record<string, (g: G, f: number, active: boolean) => void> = {
  rasp: (g, f, active) => {
    bevel(g, 1, 1, 10, 10, C.steel1, C.steel3, C.steel0, C.ink);
    rect(g, 3, 2, 5, 8, C.ink); // the file's blade, dark
    for (let y = 3; y <= 8; y++) for (let x = 4; x <= 6; x++) px(g, x, y, (x + y) % 2 ? C.steel3 : C.steel0); // its teeth
    hline(g, 3, 2, 5, C.steel2); // the tang
    px(g, 9, 9, active ? C.fire4 : f % 4 < 2 ? C.fire2 : C.fire3); // the ember (BURN)
    px(g, 9, 8, C.fire1);
    if (active) { px(g, 10, 2, C.yellow); px(g, 9, 1, C.fire4); }
  },
  sparkgap: (g, f, active) => {
    bevel(g, 1, 1, 10, 10, C.slate1, C.slate3, C.slate0, C.ink);
    rect(g, 2, 5, 3, 2, C.cop1); px(g, 4, 5, C.cop3); // the left electrode
    rect(g, 7, 5, 3, 2, C.cop1); px(g, 7, 5, C.cop3); // the right one
    const up = f % 2 === 0;
    px(g, 5, up ? 5 : 6, active ? C.white : C.ice); // the spark, jumping the gap
    px(g, 6, up ? 6 : 5, active ? C.white : C.yellow);
    px(g, 2, 2, C.cop2); px(g, 9, 9, C.cop2); // the posts' rivets
    if (active) { px(g, 5, 3, C.ice); px(g, 6, 8, C.ice); }
  },
  scaleguard: (g, _f, active) => {
    bevel(g, 1, 1, 10, 10, C.plate1, C.plate3, C.plate0, C.ink);
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 3; k++) {
        const x = 2 + k * 3 + (r % 2), y = 2 + r * 3;
        if (x > 8) continue;
        px(g, x, y, C.plate3); px(g, x + 1, y, C.plate3); // a scale's lit rim
        px(g, x, y + 1, C.plate2); px(g, x + 1, y + 1, C.plate0); // and its shade
      }
    }
    vline(g, 10, 3, 6, active ? C.white : C.steel3); // the blade at its edge (DMG)
    if (active) px(g, 2, 9, C.cyan);
  },
  ballast: (g, _f, active) => {
    bevel(g, 1, 1, 10, 10, C.stone1, C.stone3, C.stone0, C.ink);
    px(g, 5, 2, C.steel2); px(g, 6, 2, C.steel2); px(g, 4, 3, C.steel2); px(g, 7, 3, C.steel2); // the lifting ring
    hline(g, 4, 4, 4, C.steel1); // the weight: narrow top
    for (let y = 5; y <= 8; y++) hline(g, 3, y, 6, C.steel0); // a wide foot
    hline(g, 3, 5, 6, C.steel1);
    px(g, 4, 6, C.red); px(g, 6, 6, C.red); hline(g, 4, 7, 3, C.red); px(g, 5, 8, C.red); // the heart (MAX HULL)
    px(g, 5, 6, active ? C.white : C.maroon);
    if (active) { px(g, 9, 2, C.white); px(g, 2, 9, C.white); }
  },
  grindstone: (g, f, active) => {
    bevel(g, 1, 1, 10, 10, C.wood1, C.wood3, C.wood0, C.ink);
    disc(g, 6, 6, 4.4, C.ink);
    disc(g, 6, 6, 3.6, C.stone2); // the wheel, stone not steel
    ring(g, 6, 6, 3.6, C.stone3);
    px(g, 6, 6, C.brass3); // the axle
    const a = (f / 8) * Math.PI * 2;
    px(g, Math.round(6 + Math.cos(a) * 2.5 - 0.5), Math.round(6 + Math.sin(a) * 2.5 - 0.5), C.stone0); // turning
    if (active) { px(g, 1, 5, C.yellow); px(g, 0, 6, C.fire4); px(g, 10, 6, C.yellow); px(g, 11, 5, C.fire4); } // both sides
  },
  brandingiron: (g, f, active) => {
    bevel(g, 1, 1, 10, 10, C.rust0, C.rust2, C.ink, C.ink);
    const hot = active ? C.white : f % 4 < 2 ? C.fire3 : C.fire4, glow = active ? C.fire4 : C.fire2;
    rect(g, 3, 2, 2, 7, glow); vline(g, 3, 2, 7, hot); // the L's upright
    rect(g, 3, 7, 6, 2, glow); hline(g, 3, 7, 6, hot); // and its foot
    px(g, 9, 2, C.wood2); px(g, 8, 3, C.wood2); px(g, 7, 4, C.wood3); // the grip
    if (active) px(g, 2, 9, C.fire4);
  },
};

/** The six plain rigs' ids with art here. */
export const PLAIN_ART_IDS: readonly string[] = Object.keys(RIG_ART);

/** Draw plain rig `id` (frame f 0-7, the hit flash `active`) on a 12x12 G; false for any other id. */
export function drawPlainGate(g: G, id: string, f: number, active: boolean): boolean {
  if (!own(RIG_ART, id)) return false;
  RIG_ART[id](g, ((f % 8) + 8) % 8, active);
  return true;
}

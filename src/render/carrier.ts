// MOTION-1 (REQ-BFG-071) drew the carriers; MOTION-2 ships them on every screen. Each is a ship seen from above, bow to
// the right, in its faction's hull colours, with the bow wave and its shadow on the water. It turns (banks) on its own
// clock; its board rides above it on a gimbal (the board plate is the deck sprite, hull.ts hullSprite, cut down to the
// deck, the bow band with the turret mounts and the walkways: no treads). Every hull is pre-rendered once per faction and
// per whole degree of heading into cached canvases and blitted at whole pixels; nothing here is drawn pixel by pixel per
// frame but the wake's few dozen foam marks. Imports no sim value (the caller passes the faction palette).
// MOTION-2 (REVIEW-MOTION1 Q2): a longer bow and a taller stern that reach past the board, so more ship shows in portrait
// with the board's 24 CSS px tile unchanged: the bow runs 33 px past the board (MOTION-1: 23) and the stern flares to
// 152 px across (MOTION-1: 92), 6 px past a portrait board's top and bottom edges, with a deckhouse and twin funnels.

import { C, type FactionPalette } from "./palette";
import { makeCanvas, rect, silhouette, type G } from "./pixel";
import type { Facing } from "./frame";

type Cv = HTMLCanvasElement;

/** The ship: length (stern to bow, along screen x), logical px. Its board sits above ship x = PIVOT_X (the pivot). */
export const SHIP_L = 184;
/** The pivot (the board's centre) from the stern: the stern reaches PIVOT_X behind it, the bow SHIP_L - PIVOT_X ahead. */
export const PIVOT_X = 88;
/** The beam amidships (under the board) and at the stern (the stern flares out to it over STERN_FLARE px). */
export const SHIP_B = 92;
export const STERN_B = 152;
const STERN_FLARE = 70;
/** The bow's taper (px from the tip back to the full beam): long and fine. */
const BOW_TAPER = 66;
const M = 4; // canvas margin (bow wave, outline)
/** The rotated-sprite canvas: big enough for the ship turned 12 degrees either way, its pivot at (ROT_X, ROT_Y). */
export const ROT_W = 212, ROT_H = 194;
export const ROT_X = 106, ROT_Y = 97;
/** The board plate cut from the hull art: hull-local hx 13..142 (the bow band's span), hy 0..139 (bow edge to stern). */
export const PLATE_HX = 13, PLATE_W = 130;

const cache = new Map<string, Cv>();
function cached(k: string, make: () => Cv): Cv {
  let c = cache.get(k);
  if (!c) {
    c = make();
    cache.set(k, c);
  }
  return c;
}

/** Drop every cached carrier canvas (a resize or a DPR change rebuilds them lazily; they are size-independent). */
export function clearCarrierCache(): void {
  cache.clear();
}

/** Half the beam at x along the hull (0 stern .. L-1 bow): a broad, flared stern with rounded quarters, straight sides
 *  under the board, and a long pointed bow. */
export function halfBeam(x: number): number {
  const B2 = SHIP_B / 2, S2 = STERN_B / 2;
  if (x < 0 || x > SHIP_L) return -1;
  if (x > SHIP_L - BOW_TAPER) return B2 * Math.sqrt(Math.max(0, (SHIP_L - x) / BOW_TAPER)) * 0.98 + 0.5;
  if (x >= STERN_FLARE) return B2;
  // the stern quarter: S2 at the transom, easing to B2 at STERN_FLARE; the corners rounded over 5 px
  const k = x / STERN_FLARE;
  const flare = S2 + (B2 - S2) * k * k * (3 - 2 * k);
  return x < 5 ? flare - (5 - x) * 0.9 : flare;
}

/** Ship-local (x from the stern, y across the canvas) inside the hull. */
function insideShip(x: number, y: number): boolean {
  if (x < 0 || x >= SHIP_L) return false;
  return Math.abs(y + 0.5 - STERN_B / 2) <= halfBeam(x + 0.5);
}

/** The ship at heading 0 (bow right), its bow wave under it. Light falls from the upper left (STUDY rule 4). */
function shipBase(key: string, P: FactionPalette): Cv {
  return cached(`ship:${key}`, () => {
    const [c, g] = makeCanvas(SHIP_L + 2 * M, STERN_B + 2 * M);
    const cy = STERN_B / 2;
    // bow wave: foam 1-3 px off the hull along the bow's taper, thinning toward the beam
    const w0 = SHIP_L - BOW_TAPER - 6;
    for (let x = w0; x < SHIP_L + 3; x++) {
      for (let y = Math.floor(cy - SHIP_B / 2) - 3; y < cy + SHIP_B / 2 + 3; y++) {
        if (insideShip(x, y)) continue;
        let near = 9;
        for (let d = 1; d <= 3 && near === 9; d++) {
          if (insideShip(x - d, y) || insideShip(x, y - d) || insideShip(x, y + d)) near = d;
        }
        if (near > 3) continue;
        const k = (x - w0) / (SHIP_L - w0); // 0 .. 1 toward the bow
        if (near === 1 && k > 0.2) rect(g, M + x, M + y, 1, 1, k > 0.75 ? C.white : C.ice);
        else if (near === 2 && k > 0.45 && (x + y) % 2 === 0) rect(g, M + x, M + y, 1, 1, C.slate4);
        else if (near === 3 && k > 0.8 && (x + y) % 3 === 0) rect(g, M + x, M + y, 1, 1, C.slate3);
      }
    }
    // hull: ink rim, gunwale light on the top side, shade on the bottom side, deck planks between
    for (let y = 0; y < STERN_B; y++) {
      for (let x = 0; x < SHIP_L; x++) {
        if (!insideShip(x, y)) continue;
        const edge = !insideShip(x - 1, y) || !insideShip(x + 1, y) || !insideShip(x, y - 1) || !insideShip(x, y + 1);
        let col: string;
        if (edge) col = C.ink;
        else {
          const top = !insideShip(x, y - 3), bot = !insideShip(x, y + 3);
          const top2 = !insideShip(x, y - 5), bot2 = !insideShip(x, y + 5);
          if (top) col = P.hull4;
          else if (bot) col = P.hull0;
          else if (top2) col = P.hull3;
          else if (bot2) col = P.hull1;
          else col = (y - 5) % 6 === 0 ? P.trim0 : x % 23 === 0 && y % 6 === 3 ? P.trim0 : P.hull2;
        }
        rect(g, M + x, M + y, 1, 1, col);
      }
    }
    // rivets along the gunwales
    for (let x = 10; x < SHIP_L - 30; x += 8) {
      const h = Math.floor(halfBeam(x + 0.5));
      for (const y of [Math.round(cy - h) + 3, Math.round(cy + h) - 4]) if (insideShip(x, y - 2) && insideShip(x, y + 2)) rect(g, M + x, M + y, 1, 1, P.trim2);
    }
    // the bow: a stem line and an anchor hawse each side
    rect(g, M + SHIP_L - 58, M + cy - 1, 50, 2, P.trim1);
    rect(g, M + SHIP_L - 58, M + cy - 1, 50, 1, P.trim2);
    for (const dy of [-12, 11]) {
      rect(g, M + SHIP_L - 32, M + cy + dy, 3, 2, C.ink);
      rect(g, M + SHIP_L - 31, M + cy + dy, 1, 1, P.trim2);
    }
    // the stern: a raised deckhouse (bevelled, its shadow to the lower right, a row of bridge lights) between twin funnels
    // with the faction's glow, sponson lamps on the flared quarters, and a rudder post
    rect(g, M + 9, M + cy - 23, 17, 48, C.ink); // shadow
    rect(g, M + 6, M + cy - 25, 17, 48, C.ink);
    rect(g, M + 7, M + cy - 24, 15, 46, P.hull3);
    rect(g, M + 7, M + cy - 24, 15, 1, P.hull4);
    rect(g, M + 7, M + cy - 24, 1, 46, P.hull4);
    rect(g, M + 7, M + cy + 21, 15, 1, P.hull1);
    for (let k = 0; k < 6; k++) rect(g, M + 19, M + cy - 19 + k * 7, 2, 3, k % 2 ? P.trim2 : P.glow);
    for (const dy of [-40, 33]) {
      rect(g, M + 5, M + cy + dy, 11, 7, C.ink);
      rect(g, M + 6, M + cy + dy + 1, 9, 5, P.trim1);
      rect(g, M + 8, M + cy + dy + 1, 5, 5, C.ink);
      rect(g, M + 9, M + cy + dy + 2, 3, 3, P.glow);
    }
    for (const dy of [-62, 61]) {
      rect(g, M + 4, M + cy + dy, 4, 2, C.ink);
      rect(g, M + 5, M + cy + dy, 2, 1, P.trim2);
    }
    rect(g, M + 1, M + cy - 2, 3, 4, C.ink);
    rect(g, M + 2, M + cy - 1, 1, 2, P.trim2);
    return c;
  });
}

/** The ship turned by `deg` (whole degrees, + = bow up), on a ROT_W x ROT_H canvas whose (ROT_X, ROT_Y) is the pivot.
 *  Nearest-neighbour rotation once per angle, then cached: blitted at whole pixels it stays crisp. */
export function shipSprite(key: string, P: FactionPalette, deg: number): Cv {
  return cached(`shipR:${key}:${deg}`, () => {
    const base = shipBase(key, P);
    const [c, g] = makeCanvas(ROT_W, ROT_H);
    g.imageSmoothingEnabled = false;
    g.translate(ROT_X, ROT_Y);
    if (deg) g.rotate((-deg * Math.PI) / 180);
    g.drawImage(base, -(M + PIVOT_X), -(M + STERN_B / 2));
    return c;
  });
}

/** The ship's shadow (ink silhouette) at the same angle. */
export function shipShadow(key: string, P: FactionPalette, deg: number): Cv {
  return cached(`shipS:${key}:${deg}`, () => silhouette(shipSprite(key, P, deg), C.ink));
}

/**
 * The board plate for a facing: the deck sprite (`hull`, hull.ts hullSprite with HULL_M px of margin) cut to hull-local
 * hx PLATE_HX .. PLATE_HX + PLATE_W - 1 and the whole length, with an ink rim. `map` is the hull painter's hull-local ->
 * canvas map. Cached per hero and facing (CUSTOM-2's deck styles key it further).
 */
export function boardPlate(key: string, hull: Cv, facing: Facing, map: (hx: number, hy: number, w: number, h: number) => [number, number, number, number], length: number): Cv {
  return cached(`plate:${key}:${facing}`, () => {
    const [x, y, w, h] = map(PLATE_HX, 0, PLATE_W, length);
    const [c, g] = makeCanvas(w, h);
    g.drawImage(hull, x, y, w, h, 0, 0, w, h);
    // the gimbal's rim: an ink frame, so the plate reads as a platform above the ship
    g.fillStyle = C.ink;
    g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
    return c;
  });
}

/** The KO dim over a plate: an ink rect (callers set the alpha). */
export function plateShade(w: number, h: number): Cv {
  return cached(`plateS:${w}x${h}`, () => {
    const [c, g] = makeCanvas(w, h);
    g.fillStyle = C.ink;
    g.fillRect(0, 0, w, h);
    return c;
  });
}

/** One foam mark of the wake (callers pick the colour by age). */
export function foam(g: G, x: number, y: number, w: number, col: string): void {
  rect(g, Math.round(x), Math.round(y), w, 1, col);
}

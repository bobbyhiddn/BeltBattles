// MOTION-1 (REQ-BFG-071; prototype, VITE_MOTION builds only): the carriers. Each is a ship seen from above, bow to the
// right, in its faction's hull colours, with the bow wave and its shadow on the water. It turns (banks) on its own clock;
// its board rides above it on a gimbal (the board plate is today's hull art cut down to the deck, the bow band with the
// turret mounts, and the walkways: no treads). Every hull is pre-rendered once per faction and per whole degree of
// heading into cached canvases and blitted at whole pixels; nothing here is drawn pixel by pixel per frame but the wake's
// few dozen foam marks. Imports no sim value (the caller passes the faction palette).

import { C, type FactionPalette } from "./palette";
import { makeCanvas, rect, silhouette, type G } from "./pixel";
import type { Facing } from "./frame";

type Cv = HTMLCanvasElement;

/** The ship: length (bow to stern, along screen x) and beam (across), logical px. Under a 130 x 140 board its bow and
 *  stern stand out on the left and right; the board overhangs its sides, as a carrier's deck does. */
export const SHIP_L = 176;
export const SHIP_B = 92;
const M = 4; // canvas margin (bow wave, outline)
/** The rotated-sprite canvas: big enough for the ship turned 12 degrees either way, its pivot at the centre. */
export const ROT_W = 206, ROT_H = 142;
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

/** Half the beam at x along the hull (0 stern .. L-1 bow): a squared stern, straight sides, a long pointed bow. */
function halfBeam(x: number): number {
  const B2 = SHIP_B / 2;
  if (x < 6) return B2 - (6 - x) * 0.9;
  const bow = 58;
  if (x > SHIP_L - bow) return B2 * Math.sqrt(Math.max(0, (SHIP_L - x) / bow)) * 0.98 + 0.5;
  return B2;
}

function insideShip(x: number, y: number): boolean {
  if (x < 0 || x >= SHIP_L) return false;
  return Math.abs(y + 0.5 - SHIP_B / 2) <= halfBeam(x + 0.5);
}

/** The ship at heading 0 (bow right), its bow wave under it. Light falls from the upper left (STUDY rule 4). */
function shipBase(key: string, P: FactionPalette): Cv {
  return cached(`ship:${key}`, () => {
    const [c, g] = makeCanvas(SHIP_L + 2 * M, SHIP_B + 2 * M);
    // bow wave: foam 1-3 px off the hull along the bow's taper, thinning toward the beam
    for (let x = SHIP_L - 64; x < SHIP_L + 3; x++) {
      for (let y = -3; y < SHIP_B + 3; y++) {
        if (insideShip(x, y)) continue;
        let near = 9;
        for (let d = 1; d <= 3 && near === 9; d++) {
          if (insideShip(x - d, y) || insideShip(x, y - d) || insideShip(x, y + d)) near = d;
        }
        if (near > 3) continue;
        const k = (x - (SHIP_L - 64)) / 64; // 0 .. 1 toward the bow
        if (near === 1 && k > 0.2) rect(g, M + x, M + y, 1, 1, k > 0.75 ? C.white : C.ice);
        else if (near === 2 && k > 0.45 && (x + y) % 2 === 0) rect(g, M + x, M + y, 1, 1, C.slate4);
        else if (near === 3 && k > 0.8 && (x + y) % 3 === 0) rect(g, M + x, M + y, 1, 1, C.slate3);
      }
    }
    // hull: ink rim, gunwale light on the top side, shade on the bottom side, deck planks between
    for (let y = 0; y < SHIP_B; y++) {
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
      for (const y of [3, SHIP_B - 4]) if (insideShip(x, y - 2) && insideShip(x, y + 2)) rect(g, M + x, M + y, 1, 1, P.trim2);
    }
    // the bow: a stem line and an anchor hawse each side
    const cy = SHIP_B / 2;
    rect(g, M + SHIP_L - 52, M + cy - 1, 44, 2, P.trim1);
    rect(g, M + SHIP_L - 52, M + cy - 1, 44, 1, P.trim2);
    for (const dy of [-12, 11]) {
      rect(g, M + SHIP_L - 30, M + cy + dy, 3, 2, C.ink);
      rect(g, M + SHIP_L - 29, M + cy + dy, 1, 1, P.trim2);
    }
    // the stern: twin exhaust stacks with the faction's glow, and a rudder post
    for (const dy of [-14, 10]) {
      rect(g, M + 5, M + cy + dy, 9, 5, C.ink);
      rect(g, M + 6, M + cy + dy + 1, 7, 3, P.trim1);
      rect(g, M + 8, M + cy + dy + 1, 3, 3, C.ink);
      rect(g, M + 9, M + cy + dy + 2, 1, 1, P.glow);
    }
    rect(g, M + 1, M + cy - 2, 3, 4, C.ink);
    rect(g, M + 2, M + cy - 1, 1, 2, P.trim2);
    return c;
  });
}

/** The ship turned by `deg` (whole degrees, + = bow up), on a ROT_W x ROT_H canvas whose centre is the pivot. Nearest-
 *  neighbour rotation once per angle, then cached: blitted at whole pixels it stays crisp. */
export function shipSprite(key: string, P: FactionPalette, deg: number): Cv {
  return cached(`shipR:${key}:${deg}`, () => {
    const base = shipBase(key, P);
    const [c, g] = makeCanvas(ROT_W, ROT_H);
    g.imageSmoothingEnabled = false;
    g.translate(ROT_W / 2, ROT_H / 2);
    g.rotate((-deg * Math.PI) / 180);
    g.drawImage(base, -Math.round(base.width / 2), -Math.round(base.height / 2));
    return c;
  });
}

/** The ship's shadow (ink silhouette) at the same angle. */
export function shipShadow(key: string, P: FactionPalette, deg: number): Cv {
  return cached(`shipS:${key}:${deg}`, () => silhouette(shipSprite(key, P, deg), C.ink));
}

/**
 * The board plate for a facing: today's hull sprite (`hull`, HULL_M px of margin) cut to hull-local hx PLATE_HX ..
 * PLATE_HX + PLATE_W - 1 and the whole length, with an ink rim. `map` is the hull painter's hull-local -> canvas map.
 */
export function boardPlate(key: string, hull: Cv, facing: Facing, map: (hx: number, hy: number, w: number, h: number) => [number, number, number, number], length: number): Cv {
  return cached(`plate:${key}:${facing}`, () => {
    const [x, y, w, h] = map(PLATE_HX, 0, PLATE_W, length);
    const [c, g] = makeCanvas(w, h);
    g.drawImage(hull, x, y, w, h, 0, 0, w, h);
    // the gimbal's rim: an ink frame with a brass inner line, so the plate reads as a platform above the ship
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

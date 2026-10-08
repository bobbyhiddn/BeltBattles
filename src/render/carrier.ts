// MOTION-1 (REQ-BFG-071) drew the carriers; MOTION-2 ships them on every screen. Each is a ship seen from above, bow to
// the right, in its faction's hull colours, with the bow wave and its shadow on the water. It turns (banks) on its own
// clock; its board rides above it on a gimbal (the board plate is the deck sprite, hull.ts hullSprite, cut down to the
// deck, the bow band with the turret mounts and the walkways: no treads). Every hull is pre-rendered once per faction and
// per whole degree of heading into cached canvases and blitted at whole pixels; nothing here is drawn pixel by pixel per
// frame but the wake's few dozen foam marks. Imports no sim value (the caller passes the faction palette).
// MOTION-2 (REVIEW-MOTION1 Q2): a longer bow and a taller stern that reach past the board, so more ship shows in portrait
// with the board's 24 CSS px tile unchanged: the bow runs 33 px past the board (MOTION-1: 23) and the stern flares to
// 152 px across (MOTION-1: 92), 6 px past a portrait board's top and bottom edges, with a deckhouse and twin funnels.

// CUSTOM-3 (REQ-BFG-074): the carrier styles (styles.ts CARRIERS). A style repaints the hull (its paint in hull0..hull4's
// places) and dresses the two bands that show around the board (the stern band, ship x 0..22, and the bow, ship x
// 153..183); the outline (halfBeam), the board plate, PIVOT_X and the rotation canvases are the default's, so taps, shots
// and motion are unchanged. The faction's trim and glow stay on every style. The default (WAR COLOURS, no style) takes
// exactly today's draw calls and keys (`ship:<hero>`, `shipR:<hero>:<deg>`, `shipS:<hero>:<deg>`); a style's key carries
// its id (`<hero>:<style>`; render/ship.ts shipKey), so it never reuses the default's canvas.

import { C, type FactionPalette } from "./palette";
import { makeCanvas, rect, silhouette, type G } from "./pixel";
import type { Facing } from "./frame";
import type { CarrierStyle } from "./styles";

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

/** The ship at heading 0 (bow right), its bow wave under it. Light falls from the upper left (STUDY rule 4). CUSTOM-3:
 *  `st` (a carrier style with a paint) repaints and dresses it; absent (or WAR COLOURS), today's ship exactly. */
function shipBase(key: string, P: FactionPalette, st?: CarrierStyle): Cv {
  return cached(`ship:${key}`, () => {
    const [c, g] = makeCanvas(SHIP_L + 2 * M, STERN_B + 2 * M);
    const cy = STERN_B / 2;
    const s = st?.paint ? st : undefined;
    const H = s?.paint ?? [P.hull0, P.hull1, P.hull2, P.hull3, P.hull4];
    const id = s?.id;
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
          if (top) col = H[4];
          else if (bot) col = H[0];
          else if (top2) col = H[3];
          else if (bot2) col = H[1];
          else if (id === "ironclad") col = (y - 5) % 12 === 0 || x % 16 === 0 ? P.trim0 : H[2]; // armour plates, not planks
          else if (id === "storm") col = (y - 5) % 6 === 0 ? P.trim0 : (x + y) % 11 === 0 ? H[1] : H[2]; // storm streaks
          else col = (y - 5) % 6 === 0 ? P.trim0 : x % 23 === 0 && y % 6 === 3 ? P.trim0 : H[2];
        }
        rect(g, M + x, M + y, 1, 1, col);
      }
    }
    if (s) dressHull(g, s, P, H);
    // rivets along the gunwales
    for (let x = 10; x < SHIP_L - 30; x += 8) {
      const h = Math.floor(halfBeam(x + 0.5));
      for (const y of [Math.round(cy - h) + 3, Math.round(cy + h) - 4]) if (insideShip(x, y - 2) && insideShip(x, y + 2)) rect(g, M + x, M + y, 1, 1, P.trim2);
    }
    // the bow: a stem line and an anchor hawse each side
    rect(g, M + SHIP_L - 58, M + cy - 1, 50, 2, P.trim1);
    rect(g, M + SHIP_L - 58, M + cy - 1, 50, 1, P.trim2);
    if (id !== "storm") {
      for (const dy of [-12, 11]) {
        rect(g, M + SHIP_L - 32, M + cy + dy, 3, 2, C.ink);
        rect(g, M + SHIP_L - 31, M + cy + dy, 1, 1, P.trim2);
      }
    }
    if (s) dressBow(g, s, P, H);
    if (id === "ironclad") {
      casemate(g, P, H);
    } else {
      // the stern: a raised deckhouse (bevelled, its shadow to the lower right, a row of bridge lights) between twin
      // funnels with the faction's glow, sponson lamps on the flared quarters, and a rudder post
      rect(g, M + 9, M + cy - 23, 17, 48, C.ink); // shadow
      rect(g, M + 6, M + cy - 25, 17, 48, C.ink);
      rect(g, M + 7, M + cy - 24, 15, 46, H[3]);
      rect(g, M + 7, M + cy - 24, 15, 1, H[4]);
      rect(g, M + 7, M + cy - 24, 1, 46, H[4]);
      rect(g, M + 7, M + cy + 21, 15, 1, H[1]);
      if (s) dressDeckhouse(g, s);
      for (let k = 0; k < 6; k++) rect(g, M + 19, M + cy - 19 + k * 7, 2, 3, k % 2 ? P.trim2 : P.glow);
      for (const dy of [-40, 33]) {
        rect(g, M + 5, M + cy + dy, 11, 7, C.ink);
        rect(g, M + 6, M + cy + dy + 1, 9, 5, id === "storm" ? C.plum4 : id === "gold" ? C.brass2 : P.trim1);
        rect(g, M + 8, M + cy + dy + 1, 5, 5, C.ink);
        rect(g, M + 9, M + cy + dy + 2, 3, 3, P.glow);
        if (id === "gold") {
          rect(g, M + 6, M + cy + dy + 3, 2, 1, C.soil0); // the gold funnels' dark bands
          rect(g, M + 13, M + cy + dy + 3, 2, 1, C.soil0);
        }
      }
    }
    for (const dy of [-62, 61]) {
      rect(g, M + 4, M + cy + dy, 4, 2, C.ink);
      rect(g, M + 5, M + cy + dy, 2, 1, id === "admiral" || id === "gold" ? C.brass3 : P.trim2);
    }
    rect(g, M + 1, M + cy - 2, 3, 4, C.ink);
    rect(g, M + 2, M + cy - 1, 1, 2, P.trim2);
    return c;
  });
}

// ------------------------------------------------------------------------------------------- CUSTOM-3: the dressings

/** The hull's top and bottom rows inside the ship at column x (ship-local; [-1, -1] past the ends). */
function extent(x: number): [number, number] {
  let y0 = -1, y1 = -1;
  for (let y = 0; y < STERN_B; y++) {
    if (!insideShip(x, y)) continue;
    if (y0 < 0) y0 = y;
    y1 = y;
  }
  return [y0, y1];
}

const px1 = (g: G, x: number, y: number, col: string): void => rect(g, M + x, M + y, 1, 1, col);

/** Lines along both gunwales, `d` rows inside the ink rim: the stripes and belts each style runs round its hull. */
function gunwaleLine(g: G, d: number, top: string, bot: string, x0 = 1, x1 = SHIP_L - 2): void {
  for (let x = x0; x <= x1; x++) {
    const [y0, y1] = extent(x);
    if (y0 < 0 || y1 - y0 < 2 * d + 4) continue;
    px1(g, x, y0 + d, top);
    px1(g, x, y1 - d, bot);
  }
}

/** The hull's own dressing, over the paint (before the rivets and the bow's fittings). */
function dressHull(g: G, s: CarrierStyle, P: FactionPalette, H: readonly string[]): void {
  if (s.id === "admiral") {
    gunwaleLine(g, 2, C.brass3, C.brass2); // the gilt line round the gunwale
  } else if (s.id === "ironclad") {
    // the armour belt: a riveted band down both flanks, under the light bands
    for (let x = 1; x <= SHIP_L - 2; x++) {
      const [y0, y1] = extent(x);
      if (y0 < 0 || y1 - y0 < 24) continue;
      for (let k = 5; k <= 8; k++) {
        px1(g, x, y0 + k, k === 5 ? H[3] : H[1]);
        px1(g, x, y1 - k, k === 8 ? H[3] : H[1]);
      }
      if (x % 4 === 2) {
        px1(g, x, y0 + 7, P.trim2);
        px1(g, x, y1 - 6, P.trim2);
      }
    }
  } else if (s.id === "storm") {
    // lightning down each flank of the stern band: rune light with a white core, jagged every 3 px
    const zig = [0, 1, 2, 3, 2, 1];
    for (let x = 1; x <= 22; x++) {
      const [y0, y1] = extent(x);
      if (y0 < 0) continue;
      const z = zig[Math.floor(x / 2) % zig.length];
      px1(g, x, y0 + 8 + z, C.white);
      px1(g, x, y0 + 9 + z, C.rune3);
      px1(g, x, y1 - 8 - z, C.white);
      px1(g, x, y1 - 9 - z, C.rune3);
    }
  } else if (s.id === "gold") {
    gunwaleLine(g, 3, C.soil0, C.soil0); // the dark cove stripe
    gunwaleLine(g, 4, C.brass4, C.brass3); // and its gilt line
  }
}

/** The bow's dressing, over the stem line (ship x 153..183 shows past the board). */
function dressBow(g: G, s: CarrierStyle, P: FactionPalette, H: readonly string[]): void {
  const cy = STERN_B / 2, tip = SHIP_L;
  if (s.id === "admiral") {
    // the gilt crest: a diamond astride the stem, a bright heart
    for (let y = -4; y < 4; y++) {
      for (let x = -4; x <= 4; x++) {
        const d = Math.abs(x) + (y < 0 ? -y - 1 : y);
        if (d > 3) continue;
        px1(g, tip - 20 + x, cy + y, d <= 0 ? C.brass4 : d <= 1 ? C.brass3 : d <= 2 ? C.brass2 : C.ink);
      }
    }
  } else if (s.id === "ironclad") {
    // the ram: the last 14 px of the bow in steel, a ridge along the stem and a seam where it meets the hull
    for (let x = tip - 14; x < tip; x++) {
      const [y0, y1] = extent(x);
      if (y0 < 0) continue;
      for (let y = y0 + 1; y < y1; y++) px1(g, x, y, y === y0 + 1 ? C.steel3 : y === y1 - 1 ? C.steel0 : y === cy - 1 ? C.steel3 : y === cy ? C.steel2 : C.steel1);
      if (x === tip - 14) for (let y = y0 + 1; y < y1; y++) px1(g, x, y, C.ink);
    }
  } else if (s.id === "storm") {
    // the rune-lit bow eyes (in the hawses' place) and a lightning line along each side of the bow
    for (const dy of [-12, 11]) {
      rect(g, M + tip - 33, M + cy + dy - 1, 4, 4, C.ink);
      rect(g, M + tip - 32, M + cy + dy, 2, 2, C.rune2);
      px1(g, tip - 32, cy + dy, C.rune4);
    }
    const zig = [0, 1, 2, 1];
    for (let x = tip - 30; x <= tip - 6; x++) {
      const [y0, y1] = extent(x);
      if (y0 < 0 || y1 - y0 < 14) continue;
      const z = zig[Math.floor(x / 3) % zig.length];
      px1(g, x, y0 + 4 + z, C.white);
      px1(g, x, y0 + 5 + z, C.rune3);
      px1(g, x, y1 - 4 - z, C.white);
      px1(g, x, y1 - 5 - z, C.rune3);
    }
  } else if (s.id === "gold") {
    // a laurel: gilt leaves (2 x 2, lit from the upper left, an ink shadow) in a V astride the stem, opening aft
    for (let i = 0; i < 5; i++) {
      const x = tip - 17 - i * 5, dy = 4 + i * 3;
      for (const yy of [cy - 2 - dy, cy + dy]) {
        rect(g, M + x - 1, M + yy - 1, 4, 4, C.ink);
        px1(g, x, yy, C.brass4);
        px1(g, x + 1, yy, C.brass3);
        px1(g, x, yy + 1, C.brass3);
        px1(g, x + 1, yy + 1, C.brass2);
      }
    }
  }
  void P;
  void H;
}

/** The deckhouse's dressing (ADMIRAL'S BLUE, CHAMPION'S GOLD), before the bridge lights. */
function dressDeckhouse(g: G, s: CarrierStyle): void {
  const cy = STERN_B / 2;
  if (s.id === "admiral") {
    // a gilt frame and a bone roof ridge
    rect(g, M + 8, M + cy - 23, 13, 1, C.brass3);
    rect(g, M + 8, M + cy - 23, 1, 43, C.brass3);
    rect(g, M + 8, M + cy + 20, 13, 1, C.brass1);
    rect(g, M + 20, M + cy - 23, 1, 44, C.brass1);
    rect(g, M + 13, M + cy - 20, 2, 38, C.bone);
    rect(g, M + 15, M + cy - 20, 1, 38, C.rune1);
  } else if (s.id === "gold") {
    // a crown on the roof: three points, a band, a jewel
    const x = 10, y = cy - 4;
    rect(g, M + x - 1, M + y - 1, 9, 8, C.ink);
    for (const k of [0, 3, 6]) rect(g, M + x + k, M + y, 1, 2, C.brass4);
    rect(g, M + x, M + y + 2, 7, 3, C.brass4);
    rect(g, M + x, M + y + 4, 7, 1, C.brass2);
    px1(g, x + 3, y + 3, C.red);
  } else if (s.id === "storm") {
    // a white bolt down the roof
    const pts: [number, number][] = [[14, -18], [12, -12], [15, -6], [12, 0], [15, 6], [13, 12], [14, 17]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      for (let t = 0; t <= Math.abs(by - ay); t++) {
        const xx = Math.round(ax + ((bx - ax) * t) / Math.abs(by - ay)), yy = ay + Math.sign(by - ay) * t;
        px1(g, xx, cy + yy, C.white);
        px1(g, xx + 1, cy + yy, C.rune3);
      }
    }
  }
}

/** IRONCLAD's stern: an armoured casemate with gun-port slits and one broad funnel with the faction's glow, in place of
 *  the deckhouse and the twin funnels; vision slits in the faction's glow and trim where the bridge lights were. */
function casemate(g: G, P: FactionPalette, H: readonly string[]): void {
  const cy = STERN_B / 2;
  const x0 = 4, y0 = cy - 31, w = 19, h = 61;
  rect(g, M + x0 + 3, M + y0 + 2, w, h, C.ink); // shadow
  rect(g, M + x0, M + y0, w, h, C.ink);
  rect(g, M + x0 + 1, M + y0 + 1, w - 2, h - 2, H[3]);
  rect(g, M + x0 + 1, M + y0 + 1, w - 2, 1, H[4]);
  rect(g, M + x0 + 1, M + y0 + 1, 1, h - 2, H[4]);
  rect(g, M + x0 + 1, M + y0 + h - 2, w - 2, 1, H[1]);
  rect(g, M + x0 + w - 2, M + y0 + 2, 1, h - 3, H[1]);
  for (const [cx, cyy] of [[x0, y0], [x0 + w - 2, y0], [x0, y0 + h - 2], [x0 + w - 2, y0 + h - 2]]) rect(g, M + cx, M + cyy, 2, 2, C.ink); // chamfers
  for (const k of [0, 1, 2]) {
    rect(g, M + x0 + 4 + k * 5, M + y0 + 3, 3, 1, C.ink); // gun ports, both edges
    rect(g, M + x0 + 4 + k * 5, M + y0 + h - 4, 3, 1, C.ink);
  }
  // one broad funnel
  rect(g, M + x0 + 4, M + cy - 7, 11, 14, C.ink);
  rect(g, M + x0 + 5, M + cy - 6, 9, 12, P.trim1);
  rect(g, M + x0 + 6, M + cy - 5, 7, 10, C.ink);
  rect(g, M + x0 + 7, M + cy - 4, 5, 8, P.glow);
  rect(g, M + x0 + 8, M + cy - 2, 3, 4, C.white);
  // vision slits at the casemate's fore edge
  for (const [k, dy] of [[0, -24], [1, -13], [2, 11], [3, 22]]) rect(g, M + x0 + w - 4, M + cy + dy, 2, 3, k % 2 ? P.trim2 : P.glow);
}

/** The ship turned by `deg` (whole degrees, + = bow up), on a ROT_W x ROT_H canvas whose (ROT_X, ROT_Y) is the pivot.
 *  Nearest-neighbour rotation once per angle, then cached: blitted at whole pixels it stays crisp. CUSTOM-3: `st`, a
 *  carrier style (the caller's `key` names it; render/ship.ts shipKey). */
export function shipSprite(key: string, P: FactionPalette, deg: number, st?: CarrierStyle): Cv {
  return cached(`shipR:${key}:${deg}`, () => {
    const base = shipBase(key, P, st);
    const [c, g] = makeCanvas(ROT_W, ROT_H);
    g.imageSmoothingEnabled = false;
    g.translate(ROT_X, ROT_Y);
    if (deg) g.rotate((-deg * Math.PI) / 180);
    g.drawImage(base, -(M + PIVOT_X), -(M + STERN_B / 2));
    return c;
  });
}

/** The ship's shadow (ink silhouette) at the same angle. */
export function shipShadow(key: string, P: FactionPalette, deg: number, st?: CarrierStyle): Cv {
  return cached(`shipS:${key}:${deg}`, () => silhouette(shipSprite(key, P, deg, st), C.ink));
}

/** CUSTOM-3 tooling and tests: the cache keys the ship canvases are stored under (read only). */
export function shipCacheKeys(): string[] {
  return [...cache.keys()].filter((k) => k.startsWith("ship"));
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

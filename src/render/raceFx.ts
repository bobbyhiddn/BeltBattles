// 0.8.0 H1 M3 (REQ-BFG-011): the signature visuals of FOUNDRY and BASTION (docs/RACES.md section 5's OPEN list), drawn
// after the race-art branch (raceart 0c094b2: render/races/fx.ts and fxPlating.ts) in today's palette. Pure sprites with
// cached canvases; their callers read the game state (cruiser.ts, battleHud.ts, the inspector). Furnace and Weaver
// never reach any of them.
//  - FUSE: the weld flash on a gun when the sim's `fuse` event fires (13x13, 4 frames);
//  - the plating strip on BASTION's hull plate (race.plating.plate, cap 24): one segment for each bulwark slug's plating,
//    white where plating was just lost (hits take plating before HP), and the CLANK on a gun when a bulwark slug plates
//    (13x9, 3 frames);
//  - SYNC: the mark for a gun that two CRUCIBLE belts reach within SYNC_WINDOW of each other (11x9 with its outline), in
//    the route inspector and on the deck beside that gun.

import { C } from "./palette";
import { makeCanvas, outlined, px, rect, ring, type G } from "./pixel";

type Cv = HTMLCanvasElement;
const cache = new Map<string, Cv>();
function cached(k: string, make: () => Cv): Cv {
  let c = cache.get(k);
  if (!c) {
    c = make();
    cache.set(k, c);
  }
  return c;
}
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// --------------------------------------------------------------------------------------------------------------- FUSE

export const FUSE_FRAMES = 4;
export const FUSE_SIZE = 13;
/** Seconds the weld flash plays (its 4 frames). */
export const FUSE_TIME = 0.36;

/** The frame of a timed flash with `left` of `total` seconds to go (0 first). */
export function flashFrame(left: number, total: number, frames: number): number {
  return Math.max(0, Math.min(frames - 1, Math.floor((1 - left / total) * frames)));
}

/** The weld flash (13x13, centre anchor): 0 the two blanks meet, 1 the white-hot strike, 2 the weld ring and its sparks,
 *  3 the cooling embers. */
export function fuseFlash(frame: number): Cv {
  const f = Math.max(0, Math.min(FUSE_FRAMES - 1, Math.floor(frame)));
  return cached(`fuse:${f}`, () => {
    const [c, g] = makeCanvas(FUSE_SIZE, FUSE_SIZE);
    if (f === 0) {
      for (const x of [2, 8]) {
        rect(g, x, 5, 3, 3, C.ink);
        px(g, x + 1, 6, C.cop3);
      }
      px(g, 5, 6, C.fire4); px(g, 7, 6, C.fire4); px(g, 6, 6, C.white);
      px(g, 6, 5, C.yellow); px(g, 6, 7, C.yellow);
    } else if (f === 1) {
      for (let d = 1; d <= 5; d++) {
        const col = d <= 2 ? C.fire5 : d <= 4 ? C.fire4 : C.brass3;
        for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) px(g, 6 + dx, 6 + dy, col);
      }
      for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) px(g, 6 + dx, 6 + dy, C.fire4);
      for (const [dx, dy] of [[-3, -3], [3, 3]]) px(g, 6 + dx, 6 + dy, C.yellow);
      rect(g, 5, 5, 3, 3, C.fire5);
      px(g, 6, 6, C.white);
    } else if (f === 2) {
      ring(g, 6.5, 6.5, 5, C.fire3);
      ring(g, 6.5, 6.5, 4, C.brass4);
      rect(g, 4, 4, 5, 5, C.ink);
      rect(g, 5, 5, 3, 3, C.brass3);
      rect(g, 5, 6, 3, 1, C.white);
      for (const [x, y] of [[0, 6], [12, 6], [6, 0], [6, 12], [1, 1], [11, 11]]) px(g, x, y, C.yellow);
    } else {
      rect(g, 4, 5, 5, 3, C.ink);
      rect(g, 5, 6, 3, 1, C.fire4);
      for (const [x, y] of [[1, 3], [11, 9], [3, 11], [9, 1], [0, 7], [12, 5]]) px(g, x, y, C.cop3);
      for (const [x, y] of [[2, 1], [10, 11], [12, 1], [0, 11]]) px(g, x, y, C.cop1);
    }
    return c;
  });
}

// ------------------------------------------------------------------------------------------------------------ PLATING

export const CLANK_FRAMES = 3;
export const CLANK_W = 13, CLANK_H = 9;
/** Seconds the CLANK plays (its 3 frames); the plating strip's newest segment shines as long. */
export const CLANK_TIME = 0.3;

/** CLANK when a bulwark slug plates the hull (13x9, centre anchor): 0 a white plate slams on, 1 rivet sparks fly, 2 the
 *  last sparks fade. */
export function platingClank(frame: number): Cv {
  const f = Math.max(0, Math.min(CLANK_FRAMES - 1, Math.floor(frame)));
  return cached(`clank:${f}`, () => {
    const [cv, g] = makeCanvas(CLANK_W, CLANK_H);
    if (f === 0) {
      rect(g, 3, 2, 7, 5, C.ink);
      rect(g, 4, 3, 5, 3, C.white);
      px(g, 4, 3, C.plate3); px(g, 8, 5, C.plate2);
      for (const [x, y] of [[1, 4], [11, 4], [6, 0], [6, 8]]) px(g, x, y, C.white);
    } else if (f === 1) {
      rect(g, 4, 3, 5, 3, C.ink);
      rect(g, 5, 4, 3, 1, C.plate3);
      for (const [x, y] of [[0, 4], [12, 4], [2, 1], [10, 1], [2, 7], [10, 7]]) px(g, x, y, C.rune3);
      for (const [x, y] of [[1, 2], [11, 6], [6, 1]]) px(g, x, y, C.white);
    } else {
      for (const [x, y] of [[0, 1], [12, 7], [1, 8], [11, 0]]) px(g, x, y, C.plate2);
      px(g, 6, 4, C.plate3);
    }
    return cv;
  });
}

/** The plating strip's rows (it sits on the hull bar, which keeps the rest of the bar's 7 rows). */
export const STRIP_H = 2;

/**
 * The plating strip (raceart fxPlating.ts drawPlatingBar), STRIP_H px tall across w: `segments` segments with a 1 px gap,
 * each full at max / segments plating (one bulwark slug's), a part-full one lit as far as it holds, in the bulwark
 * slug's rune blue (its chamber pip's), dark plate where none is left. Plating just lost (between `plate` and `shown`,
 * which trails it like the hull bar's chip) shows white: a hit took plating before HP. `shine` (0..1) lights the newest
 * segment as plating lands (the CLANK).
 */
export function drawPlatingStrip(g: G, x: number, y: number, w: number, plate: number, shown: number, max: number, segments: number, shine = 0,
  cols: { full: string; part: string; edge: string; shine: string } = RUNE_STRIP): void {
  // WIND-1 (REQ-BFG-097): `cols`, the strip's colours (the battle plate passes plating's own, apart from SHIELD's rune
  // blue); absent, the rune blue as before
  const per = max / segments;
  const top = Math.ceil(Math.min(max, Math.max(0, plate)) / per - 1e-9) - 1;
  for (let k = 0; k < segments; k++) {
    const x0 = x + Math.floor((k * w) / segments);
    const sw = x + Math.floor(((k + 1) * w) / segments) - 1 - x0;
    if (sw <= 0) continue;
    const a = clamp01((plate - k * per) / per), c = clamp01((shown - k * per) / per);
    const fill = a > 0 ? Math.max(1, Math.round(sw * a)) : 0;
    const chip = Math.max(fill, c > 0 ? Math.max(1, Math.round(sw * c)) : 0);
    rect(g, x0, y, sw, STRIP_H, C.plate0);
    if (chip > fill) rect(g, x0 + fill, y, chip - fill, STRIP_H, C.white);
    if (fill > 0) {
      rect(g, x0, y, fill, STRIP_H, a >= 1 ? cols.full : cols.part);
      rect(g, x0, y, fill, 1, cols.edge);
    }
    if (k === top && shine > 0) rect(g, x0, y, sw, STRIP_H, shine > 0.5 ? C.white : cols.shine);
  }
}

/** The strip's colours before WIND-1: the bulwark slug's rune blue. */
const RUNE_STRIP = { full: C.rune2, part: C.rune1, edge: C.rune3, shine: C.rune4 } as const;

// --------------------------------------------------------------------------------------------------------------- SYNC

export const SYNC_W = 11, SYNC_H = 9;

/** The SYNC mark (11x9 with its ink outline): two belts meet at a lit junction and leave as one arrow. `lit` false is
 *  the dim form (out of sync); `frame` 0 or 1 pulses the lit junction. */
export function syncIcon(lit = true, frame = 0): Cv {
  const f = lit ? frame & 1 : 0;
  return cached(`sync:${lit ? 1 : 0}:${f}`, () => {
    const [c, g] = makeCanvas(SYNC_W - 2, SYNC_H - 2);
    const route = lit ? C.brass3 : C.slate3;
    const main = lit ? C.yellow : C.slate3;
    for (let k = 0; k < 3; k++) {
      px(g, k, k, route);
      px(g, k, 6 - k, route);
    }
    for (let x = 4; x < 8; x++) px(g, x, 3, main);
    px(g, 7, 2, main); px(g, 7, 4, main); px(g, 8, 3, main);
    px(g, 3, 3, lit ? C.white : C.slate4);
    if (f === 1) {
      px(g, 4, 3, C.white);
      px(g, 3, 2, C.fire4);
      px(g, 3, 4, C.fire4);
    }
    return outlined(c, C.ink);
  });
}

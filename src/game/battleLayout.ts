// Battle framing (STUDY rules 1-2). The battle picks the largest integer device-pixel scale
// at which both cruisers, the gap between their bows and the docked HUD fit. Landscape
// puts the cruisers side by side (player left facing east, enemy right facing west);
// portrait stacks them (enemy on top facing south). Name plates and hull bars are bolted
// to their own cruiser; the timer and speed controls share one bar.

import { HULL_A, HULL_L, STERN, frameForHull, hullBox, type Box, type DeckFrame } from "../render/frame";

export const GAP_MIN = 22; // clears a heavy (13px) + light (9px) barrel poking past the bows
const GAP_MAX_L = 64;
const GAP_MAX_P = 40;
export const PLATE_H = 11;
const PLATE_L = 10; // landscape plates (one text row)
const BAR_L = 14;
const BAR_P = 18;
const BAR_C = 16; // compact portrait: plate + controls merged, overlapping the stern

export interface BattleLayout {
  W: number;
  H: number;
  portrait: boolean;
  compact: boolean;
  frames: [DeckFrame, DeckFrame];
  hulls: [Box, Box];
  deckArea: Box; // both hulls and the gap between them
  plates: [Box, Box];
  bar: Box; // timer + speed controls
  enter: [number, number][]; // per side: unit vector pointing away from the gap (drive-in)
}

function fits(W: number, H: number, portrait: boolean): boolean {
  if (!portrait) return W >= 2 * HULL_L + GAP_MIN && H >= HULL_A + PLATE_L + BAR_L;
  return W >= HULL_A + 4 && H >= PLATE_H - STERN + 2 * HULL_L + GAP_MIN + BAR_C - STERN;
}

/** Largest integer scale at which the battle fits the device-pixel viewport. */
export function battleScale(pw: number, ph: number, portrait: boolean): number {
  for (let s = 16; s > 1; s--) {
    if (fits(Math.floor(pw / s), Math.floor(ph / s), portrait)) return s;
  }
  return 1;
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function battleLayout(W: number, H: number, portrait: boolean): BattleLayout {
  if (!portrait) {
    const gap = Math.max(GAP_MIN, Math.min(GAP_MAX_L, W - 2 * HULL_L));
    const x0 = Math.floor((W - (2 * HULL_L + gap)) / 2);
    const band = H - PLATE_L - BAR_L;
    const y0 = PLATE_L + Math.max(0, Math.floor((band - HULL_A) / 2));
    const p = frameForHull(1, x0, y0), e = frameForHull(3, x0 + HULL_L + gap, y0);
    const hp = hullBox(p), he = hullBox(e);
    const barW = Math.min(W - 8, 120);
    return {
      W, H, portrait, compact: false, frames: [p, e], hulls: [hp, he], deckArea: union(hp, he),
      plates: [
        { x: hp.x + 4, y: hp.y - PLATE_L, w: HULL_L - 8, h: PLATE_L - 1 },
        { x: he.x + 4, y: he.y - PLATE_L, w: HULL_L - 8, h: PLATE_L - 1 },
      ],
      bar: { x: Math.round(W / 2 - barW / 2), y: Math.min(H - BAR_L, hp.y + HULL_A), w: barW, h: BAR_L },
      enter: [[-1, 0], [1, 0]],
    };
  }
  const full = H >= PLATE_H + 2 * HULL_L + GAP_MIN + PLATE_H + BAR_P;
  const x0 = Math.floor((W - HULL_A) / 2);
  let top: number, gap: number;
  if (full) {
    const spare = H - (PLATE_H + 2 * HULL_L + PLATE_H + BAR_P);
    gap = Math.max(GAP_MIN, Math.min(GAP_MAX_P, spare));
    top = PLATE_H + Math.floor((spare - gap) / 2);
  } else {
    const spare = H - (PLATE_H - STERN + 2 * HULL_L + BAR_C - STERN);
    gap = Math.max(GAP_MIN, Math.min(GAP_MAX_P, spare));
    top = PLATE_H - STERN + Math.floor((spare - gap) / 2);
  }
  const e = frameForHull(2, x0, top), p = frameForHull(0, x0, top + HULL_L + gap);
  const he = hullBox(e), hp = hullBox(p);
  const pw = HULL_A - 24;
  if (full) {
    return {
      W, H, portrait, compact: false, frames: [p, e], hulls: [hp, he], deckArea: union(hp, he),
      plates: [
        { x: hp.x + 12, y: hp.y + HULL_L + 1, w: pw, h: PLATE_H - 1 },
        { x: he.x + 12, y: he.y - PLATE_H, w: pw, h: PLATE_H - 1 },
      ],
      bar: { x: 3, y: H - BAR_P + 1, w: W - 6, h: BAR_P - 2 },
      enter: [[0, 1], [0, -1]],
    };
  }
  // compact: plates overlap the engine blocks; the player's plate shares the control bar
  return {
    W, H, portrait, compact: true, frames: [p, e], hulls: [hp, he], deckArea: union(hp, he),
    plates: [
      { x: 2, y: hp.y + HULL_L - STERN, w: Math.floor(W * 0.5), h: BAR_C - 1 },
      { x: he.x + 12, y: Math.max(0, he.y - (PLATE_H - STERN)), w: pw, h: PLATE_H - 1 },
    ],
    bar: { x: Math.floor(W * 0.5) + 3, y: hp.y + HULL_L - STERN, w: W - Math.floor(W * 0.5) - 5, h: BAR_C - 1 },
    enter: [[0, 1], [0, -1]],
  };
}

/** Cruisers only, centred in a box (title attract loop, previews). */
export function arenaIn(r: Box, portrait: boolean, gap = 32): { frames: [DeckFrame, DeckFrame]; hulls: [Box, Box] } {
  if (!portrait) {
    const x0 = Math.floor(r.x + (r.w - (2 * HULL_L + gap)) / 2), y0 = Math.floor(r.y + (r.h - HULL_A) / 2);
    const p = frameForHull(1, x0, y0), e = frameForHull(3, x0 + HULL_L + gap, y0);
    return { frames: [p, e], hulls: [hullBox(p), hullBox(e)] };
  }
  const x0 = Math.floor(r.x + (r.w - HULL_A) / 2), y0 = Math.floor(r.y + (r.h - (2 * HULL_L + gap)) / 2);
  const e = frameForHull(2, x0, y0), p = frameForHull(0, x0, y0 + HULL_L + gap);
  return { frames: [p, e], hulls: [hullBox(p), hullBox(e)] };
}

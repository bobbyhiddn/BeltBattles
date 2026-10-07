// Battle framing (STUDY rules 1-2). 0.5.0: the open floor between the bows is a constraint,
// not leftover space. The battle picks the largest integer device-pixel scale at which the
// full layout fits with a gap of at least GAP_SHARE of the firing axis (width in landscape,
// height in portrait); spare space then widens the gap up to GAP_SHARE_MAX, and anything
// left over becomes margin. Landscape puts the cruisers side by side (player left facing
// east, enemy right facing west); portrait stacks them (enemy on top facing south). Name
// plates and hull bars are bolted to their own cruiser; the timer and speed controls share
// one bar docked under the cruisers.

import { DECK, HULL_A, HULL_L, STERN, frameForHull, hullBox, type Box, type DeckFrame } from "../render/frame";
import type { LaneSpec } from "../render/motion";

export const GAP_MIN = 22; // clears a heavy (13px) + light (9px) barrel poking past the bows
export const GAP_SHARE = 0.17; // minimum open floor between the bows (share of the firing axis)
export const GAP_SHARE_MAX = 0.33; // spare space widens the gap up to this share
export const PLATE_H = 11;
const PLATE_L = 10; // landscape plates (one text row)
const BAR_L = 14;
const BAR_P = 18;
const BAR_C = 16; // compact portrait: plate + controls merged, overlapping the stern
const FULL_P = PLATE_H + 2 * HULL_L + PLATE_H + BAR_P; // portrait stack without the gap
const COMPACT_P = PLATE_H - STERN + 2 * HULL_L + BAR_C - STERN; // tiny-viewport fallback

export interface BattleLayout {
  W: number;
  H: number;
  portrait: boolean;
  compact: boolean;
  frames: [DeckFrame, DeckFrame];
  hulls: [Box, Box];
  deckArea: Box; // both hulls and the gap between them
  gap: number; // open floor between the bows along the firing axis (logical px)
  gapBox: Box; // that floor as a rect (between the hull boxes)
  plates: [Box, Box];
  bar: Box; // timer + speed controls
  enter: [number, number][]; // per side: unit vector pointing away from the gap (drive-in)
}

/** Smallest gap allowed on a firing axis of `axis` logical px. */
export function minGap(axis: number): number {
  return Math.max(GAP_MIN, Math.ceil(axis * GAP_SHARE));
}

/** Widest gap wanted on a firing axis of `axis` logical px. */
export function maxGap(axis: number): number {
  return Math.max(minGap(axis), Math.floor(axis * GAP_SHARE_MAX));
}

/** Open floor available between the bows with the full HUD, or -1 when the hulls don't fit. */
export function gapRoom(W: number, H: number, portrait: boolean): number {
  if (!portrait) return H >= HULL_A + PLATE_L + BAR_L ? W - 2 * HULL_L : -1;
  return W >= HULL_A + 4 ? H - FULL_P : -1;
}

/** Largest integer scale at which the full battle fits with the gap >= GAP_SHARE of the firing axis. */
export function battleScale(pw: number, ph: number, portrait: boolean): number {
  for (let s = 16; s > 1; s--) {
    const W = Math.floor(pw / s), H = Math.floor(ph / s);
    if (gapRoom(W, H, portrait) >= minGap(portrait ? H : W)) return s;
  }
  return 1;
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function battleLayout(W: number, H: number, portrait: boolean): BattleLayout {
  if (!portrait) {
    const gap = Math.max(GAP_MIN, Math.min(W - 2 * HULL_L, maxGap(W)));
    const x0 = Math.floor((W - (2 * HULL_L + gap)) / 2);
    const band = H - PLATE_L - BAR_L;
    const y0 = PLATE_L + Math.max(0, Math.floor((band - HULL_A) / 2));
    const p = frameForHull(1, x0, y0), e = frameForHull(3, x0 + HULL_L + gap, y0);
    const hp = hullBox(p), he = hullBox(e);
    const barW = Math.min(W - 8, 150); // 0.6.0: room for 0.5X 1X 2X 4X + SKIP + II
    return {
      W, H, portrait, compact: false, frames: [p, e], hulls: [hp, he], deckArea: union(hp, he),
      gap, gapBox: { x: hp.x + HULL_L, y: hp.y, w: gap, h: HULL_A },
      plates: [
        { x: hp.x + 4, y: hp.y - PLATE_L, w: HULL_L - 8, h: PLATE_L - 1 },
        { x: he.x + 4, y: he.y - PLATE_L, w: HULL_L - 8, h: PLATE_L - 1 },
      ],
      bar: { x: Math.round(W / 2 - barW / 2), y: Math.min(H - BAR_L, hp.y + HULL_A), w: barW, h: BAR_L },
      enter: [[-1, 0], [1, 0]],
    };
  }
  // compact (plates over the engine blocks) only when even the minimum gap won't fit the full stack
  const full = H - FULL_P >= GAP_MIN;
  const spare = H - (full ? FULL_P : COMPACT_P);
  const gap = Math.max(GAP_MIN, Math.min(spare, maxGap(H)));
  const top = (full ? PLATE_H : PLATE_H - STERN) + Math.floor((spare - gap) / 2);
  const x0 = Math.floor((W - HULL_A) / 2);
  const e = frameForHull(2, x0, top), p = frameForHull(0, x0, top + HULL_L + gap);
  const he = hullBox(e), hp = hullBox(p);
  const pw = HULL_A - 24;
  const gapBox = { x: he.x, y: he.y + HULL_L, w: HULL_A, h: gap };
  if (full) {
    return {
      W, H, portrait, compact: false, frames: [p, e], hulls: [hp, he], deckArea: union(hp, he), gap, gapBox,
      plates: [
        { x: hp.x + 12, y: hp.y + HULL_L + 1, w: pw, h: PLATE_H - 1 },
        { x: he.x + 12, y: he.y - PLATE_H, w: pw, h: PLATE_H - 1 },
      ],
      // docked under the player's plate (the screen bottom when the gap takes all the spare)
      bar: { x: 3, y: hp.y + HULL_L + PLATE_H + 1, w: W - 6, h: BAR_P - 2 },
      enter: [[0, 1], [0, -1]],
    };
  }
  // compact: plates overlap the engine blocks; the player's plate shares the control bar
  return {
    W, H, portrait, compact: true, frames: [p, e], hulls: [hp, he], deckArea: union(hp, he), gap, gapBox,
    plates: [
      { x: 2, y: hp.y + HULL_L - STERN, w: Math.floor(W * 0.5), h: BAR_C - 1 },
      { x: he.x + 12, y: Math.max(0, he.y - (PLATE_H - STERN)), w: pw, h: PLATE_H - 1 },
    ],
    bar: { x: Math.floor(W * 0.5) + 3, y: hp.y + HULL_L - STERN, w: W - Math.floor(W * 0.5) - 5, h: BAR_C - 1 },
    enter: [[0, 1], [0, -1]],
  };
}

/** MOTION-1 (REQ-BFG-071): how far landscape lifts the enemy's lane and lowers the player's (logical px, at most). */
export const LANE_LIFT = 24;

/**
 * MOTION-1 (REQ-BFG-071; VITE_MOTION builds): the lanes. Both carriers sail left to right and enter from the left.
 * Portrait keeps today's stack exactly (the enemy's lane above, the player's below, so the screen doesn't flip). Landscape
 * keeps today's side-by-side boards at today's size, with the enemy's lane raised and the player's lowered by the band's
 * spare rows (at most LANE_LIFT each): two parallel lanes, the enemy's a little ahead (to the right). Plates and the bar
 * move with them, so the HUD still sits fixed on screen during the fight. Pure (tests).
 */
export function laneLayout(L: BattleLayout): BattleLayout {
  const enter: [number, number][] = [[-1, 0], [-1, 0]];
  if (L.portrait) return { ...L, enter };
  const [hp, he] = L.hulls;
  const up = Math.max(0, Math.min(LANE_LIFT, he.y - PLATE_L));
  const down = Math.max(0, Math.min(LANE_LIFT, L.H - BAR_L - (hp.y + HULL_A)));
  const p = { ...L.frames[0], dy: L.frames[0].dy + down }, e = { ...L.frames[1], dy: L.frames[1].dy - up };
  const hp2 = hullBox(p), he2 = hullBox(e);
  return {
    ...L, frames: [p, e], hulls: [hp2, he2], deckArea: union(hp2, he2),
    gapBox: { x: hp2.x + HULL_L, y: Math.min(hp2.y, he2.y), w: L.gap, h: Math.max(hp2.y, he2.y) + HULL_A - Math.min(hp2.y, he2.y) },
    plates: [{ ...L.plates[0], y: L.plates[0].y + down }, { ...L.plates[1], y: L.plates[1].y - up }],
    bar: { ...L.bar, y: Math.min(L.H - BAR_L, hp2.y + HULL_A) },
    enter,
  };
}

/**
 * CUSTOM-3 (REVIEW-STAGE096 R5 b): the lanes the motion model is fitted to, from a battle layout: the rest gap and its
 * least along the firing axis and, in landscape, the boards' margin: how far the outer tile columns (the player's
 * leftmost, at its deck's left edge; the enemy's rightmost) stand from the screen's side edges at rest. The landscape
 * surge stays inside it (render/motion.ts setLanes), so at a surge's outer reach no tile column is off screen. Portrait
 * carries no edge: its drift and surge are 0.9.6's exactly. Pure (tests/surge.margin.test.ts).
 */
export function laneSpec(L: Pick<BattleLayout, "portrait" | "gap" | "W" | "frames">, gapMin: number): LaneSpec {
  if (L.portrait) return { portrait: true, gapRest: L.gap, gapMin };
  const [p, e] = L.frames; // landscape: the player faces east (deck x dx .. dx + DECK), the enemy west
  const edge = Math.min(p.dx, L.W - (e.dx + DECK));
  return { portrait: false, gapRest: L.gap, gapMin, edge };
}

/** Cruisers only, centred in a box (title attract loop, previews). The gap is clamped to the box. */
export function arenaIn(r: Box, portrait: boolean, gap = 32): { frames: [DeckFrame, DeckFrame]; hulls: [Box, Box] } {
  const g = Math.max(GAP_MIN, Math.min(gap, (portrait ? r.h : r.w) - 2 * HULL_L));
  if (!portrait) {
    const x0 = Math.floor(r.x + (r.w - (2 * HULL_L + g)) / 2), y0 = Math.floor(r.y + (r.h - HULL_A) / 2);
    const p = frameForHull(1, x0, y0), e = frameForHull(3, x0 + HULL_L + g, y0);
    return { frames: [p, e], hulls: [hullBox(p), hullBox(e)] };
  }
  const x0 = Math.floor(r.x + (r.w - HULL_A) / 2), y0 = Math.floor(r.y + (r.h - (2 * HULL_L + g)) / 2);
  const e = frameForHull(2, x0, y0), p = frameForHull(0, x0, y0 + HULL_L + g);
  return { frames: [p, e], hulls: [hullBox(p), hullBox(e)] };
}

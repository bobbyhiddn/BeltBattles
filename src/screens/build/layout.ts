// Build-screen layout. Reading order: shop cards (top) -> the cruiser at centre stage ->
// cargo tray docked under it; FIGHT sits beside the bow. Landscape parks the cruiser bow
// east (as it fights); portrait bow north. The screen picks its own integer scale.

import type { Rect } from "../../ui/ui";
import { HULL_A, HULL_L, frameForHull, hullBox, type DeckFrame } from "../../render/frame";

export type Sel =
  | { kind: "none" }
  | { kind: "offer"; wagon: number; slot: number }
  | { kind: "cargo"; uid: number }
  | { kind: "item"; uid: number }
  | { kind: "route"; index: number }
  | { kind: "turret"; index: number };

export const CARD_W = 46;
export const CARD_H = 42;
/** 0.6.2t (REQ-BFG-032, T5): a landscape shop card is wider (up to 70 px, as the row allows) and 4 px taller, so it
 *  shows its one-line effect under its name (shop.ts drawCard). The phone's 46 x 42 cards keep the old face: a tap
 *  opens the offer's panel, the tap preview. The reroll keeps CARD_W. */
export const WIDE_CARD_MAX_W = 70;
export const WIDE_CARD_H = 46;
const GAP = 3;
const BAR_H = 14;
const CARGO_H = 22;
/** Portrait: how far the bow turrets' barrels reach past the hull's bow edge (heavy: tip 20 px
 *  ahead of a pivot 9 px into the 14 px bow band), so no panel covers them. */
export const BARREL = 15;
/** Portrait NEXT BATTLE panel height, and the band holding it under the hero/details strip. */
export const FOE_H = 24;
const PORT_BAND = 43 + 2 + FOE_H;

export interface BuildLayout {
  W: number;
  H: number;
  portrait: boolean;
  bar: Rect;
  cards: Rect[]; // slot rects in shop order (5 offers), plus the reroll slot at the end
  reroll: Rect;
  perRow: number;
  tags: boolean; // room for merchant tags above the card groups
  frame: DeckFrame;
  hull: Rect;
  pad: Rect;
  cargo: Rect;
  fight: Rect;
  info: Rect; // inspector (landscape column) or the whole info band (portrait)
  foe: Rect | null; // next-battle card: beside FIGHT (landscape), bottom of the info band (portrait)
}

const LAND_MIN_W = 430;
const LAND_MIN_H = BAR_H + 6 + WIDE_CARD_H + 4 + HULL_A + 3 + CARGO_H + 2;

/** 0.6.2t (T5): a landscape offer card's width for `offers` cards in `W`: as wide as the row allows (the reroll keeps
 *  CARD_W, 8 px apart), at most WIDE_CARD_MAX_W, never under CARD_W. Exported for the tests. */
export function wideCardW(W: number, offers: number): number {
  const room = Math.floor((W - 12 - CARD_W - offers * GAP - 8) / Math.max(1, offers));
  return Math.max(CARD_W, Math.min(WIDE_CARD_MAX_W, room));
}
const PORT_MIN_W = HULL_A + 4;
const PORT_FIXED = BAR_H + 3 + 2 * CARD_H + GAP + 2 + BARREL + 2 + HULL_L + 4 + CARGO_H + 3;

export function buildScale(pw: number, ph: number, portrait: boolean): number {
  for (let s = 12; s > 1; s--) {
    const W = Math.floor(pw / s), H = Math.floor(ph / s);
    if (!portrait && W >= LAND_MIN_W && H >= LAND_MIN_H) return s;
    if (portrait && W >= PORT_MIN_W && H >= PORT_FIXED) return s;
  }
  return 1;
}

function cardRow(n: number, x0: number, y: number, perRow: number, step: number): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < n; i++) out.push({ x: x0 + (i % perRow) * step, y: y + Math.floor(i / perRow) * (CARD_H + GAP), w: CARD_W, h: CARD_H });
  return out;
}

export function buildLayout(W: number, H: number, portrait: boolean, offers: number): BuildLayout {
  const bar: Rect = { x: 0, y: 0, w: W, h: BAR_H };
  const slots = offers + 1; // + reroll
  if (!portrait) {
    const tags = true;
    const cy = BAR_H + 3 + 6;
    // 0.6.2t (T5): the offer cards are wide enough for their one-line effect (drawCard's wide face); the reroll keeps
    // CARD_W; the row is as tall as the wide cards
    const cardW = wideCardW(W, offers);
    const rowW = offers * cardW + CARD_W + offers * GAP + 8;
    const x0 = Math.round(W / 2 - rowW / 2);
    const cards: Rect[] = [];
    for (let i = 0; i < offers; i++) cards.push({ x: x0 + i * (cardW + GAP), y: cy, w: cardW, h: WIDE_CARD_H });
    const reroll: Rect = { x: x0 + offers * (cardW + GAP) + 8, y: cy, w: CARD_W, h: WIDE_CARD_H };
    const colL = Math.min(136, Math.round(W * 0.28));
    const colR = Math.min(150, Math.round(W * 0.3));
    const top = cy + WIDE_CARD_H + 5;
    const avail = H - top - CARGO_H - 4;
    const hy = top + Math.max(0, Math.floor((avail - HULL_A) / 2));
    const cx0 = 6 + colL, cx1 = W - 6 - colR;
    const hx = Math.round((cx0 + cx1) / 2 - HULL_L / 2);
    const frame = frameForHull(1, hx, hy);
    const hull = hullBox(frame);
    const cw = Math.min(cx1 - cx0 - 8, 200);
    const cargo: Rect = { x: Math.round((cx0 + cx1) / 2 - cw / 2), y: hull.y + HULL_A + 3, w: cw, h: CARGO_H };
    const rx = cx1 + 4, rw = colR - 4;
    return {
      W, H, portrait, bar, cards, reroll, perRow: slots, tags, frame, hull,
      pad: { x: hull.x - 5, y: hull.y - 5, w: hull.w + 10, h: hull.h + 10 },
      cargo,
      fight: { x: rx, y: Math.round(hull.y + HULL_A / 2 - 16), w: rw, h: 32 },
      info: { x: 6, y: top, w: colL - 8, h: cargo.y + CARGO_H - top },
      foe: { x: rx, y: top, w: rw, h: 40 },
    };
  }
  const perRow = Math.max(1, Math.floor((W - 8 + GAP) / (CARD_W + GAP)));
  const rows = Math.ceil(slots / perRow);
  const tags = rows === 1;
  const cy = BAR_H + 3 + (tags ? 6 : 0);
  const used = Math.min(perRow, slots);
  const rowW = used * CARD_W + (used - 1) * GAP;
  const cards = cardRow(slots, Math.round(W / 2 - rowW / 2), cy, perRow, CARD_W + GAP);
  const reroll = cards.pop()!;
  const shopBottom = cy + rows * CARD_H + (rows - 1) * GAP;
  // Band between the shop and the bow turrets' barrel tips: idle it holds the hero card over
  // the NEXT BATTLE panel; a selection or hover shows the details panel across all of it.
  const fixedBelow = 2 + BARREL + 2 + HULL_L + 4 + CARGO_H + 3;
  const spare = Math.max(0, H - shopBottom - fixedBelow);
  const band = Math.min(PORT_BAND, spare);
  const info: Rect = { x: 3, y: shopBottom + 2, w: W - 6, h: band };
  const hy = info.y + band + 2 + BARREL + Math.floor((spare - band) / 2);
  const frame = frameForHull(0, Math.round(W / 2 - HULL_A / 2), hy);
  const hull = hullBox(frame);
  const fw = Math.min(64, Math.round(W * 0.36));
  const ry = hull.y + HULL_L + 4;
  return {
    W, H, portrait, bar, cards, reroll, perRow, tags, frame, hull,
    pad: { x: hull.x - 3, y: hull.y - 4, w: hull.w + 6, h: hull.h + 8 },
    cargo: { x: 3, y: ry, w: W - fw - 9, h: CARGO_H },
    fight: { x: W - fw - 3, y: ry - 1, w: fw, h: CARGO_H + 2 },
    info,
    foe: band >= FOE_H ? { x: info.x, y: info.y + band - FOE_H, w: info.w, h: FOE_H } : null,
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Caravan convoy: cards slide in from the right with a stagger; out to the left on reroll. */
export class Caravan {
  state: "in" | "parked" | "out" = "in";
  t = 0;
  count = 0;
  private then: (() => void) | null = null;

  arrive(n: number): void {
    this.count = n;
    this.state = "in";
    this.t = 0;
  }

  /** No caravan (refit after a road event): nothing slides, input is live at once. */
  park(): void {
    this.state = "parked";
    this.t = 0;
    this.count = 0;
    this.then = null;
  }

  leave(then: () => void): void {
    this.state = "out";
    this.t = 0;
    this.then = then;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.state === "in" && this.t > (this.count - 1) * 0.07 + 0.55) this.state = "parked";
    if (this.state === "out" && this.t > (this.count - 1) * 0.04 + 0.3) {
      const f = this.then;
      this.then = null;
      this.state = "parked";
      f?.();
    }
  }

  /** Horizontal offset of card i (0 when parked). */
  dx(i: number, W: number): number {
    if (this.state === "in") {
      const k = clamp01((this.t - i * 0.07) / 0.45);
      return Math.round((W * 0.8) * Math.pow(1 - k, 3));
    }
    if (this.state === "out") {
      const k = clamp01((this.t - i * 0.04) / 0.25);
      return Math.round(-W * k * k);
    }
    return 0;
  }

  get ready(): boolean {
    return this.state === "parked";
  }
}

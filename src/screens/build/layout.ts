// Build-screen layout. Reading order: shop cards (top) -> the cruiser at centre stage ->
// cargo tray docked under it; FIGHT sits beside the bow. Landscape parks the cruiser bow
// east (as it fights); portrait bow north. The screen picks its own integer scale.

import type { Rect } from "../../ui/ui";
import { HULL_A, HULL_L, frameForHull, hullBox, type DeckFrame } from "../../render/frame";
import { PHONE_CSS } from "../../ui/tap"; // zoom (REQ-BFG-040)

export type Sel =
  | { kind: "none" }
  | { kind: "offer"; wagon: number; slot: number }
  | { kind: "cargo"; uid: number }
  | { kind: "item"; uid: number }
  | { kind: "route"; index: number }
  | { kind: "turret"; index: number }
  // shoptap (REQ-BFG-035): a turret's bought core or one of its gear pieces (Build.mods, by uid), with its own panel
  // (inspector.ts fittedPanel: its text, TO CARGO and SELL). Only a touch tap on the selected turret picks one.
  | { kind: "fitted"; uid: number };

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
/** The portrait band's full height (69): the hero card over the NEXT BATTLE panel, or the details panel. shoptap2: a
 *  finger's panel is never shorter (panelRect). */
export const PORT_BAND = 43 + 2 + FOE_H;

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
  /** zoom (REQ-BFG-040): a portrait phone's layout (buildLayout's `phone`): the shop's rows balanced, the band as tall as
   *  the tallest panel needs (phoneBand). Absent on every other layout, which is exactly as before. */
  phone?: true;
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

/** zoom (REQ-BFG-040): the biggest art pixel a phone's build screen draws, in CSS px. At 402x690 @3 the build screen
 *  picked x7 (2.33 CSS px an art pixel: the hull 91% of the width, a 3 px details band); the title and the battle draw
 *  at x5 on that phone. */
export const PHONE_ART_CSS = 1.75;

/** zoom: a phone, as ui/tap.ts tells one (the view's short side under PHONE_CSS CSS px), from its device px `pw` x `ph`
 *  (computeView: floor(CSS px x dpr)). Exact for whole CSS px sizes: 499 is a phone at any dpr >= 1, 500 never is. */
export function phoneScreen(pw: number, ph: number, dpr: number): boolean {
  return Math.min(pw, ph) + 1 <= PHONE_CSS * dpr;
}

/** The build screen's integer device-pixel scale: the largest whose logical screen holds the layout's fixed parts.
 *  zoom (REQ-BFG-040, D1): on a phone (`dpr` given: phoneScreen) never above floor(PHONE_ART_CSS x dpr), an art pixel
 *  at most 1.75 CSS px (x5 at DPR 3, x4 at 2.625, x3 at 2); the cap only lowers the pick. Without `dpr`, or not a
 *  phone, exactly as before. */
export function buildScale(pw: number, ph: number, portrait: boolean, dpr?: number): number {
  const top = dpr !== undefined && phoneScreen(pw, ph, dpr) ? Math.min(12, Math.max(1, Math.floor(PHONE_ART_CSS * dpr))) : 12;
  for (let s = top; s > 1; s--) {
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

/**
 * zoom (REQ-BFG-040, D2): the details band a portrait phone's build screen gives its panels at width `W`: what the
 * tallest touch panel needs to show every block (every kept block, every rule sentence, the hint and the flavour) in
 * the band's layout at that width, and no more. Measured over every panel a finger can open (885 kinds: each buyable
 * module as a card, in cargo and placed or fitted at every star, every turret installed with a core and gear, the
 * heroes' starting parts and belts) at every width 186-340 px (tests/zoom.test.ts pins it): a THUNDERER ★3 with a core
 * and gear is the tallest everywhere; a panel's fullest form without its flavour and hint needs at most 144.
 */
export function phoneBand(W: number): number {
  return W < 194 ? 169 : W < 278 ? 162 : W < 281 ? 155 : W < 316 ? 148 : W < 320 ? 141 : 136;
}

/** The build screen's layout. zoom (REQ-BFG-040, D2): `phone`, a portrait phone's (phoneScreen): the shop's slots in
 *  balanced rows (five offers and the reroll 3 + 3, not 4 + 2: perRow = ceil(slots / rows)); the details band takes the
 *  room the zoom frees, up to phoneBand(W), the hull centred in what is left as before; the idle hero card and NEXT
 *  BATTLE (PORT_BAND tall together) centred in a taller band. Landscape, and `phone` false, exactly as before. */
export function buildLayout(W: number, H: number, portrait: boolean, offers: number, phone = false): BuildLayout {
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
  const fit = Math.max(1, Math.floor((W - 8 + GAP) / (CARD_W + GAP)));
  const perRow = phone ? Math.ceil(slots / Math.ceil(slots / fit)) : fit; // zoom (D2): a phone's rows balanced
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
  // zoom (D2): a phone's band takes the room the zoom frees, up to what its tallest panel needs (phoneBand)
  const band = Math.min(phone ? phoneBand(W) : PORT_BAND, spare);
  const info: Rect = { x: 3, y: shopBottom + 2, w: W - 6, h: band };
  // zoom: idle, the hero card over NEXT BATTLE (PORT_BAND tall together) sits in the middle of a taller band
  const idle = Math.max(0, Math.floor((band - PORT_BAND) / 2));
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
    foe: band >= FOE_H ? { x: info.x, y: info.y + idle + Math.min(band, PORT_BAND) - FOE_H, w: info.w, h: FOE_H } : null,
    ...(phone ? { phone: true as const } : {}),
  };
}

/** zoom: the idle hero card's rect over the NEXT BATTLE card `foe` in band `info` (chrome.ts): the band above the card
 *  (as before, where the band is PORT_BAND or less), at most the PORT_BAND band's 43 px, right above the card. */
export function heroCardRect(info: Rect, foe: Rect): Rect {
  const y = Math.max(info.y, foe.y - 2 - (PORT_BAND - 2 - FOE_H));
  return { x: info.x, y, w: info.w, h: foe.y - 2 - y };
}

/**
 * shoptap2 (REQ-BFG-034, REQ-BFG-035): the details panel's rect after a finger's tap on a portrait phone. The band between
 * the shop and the bow gets what is left of the screen's height once the shop, the bow, the hull and the cargo tray have
 * theirs (buildLayout: min(PORT_BAND, spare)): its full 69 px on a 390x844 screen, but a phone's browser never gives a page
 * all of its screen. Safari's toolbars leave 390x664 on a 390x844 iPhone (a 40 px band) and 430x739 on a 430x932 one
 * (24 px); iOS 26's Compact tab bar leaves an iPhone 16 Pro 402x718 (15 px), so a 390x844 iPhone about 390x700 (8 px: no
 * panel at all). There a panel showed its header and no description, or nothing. So where the band is shorter than `h`
 * (PORT_BAND, the band a 390x844 screen gives, unless panelArea asks for more) the panel is `h` tall, over its neighbour,
 * away from what it describes. `grow` "down": a shop card's, over the bow (the card stays in sight, to drag); "up":
 * anything else's, over the shop (the deck stays in sight, to tap the next part). It stays under the top bar and above
 * the cargo tray (where that leaves less than `h`, as tall as it can be). The band itself where it is that tall, and the
 * landscape column, as they are. Pure (tests).
 */
export function panelRect(L: BuildLayout, grow: "up" | "down", h: number = PORT_BAND): Rect {
  const a = L.info;
  if (!L.portrait || a.h >= h) return a;
  const top = L.bar.y + L.bar.h + 1, bottom = L.cargo.y - 2;
  const ph = Math.min(h, bottom - top);
  const y = Math.max(top, Math.min(bottom - ph, grow === "down" ? a.y : a.y + a.h - ph));
  return { x: a.x, y, w: a.w, h: ph };
}

/** shoptap2: how much a finger's panel grows at a time where its kept text doesn't fit (a 3x5 body line's pitch). */
export const PANEL_STEP = 6;

/**
 * shoptap2: the rect the details panel is drawn in this frame (BuildScreen.panelArea): the layout's band or column, or,
 * after a finger's press (`o.touch`) on a portrait phone, for a selection that has a panel, the band grown (panelRect: a
 * shop card's down, anything else's up) to PORT_BAND, and then PANEL_STEP at a time while its kept text doesn't show
 * whole. `fit(r)` plans the panel in `r`: null, no panel (the band, idle as before); true, its kept text shows whole.
 * Only on the narrowest build screens (160-164 px: a 375-wide iPhone at x7) does a panel need more than PORT_BAND; a
 * band already 69 px tall stays as it is wherever the panel fits it (every panel on 390x844). Never for a mouse (its
 * panels are 0.8.0's), nor while a mouse hovers a card (`o.hover`), nor during a drag or a belt draw (`o.busy`: the band,
 * so the deck stays in sight to drop on), nor in the landscape column. Pure (tests).
 */
export function panelArea(L: BuildLayout, sel: Sel, o: { touch: boolean; hover: boolean; busy: boolean }, fit: (r: Rect) => boolean | null): Rect {
  if (!L.portrait || !o.touch || o.hover || o.busy || sel.kind === "none") return L.info;
  const grow = sel.kind === "offer" ? "down" : "up";
  const most = L.cargo.y - 2 - (L.bar.y + L.bar.h + 1);
  for (let h = Math.max(PORT_BAND, L.info.h); ; h += PANEL_STEP) {
    const r = panelRect(L, grow, h), f = fit(r);
    if (f === null) return L.info;
    if (f || r.h >= most) return r;
  }
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

// Build-screen layout. Reading order: shop cards (top) -> the cruiser at centre stage ->
// cargo tray docked under it; FIGHT sits beside the bow. Landscape parks the cruiser bow
// east (as it fights); portrait bow north. The screen picks its own integer scale.

import type { Rect } from "../../ui/ui";
import type { G } from "../../render/pixel"; // ZOOM-1 (REQ-BFG-080): inCarrier
import { HULL_A, HULL_L, frameForHull, hullBox, type DeckFrame } from "../../render/frame";
import { PHONE_CSS } from "../../ui/tap"; // zoom (REQ-BFG-040)
import { TAP_CSS } from "../../ui/tap"; // bb-0.8.6 (REQ-BFG-051 P5): the pack slots' finger target
import { OFFERS } from "../../sim/content"; // bb-0.8.6 (PACKS P5): buildScale's pack-row guard reads a full caravan

export type Sel =
  | { kind: "none" }
  | { kind: "offer"; wagon: number; slot: number }
  | { kind: "cargo"; uid: number }
  | { kind: "item"; uid: number }
  | { kind: "route"; index: number }
  | { kind: "turret"; index: number }
  // shoptap (REQ-BFG-035): a turret's bought core or one of its gear pieces (Build.mods, by uid), with its own panel
  // (inspector.ts fittedPanel: its text, TO CARGO and SELL). Only a touch tap on the selected turret picks one.
  | { kind: "fitted"; uid: number }
  // ENCHANT-1 (REQ-BFG-085, E5): a word card (the ENCHANTER's offer `i`, or with `pick` the warlord pick's word `i`): its tap panel
  // (apply.ts wordSpec). Only ever selected with ENCHANT on.
  | { kind: "word"; pick: boolean; i: number };

export const CARD_W = 46;
export const CARD_H = 42;
/** 0.6.2t (REQ-BFG-032, T5): a landscape shop card is wider (up to 70 px, as the row allows) and 4 px taller, so it
 *  shows its one-line effect under its name (shop.ts drawCard). The phone's 46 x 42 cards keep the old face: a tap
 *  opens the offer's panel, the tap preview. The reroll keeps CARD_W. */
export const WIDE_CARD_MAX_W = 70;
export const WIDE_CARD_H = 46;
const GAP = 3;
/** The top bar's height (TAP-093: a portrait phone's grows where the screen spares it, phoneBarLift). */
export const BAR_H = 14;
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
  /** bb-0.8.6 (REQ-BFG-051, PACKS P5): the two fixed pack slots, BELT PACK then ARMOR PACK (packRects). */
  packs: Rect[];
  /** ZOOM-1 (REQ-BFG-080): the carrier's own zoom (CarrierCam). `frame` is in the carrier's space: the layout's px as if
   *  the carrier drew at the UI's scale; `hull` and `pad` are on screen (the zoomed hull box). k 1: the identity. */
  cam: CarrierCam;
  /** ENCHANT-1 (REQ-BFG-085, E5a): the ENCHANTER's wagon's cards and their tap targets (enchantStrip.ts wagonPlace), put in by
   *  BuildScreen.layoutAt on a day with the wagon and the switch on. Absent otherwise: buildLayout itself never sets it. */
  wagon?: { rects: Rect[]; hits: Rect[]; tag: { x: number; y: number } | null; shift: number; lift?: number }; // POLISH-6 (P6-6): `lift`, the most a card in the right column's gap may lift (enchantStrip.ts WagonPlace)
}

/**
 * ZOOM-1 (REQ-BFG-080): the build screen's carrier draws at its own whole device-pixel zoom `z` (BuildScreen.pickSub gives
 * the canvas a grid fine enough for both it and the UI's scale), scaled by k = z / scale about its pivot (x, y): the hull
 * box's centre, whole logical px, the same point in the carrier's space and on screen. A carrier-space point c is on
 * screen at pivot + k (c - pivot) (toScreen); a press goes back through toDeck. k 1 is the identity (today's).
 */
export interface CarrierCam {
  k: number;
  z: number;
  x: number;
  y: number;
}

/** ZOOM-1: the still carrier's reach about its pivot, art px, measured from render/carrier.ts and ship.ts by
 *  tests/zoom1.test.ts over every hero in every carrier style (the opaque pixels: the ship, its bow wave and the board
 *  plate; the shadow, 2-3 px further down and ahead, lies on the water and is left out): the transom 88 behind, the bow
 *  wave's tip 98 ahead, the flared stern 75 above and 74 below the centre line. */
export const CARRIER_BACK = 88, CARRIER_AHEAD = 98, CARRIER_UP = 75, CARRIER_DOWN = 74;

/** ZOOM-1: the carrier's box about its pivot (art px; x0, y0 its top-left offset): the ship stern to bow wave, and in
 *  portrait (bow north) the bow turrets' barrels, BARREL over the hull's bow edge (HULL_L / 2 above the pivot). 187 x 150
 *  landscape, 187 x 160 portrait. */
export function carrierBox(portrait: boolean): { x0: number; y0: number; w: number; h: number } {
  const up = portrait ? Math.max(CARRIER_UP, HULL_L / 2 + BARREL) : CARRIER_UP;
  return { x0: -CARRIER_BACK, y0: -up, w: CARRIER_BACK + CARRIER_AHEAD + 1, h: up + CARRIER_DOWN + 1 };
}

/** ZOOM-1 (REQ-BFG-080): the carrier's zoom, device px per art px: the largest whole one at which its box fits `room`
 *  (logical px at the UI's `scale`), a multiple of `unit` (the canvas grid's device px per canvas px, so each art px is
 *  whole canvas px), and never below the UI's scale (0.9.8's size). Pure (tests). */
export function carrierZoom(room: { w: number; h: number }, portrait: boolean, scale: number, unit = 1): number {
  const b = carrierBox(portrait), u = Math.max(1, unit);
  const fit = Math.floor(Math.min((room.w * scale) / b.w, (room.h * scale) / b.h) + 1e-9);
  return Math.max(scale, fit - (fit % u));
}

/** ZOOM-1: the layout's carrier camera; a layout made by hand without one (tests' hosts) is at k 1. */
const camOf = (L: Pick<BuildLayout, "cam">): CarrierCam => (L.cam as CarrierCam | undefined) ?? { k: 1, z: 0, x: 0, y: 0 };

/** ZOOM-1: a carrier-space point on screen (logical px). */
export function toScreen(L: Pick<BuildLayout, "cam">, x: number, y: number): { x: number; y: number } {
  const c = camOf(L);
  return { x: c.x + c.k * (x - c.x), y: c.y + c.k * (y - c.y) };
}

/** ZOOM-1: a screen point (logical px, a press) in the carrier's space: what the deck's hit tests read. */
export function toDeck(L: Pick<BuildLayout, "cam">, x: number, y: number): { x: number; y: number } {
  const c = camOf(L);
  return { x: c.x + (x - c.x) / c.k, y: c.y + (y - c.y) / c.k };
}

/** ZOOM-1: a carrier-space rect on screen. */
export function screenRect(L: Pick<BuildLayout, "cam">, r: Rect): Rect {
  const p = toScreen(L, r.x, r.y), k = camOf(L).k;
  return { x: p.x, y: p.y, w: r.w * k, h: r.h * k };
}

/** ZOOM-1: draw `fn` in the carrier's space (the deck, belts, parts, ship, its labels, cues and effects): scaled by k
 *  about the pivot. At rest every art px is z / unit whole canvas px (the pivot is whole, k x the canvas grid whole). */
export function inCarrier(g: G, L: Pick<BuildLayout, "cam">, fn: () => void): void {
  const c = camOf(L);
  if (c.k === 1) return fn();
  g.save();
  g.translate(c.x * (1 - c.k), c.y * (1 - c.k));
  g.scale(c.k, c.k);
  try {
    fn();
  } finally {
    g.restore();
  }
}

const LAND_MIN_W = 430;
/** The smallest landscape screen height (logical px) the build screen lays out at (253). ZOOM-1: exported for
 *  runeRowFits, which keeps 0.9.8's landscape test (the cargo tray no longer sits under the hull). */
export const LAND_MIN_H = BAR_H + 6 + WIDE_CARD_H + 4 + HULL_A + 3 + CARGO_H + 2;

/** 0.6.2t (T5): a landscape offer card's width for `offers` cards in `W`: as wide as the row allows (the reroll keeps
 *  CARD_W, 8 px apart), at most WIDE_CARD_MAX_W, never under CARD_W. Exported for the tests. */
export function wideCardW(W: number, offers: number): number {
  const room = Math.floor((W - 12 - CARD_W - offers * GAP - 8) / Math.max(1, offers));
  return Math.max(CARD_W, Math.min(WIDE_CARD_MAX_W, room));
}

/** bb-0.8.6 (REQ-BFG-051, PACKS P5; oracle 43f2c3d185b37c07): the two fixed pack slots (BELT PACK, ARMOR PACK) sit beside
 *  REROLL, at most PACK_W wide. On a phone (ui/tap.ts isPhone: portrait or landscape) each is a finger's target, at least
 *  tapPx(view) art px both ways and never under PACK_MIN_W (30 art px: 45 CSS px at a phone's smallest art pixel, 1.5 CSS
 *  px). On a desk's landscape row (a mouse) the two are stacked in a column, each half REROLL's height, at least
 *  PACK_LAND_MIN_W wide (the one-line "+25 HULL", 30 px in the 3x5 face, inside the frame). */
export const PACK_W = 34;
export const PACK_MIN_W = 30;
export const PACK_LAND_MIN_W = 32;
/** bb-0.8.6 (PACKS P5): REROLL's narrowest, on the narrowest landscape rows (its label, 23 px, and price still show). */
export const REROLL_MIN_W = 32;
/** bb-0.8.6 (PACKS P5): the narrowest landscape card: wideCardW at the narrowest landscape screen (430), where every card's
 *  one-line effect fits (tests/abilityText.test.ts checks 430-480); the pack slots never push a card below it. */
export const CARD_TEXT_MIN_W = 69;

/** bb-0.8.6 (PACKS P5): a landscape shop row with room for the packs right of REROLL. A desk (`tap` 0): the stacked
 *  column, PACK_W wide. A landscape phone (`tap` > 0, tapPx(view)): the two side by side, each max(tap, PACK_MIN_W) wide.
 *  As before (the 8 px gap, REROLL CARD_W wide) where W holds it; on the narrowest rows the gap before REROLL goes first,
 *  then REROLL narrows (to REROLL_MIN_W), then the desk's column (to PACK_LAND_MIN_W). The cards never narrow below
 *  CARD_TEXT_MIN_W (buildLayout). `fits` false: even then the packs don't fit (a landscape phone's go elsewhere,
 *  packRects). Exported for the tests. */
export function landscapeRow(W: number, offers: number, cardW: number, tap = 0): { gap: number; rerollW: number; packW: number; rowW: number; side: boolean; fits: boolean } {
  const side = tap > 0;
  let gap = 8, rerollW = CARD_W, packW = side ? Math.max(tap, PACK_MIN_W) : PACK_W;
  const row = () => offers * cardW + offers * GAP + gap + rerollW + (side ? 2 : 1) * (GAP + packW);
  const room = W - 3;
  if (row() > room) gap = 0;
  if (row() > room) rerollW = Math.max(REROLL_MIN_W, rerollW - (row() - room));
  if (!side && row() > room) packW = Math.max(PACK_LAND_MIN_W, packW - (row() - room));
  return { gap, rerollW, packW, rowW: row(), side, fits: row() <= room };
}

/** bb-0.8.6 (PACKS P5): a portrait shop's pack column in the margin right of its widest row: the slot width it holds
 *  (at most PACK_W), and whether that is enough (`need`: a phone's max(tapPx, PACK_MIN_W); elsewhere PACK_MIN_W). */
function portraitColumn(W: number, right: number, need: number): { x: number; w: number; ok: boolean } {
  const x = right + GAP, w = Math.min(PACK_W, W - 1 - x);
  return { x, w, ok: w >= need };
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
  const phone = dpr !== undefined && phoneScreen(pw, ph, dpr);
  const top = phone ? Math.min(12, Math.max(1, Math.floor(PHONE_ART_CSS * dpr!))) : 12;
  for (let s = top; s > 1; s--) {
    const W = Math.floor(pw / s), H = Math.floor(ph / s);
    if (!portrait && W >= LAND_MIN_W && H >= LAND_MIN_H) return s;
    if (portrait && W >= PORT_MIN_W && H >= PORT_FIXED && packRowHolds(W, H, phone, phone ? Math.ceil(TAP_CSS / (s / dpr!)) : 0)) return s;
  }
  return 1;
}

/** bb-0.8.6 (REQ-BFG-051 P5; oracle b24d14b979bbded9 (2)): a portrait screen holds the pack slots at this size: they sit
 *  beside REROLL or in the grid's margin, or, where they need their own row under REROLL's, the screen still leaves the
 *  band at least FOE_H (NEXT BATTLE) below it, so nothing (FIGHT, the cargo tray) goes off screen. Read with buildLayout's
 *  own inputs at that size (OFFERS offers, so the scale never changes between visits; `phone`, `tap`). */
function packRowHolds(W: number, H: number, phone: boolean, tap: number): boolean {
  const L = buildLayout(W, H, true, OFFERS, phone, tap);
  const row = L.packs[0].y > L.reroll.y + L.reroll.h;
  return !row || L.info.h >= FOE_H;
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
 * U2d (REQ-BFG-046; re-measured with the new faces, the stat-row turret panel and the notices): the tallest is still the
 * THUNDERER ★3 with a core and gear (a RAIL GUN ★3 at 316-319), 7 to 14 px shorter: 155 / 148 / 141 / 134 / 129 (was
 * 169 / 162 / 155 / 148 / 141 / 136; the step at 278 is gone); without its flavour and hint a panel needs at most 130.
 * Y7b2 (the words, the new faces; cap's ruling e66379fbf3184e56, TEXT-STYLE 11.5: a display number, no rule), re-measured
 * at every W 186-340: the tallest is still the THUNDERER ★3 with a core and gear (a RAIL GUN ★3 at 316-319), 7 px shorter
 * at W 186-236: 148 at 186-193 (was 155), 141 at 194-315 (was 148 at 194-236, 141 at 237-315: the step at 237 is gone),
 * 134 at 316-319 and 129 at 320-340 (unchanged): 148 / 141 / 134 / 129 (was 155 / 148 / 141 / 134 / 129).
 */
export function phoneBand(W: number): number {
  // NUM-4 (REQ-BFG-047), re-measured (tests/zoom.test.ts): the turret panels' whole RATE numbers are narrower than the
  // decimal intervals, so the THUNDERER ★3 with a core and gear needs 141 from W 237 (was from 281); every other step holds
  // Y7b2 (the words; cap's ruling e66379fbf3184e56), re-measured at every W 186-340: 148 below 194 (was 155) and 141 from
  // 194 (was 148 at 194-236); 134 and 129 hold. Was: W < 194 ? 155 : W < 237 ? 148 : W < 316 ? 141 : W < 320 ? 134 : 129
  return W < 194 ? 148 : W < 316 ? 141 : W < 320 ? 134 : 129;
}

/**
 * ZOOM-1 (REQ-BFG-080, acceptance 2): the details band a portrait phone's build screen keeps at width `W` (art px) when the
 * carrier zooms: what at least 90% of the 899 panels a finger can open need to show their full description (fullText) in
 * the band at that width, measured at every W 186-340 (tests/zoom1.test.ts pins it: the 90th of the sorted heights):
 * 60 to W 235, 57 at 236-237, 55 at 238-239, 53 at 240-245, 51 at 246-247, 48 at 248-249, 45 from 250. The rest grow over
 * the shop rows (panelArea), never over the carrier. phoneBand(W), the tallest's need, stays the cap where the screen
 * spares more.
 * SPACE-1 (REQ-BFG-087, D6; REVIEW-ZOOM1 carry-forward 3): re-measured after the words1 merge (WORDS-1's plain words) at
 * every W 186-340: three runs moved, 238-239 53 -> 55, 246-247 48 -> 51 and 248-249 45 -> 48 (the old pins fit 89.5-89.9%
 * there); every other run holds, the operator's 402x690 (W 241) at 53, and no pinned view sits at a moved width, so every
 * PICKS row stays. Was: W < 236 ? 60 : W < 238 ? 57 : W < 246 ? 53 : W < 248 ? 48 : 45.
 */
export function phoneBand90(W: number): number {
  return W < 236 ? 60 : W < 238 ? 57 : W < 240 ? 55 : W < 246 ? 53 : W < 248 ? 51 : W < 250 ? 48 : 45;
}

/** ZOOM-1: idle, a phone's band holds NEXT BATTLE (FOE_H) under the hero card, at least HERO_MIN tall (its compact form:
 *  the name over HULL, BELT and FEEDS; inspector.ts drawHeroStrip), 2 px apart. */
export const HERO_MIN = 24;
export const IDLE_MIN = HERO_MIN + 2 + FOE_H;

/** ZOOM-1: a portrait layout's height under the band at carrier zoom k: 1 px, the carrier's box (the barrels' tips to the
 *  flared stern's last row), the cargo tray right under it and the 3 px foot. 186 at k 1: 0.9.8's (its PORT_BELOW less
 *  the band's own 2 px), so every layout at k 1, and so every scale pick (buildScale, runeRowFits, phoneBarLift: they lay
 *  out at k 1), is 0.9.8's band. */
const portBelow = (k: number): number => 1 + k * carrierBox(true).h + CARGO_H + 3;

/** The build screen's layout. zoom (REQ-BFG-040, D2): `phone`, a portrait phone's (phoneScreen): the shop's slots in
 *  balanced rows (five offers and the reroll 3 + 3, not 4 + 2: perRow = ceil(slots / rows)); the details band takes the
 *  room the zoom frees, up to phoneBand(W), the hull centred in what is left as before; the idle hero card and NEXT
 *  BATTLE (PORT_BAND tall together) centred in a taller band. Landscape, and `phone` false, exactly as before.
 *  TAP-093 (backlog #340, REQ-BFG-040): `lift`, on a portrait phone's layout, the px the top bar grows (phoneBarLift: so
 *  its buttons' targets are a finger's tall); the shop and everything under it move down by it and the band keeps its
 *  height (the caller lifts only where the screen spares that much). 0, the default, is exactly as before. */
export function buildLayout(W: number, H: number, portrait: boolean, offers: number, phone = false, tap = 0, lift = 0,
  grid?: { scale: number; unit: number }): BuildLayout {
  // ZOOM-1 (REQ-BFG-080): `grid`, the view's device px per logical px (the UI's scale) and per canvas px (BuildScreen's
  // canvas grid): the carrier takes the largest whole zoom whose box fits the room the UI leaves (carrierZoom). Absent
  // (the scale picks, the tests' layouts): the carrier at the UI's scale, k 1.
  const zoomIn = (room: { w: number; h: number }, port: boolean): CarrierCam => {
    const z = grid ? carrierZoom(room, port, grid.scale, grid.unit) : 1;
    return { k: grid ? z / grid.scale : 1, z: grid ? z : 0, x: 0, y: 0 };
  };
  const up = portrait && phone ? Math.max(0, lift) : 0;
  const bar: Rect = { x: 0, y: 0, w: W, h: BAR_H + up };
  const slots = offers + 1; // + reroll
  if (!portrait) {
    const tags = true;
    const cy = BAR_H + 3 + 6;
    // 0.6.2t (T5): the offer cards are wide enough for their one-line effect (drawCard's wide face); the reroll keeps
    // CARD_W; the row is as tall as the wide cards
    // bb-0.8.6 (REQ-BFG-051, PACKS P5): the row is centred with the packs beside REROLL (landscapeRow; `tap`, a landscape
    // phone's finger target: the two side by side); where even the narrowed row can't hold them, the cards keep 430's
    // width (CARD_TEXT_MIN_W); a landscape phone's packs that still don't fit go elsewhere (landPacksAway)
    let cardW = wideCardW(W, offers);
    let lr = landscapeRow(W, offers, cardW, tap);
    while (!lr.fits && cardW > CARD_TEXT_MIN_W) lr = landscapeRow(W, offers, --cardW, tap);
    const away = lr.side && !lr.fits;
    if (away) {
      cardW = wideCardW(W, offers);
      lr = { ...lr, gap: 8, rerollW: CARD_W, rowW: offers * cardW + offers * GAP + 8 + CARD_W };
    }
    const x0 = Math.round(W / 2 - lr.rowW / 2);
    const cards: Rect[] = [];
    for (let i = 0; i < offers; i++) cards.push({ x: x0 + i * (cardW + GAP), y: cy, w: cardW, h: WIDE_CARD_H });
    const reroll: Rect = { x: x0 + offers * (cardW + GAP) + lr.gap, y: cy, w: lr.rerollW, h: WIDE_CARD_H };
    const colL = Math.min(136, Math.round(W * 0.28));
    const colR = Math.min(150, Math.round(W * 0.3));
    const top = cy + WIDE_CARD_H + 5;
    const cx0 = 6 + colL, cx1 = W - 6 - colR;
    // ZOOM-1 (REQ-BFG-080, call 4): the carrier alone in the middle column, from under the shop row to 2 px off the foot
    // (the cargo tray moves to the right column, under FIGHT), at the largest zoom whose box fits there; its box centred
    const box = carrierBox(false);
    const cam = zoomIn({ w: cx1 - cx0, h: H - 2 - top }, false);
    cam.x = Math.round((cx0 + cx1) / 2 - cam.k * (box.x0 + box.w / 2));
    cam.y = Math.round((top + H - 2) / 2 - cam.k * (box.y0 + box.h / 2));
    const frame = frameForHull(1, cam.x - HULL_L / 2, cam.y - HULL_A / 2);
    const hull = screenRect({ cam }, hullBox(frame));
    const rx = cx1 + 4, rw = colR - 4;
    // FIGHT beside the bow, at the hull's middle as before; NEXT BATTLE at the column's top
    const fight: Rect = { x: rx, y: Math.round(cam.y - 16), w: rw, h: 32 }, foe: Rect = { x: rx, y: top, w: rw, h: 40 };
    // ZOOM-1: the cargo tray under FIGHT, two rows of slots (the column holds 6-7 a row; 0.9.8's tray under the hull held
    // up to 10), else (a short screen) one row; never past the foot
    const two = fight.y + fight.h + 4 + CARGO_H + 19 <= H - 2;
    const cargo: Rect = { x: rx, y: Math.min(fight.y + fight.h + 4, H - 2 - CARGO_H), w: rw, h: CARGO_H + (two ? 19 : 0) };
    // bb-0.8.6 (PACKS P5): the packs: a desk's stacked column right of REROLL; a landscape phone's two side by side
    // (ZOOM-1: a landscape phone's that go elsewhere keep clear of the cargo tray under FIGHT as of FIGHT itself)
    const px = reroll.x + reroll.w + GAP;
    const packs: Rect[] = !lr.side
      ? stacked(px, reroll.y, lr.packW, reroll.h)
      : !away
        ? [{ x: px, y: reroll.y, w: lr.packW, h: reroll.h }, { x: px + lr.packW + GAP, y: reroll.y, w: lr.packW, h: reroll.h }]
        : landPacksAway(W, H, foe, { ...fight, h: cargo.y + cargo.h - fight.y }, Math.max(tap, PACK_MIN_W));
    return {
      W, H, portrait, bar, cards, reroll, perRow: slots, tags, frame, hull,
      pad: { x: hull.x - 5, y: hull.y - 5, w: hull.w + 10, h: hull.h + 10 },
      cargo,
      fight,
      info: { x: 6, y: top, w: colL - 8, h: H - 2 - top },
      foe,
      packs,
      cam,
    };
  }
  const fit = Math.max(1, Math.floor((W - 8 + GAP) / (CARD_W + GAP)));
  const perRow = phone ? Math.ceil(slots / Math.ceil(slots / fit)) : fit; // zoom (D2): a phone's rows balanced
  const rows = Math.ceil(slots / perRow);
  const tags = rows === 1;
  const cy = BAR_H + up + 3 + (tags ? 6 : 0);
  const used = Math.min(perRow, slots);
  const rowW = used * CARD_W + (used - 1) * GAP;
  const cards = cardRow(slots, Math.round(W / 2 - rowW / 2), cy, perRow, CARD_W + GAP);
  const reroll = cards.pop()!;
  // bb-0.8.6 (REQ-BFG-051, PACKS P5): the packs in the margin right of the widest row (no card moves): BELT PACK beside
  // the row above REROLL's, ARMOR PACK beside REROLL, each a card tall (one row: stacked beside REROLL). Where the margin
  // can't hold a slot (`need`: a phone's finger target), a pack row under REROLL's row instead, the two side by side
  // ending at REROLL's right edge; the band below gives up its height.
  // A non-phone screen whose last row is short (REROLL ends before the widest row) has room right of REROLL in its own
  // row: the two side by side there.
  const need = phone ? Math.max(tap, PACK_MIN_W) : PACK_MIN_W;
  const right = Math.max(...[...cards, reroll].map((r) => r.x + r.w)), rEnd = reroll.x + reroll.w;
  const above = [...new Set([...cards, reroll].map((r) => r.y))].sort((a, b) => a - b).filter((y) => y < reroll.y).pop();
  // one row: the two stacked beside REROLL, each half its height, in the short face (at least PACK_LAND_MIN_W wide)
  const col = portraitColumn(W, right, above === undefined ? Math.max(need, PACK_LAND_MIN_W) : need);
  const besideW = Math.min(PACK_W, Math.floor((W - 1 - rEnd) / 2) - GAP);
  const beside = rEnd < right && besideW >= need;
  const packH = Math.max(tap, PACK_MIN_W), packW = Math.max(need, PACK_W);
  const packRow = beside || col.ok ? 0 : packH + GAP;
  const shopBottom = cy + rows * CARD_H + (rows - 1) * GAP + packRow;
  const rowX = Math.max(1, rEnd - 2 * packW - GAP), rowY = reroll.y + reroll.h + GAP;
  const packs: Rect[] = beside
    ? [{ x: rEnd + GAP, y: reroll.y, w: besideW, h: CARD_H }, { x: rEnd + 2 * GAP + besideW, y: reroll.y, w: besideW, h: CARD_H }]
    : col.ok
      ? above === undefined ? stacked(col.x, reroll.y, col.w, reroll.h) : [{ x: col.x, y: above, w: col.w, h: CARD_H }, { x: col.x, y: reroll.y, w: col.w, h: CARD_H }]
      : [{ x: rowX, y: rowY, w: packW, h: packH }, { x: rowX + packW + GAP, y: rowY, w: packW, h: packH }];
  // Band between the shop and the bow turrets' barrel tips: idle it holds the hero card over
  // the NEXT BATTLE panel; a selection or hover shows the details panel across all of it.
  // ZOOM-1 (REQ-BFG-080): the band keeps at least `least` (a phone's: what 90% of the panels need, phoneBand90, and the
  // idle pair; elsewhere PORT_BAND, as before); the carrier takes the largest zoom whose box fits what is left (the
  // screen's width, the height under that band); the band then takes what the zoom leaves, up to its cap (phoneBand(W),
  // the tallest panel's need; PORT_BAND), and the carrier is centred in the rest. At k 1 every number is 0.9.8's.
  const infoY = shopBottom + 2;
  const box = carrierBox(true);
  const least = phone ? Math.max(phoneBand90(W), IDLE_MIN) : PORT_BAND;
  const cam = zoomIn({ w: W, h: H - infoY - least - portBelow(0) }, true);
  const k = cam.k;
  const spare = Math.max(0, Math.floor(H - infoY - portBelow(k) + 1e-9)); // whole px (k x the box may not be)
  // zoom (D2): a phone's band takes the room the zoom frees, up to what its tallest panel needs (phoneBand)
  const band = Math.min(phone ? phoneBand(W) : PORT_BAND, spare);
  const info: Rect = { x: 3, y: infoY, w: W - 6, h: band };
  // zoom: idle, the hero card over NEXT BATTLE (PORT_BAND tall together) sits in the middle of a taller band
  const idle = Math.max(0, Math.floor((band - PORT_BAND) / 2));
  // the box's top 1 px under the band, centred in what is left; its pivot on whole px (rounded down: the box never
  // reaches up into the band)
  const boxTop = info.y + band + 1 + Math.floor((spare - band) / 2);
  cam.x = Math.round(W / 2 - k * (box.x0 + box.w / 2));
  cam.y = Math.ceil(boxTop - k * box.y0 - 1e-9);
  const frame = frameForHull(0, cam.x - HULL_A / 2, cam.y - HULL_L / 2);
  const hull = screenRect({ cam }, hullBox(frame));
  const fw = Math.min(64, Math.round(W * 0.36));
  // the cargo tray and FIGHT right under the box's last row (the flared stern)
  const ry = Math.min(H - 3 - CARGO_H, Math.ceil(cam.y + k * (box.y0 + box.h) - 1e-9));
  return {
    W, H, portrait, bar, cards, reroll, perRow, tags, frame, hull,
    pad: { x: hull.x - 3, y: hull.y - 4, w: hull.w + 6, h: hull.h + 8 },
    cargo: { x: 3, y: ry, w: W - fw - 9, h: CARGO_H },
    // ZOOM-1: FIGHT from the tray's top (was 1 px above it, on the flared stern's last row), 1 px off the screen's foot
    fight: { x: W - fw - 3, y: ry, w: fw, h: CARGO_H + 2 },
    info,
    foe: band >= FOE_H ? { x: info.x, y: info.y + idle + Math.min(band, PORT_BAND) - FOE_H, w: info.w, h: FOE_H } : null,
    ...(phone ? { phone: true as const } : {}),
    packs,
    cam,
  };
}

/** A portrait layout's fixed height under the shop at k 1, the band aside: the band's 2 px and portBelow(1) (0.9.8's
 *  2 + BARREL + 2 + HULL_L + 4 + CARGO_H + 3). */
const PORT_BELOW = 2 + 186;

/**
 * TAP-093 (backlog #340, REQ-BFG-040; the brief's means 1): how far a portrait phone's top bar grows (buildLayout's `lift`)
 * so the whole bar is a finger's target tall (`tap`, tapPx: 27 px at x5 @3) and SND and MENU take it, the shop moved down
 * by as much: only where the screen `W` x `H` spares that height beyond the band's full height (phoneBand) with a rune
 * row held (`row`, runeRowH for one rune: a run holds one from its first dawn), so the band never shrinks and the bar
 * doesn't change when the first rune is taken. 0 elsewhere (those screens put one MENU in the bar's corner, chrome.ts):
 * of the views measured only 390x844 @3 lifts (13 px, of the 33 it spares with a rune row; 66 without). Pure (tests).
 */
export function phoneBarLift(W: number, H: number, offers: number, tap: number, row: number): number {
  const need = Math.max(0, tap - BAR_H);
  if (!need) return 0;
  const L = buildLayout(W, H - row, true, offers, true, tap);
  const left = H - row - (L.info.y - 2) - PORT_BELOW - L.info.h; // what the hull is centred in, under a full band
  return L.info.h >= phoneBand(W) && left >= need ? need : 0;
}

/**
 * TAP-093b (backlog #340, REQ-BFG-040): the side of the corner MENU's finger square on the layout `L` (`tap`, tapPx of
 * the view) where chrome.ts drawTopBar puts MENU in the bar's top-left corner: a portrait phone's layout whose bar is
 * shorter than a finger's target (not lifted, phoneBarLift). 0 elsewhere: a lifted bar keeps SND and MENU at its right
 * end; landscape and the desktop have no `phone` layout. The rune bar's chips start right of it (runeBar.ts runeChipX0).
 * Pure.
 */
export function cornerTap(L: Pick<BuildLayout, "phone" | "bar">, tap: number): number {
  return L.phone && tap > 0 && L.bar.h < tap ? tap : 0;
}

/**
 * TAP-093 (the brief's means 2): the corner MENU's target on a portrait phone whose bar doesn't lift: from the screen's
 * top-left corner, `tap` px tall (stopping at `floor`, a grown details panel's top) and at least `tap` wide (past the drawn
 * button `r`), on dead space only: kept 1 px clear of every target under the bar (`others`: the shop cards, REROLL, the
 * packs, the rune chips). Where one of them cuts into that rect, an L: the full width down to that target's top, and the
 * full height left of it (every point one button's). The first rect is the tallest. TAP-093b: the rune chips start at
 * tap + 1 while the corner MENU is up (runeBar.ts runeChipX0), so with runes held the column left of them is a full
 * finger's square (before, at DPR 2 the first chip 28 px in cut a finger's 30 to 27); the first card still cuts it with
 * no rune held on the narrowest x5 screens (320-330 CSS px @3: the card row starts 24-27 px in). Pure (tests).
 */
export function cornerTarget(r: Rect, tap: number, others: Rect[], floor = Infinity): Rect[] {
  const w = Math.max(tap, r.x + r.w + 2), h = Math.max(r.y + r.h + 1, Math.min(tap, floor));
  const cut = others.filter((o) => o.w > 0 && o.h > 0 && o.x < w + 1 && o.y < h + 1 && o.x + o.w > 0 && o.y + o.h > 0);
  if (!cut.length) return [{ x: 0, y: 0, w, h }];
  const left = Math.min(...cut.map((o) => o.x)) - 1, top = Math.max(r.y + r.h + 1, Math.min(...cut.map((o) => o.y)) - 1);
  return left > 0 ? [{ x: 0, y: 0, w: left, h }, { x: 0, y: 0, w, h: top }] : [{ x: 0, y: 0, w, h: top }];
}

/** bb-0.8.6 (PACKS P5): two slots stacked in a column at (x, y), each half of `h` (a 2 px gap between). */
function stacked(x: number, y: number, w: number, h: number): Rect[] {
  const s = Math.floor((h - 2) / 2);
  return [{ x, y, w, h: s }, { x, y: y + s + 2, w, h: s }];
}

/** bb-0.8.6 (PACKS P5; oracle 43f2c3d185b37c07 (3)): a landscape phone whose row can't hold two finger-sized slots beside
 *  REROLL: the nearest free space that holds them, side by side at the right column's right edge: between NEXT BATTLE and
 *  FIGHT where that holds a slot, else under FIGHT. */
function landPacksAway(W: number, H: number, foe: Rect, fight: Rect, s: number): Rect[] {
  const x1 = fight.x + fight.w, y = foe.y + foe.h + 3 + s + 3 <= fight.y ? foe.y + foe.h + 3 : Math.min(H - 1 - s, fight.y + fight.h + 3);
  return [{ x: x1 - 2 * s - GAP, y, w: s, h: s }, { x: x1 - s, y, w: s, h: s }];
}

/**
 * bb-0.8.6 (REQ-BFG-051, PACKS P5): the two fixed pack slots' rects, BELT PACK then ARMOR PACK, beside REROLL. They don't
 * ride with the caravan (no offer slot, nothing a reroll touches). Landscape: a column right of REROLL (buildLayout's row
 * leaves room for it), the two stacked, each half REROLL's height. Portrait: a column right of the card grid, in the
 * margin the centred rows leave (no card moves): with two or more rows BELT PACK beside the row above REROLL's and ARMOR
 * PACK beside REROLL, each a card tall; a single row stacks them beside REROLL. On a phone the margin is 34-57 px (320-430
 * CSS px wide), so each slot is PACK_MIN_W-PACK_W wide and 42 tall: at least 45 by 63 CSS px. Pure (tests).
 */
export function packRects(L: BuildLayout): Rect[] {
  return L.packs;
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
  // ZOOM-1 (REQ-BFG-080, call 5): grown up, a panel ends at the band's foot: it never reaches down over the carrier
  const top = L.bar.y + L.bar.h + 1, bottom = grow === "up" ? a.y + a.h : L.cargo.y - 2;
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
 * SPACE-1 (REQ-BFG-087, D4): `fit(r, at)` says whether the panel shows in `r` as it must "band" (in the band: its full
 * text, its gaps at least GAP_MIN) or "grown" (while growing: its gaps at GAP); inspector.ts panelFit is the build screen's.
 */
export function panelArea(L: BuildLayout, sel: Sel, o: { touch: boolean; hover: boolean; busy: boolean },
  fit: (r: Rect, at: "band" | "grown") => boolean | null): Rect {
  if (!L.portrait || !o.touch || o.hover || o.busy || sel.kind === "none") return L.info;
  // ZOOM-1 (REQ-BFG-080, call 5): every panel grows up over the shop rows (a shop card's grew down over the bow: the
  // carrier now fills that room), never over the carrier; a press on what it covers still reaches what is under it
  // (chrome.ts `through`). On a phone's layout the band is sized for 90% of the panels (phoneBand90): a panel that shows
  // whole there stays in it, the rest grow from the band's height. SPACE-1 (D4): whole with its gaps at least GAP_MIN in
  // the band; growing, it stops at the first height that shows its gaps at GAP (or at the limit, as before)
  const grow = "up";
  const most = L.info.y + L.info.h - (L.bar.y + L.bar.h + 1);
  if (L.phone) {
    const f0 = fit(L.info, "band");
    if (f0 === null || f0) return L.info;
  }
  for (let h = L.phone ? L.info.h + PANEL_STEP : Math.max(PORT_BAND, L.info.h); ; h += PANEL_STEP) {
    const r = panelRect(L, grow, h), f = fit(r, "grown");
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

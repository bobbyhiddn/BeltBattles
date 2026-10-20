// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E4, E5, E7, E12): what the build screen DRAWS for the words, and where: the ENCHANTER's wagon (the
// caravan's extra wagon: its tag and its two word cards, the word's icon and its price, nothing else, REQ-BFG-115), the warlord pick's
// strip (two word cards without a price, and NO THANKS), the merge pick's prompt, and APPLY's glow on the parts that take the word
// (with the free sides as small arrows when WIDE asks). The state and the rules are apply.ts; this file is geometry and drawing.
//
// WHERE THE WAGON SITS: the regular cards never move (buildLayout is untouched, so with ENCHANT off, or on a day with no wagon, every
// rectangle of the shop is what it was). The wagon takes the free margin left of the shop block, between the screen's edge and the
// first card: two cards side by side where the margin is wide (the desk: 2 x 41 px of the margin's 92), else stacked (a portrait
// phone: 2 x 44 x 42 in the margin's 49, the shop block's own height). On a phone the card's tap target is TAP_CSS CSS px tall and
// wide within the margin (ui/tap.ts tapPx), as the other cards' are.

import { ENCHANT_DEFS, enchantRules, type EnchantId } from "../../sim/enchant";
import { enchantChoices, pendingEnchantPick, type EnchantTarget } from "../../game/enchanter";
import { defOf, itemByUid, rotOf, turretSlots, type Placed } from "../../sim/deck";
import { footBox } from "../../sim/foot";
import type { Run } from "../../game/run";
import { C } from "../../render/palette";
import { boxRect, footX, footY, sdir } from "../../render/frame";
import { frame, makeCanvas, rect, type G } from "../../render/pixel";
import { drawText, textWidth } from "../../render/font";
import { coinIcon } from "../../render/sprites";
import { enchantIcon } from "../../render/enchantArt";
import { button, panel, tapRect, type Rect } from "../../ui/ui";
import { tapPx } from "../../ui/tap";
import { cardFrame, cardPriceX, cardZones, priceColour, SOLD_ALPHA } from "./shop";
import { shapedPiece } from "./shapeEdit";
import { dragSlop } from "./edit";
import { CARD_H, CARD_W, cornerTap, type BuildLayout } from "./layout";
import {
  answerMerge, applyState, cancelApply, chooseTarget, mergePrompt, pressOf, setPress, skipPick, tapWord, wagonSlides, wagonUp, wordHover,
} from "./apply";
import type { BuildScreen } from "./build";

// ---------------------------------------------------------------------------------------------------------------- the wagon's place

const GAP = 3, PAD = 2, CLEAR = 4, MIN_SIDE = 34, MIN_W = 30, MIN_H = 30;

/** The wagon's cards, their tap targets and the tag's place; `shift`, the px the details band (portrait) or column (landscape) gives up at
 *  its top for the wagon (0: the cards sit in the margin and nothing else moves). */
export interface WagonPlace {
  rects: Rect[];
  hits: Rect[];
  tag: { x: number; y: number } | null;
  shift: number;
}

type PlaceLayout = Pick<BuildLayout, "cards" | "reroll" | "packs" | "tags" | "info" | "portrait" | "W" | "bar" | "phone">;

/** Grow each card's tap target to a finger (`tap` px both ways) inside `within`, the neighbours' targets never meeting. */
function fingerHits(rects: Rect[], tap: number, within: Rect): Rect[] {
  const hits = rects.map((r) => (tap > 0 ? tapRect(r, tap, within, tap) : { ...r }));
  for (let i = 1; i < hits.length; i++) {
    const a = hits[i - 1], b = hits[i], ra = rects[i - 1], rb = rects[i];
    if (rb.x >= ra.x + ra.w) { // side by side: the overlap splits at the middle of the gap between the cards
      if (b.x < a.x + a.w) {
        const mid = Math.round((ra.x + ra.w + rb.x) / 2);
        a.w = Math.max(ra.w, mid - a.x);
        b.w += b.x - mid;
        b.x = mid;
      }
    } else if (b.y < a.y + a.h) { // stacked: the same, down the gap
      const mid = Math.round((ra.y + ra.h + rb.y) / 2);
      a.h = Math.max(ra.h, mid - a.y);
      b.h += b.y - mid;
      b.y = mid;
    }
  }
  return hits;
}

/** The margin left of the shop block (the screen's edge to the first card): side by side where it holds the cards at MIN_SIDE px or
 *  more, else stacked at MIN_W by MIN_H or more; on a phone (`tap` > 0) only where each card is a finger wide and tall. */
function inMargin(L: PlaceLayout, n: number, tap: number): WagonPlace | null {
  const all = [...L.cards, L.reroll];
  // a phone whose bar is shorter than a finger keeps its corner MENU's finger square (tap px tall from the corner: layout.ts cornerTarget):
  // the cards start under it, so the MENU's target stays a finger's
  const x0 = Math.min(...all.map((r) => r.x)), top = Math.max(Math.min(...all.map((r) => r.y)), cornerTap(L, tap) > 0 ? tap + 1 : 0);
  const bottom = Math.max(...[...all, ...L.packs].map((r) => r.y + r.h));
  const hRow = L.cards[0].h, room = { x: PAD, y: top, w: x0 - PAD - CLEAR, h: bottom - top };
  let rects: Rect[] | null = null;
  const side = Math.min(CARD_W, Math.floor((room.w - (n - 1) * GAP) / n));
  if (side >= MIN_SIDE && room.h >= Math.min(hRow, MIN_H)) {
    const total = n * side + (n - 1) * GAP, left = x0 - CLEAR - total;
    rects = Array.from({ length: n }, (_, i) => ({ x: left + i * (side + GAP), y: top, w: side, h: Math.min(hRow, room.h) }));
  } else {
    const w = Math.min(CARD_W - 2, room.w), h = Math.min(CARD_H, Math.floor((room.h - (n - 1) * GAP) / n));
    if (w >= MIN_W && h >= MIN_H) rects = Array.from({ length: n }, (_, i) => ({ x: x0 - CLEAR - w, y: top + i * (h + GAP), w, h }));
  }
  if (!rects || (tap > 0 && rects.some((r) => r.w < tap || r.h < tap))) return null;
  const hits = fingerHits(rects, tap, { x: 0, y: top, w: Math.max(1, x0 - 1), h: Math.max(room.h, 1) });
  return { rects, hits, tag: L.tags ? { x: rects[0].x, y: rects[0].y - 8 } : null, shift: 0 };
}

/** No margin holds the wagon: a portrait screen gives it a row under the shop block (the band under it gives up that much of its top), a
 *  landscape one the top of the details column (the column starts under it). */
function inRow(L: PlaceLayout, n: number, tap: number): WagonPlace | null {
  const tag = L.tags ? 8 : 0;
  if (L.portrait) {
    const bottom = Math.max(...[...L.cards, L.reroll, ...L.packs].map((r) => r.y + r.h));
    const total = n * CARD_W + (n - 1) * GAP, x = Math.round(L.W / 2 - total / 2), y = bottom + GAP + tag;
    const rects = Array.from({ length: n }, (_, i): Rect => ({ x: x + i * (CARD_W + GAP), y, w: CARD_W, h: CARD_H }));
    const hits = fingerHits(rects, tap, { x: 0, y, w: L.W, h: CARD_H });
    return { rects, hits, tag: tag ? { x: rects[0].x, y: y - 8 } : null, shift: Math.max(0, y + CARD_H + 2 - L.info.y) };
  }
  const w = Math.min(CARD_W, Math.floor((L.info.w - (n - 1) * GAP) / n)), h = Math.min(L.cards[0].h, L.info.h - tag - 40);
  if (w < MIN_W || h < MIN_H) return null;
  const y = L.info.y + tag, x = L.info.x;
  const rects = Array.from({ length: n }, (_, i): Rect => ({ x: x + i * (w + GAP), y, w, h }));
  return { rects, hits: fingerHits(rects, tap, { x: L.info.x, y, w: L.info.w, h }), tag: tag ? { x, y: y - 8 } : null, shift: tag + h + GAP + 1 };
}

/**
 * Where `n` word cards go on layout `L` (the regular cards, REROLL and the packs are never moved): in the free margin left of the shop
 * block where it holds them (the desk: 2 x 41 px of the margin's 92; a portrait phone: 2 x 43 x 42 in the margin's 49, the block's own
 * height), else in a row under the block (portrait) or at the top of the details column (landscape), which then start `shift` px
 * lower. `tap` (a phone's finger target in logical px, ui/tap.ts tapPx; 0 on a desk) grows each card's tap target to a finger.
 * null: nowhere holds them. Pure (tests).
 */
export function wagonPlace(L: PlaceLayout, n: number, tap = 0): WagonPlace | null {
  if (n <= 0 || !L.cards.length) return null;
  return inMargin(L, n, tap) ?? inRow(L, n, tap);
}

/** The layout with the words' places in it (build.ts layoutAt): the ENCHANTER's wagon (`L.wagon`, and the band or column under it
 *  starting lower where no margin held it), then, in a landscape screen, the merge pick's prompt (the column starts under it). The
 *  layout as it is with ENCHANT off, no wagon today and no merge pick: the same object. */
export function wordLayout(L: BuildLayout, run: Run, tap = 0): BuildLayout {
  if (!enchantRules()) return L;
  let out = L;
  if (wagonUp(run)) {
    const p = wagonPlace(L, run.shop.enchanter!.offers.length, tap);
    if (p) out = lowerInfo({ ...L, wagon: p }, p.shift);
  }
  return mergeShift(out, run, tap);
}

/** The details band (portrait) or column (landscape) of `L` starting `d` px lower (the NEXT BATTLE strip of a portrait band with it). */
function lowerInfo(L: BuildLayout, d: number): BuildLayout {
  if (d <= 0) return L;
  const info = { ...L.info, y: L.info.y + d, h: Math.max(0, L.info.h - d) };
  return { ...L, info, foe: L.portrait && L.foe ? (info.h >= L.foe.h ? { ...L.foe, y: L.foe.y + d } : null) : L.foe };
}

/** One word card on the screen: which card it is, its word, its price (null: a pick's card is free), whether it is sold, where it is drawn
 *  (with the caravan's roll-in) and its tap target. */
export interface WordCardView {
  pick: boolean;
  i: number;
  id: EnchantId;
  price: number | null;
  sold: boolean;
  rect: Rect;
  hit: Rect;
}

/** The ENCHANTER's wagon as drawn this frame (its cards slide in with the caravan at the dawn), or null. */
export function wagonView(s: BuildScreen): { cards: WordCardView[]; tag: { x: number; y: number } | null } | null {
  const run = s.run, lay = s.L.wagon;
  if (!wagonUp(run) || !lay) return null;
  const offers = run.shop.enchanter!.offers, L = s.L;
  const base = s.offers().length + 1;
  const dx = (j: number): number => (wagonSlides(s) ? s.caravan.dx(base + j, L.W) : 0);
  const cards = offers.map((o, i): WordCardView => ({
    pick: false, i, id: o.ench as EnchantId, price: o.price, sold: o.sold,
    rect: { ...lay.rects[i], x: lay.rects[i].x + dx(i) }, hit: { ...lay.hits[i], x: lay.hits[i].x + dx(i) },
  }));
  return { cards, tag: lay.tag ? { x: lay.tag.x + dx(0), y: lay.tag.y } : null };
}

// ---------------------------------------------------------------------------------------------------------------- the pick strip

/** The warlord pick's strip as laid out: the banner's rect (REFIT's row), its heading, its two cards (and their tap targets), NO THANKS. */
export interface PickRects {
  r: Rect;
  head: { x: number; y: number };
  cards: Rect[];
  hits: Rect[];
  skip: Rect;
  skipHit: Rect;
}

/** The banner's rect (chrome.ts drawRefitBanner): the whole shop block. */
export function bannerRect(L: Pick<BuildLayout, "cards" | "reroll" | "tags">): Rect {
  const first = L.cards[0], last = L.reroll;
  const x = Math.min(first.x, last.x), y = first.y - (L.tags ? 7 : 0);
  return { x, y, w: Math.max(first.x + first.w, last.x + last.w) - x, h: Math.max(first.y + first.h, last.y + last.h) - y };
}

/** The pick strip inside the banner: tall (a phone's two-row block): the heading, the two cards side by side, NO THANKS under them;
 *  wide (the desk's one row): the heading, the cards, then NO THANKS at the right. `tap`: a finger's target (a phone). Pure (tests). */
export function pickRects(L: Pick<BuildLayout, "cards" | "reroll" | "tags">, tap = 0, n = 2): PickRects { // ENCHANT-2 (T3): `n`, the cards of the pick (2: a warlord's; 1: the ASH SHRINE's word)
  const r = bannerRect(L);
  const cw = Math.min(CARD_W - 2, Math.floor((r.w - 3 * GAP) / 2)), tall = r.h >= 70;
  const idx = Array.from({ length: n }, (_, i) => i);
  if (tall) {
    const ch = Math.min(CARD_H, r.h - 26 - Math.max(0, tap - 22)), cy = r.y + 11;
    const total = n * cw + (n - 1) * GAP, x = Math.round(r.x + r.w / 2 - total / 2);
    const cards = idx.map((i): Rect => ({ x: x + i * (cw + GAP), y: cy, w: cw, h: ch }));
    const bh = Math.max(15, tap), skip = { x: r.x + 6, y: Math.min(r.y + r.h - 2 - bh, cy + ch + 3), w: r.w - 12, h: bh };
    return { r, head: { x: Math.round(r.x + r.w / 2), y: r.y + 4 }, cards, hits: cards.map((c) => (tap ? tapRect(c, tap, r, tap) : c)), skip, skipHit: skip };
  }
  const ch = Math.min(r.h - 8, CARD_H + 4), cy = r.y + Math.round((r.h - ch) / 2);
  const x = r.x + 74;
  const cards = idx.map((i): Rect => ({ x: x + i * (cw + GAP), y: cy, w: Math.min(cw, 56), h: ch }));
  const sw = 64, bh = Math.max(15, Math.min(r.h - 12, Math.max(tap, 22)));
  const skip = { x: r.x + r.w - sw - 8, y: r.y + Math.round((r.h - bh) / 2), w: sw, h: bh };
  return { r, head: { x: r.x + 8, y: r.y + Math.round(r.h / 2) - 6 }, cards, hits: cards.map((c) => (tap ? tapRect(c, tap, r, tap) : c)), skip, skipHit: skip };
}

/** The pick's cards and NO THANKS as drawn this frame (REFIT's banner row), or null with no pick open. */
export function pickView(s: BuildScreen): { lay: PickRects; cards: WordCardView[] } | null {
  const pk = enchantRules() ? pendingEnchantPick(s.run) : null;
  if (!pk || !s.refit) return null;
  const lay = pickRects(s.L, s.fingerPx, pk.words.length); // ENCHANT-2 (T3): a one-word pick (the ASH SHRINE's) has one card
  const cards = pk.words.map((w, i): WordCardView => ({ pick: true, i, id: w as EnchantId, price: null, sold: false, rect: lay.cards[i], hit: lay.hits[i] }));
  return { lay, cards };
}

/** The ENCHANTER's word card under a press, or null. A sold card and a rolling caravan take no press. (The pick's cards are UI regions
 *  of the banner, drawPick: a press there never reaches the editor.) */
export function wordCardAt(s: BuildScreen, x: number, y: number): WordCardView | null {
  if (!enchantRules() || !s.caravan.ready) return null;
  return (wagonView(s)?.cards ?? []).find((c) => !c.sold && x >= c.hit.x && y >= c.hit.y && x < c.hit.x + c.hit.w && y < c.hit.y + c.hit.h) ?? null;
}

/** The tap targets the wagon and the pick add to the shop's (the phone's corner MENU keeps clear of them: chrome.ts drawTopBar). */
export function wordHits(s: BuildScreen): Rect[] {
  return [...(wagonView(s)?.cards ?? []), ...(pickView(s)?.cards ?? [])].map((c) => c.hit);
}

// ---------------------------------------------------------------------------------------------------------------- drawing

const ICON2 = new Map<string, HTMLCanvasElement>();
/** A word's icon doubled, pixel for pixel (the 12x12 icon at 24x24, as a shop card's piece icon is), cached. */
function wordIcon2(id: EnchantId): HTMLCanvasElement {
  let c = ICON2.get(id);
  if (!c) {
    const src = enchantIcon(id), [cv, g] = makeCanvas(src.width * 2, src.height * 2);
    g.drawImage(src, 0, 0, src.width, src.height, 0, 0, src.width * 2, src.height * 2);
    ICON2.set(id, (c = cv));
  }
  return c;
}

/**
 * One word card, in a shop card's frame (REQ-BFG-115: the icon and the price, nothing else): the word's icon at x2 (x1 on a card too
 * short for it), the price under it, the word's colour on the bar; a sold card is dim and prices nothing; a pick's card has no price.
 */
export function drawWordCard(g: G, r: Rect, id: EnchantId, o: { price: number | null; sold: boolean; affordable: boolean; selected: boolean; hover: boolean; t: number }): void {
  const def = ENCHANT_DEFS[id];
  const lift = o.selected ? 2 : o.hover ? 1 : 0, x = r.x, y = r.y - lift;
  if (lift) {
    rect(g, r.x + 2, r.y + r.h - 1, r.w - 1, 2, C.ink);
    rect(g, r.x + r.w, r.y + 2, 1, r.h - 1, C.ink);
  }
  cardFrame(g, x, y, r.w, r.h, o.sold ? C.slate1 : C.brass2, def.color, o.sold);
  const z = cardZones(r.w, r.h, o.price ?? undefined);
  const big = r.h >= 38, ic = big ? wordIcon2(id) : enchantIcon(id);
  const pic = z.pic, ix = Math.floor((r.w - ic.width) / 2), iy = pic.y + Math.floor((pic.h - ic.height) / 2) + (o.price === null && big ? 2 : 0);
  if (o.sold) g.globalAlpha = SOLD_ALPHA;
  g.drawImage(ic, x + ix, y + iy);
  g.globalAlpha = 1;
  if (!o.sold && o.price !== null) {
    const px = cardPriceX(x, r.w, o.price, false, false);
    g.drawImage(coinIcon(), px, y + r.h - 11);
    drawText(g, String(o.price), px + 7, y + r.h - 12, priceColour(o.affordable, false), { outline: C.ink });
  }
  if (o.selected) frame(g, x - 1, y - 1, r.w + 2, r.h + 2, Math.floor(o.t * 6) % 2 ? C.white : C.yellow);
  else if (o.hover) frame(g, x - 1, y - 1, r.w + 2, r.h + 2, C.bone);
}

/** The merchant tag above the wagon's first card: a ring (a shape beside the colour, as every merchant's) and ENCHANTER. */
export function drawEnchanterTag(g: G, x: number, y: number): void {
  const c = C.brass3;
  rect(g, x, y + 2, 3, 1, c);
  rect(g, x, y + 4, 3, 1, c);
  rect(g, x, y + 2, 1, 3, c);
  rect(g, x + 2, y + 2, 1, 3, c);
  drawText(g, "ENCHANTER", x + 5, y, C.slate4, { font: "3" });
}

const isSel = (s: BuildScreen, pick: boolean, i: number): boolean => s.sel.kind === "word" && s.sel.pick === pick && s.sel.i === i;

/** The ENCHANTER's wagon: its tag (on the desk) and its two word cards (chrome.ts drawShop calls it after the regular cards). */
export function drawWagon(g: G, s: BuildScreen): void {
  const v = wagonView(s);
  if (!v) return;
  if (v.tag) drawEnchanterTag(g, v.tag.x, v.tag.y);
  const hov = wordHover(s);
  for (const c of v.cards) {
    drawWordCard(g, c.rect, c.id, {
      price: c.price, sold: c.sold, affordable: s.run.gold >= (c.price ?? 0), selected: isSel(s, false, c.i) && !s.ed.carry,
      hover: !!hov && !hov.pick && hov.i === c.i, t: s.t,
    });
  }
}

/** REFIT's banner row while a warlord pick is open (chrome.ts drawRefitBanner draws the banner first, this replaces its words): the
 *  heading, the two words as cards (no price: it is free) and NO THANKS (the word is lost). */
export function drawPick(g: G, s: BuildScreen): void {
  const v = pickView(s);
  if (!v) return;
  const { lay } = v, ui = s.game.ui;
  panel(g, lay.r, "dark");
  ui.add({ id: "refitbanner", r: lay.r, block: true });
  const tall = lay.r.h >= 70;
  const shrine = pendingEnchantPick(s.run)?.no === 3; // ENCHANT-2 (T3): the ASH SHRINE's word, a pick of 1
  if (tall) drawText(g, shrine ? "THE SHRINE'S FREE ENCHANTMENT" : "PICK ONE FREE ENCHANTMENT", lay.head.x, lay.head.y, C.yellow, { font: "3", align: "center" }); // run 5, E10's fix round: was PICK A WORD
  else {
    drawText(g, shrine ? "SHRINE'S FREE" : "PICK ONE FREE", lay.head.x, lay.head.y, C.yellow, { font: "3" });
    drawText(g, "ENCHANTMENT", lay.head.x, lay.head.y + 7, C.yellow, { font: "3" });
  }
  for (const c of v.cards) {
    drawWordCard(g, c.rect, c.id, { price: null, sold: false, affordable: true, selected: isSel(s, true, c.i), hover: ui.hover === `enchpick${c.i}`, t: s.t });
    // the banner's own region takes every press inside it, so each card is a region too (registered after it, so it wins)
    ui.add({ id: `enchpick${c.i}`, r: c.hit, onTap: () => tapWord(s, { kind: "word", pick: true, i: c.i }), block: true });
  }
  button(ui, g, "enchskip", lay.skip, "NO THANKS", { font: "3", onTap: () => skipPick(s), hit: lay.skipHit });
}

// ---------------------------------------------------------------------------------------------------------------- the merge pick

/** The merge pick's prompt: where it is drawn (a landscape screen's details column gives it its top, a portrait one's band its foot) and its buttons. */
export function promptRects(L: Pick<BuildLayout, "info" | "portrait" | "W">, tap = 0): { r: Rect; a: Rect; b: Rect; text: { x: number; y: number } } {
  const bh = Math.max(15, tap), h = 4 + 5 + 3 + bh + 3;
  const r = L.portrait ? { x: L.info.x, y: L.info.y + L.info.h + 1, w: L.info.w, h } : { x: L.info.x, y: L.info.y - h - 2, w: L.info.w, h };
  const bw = Math.floor((r.w - 12) / 2), by = r.y + h - 3 - bh;
  return { r, a: { x: r.x + 4, y: by, w: bw, h: bh }, b: { x: r.x + 8 + bw, y: by, w: bw, h: bh }, text: { x: r.x + r.w / 2, y: r.y + 4 } };
}

/** The pixel height the merge prompt takes from a landscape details column (layout: the column starts under it). */
export const PROMPT_COLUMN = (tap = 0): number => 4 + 5 + 3 + Math.max(15, tap) + 3 + 2;

/** The merge pick (E4): `FIERY OR RISING?`, each word a button in its colour. The first keeps the word the survivor holds; the second
 *  takes the word the merge lost. It takes no press but its own two buttons, so nothing else is blocked (FIGHT included). */
export function drawMergePrompt(g: G, s: BuildScreen): void {
  const m = mergePrompt(s.run);
  if (!m) return;
  const P = promptRects(s.L, s.fingerPx), ui = s.game.ui;
  const kept = ENCHANT_DEFS[m.kept], lost = ENCHANT_DEFS[m.lost];
  panel(g, P.r, "dark");
  const q = `${kept.name} OR ${lost.name}?`;
  const w0 = textWidth(q, "3"), x0 = Math.round(P.text.x - w0 / 2);
  let x = x0;
  x += drawText(g, kept.name, x, P.text.y, kept.color, { font: "3" });
  x += drawText(g, " OR ", x, P.text.y, C.bone, { font: "3" });
  x += drawText(g, lost.name, x, P.text.y, lost.color, { font: "3" });
  drawText(g, "?", x, P.text.y, C.bone, { font: "3" });
  button(ui, g, "mergekeep", P.a, kept.name, { font: "3", active: true, onTap: () => answerMerge(s, false), hit: P.a });
  button(ui, g, "mergetake", P.b, lost.name, { font: "3", onTap: () => answerMerge(s, true), hit: P.b });
}

// ---------------------------------------------------------------------------------------------------------------- APPLY's glow

/** A placed piece's box in the carrier's space (the selection frame's box). */
export function itemBox(f: Parameters<typeof footX>[0], p: Placed): Rect {
  const d = defOf(p);
  if (shapedPiece(p.def)) {
    const fb = footBox(d, p.rot ?? 0), r = boxRect(f, p.x, p.y, fb.w, fb.h);
    return { x: Math.round(r.x), y: Math.round(r.y), w: r.w, h: r.h };
  }
  return { x: Math.round(footX(f, p.x, p.y, d.size)), y: Math.round(footY(f, p.x, p.y, d.size)), w: d.size * 12, h: d.size * 12 };
}

/** The colour of the glow a cargo piece gets in APPLY (the word's), or null: not open, or the word can't go on it. */
export function cargoGlow(s: BuildScreen, uid: number): string | null {
  const st = enchantRules() ? applyState(s) : null;
  if (!st) return null;
  const row = enchantChoices(s.run, st.word).find((c) => c.target.kind === "cargo" && c.target.uid === uid && s.run.inventory.some((i) => i.uid === uid));
  return row && row.reason === null ? ENCHANT_DEFS[st.word].color : null;
}

/** A pulsing glow on a rect (carrier space or UI space): a translucent wash in `col`, a blinking frame round it. */
export function glow(g: G, r: Rect, col: string, t: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(t * 6);
  g.globalAlpha = 0.14 + 0.16 * pulse;
  rect(g, r.x, r.y, r.w, r.h, col);
  g.globalAlpha = 1;
  frame(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, Math.floor(t * 5) % 2 ? C.white : col);
}

/** A 5-px arrow at (cx, cy) pointing the screen direction `d` (0 N, 1 E, 2 S, 3 W). */
function arrowGlyph(g: G, cx: number, cy: number, d: number, col: string): void {
  const rows = [1, 3, 5];
  rows.forEach((w, k) => {
    const o = k - 1; // -1 tip, 0, 1 base
    if (d === 0) rect(g, cx - (w >> 1), cy + o - 1, w, 1, col);
    else if (d === 2) rect(g, cx - (w >> 1), cy - o + 1, w, 1, col);
    else if (d === 1) rect(g, cx - o + 1, cy - (w >> 1), 1, w, col);
    else rect(g, cx + o - 1, cy - (w >> 1), 1, w, col);
  });
}

/**
 * APPLY, in the carrier's space (build.ts drawFrame calls it after the selection): every placed part and installed turret that takes the
 * word glows in the word's colour; the part chosen so far (the side and replace steps) is framed, and WIDE's free sides show as small
 * arrows on the edges they would take (the displayed side is (enchDir + the rig's rotation) mod 4, turned by the deck's facing).
 * Cargo pieces glow in the tray (chrome.ts drawCargo, cargoGlow). The refused parts keep their look: tapping one says why.
 */
export function drawApplyGlow(g: G, s: BuildScreen): void {
  const st = applyState(s);
  if (!st) return;
  const col = ENCHANT_DEFS[st.word].color, b = s.run.build, f = s.L.frame;
  for (const c of enchantChoices(s.run, st.word)) {
    if (c.reason !== null) continue;
    if (c.target.kind === "item") {
      const p = itemByUid(b, c.target.uid);
      if (p && !(s.ed.carry?.src.from === "deck" && s.ed.carry.uid === p.uid)) glow(g, itemBox(f, p), col, s.t);
    } else if (c.target.kind === "turret") {
      glow(g, s.deckTurretRect(c.target.slot), col, s.t);
    }
  }
  const t = st.target;
  if (!t) return;
  const box = t.kind === "item" ? (() => { const p = itemByUid(b, t.uid); return p ? itemBox(f, p) : null; })()
    : t.kind === "turret" && turretSlots(b)[t.slot]?.turret ? s.deckTurretRect(t.slot) : null;
  if (!box) return;
  frame(g, box.x - 2, box.y - 2, box.w + 4, box.h + 4, Math.floor(s.t * 5) % 2 ? C.white : C.yellow);
  if (st.step === "side" && st.sides && t.kind === "item") {
    const p = itemByUid(b, t.uid), rot = p ? rotOf(p) : 0;
    for (const sd of st.sides) {
      const d = sdir(f, (sd + rot) % 4), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      const ax = d === 1 ? box.x + box.w + 4 : d === 3 ? box.x - 5 : cx, ay = d === 0 ? box.y - 5 : d === 2 ? box.y + box.h + 4 : cy;
      arrowGlyph(g, Math.round(ax), Math.round(ay), d, C.yellow);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- the press

/** A press that belongs to the words: a word card, or (APPLY open) a part to apply to. True: the build screen's editor never sees it. */
export function applyDown(s: BuildScreen, x: number, y: number, kind: "mouse" | "touch" | "pen"): boolean {
  if (!enchantRules()) return false;
  const c = wordCardAt(s, x, y);
  if (c) {
    setPress(s, { x, y, kind, card: { kind: "word", pick: c.pick, i: c.i } });
    return true;
  }
  if (applyState(s)) {
    setPress(s, { x, y, kind, card: null });
    return true;
  }
  return false;
}

/** The release of a press applyDown took: a tap (a press that moved past the touch slop is none) on a word card or on a part. True when
 *  the press was ours. A part that takes the word applies it; one that refuses says why; a tap outside any part leaves APPLY. */
export function applyUp(s: BuildScreen, x: number, y: number): boolean {
  if (!enchantRules()) return false;
  const p = pressOf(s);
  if (!p) return false;
  setPress(s, null);
  if (Math.hypot(x - p.x, y - p.y) >= dragSlop(p.kind, s.cssPerPx())) return true;
  if (p.card) {
    tapWord(s, p.card);
    return true;
  }
  const t = targetAt(s, p.x, p.y);
  if (t) chooseTarget(s, t);
  else cancelApply(s);
  return true;
}

/** The pointer was cancelled: drop the press. */
export function applyCancelPress(s: BuildScreen): void {
  setPress(s, null);
}

/** The part under a press: the build screen's own hit test (edit.ts Editor.pickAt: the deck cell, the turret mount, the cargo slot) and,
 *  for a finger, the nearest part within half a finger's width of its box (never a tighter test). null: no part (a shop card, an
 *  empty cell, the sea). */
export function targetAt(s: BuildScreen, x: number, y: number): EnchantTarget | null {
  const src = s.ed.pickAt(x, y);
  const b = s.run.build;
  if (src?.from === "deck" || src?.from === "factory") return { kind: "item", uid: src.uid };
  if (src?.from === "turret") return turretSlots(b)[src.index]?.turret ? { kind: "turret", slot: src.index } : null;
  if (src?.from === "cargo") return { kind: "cargo", uid: src.uid };
  if (src?.from === "offer") return null;
  return s.touch ? nearestPart(s, x, y, Math.ceil(tapPx(s.game.view) / 2)) : null;
}

/** The distance from a point to a rect (0 inside it). */
const gap = (r: Rect, x: number, y: number): number => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));

/** The nearest part (placed, installed or in the visible cargo) to a press, within `reach` logical px of its box. */
export function nearestPart(s: BuildScreen, x: number, y: number, reach: number): EnchantTarget | null {
  let best: EnchantTarget | null = null, bd = reach + 1e-9;
  const near = (t: EnchantTarget, r: Rect): void => {
    const d = gap(r, x, y);
    if (d < bd) {
      bd = d;
      best = t;
    }
  };
  for (const p of s.run.build.items) near({ kind: "item", uid: p.uid }, s.itemScreenRect(p));
  turretSlots(s.run.build).forEach((sl, i) => { if (sl.turret) near({ kind: "turret", slot: i }, s.turretRect(i)); });
  const n = Math.min(s.cargoSlots(), s.run.inventory.length);
  for (let i = 0; i < n; i++) near({ kind: "cargo", uid: s.run.inventory[i].uid }, s.cargoHit(i));
  return best;
}

// ---------------------------------------------------------------------------------------------------------------- the layout hook

/** A landscape screen's details column starts under the merge pick's prompt (the column gives it its top); every other layout, and
 *  every screen with no merge pick open (or ENCHANT off), is returned as it is. `tap`: a phone's finger target. */
export function mergeShift(L: BuildLayout, run: Run, tap = 0): BuildLayout {
  if (!enchantRules() || L.portrait || !mergePrompt(run)) return L;
  const d = PROMPT_COLUMN(tap);
  return { ...L, info: { ...L.info, y: L.info.y + d, h: Math.max(0, L.info.h - d) } };
}

/** Is the wagon or a pick on this screen (a quick test for the tests and the touchcheck). */
export const wordsShown = (run: Run): boolean => enchantRules() && (wagonUp(run) || !!pendingEnchantPick(run));

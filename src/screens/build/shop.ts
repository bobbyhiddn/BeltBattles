// Shop cards: each wagon offer is a large card (icon, name, price, rarity edge, merchant
// stripe). Affordable cards pulse amber until something is bought (STUDY rule 13); the
// selected card lifts with a drop shadow. REROLL uses the same card frame.

import { ITEMS, MERCHANTS, PACK_ITEM, REROLL_COST, type ItemDef, type MerchantId, type PackId } from "../../sim/content";
import { hullShown } from "../../sim/hullScale"; // HULL-1a (REQ-BFG-079): the ARMOR PACK's amount on the day's hull
import type { ShopBadge } from "../../game/run";
import { C, RARITY_COLOR } from "../../render/palette";
import { frame, makeCanvas, rect, type G } from "../../render/pixel";
import { ICON, drawText, icons, textWidth, wrap } from "../../render/font";
import { coinIcon, itemIcon } from "../../render/sprites";
import type { Rect } from "../../ui/ui";
import { colourize, drawRich, lineWidth, wrapRich, type RichLine } from "../../ui/richText"; // 0.6.2t (T4, T5)
import { drawFamilyMarks, familiesText, familySpans } from "../../ui/families"; // 0.8.0 I1 M4 (REQ-BFG-023 part 2)
import { faceLines } from "../../ui/faces"; // TXT-095: the offer's tooltip, faces first (offerTooltip)
import { plainRigStats } from "../../ui/faces"; // CARD-2 (REQ-BFG-084, K6): a plain rig's tooltip is its stat row
import { statRow } from "../../ui/icons"; // CARD-2 (K6)
import { abilityText, type TextOpts } from "../../ui/abilityText"; // TXT-095: its fallback, the kept opening sentence
import { CARD_W } from "./layout";
import { faceBlocks } from "./faceBlocks"; // SHOPCARD-1 (REQ-BFG-115, F5): the panel's own face blocks, for the hover tooltip's whole face
import { shapeWord } from "../../ui/faces"; // SHAPES-1 (REQ-BFG-086.1): the type line's shape
import { drawShapePlate, gridCell } from "../../ui/shapePic"; // SHOPCARD-1 (REQ-BFG-113, G1): the card's shape grid (was SHAPES-1's miniShape); SC-0912: gridCell (was GRID_CELL)
import { shapedPiece } from "./shapeEdit"; // SHAPES-1
import { GAP } from "../../ui/spacing"; // CARD-3 (REQ-BFG-087, D4): the tooltip's family line's gap

export const MERCHANT_COLOR: Record<MerchantId, string> = {
  ironmonger: C.steel2,
  tinker: C.cyan,
  alchemist: C.plum4,
  gunsmith: C.red,
  scrapper: C.rust4,
  quartermaster: C.verd3,
  arcane: C.blue,
};

/** 0.6.1d (ARSENAL.md §8.1): colour is never the only cue, so each merchant tag also gets a shape. */
export const MERCHANT_GLYPH: Record<MerchantId, "square" | "diamond" | "circle" | "triangle" | "cross" | "bar" | "ring"> = {
  ironmonger: "square",
  tinker: "diamond",
  alchemist: "circle",
  gunsmith: "triangle",
  scrapper: "cross",
  quartermaster: "bar",
  arcane: "ring",
};

/** A 3x3 shape beside the merchant colour swatch (drawTag), so the cue never rests on colour alone. */
function drawMerchantGlyph(g: G, x: number, y: number, merchant: MerchantId): void {
  const shape = MERCHANT_GLYPH[merchant];
  const col = MERCHANT_COLOR[merchant];
  if (shape === "square") rect(g, x, y, 3, 3, col);
  else if (shape === "diamond") { rect(g, x + 1, y, 1, 1, col); rect(g, x, y + 1, 3, 1, col); rect(g, x + 1, y + 2, 1, 1, col); }
  else if (shape === "circle") { rect(g, x + 1, y, 1, 1, col); rect(g, x, y + 1, 3, 1, col); rect(g, x + 1, y + 1, 1, 1, C.ink); rect(g, x + 1, y + 2, 1, 1, col); }
  else if (shape === "triangle") { rect(g, x + 1, y, 1, 1, col); rect(g, x, y + 1, 3, 1, col); rect(g, x, y + 2, 3, 1, col); }
  // review-061 F6: an X; a 3x3 plus would repeat the tinker "diamond" pixel for pixel
  else if (shape === "cross") { for (const [u, v] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]) rect(g, x + u, y + v, 1, 1, col); }
  else if (shape === "bar") rect(g, x, y + 1, 3, 1, col);
  else { rect(g, x, y, 3, 1, col); rect(g, x, y + 2, 3, 1, col); rect(g, x, y, 1, 3, col); rect(g, x + 2, y, 1, 3, col); }
}

const SHORT: Record<string, string> = {
  calibrate: "CALIBRATE", chamber: "EXT. CHAMBER", plating: "ARMOR PACK", // bb-0.8.6 (REQ-BFG-051 P1): was ARMOR PLATE
  // 0.6.2p (item 4): a one-word name wider than the card's name width (CARD_W - 4 = 42 px in the 3x5 face: 11+
  // letters) spilled past the card's edges, as wrap() breaks only at spaces; it breaks with a hyphen instead
  counterweight: "COUNTER- WEIGHT", overclocker: "OVER- CLOCKER", hullbreaker: "HULL- BREAKER",
};

/** Card title split into at most two lines that fit the card. */
export function cardName(def: ItemDef, w: number): string[] {
  const name = SHORT[def.id] ?? def.name;
  const lines = wrap(name, w, "3");
  return lines.slice(0, 2);
}

export interface CardState {
  sold: boolean;
  affordable: boolean;
  selected: boolean;
  hover: boolean;
  pulse: boolean;
  hidden: boolean; // being dragged away
  shake: number; // red shake time left (invalid drop)
  badge?: ShopBadge | null; // 0.6.1d: live from run.ts:shopBadge (mergePreview), never stored on the offer
  /** SHOPCARD-1 (REQ-BFG-115, F4): the offer is cheaper than its list price (a scout's deal: run.shop.discount, run.ts priceOf):
   *  the small sale mark in the bottom-right corner. No other card state marks it. Absent: no mark. */
  sale?: boolean;
  /** SHOPCARD-1 (REQ-BFG-115): the three fields below fed the old faces (the wide face's effect lines, U2c's chip, CARD-3's
   *  gist rows). The card draws none of them now (every word moved to the tap panel and the desk's hover tooltip), so drawCard
   *  ignores them; they stay so the callers and tests that set them still compile (BRIEF-SHOPCARD1 rule 2: PLAIN-1F's and
   *  the next rules job's rows are not touched). */
  /** @deprecated SHOPCARD-1: not drawn. */
  effect?: string;
  /** @deprecated SHOPCARD-1: not drawn. */
  chip?: string;
  /** @deprecated SHOPCARD-1: not drawn. */
  gist?: readonly [string, string];
}

/** CARD-3 (A): the narrow face's gist rows (3x5): row A at y + 25 (the art gives up its room; the name moves up under the
 *  badge's row, from y + 13), row B on the chip's row (CARD_CHIP_Y). */
export const CARD_GIST_Y = 25;
export const CARD_GIST_NAME_Y = 13;

/** U2c: the narrow face's chip row (3x5, its glyphs on the price's last five rows: y + 32 .. 36 on a 42 px card). */
export const CARD_CHIP_Y = 32;

/** U2c: where a card draws its price (the coin's x, the number 7 px right of it): the wide face and a narrow face with a
 *  chip at the right, 4 px in (5 on the wide face); else centred. Pure (tests). */
export function cardPriceX(x: number, w: number, price: number, wide: boolean, chip: boolean): number {
  const tw = textWidth(String(price)) + 7;
  return wide ? x + w - 5 - tw : chip ? x + w - 4 - tw : Math.round(x + w / 2 - tw / 2);
}

/** U2c: the badge's drawn width on a card `w` px wide (drawBadge's), for the wide face's chip. U2f: "wait" is the owned
 *  marker's square. */
const badgeW = (badge: ShopBadge, maxW: number): number =>
  badge.kind === "wait" ? Math.min(maxW, OWNED_MARK_W) : Math.min(maxW, textWidth(badge.kind === "merge" ? `MERGE ★${badge.toStars}` : "MAX", "3") + 4);

/** U2f (REQ-BFG-070, REQ-BFG-046; the operator: "The items don't need to say 1 more to merge."): the owned marker's width
 *  and height, the ⓘ glyph's 5x7 ink square (keywords.ts). */
export const OWNED_MARK_W = 5;
export const OWNED_MARK_H = 7;

/** U2f: the owned marker, the "wait" badge's face (a copy you own that won't merge yet; was the grey `+1 ★2`, a copy
 *  count): wordless, no digit, no ★, no word. Two overlapped squares drawn with rects in dim slates, the copy in front
 *  over the corner of the one behind, on the ⓘ glyph's 5x7 ink square, in the badge's corner (x, y). Pure drawing (tests). */
export function drawOwnedMarker(g: G, x: number, y: number): void {
  rect(g, x, y, OWNED_MARK_W, OWNED_MARK_H, C.ink);
  rect(g, x + 1, y + 2, 2, 2, C.slate3); // the copy behind
  rect(g, x + 2, y + 3, 2, 2, C.slate4); // the copy in front
}

/** 0.6.2t (T5): the wide card's effect text: 2 lines of the 3x5 face, 2 px in from each edge (as the name's w - 4). */
export const CARD_EFFECT_LINES = 2;
/** 0.8.0 I1 M4: where a card's family marks start (3x3 each, 4 px apart), from the card's top-left. */
export const CARD_MARK_X = 3;
export const CARD_MARK_Y = 32;
/** 0.8.0 B1 M4 (VERIFIED-I1 call 7): the wide face's first effect line, from the card's top (was 21): its second line
 *  ends two rows above CARD_MARK_Y, so a clear row lies between the effect and the marks. */
export const CARD_EFFECT_Y = 20;
export const cardEffectWidth = (w: number): number => w - 4;

/** 0.6.2t: the effect's wrapped lines on a card `w` px wide (colourized: numbers white, keywords in their colours). */
export function cardEffectLines(effect: string, w: number, colour: string = C.bone): RichLine[] {
  return wrapRich(colourize(effect, colour), cardEffectWidth(w), "3");
}

/** 0.6.1d (ARSENAL.md §8.1): the MERGE badge, a small tab under the merchant stripe. MERGE ★3
 *  (a chain) is gold and flashes at 2Hz; the grey "+1 ★2" marks a copy that won't merge yet
 *  (a 2★ is owned, no 1★); MAX means only 3★ copies are owned. Sized to its text, not fixed 24x7,
 *  so it never clips inside the 46-wide card (deviation from the design's literal pixel size).
 *  0.6.1d2: exported so warlord-pick cards (warlordHud.ts) and event-choice cards (event/cards.ts)
 *  can draw the identical badge.
 *  U2f (REQ-BFG-070, REQ-BFG-046): "wait" draws the wordless owned marker (drawOwnedMarker), no copy count; MERGE ★n and
 *  MAX are unchanged.
 */
export function drawBadge(g: G, x: number, y: number, maxW: number, badge: ShopBadge, t: number): void {
  let bg: string, fg: string, label: string;
  if (badge.kind === "merge") {
    label = `MERGE ★${badge.toStars}`;
    if (badge.toStars >= 3) { bg = Math.floor(t * 4) % 2 ? C.yellow : C.amber; fg = C.ink; }
    else { bg = C.amber; fg = C.ink; }
  } else if (badge.kind === "wait") {
    return drawOwnedMarker(g, x, y);
  } else {
    label = "MAX"; bg = C.slate2; fg = C.bone;
  }
  const w = Math.min(maxW, textWidth(label, "3") + 4);
  // 0.6.1r F1: the 3x5 label needs a bg row above and below it. Drawn at y+2 inside an ink-ringed
  // box, its bottom row fell on the ink outline (ink on ink), so "MERGE ★2" lost a row. Same 7-row
  // footprint: bg top to bottom with ink sides, and the label in rows 1-5.
  rect(g, x, y, w, 7, C.ink);
  rect(g, x + 1, y, w - 2, 7, bg);
  drawText(g, label, x + w / 2, y + 1, fg, { font: "3", align: "center" });
}

function cardFrame(g: G, x: number, y: number, w: number, h: number, stripe: string, rarity: string, dim: boolean): void {
  rect(g, x, y, w, h, C.ink);
  rect(g, x + 1, y + 1, w - 2, h - 2, dim ? C.night : C.slate0);
  rect(g, x + 1, y + 1, w - 2, 3, dim ? C.slate1 : stripe);
  rect(g, x + 1, y + 4, w - 2, 1, C.ink);
  rect(g, x + 1, y + 5, 1, h - 8, dim ? C.slate0 : C.slate2);
  rect(g, x + w - 2, y + 5, 1, h - 8, C.navy);
  rect(g, x + 1, y + h - 3, w - 2, 2, dim ? C.slate1 : rarity);
}

// ------------------------------------------------------------------------------------------------ SHOPCARD-1: THE FACE
// SHOPCARD-1 (REQ-BFG-115, REQ-BFG-113; BRIEF-SHOPCARD1 F): every shop card, phone (46x42) and desk (up to 70x46), is ONE
// face drawn by this one function: the piece's icon at x2 (24x24), its price, and only these wordless marks (each with a clear
// px round it, none over the price, the picture's centre or another mark): the rarity gem and bar, the shape grid of a shaped
// piece (top-left of the picture area), the merge mark or the owned marker (bottom-left), the sale mark (right of the price, 1c). The only
// text on it is the price's digits. The name, the stat chip, the gist rows, the effect lines and the family marks moved to the
// tap panel (inspector.ts offerPanel) and the desk's hover tooltip (drawTooltip with offerFace).

/** F2: the icon's size on a card: itemIcon's 12x12 at x2. */
export const CARD_ICON = 24;
const ICON2 = new Map<string, HTMLCanvasElement>();
/** F2: the piece's icon doubled, pixel for pixel (nearest neighbour), cached per piece. */
export function iconX2(id: string): HTMLCanvasElement {
  let c = ICON2.get(id);
  if (!c) {
    const src = itemIcon(id), [cv, g] = makeCanvas(src.width * 2, src.height * 2);
    g.drawImage(src, 0, 0, src.width, src.height, 0, 0, src.width * 2, src.height * 2);
    ICON2.set(id, (c = cv));
  }
  return c;
}

/** F4: the merge mark's plate (a solid up triangle over a star and the target's digit), the sale mark's plate (a solid down
 *  triangle), and the dim a sold card's picture and grid draw at. SHOPCARD-1b (REQ-BFG-115, F8): the merge plate was 11 x 12 and
 *  the sale plate 7 x 8. SHOPCARD-1c (REQ-BFG-115, G2, G3): the merge plate is 11 x 13 (a 4-row triangle, a gap row, the game's
 *  own 5x6 star with its digit; its right edge still stays left of a two-digit price's box, its top below the tallest grid plate's
 *  foot) and the sale plate 9 x 6 (a 4-row triangle 7 px wide, 1 px of ink round it), set against the price (cardZones' `price`). */
export const MERGE_W = 11, MERGE_H = 13, SALE_W = 9, SALE_H = 6, SOLD_ALPHA = 0.4;

export interface CardZones {
  /** The picture area: under the stripe and the bevel, above the price row. */
  pic: Rect;
  /** F2: the icon's box (CARD_ICON square), centred in the picture area. */
  icon: Rect;
  /** The rarity gem's ink box. */
  gem: Rect;
  /** G3: the shape grid's plate, top-left of the picture area (its box depends on the piece: shapeGridSize + 2). */
  grid: { x: number; y: number };
  /** F4: the merge mark's plate (the owned marker, 5x7, takes its left-bottom corner). */
  merge: Rect;
  /** F4: the sale mark's plate. */
  sale: Rect;
}

/** The zone map of a card `w` x `h` px, in px from its top-left (REPORT section 4; pure, tests). The price row is the old
 *  card's: the coin at h - 11, the digits (7 rows, their outline one more) from h - 12; the rarity bar fills h - 3 and h - 2.
 *  SHOPCARD-1c (REQ-BFG-115, G3): `price`, the offer's price, sets the sale plate against it: 1 clear px right of the price box
 *  (cardPriceBox), on the digits' rows (so "7 ▼": the price is down). Without one, the plate takes the corner where a
 *  two-digit price's box leaves it room on the phone (x w - 3 - SALE_W): the widest card's fixed place, as before. */
export function cardZones(w: number, h: number, price?: number): CardZones {
  const picH = h - 13 - 5; // rows 5 .. h - 14 (24 on the phone's 42, 28 on the desk's 46)
  const pb = price === undefined ? null : cardPriceBox(w, h, price);
  return {
    pic: { x: 2, y: 5, w: w - 4, h: picH },
    icon: { x: Math.floor((w - CARD_ICON) / 2), y: 5 + Math.floor((picH - CARD_ICON) / 2), w: CARD_ICON, h: CARD_ICON },
    gem: { x: w - 6, y: 6, w: 4, h: 4 },
    grid: { x: 2, y: 5 },
    // SHOPCARD-1c (G2): x 2..12, y h - 18 .. h - 6 (was y h - 17, 11 x 12): 13 rows, from the row after the tallest grid plate's foot (SPIKE RAIL's: y 23 on the phone)
    merge: { x: 2, y: h - 18, w: MERGE_W, h: MERGE_H },
    // SHOPCARD-1c (G3): 9 x 6, rows h - 11 .. h - 6 (was 7 x 8 at x w - 10, y h - 13): the triangle's 4 rows sit on the digits' rows
    sale: { x: pb ? pb.x + pb.w + 1 : w - 3 - SALE_W, y: h - 11, w: SALE_W, h: SALE_H },
  };
}

/** The price's box (the coin and the digits with their outline), in px from the card's top-left: the clear px round it are the
 *  marks' margin. Pure (tests). */
export function cardPriceBox(w: number, h: number, price: number): Rect {
  const px = cardPriceX(0, w, price, false, false);
  return { x: px, y: h - 13, w: 7 + textWidth(String(price)) + 1, h: 9 };
}

/** F4: the owned marker's corner: bottom-left, its 7 rows on the price digits' rows (cardZones' merge plate holds it). */
export const ownedMarkAt = (h: number): { x: number; y: number } => ({ x: 3, y: h - 12 });

/** SHOPCARD-1c (REQ-BFG-115, G2): the merge mark's star, a sprite of the game's own ★ at the 5x7 size (render/font.ts:147, "..#..|..#..|
 *  #####|.###.|.#.#.|#...#", its 6 inked rows), not the 3x5 face's ★ that READ-9 and READ-10's readers took for "X-shaped blocks" and
 *  "a checker". SHOPCARD-1b drew that 3x5 glyph (STAR_ROWS "#.#|.#.|###|.#.|#.#", two or three of them). tests/shopcard1c pins
 *  these rows equal to drawText("★", { font: "5" }). */
export const STAR_ROWS: readonly string[] = ["..#..", "..#..", "#####", ".###.", ".#.#.", "#...#"];
export const STAR_W = 5, STAR_H = 6;
/** G2: the target level's digit beside the star, the 3x5 face's own 2 and 3 (render/font.ts:204-205), drawn as pixels, not as text:
 *  the only text a shop card draws stays the price's digits (SHOPCARD-1's rule, tests/shopcard1). tests/shopcard1c pins them. */
export const DIGIT_ROWS: Readonly<Record<2 | 3, readonly string[]>> = { 2: ["###", "..#", "###", "#..", "###"], 3: ["###", "..#", "###", "..#", "###"] };
export const DIGIT_W = 3, DIGIT_H = 5;
/** G2: the triangles' size: 4 rows, 1, 3, 5 and 7 px wide, solid, no stem (a stem read as a plus to the weakest reader). */
export const TRI_W = 7, TRI_H = 4;
/** A bitmap's inked px ("#") from (x, y) in `col`. */
function drawRows(g: G, x: number, y: number, rows: readonly string[], col: string): void {
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === "#") rect(g, x + c, y + r, 1, 1, col);
}

/** F4 (REQ-BFG-115): the merge mark, wordless. SHOPCARD-1c (G2; READ-10: 1 seat of 3 read the stemmed arrow over the font's 3x5
 *  stars, as READ-9's pips): a solid up triangle with no stem ("goes up"), and under it the target's star, a real 5x6 sprite, with
 *  the target level as a digit beside it: ★2 or ★3, as HOW TO PLAY writes it (title.ts helpLine3), amber on an ink plate
 *  (MERGE_W x MERGE_H at (x, y), 1 px of ink round the art): the triangle in rows 1-4 (7 px wide at its foot, centred on column
 *  5), the star in columns 1-5 and rows 6-11, the digit in columns 7-9 on the star's last 5 rows; a ★3 chain flashes amber and
 *  yellow at 2 Hz as the badge did. One star and a digit fit where three stars (SHOPCARD-1b) could not stand apart. */
export function drawMergeMark(g: G, x: number, y: number, toStars: number, t: number): void {
  const col = toStars >= 3 && Math.floor(t * 4) % 2 ? C.yellow : C.amber;
  const n = toStars >= 3 ? 3 : 2, mid = (MERGE_W - 1) / 2; // the plate's middle column, 5
  rect(g, x, y, MERGE_W, MERGE_H, C.ink);
  for (let r = 0; r < TRI_H; r++) rect(g, x + mid - r, y + 1 + r, 2 * r + 1, 1, col); // the up triangle: 1, 3, 5, 7 px
  drawRows(g, x + 1, y + 6, STAR_ROWS, col);
  drawRows(g, x + 7, y + 6 + STAR_H - DIGIT_H, DIGIT_ROWS[n], col);
}

/** F4: the sale mark, wordless: this offer is cheaper than its list price (a scout's deal). SHOPCARD-1c (REQ-BFG-115, G3; READ-9
 *  and READ-10: one seat of 3 read the stemmed arrow as "a bright green plus"): candidate A, a solid down triangle with no stem
 *  (7, 5, 3 and 1 px wide, rows 1-4), lime on an ink plate (SALE_W x SALE_H at (x, y), 1 px of ink round it), set against the price
 *  (cardZones' `price`): the price is down. */
export function drawSaleMark(g: G, x: number, y: number): void {
  rect(g, x, y, SALE_W, SALE_H, C.ink);
  for (let r = 0; r < TRI_H; r++) rect(g, x + 1 + r, y + 1 + r, TRI_W - 2 * r, 1, C.lime); // the down triangle: 7, 5, 3, 1 px
}

/** G3, candidate B (checked second: G4): the sale price drawn in lime. When the card is also too dear the price stays RED: "you
 *  can't afford it" decides whether the card can be bought at all, so it outranks "it's cheaper"; the triangle stays lime either
 *  way. Off: candidate A (the price in gold, as every affordable price). */
export const SALE_STYLE: { priceLime: boolean } = { priceLime: false }; // a plain object, so tests and the picture scripts can check B; the game never sets it
/** The colour a card draws its price in: red when too dear, else lime when on sale (candidate B), else gold. Pure (tests). */
export const priceColour = (affordable: boolean, sale: boolean, lime: boolean = SALE_STYLE.priceLime): string => (!affordable ? C.red : sale && lime ? C.lime : C.yellow);

export function drawCard(g: G, r: Rect, def: ItemDef, price: number, merchant: MerchantId, s: CardState, t: number): void {
  if (s.hidden) {
    // empty cradle while the card is carried
    rect(g, r.x, r.y, r.w, r.h, C.ink);
    rect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, C.night);
    frame(g, r.x + 3, r.y + 3, r.w - 6, r.h - 6, C.slate1);
    return;
  }
  const lift = s.selected ? 2 : s.hover ? 1 : 0;
  const sh = s.shake > 0 ? Math.round(Math.sin(s.shake * 70) * 2) : 0;
  const x = r.x + sh, y = r.y - lift;
  if (lift) {
    // drop shadow on the tray below the lifted card
    rect(g, r.x + 2, r.y + r.h - 1, r.w - 1, 2, C.ink);
    rect(g, r.x + r.w, r.y + 2, 1, r.h - 1, C.ink);
  }
  cardFrame(g, x, y, r.w, r.h, MERCHANT_COLOR[merchant], RARITY_COLOR[def.rarity], s.sold);
  const z = cardZones(r.w, r.h, price); // SHOPCARD-1c (G3): the sale mark sits against this price
  // rarity gem
  rect(g, x + z.gem.x, y + z.gem.y, 4, 4, C.ink);
  rect(g, x + z.gem.x + 1, y + z.gem.y + 1, 2, 2, s.sold ? C.slate1 : RARITY_COLOR[def.rarity]);
  // F2: the picture, the icon at x2 (dim on a sold card); G3: a shaped piece's grid on its ink plate, top-left of the picture
  // area (over the icon's corner where the two meet), dim on a sold card
  if (s.sold) g.globalAlpha = SOLD_ALPHA;
  g.drawImage(iconX2(def.id), x + z.icon.x, y + z.icon.y);
  g.globalAlpha = 1;
  if (shapedPiece(def.id)) drawShapePlate(g, def.id, x + z.grid.x, y + z.grid.y, gridCell(def.id), s.sold ? SOLD_ALPHA : 1); // SC-0912: the piece's own cell (4 for PICKAXE)
  if (!s.sold) {
    // F4: the bottom-left corner holds the merge mark (MERGE ★2, ★3) or the owned marker (a copy that won't merge yet, or
    // only ★3 copies: was the MAX word); the sale mark sits against the price (1c), where no merge mark is
    const b = s.badge;
    if (b?.kind === "merge") drawMergeMark(g, x + z.merge.x, y + z.merge.y, b.toStars, t);
    else if (b) drawOwnedMarker(g, x + ownedMarkAt(r.h).x, y + ownedMarkAt(r.h).y);
    else if (s.sale) drawSaleMark(g, x + z.sale.x, y + z.sale.y);
    // the price stays at the bottom centre on both widths (a sold card shows none: it dims, and says no word)
    const px = cardPriceX(x, r.w, price, false, false);
    g.drawImage(coinIcon(), px, y + r.h - 11);
    drawText(g, String(price), px + 7, y + r.h - 12, priceColour(s.affordable, !!s.sale), { outline: C.ink }); // SHOPCARD-1c (G3): red wins over lime
  }
  if (s.shake > 0) frame(g, x - 1, y - 1, r.w + 2, r.h + 2, Math.floor(t * 20) % 2 ? C.red : C.maroon);
  else if (s.selected) frame(g, x - 1, y - 1, r.w + 2, r.h + 2, Math.floor(t * 6) % 2 ? C.white : C.yellow);
  else if (s.hover) frame(g, x - 1, y - 1, r.w + 2, r.h + 2, C.bone);
  else if (s.pulse && !s.sold && s.affordable) {
    // gentle staggered shimmer across the affordable cards, not a constant frame
    const k = (Math.sin(t * 4 - r.x * 0.05) + 1) / 2;
    if (k > 0.72) frame(g, x - 1, y - 1, r.w + 2, r.h + 2, k > 0.9 ? C.yellow : C.amber);
  }
}

/** 0.6.2t (T5): the hover tooltip's text width: its sentence wraps to this many px of the 3x5 face. */
export const TOOLTIP_TEXT_W = 150;

/** The hover tooltip's wrapped lines for a sentence (the same wrap and colours as every panel). */
export function tooltipLines(text: string): RichLine[] {
  return text ? wrapRich(colourize(text, C.bone), TOOLTIP_TEXT_W, "3") : [];
}

/** TXT-095 (REQ-BFG-070, REQ-BFG-046; ACCEPT-093's tooltip finding): a shop offer's hover tooltip text (chrome.ts), faces
 *  first, as the pack tooltip reads it: the piece's face's first rule line at ★1 (faceLines, with the run's TextOpts, as
 *  its panel draws the face, so a core's number is the run's gun's), else its kept text's opening sentence (abilityText;
 *  a face with no rule line, a stat row only: the factories PRESS, DOUBLE STAMP, GANTRY and DRAG CHAIN, and the 13 guns),
 *  else "". Was abilityText(...).sentences[0] alone. */
export function offerTooltip(def: string, o: TextOpts = {}): string {
  // CARD-2 (REQ-BFG-084, K6; REVIEW-EXPLAIN1 open item 1): a plain stat rig (WHETSTONE, TEMPER, BARBED SPOOL) shows its plain
  // face, the panel's stat row ({DMG}+20), not faceLines' HIT: rule (faces.ts plainRigStats)
  // MERGE-099D (BRIEF-MERGE-099D 1c): on the run's day (`o.day`), as faceLines' rule lines below and faceBlocks read it
  // (MERGE-099C 6ed6e27: WHETSTONE's + DAMAGE x D(d) with HULL_SCALE on)
  const plain = plainRigStats(def, 1, o.day);
  if (plain) return statRow(plain);
  return faceLines(def, 1, o)?.rules[0]?.text ?? abilityText(def, 1, o).sentences[0] ?? "";
}

/** SHOPCARD-1 (REQ-BFG-115, F5; the operator: "they should always be their icon and price"): a shop offer's whole face, for the
 *  desk's hover tooltip (chrome.ts): the text of every item the tap panel's default face draws for that offer (inspector.ts
 *  offerPanel through explainPanel: the stat row(s), every rule line, a shaped piece's own lines, the interim caveats; not the
 *  NOTES the panel keeps behind its ⓘ), at ★1 with the run's TextOpts (a core's number is the run's gun's; the day's numbers on
 *  the run's day), so the card says nothing the tooltip leaves out. A piece with no face draws its kept text's sentences, as
 *  the panel does (abilityText). faceBlocks.ts is the panel's own source, so the two read one text. */
export function offerFace(def: string, o: TextOpts = {}): string[] {
  const blocks = faceBlocks(def, 1, o);
  return blocks ? blocks.filter((b) => !b.note).map((b) => b.text) : abilityText(def, 1, o).sentences;
}

/** Floating hover tooltip under a card (mouse only). 0.6.2t (T5): `text` is the offer's opening sentence from the
 *  glossary (abilityText.ts, at 1 star and the hero's class factor), wrapped by the one helper, as its panel reads it.
 *  TXT-095: an offer's `text` is offerTooltip's (its face's first rule line first), as a pack's is (chrome.ts).
 *  SHOPCARD-1 (F5): an offer's `text` is its whole face (offerFace): a list, one item per face line, each wrapped to
 *  TOOLTIP_TEXT_W and set apart from the next by the item gap G (SPACE-1's, 3x5: 4 px) over the lines' pitch; `H`, the screen's
 *  height, keeps the box on screen (it moves up over its card rather than run off the foot). A string is one item, as before. */
export function drawTooltip(g: G, r: Rect, def: ItemDef, W: number, text: string | readonly string[] = "", H = 0): void {
  const items = (typeof text === "string" ? [text] : text).map(tooltipLines).filter((l) => l.length);
  const lines = items.flat();
  const apart = Math.max(0, items.length - 1) * GAP["3"];
  // 0.8.0 I1 M4 (REQ-BFG-023 part 2): the module's families, named in their colours under its kind (none: no line).
  // CARD-3 (REQ-BFG-087, D4; SPACE-1 open item 7): the family line and the effect are separate items: the gap G (3x5's)
  // between them (the effect's first line sat right under the names: 2 px, the pitch's)
  const fam = familiesText(def.id), famLine = fam ? familySpans(fam) : null, fh = famLine ? 7 + GAP["3"] : 0;
  const w = Math.max(textWidth(def.name), ...lines.map((l) => lineWidth(l, "3")), textWidth(describe(def), "3"), famLine ? lineWidth(famLine, "3") : 0) + 10;
  const h = 22 + fh + lines.length * 7 + apart;
  const x = Math.max(2, Math.min(W - w - 2, Math.round(r.x + r.w / 2 - w / 2)));
  const y = H ? Math.max(2, Math.min(r.y + r.h + 4, H - 2 - h)) : r.y + r.h + 4;
  rect(g, x + 2, y + 2, w, h, C.ink);
  rect(g, x, y, w, h, C.ink);
  rect(g, x + 1, y + 1, w - 2, h - 2, C.night);
  rect(g, x + 1, y + 1, w - 2, 1, RARITY_COLOR[def.rarity]);
  drawText(g, def.name, x + 5, y + 4, RARITY_COLOR[def.rarity], { outline: C.ink });
  drawText(g, describe(def), x + 5, y + 13, C.slate4, { font: "3" });
  if (famLine) drawRich(g, famLine, x + 5, y + 21, "3");
  let ly = y + 21 + fh;
  items.forEach((item, k) => {
    if (k) ly += GAP["3"];
    item.forEach((l) => { drawRich(g, l, x + 5, ly, "3"); ly += 7; });
  });
}

export function drawReroll(g: G, r: Rect, enabled: boolean, hover: boolean, pressed: boolean, free = false): void {
  const y = r.y + (pressed ? 1 : 0);
  cardFrame(g, r.x, y, r.w, r.h, enabled ? (free ? C.lime : C.amber) : C.slate1, enabled ? C.amber : C.slate1, !enabled);
  drawText(g, "REROLL", r.x + r.w / 2, y + 12, enabled ? C.white : C.slate2, { font: "3", align: "center" });
  if (free) drawText(g, "FREE", r.x + r.w / 2, y + 21, C.lime, { outline: C.ink, align: "center" });
  else {
    g.drawImage(coinIcon(), Math.round(r.x + r.w / 2 - 7), y + 22);
    drawText(g, String(REROLL_COST), r.x + r.w / 2 + 1, y + 21, enabled ? C.yellow : C.slate2, { outline: C.ink });
  }
  if (hover && enabled) frame(g, r.x - 1, y - 1, r.w + 2, r.h + 2, C.bone);
}

/** bb-0.8.6 (REQ-BFG-051, PACKS P5): a pack's amount as its slot shows it: "+4 BELT", "+25 HULL" (the ITEMS entry's).
 *  NUM-2 (REQ-BFG-047; NUM-1's question 1, cap's answer): the ARMOR PACK's is its number and the hull icon, "+250 ♥" (the
 *  stat form of docs/TEXT-STYLE.md; RIVETER's face draws the same icon): NUM-1's "+250 HULL" (34 px of the 3x5 font)
 *  overflowed the narrowest slots (32 and 34 px). No layout change. */
export function packAmount(id: PackId, day?: number): string {
  const s = ITEMS[PACK_ITEM[id]].supply!;
  return s.belt ? `+${s.belt} BELT` : `+${hullShown(s.hull!, day)} ${ICON.HULL}`; // HULL-1a (REQ-BFG-079): the day's number
}

/** bb-0.8.6 (PACKS P5): a slot this tall or taller shows the tall face (icon, two short amount lines, price inside REROLL's
 *  frame: the price ends 38 px down); a shorter one (20 px or more) the short face. */
export const PACK_TALL_H = 40;

/** bb-0.8.6 (PACKS P5): a pack's price as its slot shows it: "2G", "5G". */
export const packPriceText = (id: PackId): string => `${ITEMS[PACK_ITEM[id]].price}G`;

/**
 * bb-0.8.6 (REQ-BFG-051, PACKS P5): a fixed pack slot in REROLL's frame: the pack's icon, its amount and its price. Short
 * of gold it is dimmed and still shows its price. A slot a card tall (a phone's) stacks the icon, the amount in two short
 * lines and the price; a short one (landscape: half REROLL's height) puts the price beside the icon, the amount under.
 */
export function drawPack(g: G, r: Rect, id: PackId, enabled: boolean, hover: boolean, pressed: boolean, day?: number): void {
  const d = ITEMS[PACK_ITEM[id]];
  const y = r.y + (pressed ? 1 : 0), cx = r.x + r.w / 2;
  const amount = packAmount(id, day), price = packPriceText(id); // HULL-1a (REQ-BFG-079): `day`, the run's
  const tc = enabled ? C.white : C.slate2, pc = enabled ? C.yellow : C.slate2;
  if (r.h >= PACK_TALL_H) {
    // REROLL's frame (its stripes leave y + 5 to y + h - 4 inside)
    cardFrame(g, r.x, y, r.w, r.h, enabled ? C.amber : C.slate1, enabled ? C.amber : C.slate1, !enabled);
    const [n, word] = amount.split(" ");
    g.drawImage(itemIcon(d.id), Math.round(cx - 6), y + 6);
    drawText(g, n, cx, y + 19, tc, { font: "3", align: "center" });
    drawText(g, word, cx, y + 25, tc, { font: "3", align: "center" });
    drawText(g, price, cx, y + 31, pc, { outline: C.ink, align: "center" });
  } else {
    // a short slot (20 px or more: half REROLL's height, a pack row): a plain frame with a 1 px accent, the icon and the
    // price over the amount, centred in the height
    const top = y + Math.max(0, Math.floor((r.h - 20) / 2));
    rect(g, r.x, y, r.w, r.h, C.ink);
    rect(g, r.x + 1, y + 1, r.w - 2, r.h - 2, enabled ? C.slate0 : C.night);
    rect(g, r.x + 1, y + 1, r.w - 2, 1, enabled ? C.amber : C.slate1);
    g.drawImage(itemIcon(d.id), r.x + 2, top + 2);
    drawText(g, price, r.x + 16, top + 4, pc, { outline: C.ink });
    drawText(g, amount, cx, top + 14, tc, { font: "3", align: "center" });
  }
  if (hover && enabled) frame(g, r.x - 1, y - 1, r.w + 2, r.h + 2, C.bone);
}

/** Merchant name tag above the first card of each wagon's group (single-row layouts). */
export function drawTag(g: G, x: number, y: number, merchant: MerchantId): void {
  const name = MERCHANTS[merchant].name;
  drawMerchantGlyph(g, x, y + 2, merchant);
  drawText(g, name, x + 5, y, C.slate4, { font: "3" });
}

/** WORDS-1 (REQ-BFG-081; READ-1 3.2: TURRET CORE and TURRET GEAR drew 87 of round A's "not understood" flags; 6.2): what a
 *  core and a piece of gear do, in the words a panel's sub line uses for their kind. */
export const KIND_SUB: Readonly<Partial<Record<ItemDef["kind"], string>>> = { core: "CHANGES HOW A GUN SHOOTS", mod: "FITS A GUN'S GEAR SLOT" };
// (READ-1 6.2's "CHANGES HOW ITS TURRET SHOOTS" is 111 px of 3x5 and "FITS A TURRET'S GEAR SLOT" 93, past the 92 px the
// 1366x768 laptop's column gives a sub line, where fitHead would cut it short: GUN, the faces' other word for a turret,
// makes them 91 and 81 px)

/** WORDS-1: a panel's kind line: "RARE HEAVY TURRET", and a core's or gear's own words alone, "CHANGES HOW A GUN SHOOTS"
 *  (the title's colour says its rarity; one line in the desk column keeps the families' place under it). describe's kind
 *  names stay for everything else that reads them. */
export function panelKind(def: ItemDef): string {
  return KIND_SUB[def.kind] ?? describe(def);
}

export function describe(def: ItemDef): string {
  // 0.6.1b: kind "core" reads "TURRET CORE" (ARSENAL.md §8.1), distinct from gear's "TURRET GEAR"
  // 0.6.2 BELTSIDE: kind "gate" reads "RIG" (ref/DESIGN-beltside.md §1: the code keeps the kind)
  // 0.6.2s (REQ-BFG-031 S10): a turret reads its class ("RARE HEAVY TURRET")
  const kind = def.kind === "gate" ? "RIG" : def.kind === "factory" ? "FACTORY" : def.kind === "mod" ? "TURRET GEAR" : def.kind === "core" ? "TURRET CORE"
    : def.kind === "turret" ? `${(def.turret?.class ?? "").toUpperCase()} TURRET` : "SUPPLY";
  // SHAPES-1 (REQ-BFG-086.1, S8): a shaped piece's type line names its shape ("COMMON RIG · 2 CELLS", "RARE FACTORY ·
  // 2X3"); a 1-cell rig's and a 2x2 factory's stay as they are (faces.ts shapeWord: null)
  const sw = shapeWord(def.id);
  return `${def.rarity.toUpperCase()} ${kind}${sw ? ` · ${sw}` : ""}`;
}

export { ITEMS };

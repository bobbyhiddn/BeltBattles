// Shop cards: each wagon offer is a large card (icon, name, price, rarity edge, merchant
// stripe). Affordable cards pulse amber until something is bought (STUDY rule 13); the
// selected card lifts with a drop shadow. REROLL uses the same card frame.

import { ITEMS, MERCHANTS, PACK_ITEM, REROLL_COST, type ItemDef, type MerchantId, type PackId } from "../../sim/content";
import type { ShopBadge } from "../../game/run";
import { C, RARITY_COLOR } from "../../render/palette";
import { frame, rect, type G } from "../../render/pixel";
import { ICON, drawText, textWidth, wrap } from "../../render/font";
import { coinIcon, itemIcon } from "../../render/sprites";
import type { Rect } from "../../ui/ui";
import { colourize, drawRich, lineWidth, wrapRich, type RichLine } from "../../ui/richText"; // 0.6.2t (T4, T5)
import { drawFamilyMarks, familiesText, familySpans } from "../../ui/families"; // 0.8.0 I1 M4 (REQ-BFG-023 part 2)
import { faceLines } from "../../ui/faces"; // TXT-095: the offer's tooltip, faces first (offerTooltip)
import { plainRigStats } from "../../ui/faces"; // CARD-2 (REQ-BFG-084, K6): a plain rig's tooltip is its stat row
import { statRow } from "../../ui/icons"; // CARD-2 (K6)
import { abilityText, type TextOpts } from "../../ui/abilityText"; // TXT-095: its fallback, the kept opening sentence
import { CARD_W } from "./layout";

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
  /** 0.6.2t (T5): the offer's one-line effect (abilityText.ts cardText), shown on a wide (landscape) card. */
  effect?: string;
  /** U2c (R1 MEMO C4): the stat chip (src/ui/chips.ts, in glyphs): on the narrow face in the family marks' place (they
   *  don't fit beside it and the price: the panel's header names the families), the price in the right corner; on the wide
   *  face left of the price, where it fits beside the badge (the marks stay). Absent: today's card. */
  chip?: string;
}

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
  // rarity gem
  rect(g, x + r.w - 6, y + 6, 4, 4, C.ink);
  rect(g, x + r.w - 5, y + 7, 2, 2, s.sold ? C.slate1 : RARITY_COLOR[def.rarity]);
  const icon = itemIcon(def.id);
  const wide = !!s.effect && r.w > CARD_W;
  if (wide) {
    // 0.6.2t (T5) the wide face: the icon at the left with the name beside it, then the one-line effect in 2 lines
    // of the 3x5 face (numbers white, keywords in their battle colours); the merge badge at the bottom left and the
    // price at the bottom right (a badge over the icon would cover the name here). 0.8.0 B1 M4 (VERIFIED-I1 call 7): the
    // effect starts at CARD_EFFECT_Y, a row higher than before, so a clear row lies between its second line and the
    // family marks (and one still between the icon and its first line)
    const nameLines = cardName(def, r.w - 26);
    g.drawImage(icon, x + 4, y + 7);
    nameLines.forEach((ln, i) => drawText(g, ln, x + 18, y + (nameLines.length > 1 ? 7 : 10) + i * 6, s.sold ? C.slate2 : C.bone, { font: "3" }));
    cardEffectLines(s.effect!, r.w, s.sold ? C.slate2 : C.bone).slice(0, CARD_EFFECT_LINES).forEach((ln, i) =>
      drawRich(g, s.sold ? ln.map((sp) => ({ ...sp, c: C.slate2 })) : ln, x + 2, y + CARD_EFFECT_Y + i * 6, "3"));
    if (s.badge && !s.sold) drawBadge(g, x + 3, y + r.h - 11, r.w - 30, s.badge, t);
  } else {
    const lines = cardName(def, r.w - 4);
    const two = lines.length > 1;
    g.drawImage(icon, Math.round(x + r.w / 2 - 6), y + (two ? 5 : 8));
    // review-061 F1: the badge sits on top of the icon, or the icon hides its label
    if (s.badge && !s.sold) drawBadge(g, x + 1, y + 5, r.w - 8, s.badge, t);
    let ny = y + (two ? 18 : 22);
    for (const ln of lines) {
      drawText(g, ln, x + r.w / 2, ny, s.sold ? C.slate2 : C.bone, { font: "3", align: "center" });
      ny += 6;
    }
  }
  // 0.8.0 I1 M4 (REQ-BFG-023 part 2): the family marks, a row at the bottom left of either face (narrow: left of the
  // centred price, under the name; wide: under the effect's second line, a clear row between (0.8.0 B1 M4), over the
  // badge and the price); the panel and the hover tooltip name them (ui/families.ts)
  // U2c (C4): on the narrow face a chip takes the marks' place (the price moves to the right corner)
  const chip = s.chip && !s.sold ? s.chip : null;
  if (chip && !wide) drawText(g, chip, x + CARD_MARK_X, y + CARD_CHIP_Y, C.white, { font: "3" });
  else drawFamilyMarks(g, def.id, x + CARD_MARK_X, y + CARD_MARK_Y, s.sold);
  if (chip && wide) {
    // U2c: the wide face's chip, left of the price on its row, where it clears the badge (else the effect line says it)
    const cx = cardPriceX(x, r.w, price, true, true) - 3 - textWidth(chip, "3");
    if (cx >= x + 3 + (s.badge ? badgeW(s.badge, r.w - 30) + 2 : 0)) drawText(g, chip, cx, y + r.h - 10, C.white, { font: "3" });
  }
  if (s.sold) {
    drawText(g, "SOLD", x + r.w / 2, y + r.h - 11, C.maroon, { font: "3", align: "center" });
  } else {
    const txt = String(price);
    const px = cardPriceX(x, r.w, price, wide, !!chip); // 0.6.2t: the wide face's price sits right; U2c: a chip's too
    g.drawImage(coinIcon(), px, y + r.h - 11);
    drawText(g, txt, px + 7, y + r.h - 12, s.affordable ? C.yellow : C.red, { outline: C.ink });
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
  const plain = plainRigStats(def, 1);
  if (plain) return statRow(plain);
  return faceLines(def, 1, o)?.rules[0]?.text ?? abilityText(def, 1, o).sentences[0] ?? "";
}

/** Floating hover tooltip under a card (mouse only). 0.6.2t (T5): `text` is the offer's opening sentence from the
 *  glossary (abilityText.ts, at 1 star and the hero's class factor), wrapped by the one helper, as its panel reads it.
 *  TXT-095: an offer's `text` is offerTooltip's (its face's first rule line first), as a pack's is (chrome.ts). */
export function drawTooltip(g: G, r: Rect, def: ItemDef, W: number, text = ""): void {
  const lines = tooltipLines(text);
  // 0.8.0 I1 M4 (REQ-BFG-023 part 2): the module's families, named in their colours under its kind (none: no line)
  const fam = familiesText(def.id), famLine = fam ? familySpans(fam) : null, fh = famLine ? 7 : 0;
  const w = Math.max(textWidth(def.name), ...lines.map((l) => lineWidth(l, "3")), textWidth(describe(def), "3"), famLine ? lineWidth(famLine, "3") : 0) + 10;
  const h = 22 + fh + lines.length * 7;
  const x = Math.max(2, Math.min(W - w - 2, Math.round(r.x + r.w / 2 - w / 2)));
  const y = r.y + r.h + 4;
  rect(g, x + 2, y + 2, w, h, C.ink);
  rect(g, x, y, w, h, C.ink);
  rect(g, x + 1, y + 1, w - 2, h - 2, C.night);
  rect(g, x + 1, y + 1, w - 2, 1, RARITY_COLOR[def.rarity]);
  drawText(g, def.name, x + 5, y + 4, RARITY_COLOR[def.rarity], { outline: C.ink });
  drawText(g, describe(def), x + 5, y + 13, C.slate4, { font: "3" });
  if (famLine) drawRich(g, famLine, x + 5, y + 21, "3");
  lines.forEach((l, i) => drawRich(g, l, x + 5, y + 21 + fh + i * 7, "3"));
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
export function packAmount(id: PackId): string {
  const s = ITEMS[PACK_ITEM[id]].supply!;
  return s.belt ? `+${s.belt} BELT` : `+${s.hull} ${ICON.HULL}`;
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
export function drawPack(g: G, r: Rect, id: PackId, enabled: boolean, hover: boolean, pressed: boolean): void {
  const d = ITEMS[PACK_ITEM[id]];
  const y = r.y + (pressed ? 1 : 0), cx = r.x + r.w / 2;
  const amount = packAmount(id), price = packPriceText(id);
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
  return `${def.rarity.toUpperCase()} ${kind}`;
}

export { ITEMS };

// Shop cards: each wagon offer is a large card (icon, name, price, rarity edge, merchant
// stripe). Affordable cards pulse amber until something is bought (STUDY rule 13); the
// selected card lifts with a drop shadow. REROLL uses the same card frame.

import { ITEMS, MERCHANTS, REROLL_COST, type ItemDef, type MerchantId } from "../../sim/content";
import type { ShopBadge } from "../../game/run";
import { C, RARITY_COLOR } from "../../render/palette";
import { frame, rect, type G } from "../../render/pixel";
import { drawText, textWidth, wrap } from "../../render/font";
import { coinIcon, itemIcon } from "../../render/sprites";
import type { Rect } from "../../ui/ui";

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
  else if (shape === "cross") { rect(g, x + 1, y, 1, 3, col); rect(g, x, y + 1, 3, 1, col); }
  else if (shape === "bar") rect(g, x, y + 1, 3, 1, col);
  else { rect(g, x, y, 3, 1, col); rect(g, x, y + 2, 3, 1, col); rect(g, x, y, 1, 3, col); rect(g, x + 2, y, 1, 3, col); }
}

const SHORT: Record<string, string> = { calibrate: "CALIBRATE", chamber: "EXT. CHAMBER", plating: "ARMOR PLATE" };

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
}

/** 0.6.1d (ARSENAL.md §8.1): the MERGE badge, a small tab under the merchant stripe. MERGE ★3
 *  (a chain) is gold and flashes at 2Hz; the grey "+1 ★2" marks a copy that won't merge yet
 *  (a 2★ is owned, no 1★); MAX means only 3★ copies are owned. Sized to its text, not fixed 24x7,
 *  so it never clips inside the 46-wide card (deviation from the design's literal pixel size).
 *  0.6.1d2: exported so warlord-pick cards (warlordHud.ts) and event-choice cards (event/cards.ts)
 *  can draw the identical badge.
 */
export function drawBadge(g: G, x: number, y: number, maxW: number, badge: ShopBadge, t: number): void {
  let bg: string, fg: string, label: string;
  if (badge.kind === "merge") {
    label = `MERGE ★${badge.toStars}`;
    if (badge.toStars >= 3) { bg = Math.floor(t * 4) % 2 ? C.yellow : C.amber; fg = C.ink; }
    else { bg = C.amber; fg = C.ink; }
  } else if (badge.kind === "wait") {
    label = "+1 ★2"; bg = C.slate2; fg = C.slate4;
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
  if (s.sold) {
    drawText(g, "SOLD", x + r.w / 2, y + r.h - 11, C.maroon, { font: "3", align: "center" });
  } else {
    const txt = String(price);
    const tw = textWidth(txt) + 7;
    const px = Math.round(x + r.w / 2 - tw / 2);
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

/** Floating hover tooltip under a card (mouse only). */
export function drawTooltip(g: G, r: Rect, def: ItemDef, W: number): void {
  const text = [def.desc[0], def.desc[1]].filter(Boolean) as string[];
  const w = Math.max(textWidth(def.name), ...text.map((l) => textWidth(l, "3")), textWidth(describe(def), "3")) + 10;
  const h = 22 + text.length * 7;
  const x = Math.max(2, Math.min(W - w - 2, Math.round(r.x + r.w / 2 - w / 2)));
  const y = r.y + r.h + 4;
  rect(g, x + 2, y + 2, w, h, C.ink);
  rect(g, x, y, w, h, C.ink);
  rect(g, x + 1, y + 1, w - 2, h - 2, C.night);
  rect(g, x + 1, y + 1, w - 2, 1, RARITY_COLOR[def.rarity]);
  drawText(g, def.name, x + 5, y + 4, RARITY_COLOR[def.rarity], { outline: C.ink });
  drawText(g, describe(def), x + 5, y + 13, C.slate4, { font: "3" });
  text.forEach((l, i) => drawText(g, l, x + 5, y + 21 + i * 7, C.bone, { font: "3" }));
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

/** Merchant name tag above the first card of each wagon's group (single-row layouts). */
export function drawTag(g: G, x: number, y: number, merchant: MerchantId): void {
  const name = MERCHANTS[merchant].name;
  drawMerchantGlyph(g, x, y + 2, merchant);
  drawText(g, name, x + 5, y, C.slate4, { font: "3" });
}

export function describe(def: ItemDef): string {
  // 0.6.1b: kind "core" reads "TURRET CORE" (ARSENAL.md §8.1), distinct from gear's "TURRET GEAR"
  const kind = def.kind === "gate" ? "GATE" : def.kind === "factory" ? "FACTORY" : def.kind === "mod" ? "TURRET GEAR" : def.kind === "core" ? "TURRET CORE" : "SUPPLY";
  return `${def.rarity.toUpperCase()} ${kind}`;
}

export { ITEMS };

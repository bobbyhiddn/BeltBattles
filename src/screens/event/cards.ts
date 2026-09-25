// Road-event choice cards: key badge + label (and a gamble's odds), the exchange line (what you
// pay -> what you get, as icon + number chips), then a note or the reason a card is disabled.
// Same frame grammar as the shop cards (ink edge, top stripe, bevel sides, bottom strip).

import type { Choice, Delta } from "../../game/eventDefs";
import type { ShopBadge } from "../../game/run";
import { ITEMS } from "../../sim/content";
import { C } from "../../render/palette";
import { frame, rect, type G } from "../../render/pixel";
import { drawText, textWidth } from "../../render/font";
import { beltIcon, coinIcon, heartIcon, itemIcon } from "../../render/sprites";
import { rerollIcon, shieldIcon, skullIcon, tagIcon } from "../../render/eventArt";
import { drawBadge } from "../build/shop";
import type { Rect } from "../../ui/ui";

const SHORT: Record<string, string> = { calibrate: "CALIBRATE", chamber: "EXT. CHAMBER", plating: "ARMOR PLATE", grease: "GREASE", coil: "GALV. COIL" };

export function deltaIcon(d: Delta): HTMLCanvasElement {
  switch (d.k) {
    case "gold": case "bounty": return coinIcon();
    case "lives": return heartIcon(true);
    case "hull": return shieldIcon();
    case "belt": return beltIcon();
    case "item": return itemIcon(d.def);
    case "sabotage": return skullIcon();
    case "reveal": case "discount": return tagIcon();
    case "reroll": return rerollIcon();
  }
}

export function itemName(def: string): string {
  return SHORT[def] ?? ITEMS[def].name;
}

/** Chip text: numbers carry their sign; items their name. */
export function deltaText(d: Delta, cost: boolean): string {
  const s = cost ? "-" : "+";
  switch (d.k) {
    case "gold": case "lives": return `${s}${d.n}`;
    case "hull": return `${s}${d.n} HULL`;
    case "belt": return `${s}${d.n} BELT`;
    case "item": return itemName(d.def);
    case "bounty": return `+${d.n} ON A HARD WIN`;
    case "sabotage": return "WEAKER WARLORD";
    case "reveal": return "DUSK DECK";
    case "discount": return `PRICES -${d.n}`;
    case "reroll": return `${d.n} FREE REROLL`;
  }
}

function chip(g: G, x: number, cy: number, d: Delta, cost: boolean, dim: boolean, right: number): number {
  const icon = deltaIcon(d);
  let text = deltaText(d, cost);
  let w = icon.width + 2 + textWidth(text, "3");
  // 0.6.1c: road items draw from the whole catalogue, so a long part name can meet a long good on a
  // narrow card; with no room for its name the part still shows its icon (the card never hides a gain)
  if (x + w > right && d.k === "item") [text, w] = ["", icon.width];
  if (x + w > right) return x;
  g.drawImage(icon, x, cy - Math.floor(icon.height / 2));
  if (text) drawText(g, text, x + icon.width + 2, cy - 2, dim ? C.slate3 : cost ? C.red : C.lime, { font: "3" });
  return x + w + 5;
}

/** "pay -> get" line centred on row cy (icons centred, 3x5 text). */
export function exchange(g: G, x: number, cy: number, w: number, c: Choice, dim: boolean): void {
  const right = x + w;
  let cx = x;
  if (!c.cost.length) cx += drawText(g, "FREE", cx, cy - 2, dim ? C.slate3 : C.lime, { font: "3" }) + 4;
  else for (const d of c.cost) cx = chip(g, cx, cy, d, true, dim, right);
  drawText(g, "→", cx, cy - 2, dim ? C.slate2 : C.slate4, { font: "3" });
  cx += 7;
  if (!c.gain.length) drawText(g, "NOTHING", cx, cy - 2, C.slate3, { font: "3" });
  else for (const d of c.gain) cx = chip(g, cx, cy, d, false, dim, right);
}

export interface CardView {
  hover: boolean;
  pressed: boolean;
  state: "open" | "chosen" | "other";
  won: boolean;
  shake: number;
  t: number;
  flash: boolean; // chosen-card blink (off with Reduced Motion)
  badge?: ShopBadge | null; // 0.6.1d2: live from run.ts:shopBadge, for a choice that gains an item
}

export function drawChoiceCard(g: G, r: Rect, c: Choice, i: number, v: CardView): void {
  const dim = !!c.blocked || v.state === "other";
  const lift = v.state === "open" && !c.blocked && v.hover && !v.pressed ? 1 : 0;
  const sh = v.shake > 0 ? Math.round(Math.sin(v.shake * 70) * 2) : 0;
  const x = r.x + sh, y = r.y - lift + (v.pressed && !dim ? 1 : 0);
  const stripe = v.state === "chosen" ? (v.won ? C.lime : C.red) : dim ? C.slate1 : c.cost.length ? C.amber : C.steel2;
  if (lift) rect(g, r.x + 2, r.y + r.h - 1, r.w - 1, 2, C.ink);
  rect(g, x, y, r.w, r.h, C.ink);
  rect(g, x + 1, y + 1, r.w - 2, r.h - 2, dim ? C.night : v.state === "chosen" && v.flash ? C.slate2 : C.slate0);
  rect(g, x + 1, y + 1, r.w - 2, 3, stripe);
  rect(g, x + 1, y + 4, r.w - 2, 1, C.ink);
  rect(g, x + 1, y + 5, 1, r.h - 7, dim ? C.slate0 : C.slate2);
  rect(g, x + r.w - 2, y + 5, 1, r.h - 7, C.navy);
  rect(g, x + 1, y + r.h - 2, r.w - 2, 1, dim ? C.slate0 : C.slate1);
  // key badge [1] [2] [3]
  rect(g, x + 4, y + 7, 9, 9, C.ink);
  rect(g, x + 5, y + 8, 7, 7, dim ? C.slate1 : v.state === "chosen" ? stripe : C.amber);
  drawText(g, String(i + 1), x + 7, y + 9, C.ink, { font: "3" });
  drawText(g, c.label, x + 16, y + 8, dim ? C.slate3 : C.white, { outline: C.ink });
  if (c.odds !== undefined) drawText(g, `${Math.round(c.odds * 100)}% WIN`, x + r.w - 5, y + 9, dim ? C.slate3 : C.yellow, { font: "3", align: "right" });
  // 0.6.1d2: the same MERGE/wait/MAX badge as the shop card, for a choice that gains an item.
  // Never combined with odds today (a gamble's gain is always gold), but skip it defensively
  // if it ever is, so the two never draw on top of each other.
  else if (v.badge && v.state === "open") {
    const bw = Math.min(50, r.w - 24);
    drawBadge(g, x + r.w - bw - 4, y + 6, bw, v.badge, v.t);
  }
  exchange(g, x + 5, y + 25, r.w - 10, c, dim);
  const note = c.blocked ?? c.note;
  if (note) drawText(g, note, x + 5, y + r.h - 9, c.blocked ? C.red : C.slate4, { font: "3" });
  if (v.state === "chosen") {
    const tag = v.won ? "CHOSEN" : "LOST";
    const tw = textWidth(tag, "3") + 6;
    rect(g, x + r.w - tw - 4, y + r.h - 12, tw, 9, C.ink);
    drawText(g, tag, x + r.w - 7, y + r.h - 10, v.won ? C.lime : C.red, { font: "3", align: "right" });
    frame(g, x - 1, y - 1, r.w + 2, r.h + 2, v.won ? C.lime : C.red);
  } else if (v.shake > 0) frame(g, x - 1, y - 1, r.w + 2, r.h + 2, Math.floor(v.t * 20) % 2 ? C.red : C.maroon);
  else if (v.hover && !dim) frame(g, x - 1, y - 1, r.w + 2, r.h + 2, C.bone);
}

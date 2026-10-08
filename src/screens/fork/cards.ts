// Road-fork cards (0.6.0b): [ROAD EVENT | EASY | MEDIUM | HARD]. A warlord card shows the
// portrait, name, EASY / MEDIUM / HARD tag, an ELITE or BOSS tag, the trick, the blurb and the
// reward; the event card the day's event kind and title over its scene. Portrait layout keeps a
// card to 2 rows (name + tags, then trick) and moves the blurb to tap-to-inspect (DESIGN.md).

import { EVENTS, type EventId } from "../../game/eventDefs";
import type { WarlordReward } from "../../game/run";
import { C } from "../../render/palette";
import { rect, type G } from "../../render/pixel";
import { drawText, textWidth, wrap } from "../../render/font";
import { drawScene } from "../../render/scenes";
import { itemIcon } from "../../render/sprites";
import { panel, type Rect } from "../../ui/ui";
import { TIER_COLOR, TIER_LABEL, drawPortrait, nameColor, rankTag, tag } from "../../ui/captain";
import { RIVALS, type Difficulty, type RivalId } from "../../sim/rivals";
import type { HeroId } from "../../sim/content";
import { itemName } from "../event/cards";
import { drawRich, wrapRich } from "../../ui/richText"; // U2b: a captain's trick and blurb in rich text
import { captainSpans } from "../../ui/captainText"; // U2b: the keyword colours
import { pctText, type DropTable } from "../../sim/npcDay"; // NPC-1 (REQ-BFG-078): the drop on the cards
import { drawDropIcons, dropStarText } from "./drops"; // NPC-1; HULL-1b: dropStarText

export interface ForkCardView {
  hover: boolean;
  selected: boolean;
  key: number; // 1-4
  t: number;
  calm: boolean;
  notes: string[]; // e.g. SABOTAGED, +10 BOUNTY
  /** NPC-1 (REQ-BFG-078; NPC_DAY on, else absent): the warlord's drop table, drawn in the tall card's reward box. */
  drop?: DropTable;
}

/** NPC-1 (REQ-BFG-078): the tall card's reward box height with the drop row (the reward line, the icons and their odds). */
export const DROP_BOX = 44;

function frameCard(g: G, r: Rect, v: ForkCardView): void {
  panel(g, r, v.selected || v.hover ? "raised" : "dark");
  if (v.selected || v.hover) {
    const c = v.selected ? C.yellow : C.bone;
    rect(g, r.x - 1, r.y - 1, r.w + 2, 1, c);
    rect(g, r.x - 1, r.y + r.h, r.w + 2, 1, c);
    rect(g, r.x - 1, r.y, 1, r.h, c);
    rect(g, r.x + r.w, r.y, 1, r.h, c);
  }
  const k = String(v.key);
  rect(g, r.x + r.w - 10, r.y + 3, 7, 8, C.ink);
  drawText(g, k, r.x + r.w - 8, r.y + 5, C.slate4, { font: "3" });
}

/** The reward as one short line (and the parts it offers). */
export function rewardText(rw: WarlordReward, bounty = 0): string {
  const b = bounty > 0 ? ` +${bounty} BOUNTY` : "";
  if (rw.legendary) return `WIN +${rw.gold}G + LEGENDARY PART${b}`;
  // NPC-1 (REQ-BFG-078; NPC_DAY on): the drop's chance (absent while the switch is off: 0.9.7's lines below)
  if (rw.chance !== undefined) return `WIN +${rw.gold}G · DROP ${pctText(rw.chance)}${b}`;
  if (rw.parts.length) return `WIN +${rw.gold}G + 1 OF ${rw.parts.length} PARTS${b}`;
  return `WIN +${rw.gold} GOLD${b}`;
}

function drawParts(g: G, parts: string[], x: number, y: number): number {
  let px = x;
  for (const d of parts) {
    const ic = itemIcon(d);
    rect(g, px, y, 14, 14, C.ink);
    rect(g, px + 1, y + 1, 12, 12, C.slate0);
    g.drawImage(ic, px + 7 - Math.floor(ic.width / 2), y + 7 - Math.floor(ic.height / 2));
    px += 16;
  }
  return px - x;
}

/** A warlord card. Tall (landscape): everything; compact (portrait): 2 text rows. */
export function drawWarlordCard(g: G, r: Rect, id: RivalId, tier: Difficulty, rw: WarlordReward, v: ForkCardView, compact: boolean): void {
  frameCard(g, r, v);
  const d = RIVALS[id], rk = rankTag(id);
  if (compact) {
    // DESIGN.md: 2 rows in portrait: name + tags, then the trick (with a short reward); the blurb,
    // the full reward and any SABOTAGED / BOUNTY note are in the tap-to-inspect panel
    drawPortrait(g, id, r.x + 5, r.y + Math.round((r.h - 24) / 2));
    const x = r.x + 34, y1 = r.y + Math.round(r.h / 2) - 11, y2 = y1 + 13;
    let tx = x + drawText(g, d.name, x, y1, nameColor(id), { outline: C.ink }) + 4;
    tx += tag(g, TIER_LABEL[tier], tx, y1, TIER_COLOR[tier]) + 2;
    if (rk) tag(g, rk.text, tx, y1, rk.color, rk.text === "BOSS" ? C.white : C.ink);
    const t2 = x + drawRich(g, captainSpans(d.trick, C.yellow), x, y2, "3") + 6; // U2b: a keyword in its colour
    const short = rw.legendary ? `+${rw.gold}G +LEGEND.` : rw.chance !== undefined ? `+${rw.gold}G ${pctText(rw.chance)} DROP` // NPC-1
      : rw.parts.length ? `+${rw.gold}G +PART` : `+${rw.gold}G`;
    const sw = drawText(g, short, t2, y2, C.lime, { font: "3" });
    // a pending SABOTAGE / BOUNTY: an amber "!" (spelled out in the inspect panel)
    if (v.notes.length) drawText(g, "!", t2 + sw + 3, y2, C.amber, { font: "3" });
    const ix = r.x + r.w - 12 - rw.parts.length * 16;
    if (rw.parts.length && ix > t2 + sw + 8) drawParts(g, rw.parts, ix, r.y + Math.round(r.h / 2) - 3);
    return;
  }
  let y = r.y + 4;
  let tx = r.x + 5;
  tx += tag(g, TIER_LABEL[tier], tx, y, TIER_COLOR[tier]) + 2;
  if (rk) tag(g, rk.text, tx, y, rk.color, rk.text === "BOSS" ? C.white : C.ink);
  y += 12;
  drawPortrait(g, id, r.x + 6, y);
  const nameLines = textWidth(d.name) > r.w - 40 ? wrap(d.name, r.w - 40) : [d.name];
  let ny = y + (nameLines.length > 1 ? 1 : 5);
  for (const ln of nameLines.slice(0, 2)) {
    drawText(g, ln, r.x + 35, ny, nameColor(id), { outline: C.ink });
    ny += 10;
  }
  y += 30;
  drawRich(g, captainSpans(d.trick, C.yellow), r.x + 5, y, "3"); // U2b (REQ-BFG-032 rule 3): keywords in their colours
  y += 9;
  for (const ln of wrapRich(captainSpans(d.blurb, C.bone), r.w - 10, "3").slice(0, 4)) {
    drawRich(g, ln, r.x + 5, y, "3");
    y += 7;
  }
  for (const n of v.notes) {
    drawText(g, n, r.x + 5, y + 1, C.amber, { font: "3" });
    y += 8;
  }
  // NPC-1 (REQ-BFG-078; NPC_DAY on): the reward box holds the reward line, then the drop's parts as icons with their odds
  // (the ⓘ for the full list is the fork's, at the box's top right)
  if (v.drop) {
    const db = r.y + r.h - DROP_BOX;
    rect(g, r.x + 4, db, r.w - 8, 1, C.slate1);
    let dy = db + 4;
    for (const ln of wrap(rewardText(rw) + dropStarText(v.drop), r.w - 24, "3").slice(0, 2)) { // HULL-1b: "... DROP 90% ★2"
      drawText(g, ln, r.x + 5, dy, C.lime, { font: "3" });
      dy += 7;
    }
    if (v.drop.lines.length) drawDropIcons(g, v.drop, r.x + 5, r.y + r.h - 26, r.w - 10);
    else drawText(g, "NOTHING DROPS", r.x + 5, r.y + r.h - 20, C.slate4, { font: "3" });
    return;
  }
  // reward box at the bottom
  const by = r.y + r.h - (rw.parts.length ? 34 : 18);
  rect(g, r.x + 4, by, r.w - 8, 1, C.slate1);
  const lines = wrap(rewardText(rw), r.w - 10, "3");
  let ly = by + 4;
  for (const ln of lines.slice(0, 2)) {
    drawText(g, ln, r.x + 5, ly, C.lime, { font: "3" });
    ly += 7;
  }
  if (rw.parts.length) drawParts(g, rw.parts, r.x + 5, r.y + r.h - 18);
  if (rw.legendary && rw.parts[0]) drawText(g, itemName(rw.parts[0]), r.x + 24, r.y + r.h - 13, C.amber, { font: "3" });
}

/** The road-event card: kind chip, title, and the event's scene (tall cards only). */
export function drawEventCard(g: G, r: Rect, id: EventId, hero: HeroId, v: ForkCardView, compact: boolean): void {
  frameCard(g, r, v);
  const def = EVENTS[id];
  if (compact) {
    const py = r.y + Math.round((r.h - 24) / 2);
    rect(g, r.x + 5, py, 24, 24, C.ink);
    drawScene(g, id, r.x + 6, py + 1, 22, 22, hero, "temper", v.t, true);
    const x = r.x + 34, y1 = r.y + Math.round(r.h / 2) - 11;
    const tw = tag(g, "ROAD EVENT", x, y1, C.amber);
    tag(g, def.kind, x + tw + 2, y1, C.slate3);
    drawText(g, def.title, x, y1 + 12, C.yellow, { outline: C.ink });
    return;
  }
  let y = r.y + 4;
  const tw = tag(g, "ROAD EVENT", r.x + 5, y, C.amber);
  if (tw + textWidth(def.kind, "3") + 12 < r.w - 12) tag(g, def.kind, r.x + 5 + tw + 2, y, C.slate3);
  else tag(g, def.kind, r.x + 5, y + 10, C.slate3);
  y += tw + textWidth(def.kind, "3") + 12 < r.w - 12 ? 12 : 22;
  const sh = Math.min(56, Math.max(30, Math.floor((r.h - (y - r.y) - 40))));
  rect(g, r.x + 4, y, r.w - 8, sh + 2, C.ink);
  drawScene(g, id, r.x + 5, y + 1, r.w - 10, sh, hero, "temper", v.t, v.calm);
  y += sh + 6;
  for (const ln of wrap(def.title, r.w - 10)) {
    drawText(g, ln, r.x + 5, y, C.yellow, { outline: C.ink });
    y += 10;
  }
  for (const ln of wrap(`${def.text[0]} ${def.text[1]}`, r.w - 10, "3").slice(0, 3)) {
    drawText(g, ln, r.x + 5, y, C.bone, { font: "3" });
    y += 7;
  }
  rect(g, r.x + 4, r.y + r.h - 18, r.w - 8, 1, C.slate1);
  drawText(g, "NO FIGHT · ITS CHOICES", r.x + 5, r.y + r.h - 13, C.slate4, { font: "3" });
}

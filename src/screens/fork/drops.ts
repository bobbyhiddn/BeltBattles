// NPC-1 (REQ-BFG-078): a warlord's drop on the screens, with NPC_DAY on (nothing here is drawn while it is off).
// - The inspect panel (the fork's tap-to-inspect in portrait, the desk card in landscape): "DROP 75%", then the parts as
//   icons with each one's odds under it (REQ-BFG-070's card rules: stats as icons), and the ⓘ button, which opens the
//   full list: every part's name, class and odds. A part's odds = the chance x its class's share of the weight / the parts
//   in its class (npcDay.ts dropTable).
// - The victory screen: the drop as a part card going to cargo, or NO DROP.

import type { Game } from "../../game/game";
import { C } from "../../render/palette";
import { rect, type G } from "../../render/pixel";
import { drawText, textWidth } from "../../render/font";
import { itemIcon } from "../../render/sprites";
import { panel, type Rect } from "../../ui/ui";
import { isPhone, tapPx } from "../../ui/tap";
import { itemName } from "../event/cards";
import { DROP_CLASS_LABEL, pctText, type DropLine, type DropTable } from "../../sim/npcDay";

/** The short drop line: "DROP 75%", or "NO DROP" when the deck has nothing that drops. */
export function dropLine(t: DropTable): string {
  return t.lines.length ? `DROP ${pctText(t.chance)}` : "NO DROP";
}

/** A line's class in the player's words. */
export const classText = (l: DropLine): string => (l.cls === "legendary" ? "LEGENDARY" : DROP_CLASS_LABEL[l.cls]);

/** The ⓘ list's rows (and the tests'): "SPLITTER · RARE RIGS AND GEAR · 12%", most likely first. */
export function dropListText(t: DropTable): string[] {
  return t.lines.map((l) => `${itemName(l.def)} · ${classText(l)} · ${pctText(l.odds)}`);
}

/** The parts as icons from (x, y), each with its odds under it, while they fit in `w`; the rest are in the ⓘ list.
 *  Returns how many were drawn. */
export function drawDropIcons(g: G, t: DropTable, x: number, y: number, w: number): number {
  let px = x, n = 0;
  for (const l of t.lines) {
    if (px + 16 > x + w) break;
    const ic = itemIcon(l.def);
    rect(g, px, y, 14, 14, C.ink);
    rect(g, px + 1, y + 1, 12, 12, l.cls === "legendary" ? C.plum1 : C.slate0);
    g.drawImage(ic, px + 7 - Math.floor(ic.width / 2), y + 7 - Math.floor(ic.height / 2));
    drawText(g, pctText(l.odds), px + 7, y + 16, C.bone, { font: "3", align: "center" });
    px += 19;
    n++;
  }
  return n;
}

/** The ⓘ glyph in its 11 px box (lastChancePicker.ts drawInfo's form: a dot over a stem on a foot). */
export function drawInfoBox(g: G, r: Rect, on: boolean): void {
  rect(g, r.x, r.y, r.w, r.h, C.ink);
  rect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, on ? C.brass1 : C.slate0);
  const c = on ? C.yellow : C.brass3, x = r.x + 4, y = r.y + 3;
  rect(g, x + 1, y, 1, 1, c);
  rect(g, x + 1, y + 2, 1, 3, c);
  rect(g, x, y + 2, 1, 1, c);
  rect(g, x, y + 4, 3, 1, c);
}

/** The ⓘ button at (x, y): drawn 11 px, its target a finger's on a phone (tap.ts tapPx). */
export function dropInfoButton(game: Game, g: G, id: string, x: number, y: number, on: boolean, onTap: () => void): void {
  const r = { x, y, w: 11, h: 11 };
  drawInfoBox(g, r, on);
  const t = isPhone(game.view) ? Math.max(11, tapPx(game.view)) : 11;
  const hit = { x: Math.round(x + 5.5 - t / 2), y: Math.round(y + 5.5 - t / 2), w: t, h: t };
  game.ui.add({ id, r: hit, onTap, block: true });
}

/** The full list (ⓘ) over the screen: the captain, "DROP n%" and every part (icon, name, class, odds). A tap anywhere
 *  closes it. */
export function drawDropList(g: G, game: Game, title: string, t: DropTable, onClose: () => void): void {
  const { W, H, ui } = game;
  g.globalAlpha = 0.6;
  rect(g, 0, 0, W, H, C.ink);
  g.globalAlpha = 1;
  const rows = t.lines.length;
  const w = Math.min(W - 8, 220), h = Math.min(H - 8, 34 + Math.max(1, rows) * 16 + 10);
  const x = Math.round(W / 2 - w / 2), y = Math.round(H / 2 - h / 2);
  panel(g, { x, y, w, h }, "raised");
  ui.add({ id: "droplist", r: { x: 0, y: 0, w: W, h: H }, onTap: onClose, block: true });
  drawText(g, title, x + 6, y + 5, C.yellow, { outline: C.ink });
  drawText(g, `${dropLine(t)} ON A WIN · TO CARGO AT ★1`, x + 6, y + 17, C.lime, { font: "3" });
  let yy = y + 28;
  if (!rows) drawText(g, "NOTHING IN THIS DECK DROPS", x + 6, yy + 4, C.slate4, { font: "3" });
  for (const l of t.lines) {
    if (yy + 14 > y + h - 8) break;
    const ic = itemIcon(l.def);
    rect(g, x + 6, yy, 14, 14, C.ink);
    rect(g, x + 7, yy + 1, 12, 12, l.cls === "legendary" ? C.plum1 : C.slate0);
    g.drawImage(ic, x + 13 - Math.floor(ic.width / 2), yy + 7 - Math.floor(ic.height / 2));
    drawText(g, itemName(l.def), x + 24, yy + 1, C.white, { font: "3" });
    drawText(g, classText(l), x + 24, yy + 8, C.slate4, { font: "3" });
    drawText(g, pctText(l.odds), x + w - 6, yy + 4, C.bone, { align: "right" });
    yy += 16;
  }
  drawText(g, "TAP TO CLOSE", x + w / 2, y + h - 8, C.slate3, { font: "3", align: "center" });
}

/** What the victory screen says: no drop, NO_DROP; a drop, its name and "DROP · TO CARGO · ★1" (the Matriarch's: LEGENDARY). */
export const NO_DROP = "NO DROP";
export function dropCardText(drop: string | null, legendary: boolean): { name: string; sub: string } | null {
  return drop ? { name: itemName(drop), sub: legendary ? "LEGENDARY · TO CARGO" : "DROP · TO CARGO · ★1" } : null;
}

/** The victory screen's drop: a part card (icon, name, "TO CARGO · ★1") at (x, y), w wide and 22 tall, or NO DROP. */
export function drawDropCard(g: G, drop: string | null, legendary: boolean, x: number, y: number, w: number): void {
  const t = dropCardText(drop, legendary);
  if (!drop || !t) {
    drawText(g, NO_DROP, x + w / 2, y + 7, C.slate4, { align: "center" });
    return;
  }
  rect(g, x, y, w, 22, C.ink);
  rect(g, x + 1, y + 1, w - 2, 20, legendary ? C.plum1 : C.slate1);
  const ic = itemIcon(drop);
  rect(g, x + 3, y + 3, 16, 16, C.ink);
  rect(g, x + 4, y + 4, 14, 14, C.slate0);
  g.drawImage(ic, x + 11 - Math.floor(ic.width / 2), y + 11 - Math.floor(ic.height / 2));
  drawText(g, t.name, x + 23, y + 3, legendary ? C.amber : C.white, { outline: C.ink });
  drawText(g, t.sub, x + 23, y + 13, C.lime, { font: "3" });
  if (textWidth(t.name) > w - 26) rect(g, x + w - 2, y + 1, 1, 20, C.ink);
}

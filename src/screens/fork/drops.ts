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
import { drawIconMark, drawShapePlate, hasGrid, shapeGrid, shapeGridSize } from "../../ui/shapePic"; // SHOPCARD-1 (REQ-BFG-113, G4): a shaped part's grid on the drop surfaces; PRESENT-4 G: the drop row's mark; PRESENT-5 G2a: drawIconMark, the one helper that draws it
import { panel, type Rect } from "../../ui/ui";
import { drawInfoMarkIn } from "../../ui/infoGlyph"; // POLISH-2 (REQ-BFG-089; Q3): the one ⓘ mark
import { isPhone, tapPx } from "../../ui/tap";
import { itemName } from "../event/cards";
import { DROP_CLASS_LABEL, pctText, type DropLine, type DropTable } from "../../sim/npcDay";
import { gameWords } from "../../ui/gameWords"; // MERGE-099D (1d): the drop classes' words
import { ENCHANT_DEFS, isEnchantId, type EnchantId } from "../../sim/enchant"; // ENCHANT-2 (REQ-BFG-085, T2): a drop keeps its rival's word, shown in its colour before the part's name

/** ENCHANT-2 (T2): the word a drop line / card carries as the player reads it ("FIERY "), with its colour; undefined for none (ENCHANT off: no line has one). */
export function dropWord(id: string | undefined): { text: string; colour: string } | undefined {
  return id !== undefined && isEnchantId(id) ? { text: `${ENCHANT_DEFS[id].name} `, colour: ENCHANT_DEFS[id].color } : undefined;
}

/** ENCHANT-2 (T2): `name` cut with a dot to fit `room` px in `font` (inspector.ts's title cut: the name, never the word, gives way). */
export function cutName(name: string, font: "5" | "3", room: number): string {
  if (textWidth(name, font) <= room) return name;
  let s = name;
  while (s.length > 1 && textWidth(`${s}.`, font) > room) s = s.slice(0, -1);
  return `${s}.`;
}

/** ENCHANT-2 (T2): how `WORD NAME` is drawn in `room` px (`word` carries its space): the 5x7 face where both fit, else the 3x5 face with the name cut with a dot. */
export function fitWordName(word: string, name: string, room: number): { font: "5" | "3"; name: string } {
  if (textWidth(word) + textWidth(name) <= room) return { font: "5", name };
  return { font: "3", name: cutName(name, "3", room - textWidth(word, "3")) };
}

/** The short drop line: "DROP 75%", or "NO DROP" when the deck has nothing that drops. */
export function dropLine(t: DropTable): string {
  return t.lines.length ? `DROP ${pctText(t.chance)}` : "NO DROP";
}

/** HULL-1b (REQ-BFG-078): the star a table's drop goes to cargo at, as the screens say it: " ★2" (Hard), "" at ★1. */
export const dropStarText = (t: DropTable): string => (t.lines.length && (t.stars ?? 1) > 1 ? ` ★${t.stars}` : "");

/** A line's class in the player's words. */
// MERGE-099D (BRIEF-MERGE-099D 1d): a sim string (npcDay.ts DROP_CLASS_LABEL) on the screen goes through the one display
// function, as CARD-3's sim strings do (src/ui/gameWords.ts; none of these labels holds a renamed word today)
export const classText = (l: DropLine): string => (l.cls === "legendary" ? "LEGENDARY" : gameWords(DROP_CLASS_LABEL[l.cls]));

/** The ⓘ list's rows (and the tests'): "SPLITTER · RARE RIGS AND GEAR · 12%", most likely first. */
export function dropListText(t: DropTable): string[] {
  return t.lines.map((l) => `${dropWord(l.ench)?.text ?? ""}${itemName(l.def)} · ${classText(l)} · ${pctText(l.odds)}`); // ENCHANT-2 (T2): the word first
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
    // SHOPCARD-1 (G4), PRESENT-1 S1 (d): a shaped part shows its footprint. PRESENT-4 G (REQ-BFG-113; F9): as a small cells-only MARK (shapePic.ts shapeMark: 7 x 7 px at most) in the box's bottom-right corner
    // over the icon's corner, not G1's grid over the box's top-left (11 x 11 for a 2x2: it covered the icon whole, so the carriage gun showed as a grey grid). The box, the 19 px pitch and the odds' row are as they were.
    // PRESENT-5 G2a (REQ-BFG-113): the mark is drawn by shapePic.ts drawIconMark (the one helper every surface with an icon box calls), over this 14 x 14 box.
    if (hasGrid(l.def)) drawIconMark(g, l.def, px, y, 14);
    drawText(g, pctText(l.odds), px + 7, y + 16, C.bone, { font: "3", align: "center" });
    px += 19;
    n++;
  }
  return n;
}

/** ENCHANT-2 (REQ-BFG-085, T4): the full list's header line, as drawDropList draws it under the title ("DROP 75% ON A WIN · TO CARGO AT ★2"). One place for the string:
 *  the text sheet (tools/textSheet.ts) reads it from here. HULL-1b: the table's star. */
export const dropListHeader = (t: DropTable): string => `${dropLine(t)} ON A WIN · TO CARGO AT ★${t.stars ?? 1}`;

/** The ⓘ button in its 11 px box: the one mark of every info button (ui/infoGlyph.ts: the 5x7 face's `?`, as a part's panel and LAST CHANCE's cards draw it), centred in
 *  the box's interior; the box and its colours are this list's own. POLISH-2 (REQ-BFG-089; Q3): was a hand-drawn "i" (a dot over a stem on a foot). */
export function drawInfoBox(g: G, r: Rect, on: boolean): void {
  rect(g, r.x, r.y, r.w, r.h, C.ink);
  rect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, on ? C.brass1 : C.slate0);
  drawInfoMarkIn(g, r, on ? C.yellow : C.brass3);
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
  drawText(g, dropListHeader(t), x + 6, y + 17, C.lime, { font: "3" }); // HULL-1b: the table's star (ENCHANT-2: the string is dropListHeader's, one place for the sheet)
  let yy = y + 28;
  if (!rows) drawText(g, "NOTHING IN THIS DECK DROPS", x + 6, yy + 4, C.slate4, { font: "3" });
  for (const l of t.lines) {
    if (yy + 14 > y + h - 8) break;
    const ic = itemIcon(l.def);
    rect(g, x + 6, yy, 14, 14, C.ink);
    rect(g, x + 7, yy + 1, 12, 12, l.cls === "legendary" ? C.plum1 : C.slate0);
    g.drawImage(ic, x + 13 - Math.floor(ic.width / 2), yy + 7 - Math.floor(ic.height / 2));
    // ENCHANT-2 (T2): a drop that keeps its rival's word shows it in its colour before the part's name; the name is cut with a dot where the row has no room
    const wd = dropWord(l.ench), room = w - 6 - 24 - textWidth(pctText(l.odds)) - 4 - (hasGrid(l.def) ? shapeGridSize(l.def).w + 4 : 0);
    if (wd) {
      const ww = textWidth(wd.text, "3");
      drawText(g, wd.text, x + 24, yy + 1, wd.colour, { font: "3" });
      drawText(g, cutName(itemName(l.def), "3", room - ww), x + 24 + ww, yy + 1, C.white, { font: "3" });
    } else drawText(g, itemName(l.def), x + 24, yy + 1, C.white, { font: "3" });
    drawText(g, classText(l), x + 24, yy + 8, C.slate4, { font: "3" });
    drawText(g, pctText(l.odds), x + w - 6, yy + 4, C.bone, { align: "right" });
    // SHOPCARD-1 (G4): a shaped part's grid in its row (the 16 px pitch holds the tallest, 16), between the words and the odds
    if (hasGrid(l.def)) g.drawImage(shapeGrid(l.def), x + w - 6 - textWidth(pctText(l.odds)) - 4 - shapeGridSize(l.def).w, yy);
    yy += 16;
  }
  drawText(g, "TAP TO CLOSE", x + w / 2, y + h - 8, C.slate3, { font: "3", align: "center" });
}

/** What the victory screen says: no drop, NO_DROP; a drop, its name and "DROP · TO CARGO · ★1" (the Matriarch's: LEGENDARY).
 *  HULL-1b (REQ-BFG-078): `stars`, the drop's star (npcDay.ts DROP_STARS: a Hard drop says ★2). */
export const NO_DROP = "NO DROP";
/** ENCHANT-2 (REQ-BFG-085, T2): `word`, the word the drop arrives with (the card says it in its colour before the part's name): it rides in the result
 *  as `word` ("FIERY ", with the space); absent for a plain drop, so every ENCHANT-off card is what it was.
 *  T6 fix round (E2-03; words only): a drop that arrives with a word spells its star, `DROP · TO CARGO · STAR 2`: the 3x5 face's ★ read as `x2` (two copies) to
 *  five of six readers of the strict read's round 1. A plain drop keeps `★n` (ENCHANT off draws what it drew), the Matriarch's keeps `LEGENDARY · TO CARGO`. */
export function dropCardText(drop: string | null, legendary: boolean, stars = 1, word?: string): { name: string; sub: string; word?: string } | null {
  const wd = dropWord(word);
  return drop ? { name: itemName(drop), sub: legendary ? "LEGENDARY · TO CARGO" : `DROP · TO CARGO · ${wd ? "STAR " : "★"}${stars}`, ...(wd ? { word: wd.text } : {}) } : null;
}

/** The victory screen's drop: a part card (icon, name, "TO CARGO · ★1") at (x, y), w wide and 22 tall, or NO DROP. ENCHANT-2 (T2): `word`, the word it
 *  keeps, before the name in its colour (the 5x7 face where word and name fit, else the 3x5, the name cut with a dot as the card's room ends). */
export function drawDropCard(g: G, drop: string | null, legendary: boolean, x: number, y: number, w: number, stars = 1, word?: string): void {
  const t = dropCardText(drop, legendary, stars, word);
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
  const wd = dropWord(word), room = w - 26;
  if (wd) {
    // ENCHANT-2 (T2): the word in its colour, then the name; the 5x7 face where both fit, else the 3x5 with the name cut with a dot
    const fit = fitWordName(wd.text, t.name, room), big = fit.font === "5", ww = textWidth(wd.text, fit.font);
    drawText(g, wd.text, x + 23, y + (big ? 3 : 4), wd.colour, big ? { outline: C.ink } : { font: "3" });
    drawText(g, fit.name, x + 23 + ww, y + (big ? 3 : 4), legendary ? C.amber : C.white, big ? { outline: C.ink } : { font: "3" });
  } else {
    drawText(g, t.name, x + 23, y + 3, legendary ? C.amber : C.white, { outline: C.ink });
  }
  drawText(g, t.sub, x + 23, y + 13, C.lime, { font: "3" }); // PRESENT-2 W (a): `DROP · TO CARGO · ★1` draws a real star (the 3x5 glyph read as `×`; PRESENT-3 S: the face's own now); the width is the 3-wide star's
  if (!wd && textWidth(t.name) > room) rect(g, x + w - 2, y + 1, 1, 20, C.ink);
  // SHOPCARD-1 (G4): a shaped drop's grid on its ink plate at the card's right end, where the name and the sub line leave room
  // (the 22 px card holds the tallest plate, 20)
  if (hasGrid(drop)) {
    const pw = shapeGridSize(drop).w + 2, px = x + w - 4 - pw;
    if (x + 23 + Math.max(textWidth(t.name), textWidth(t.sub, "3")) + 4 <= px) drawShapePlate(g, drop, px, y + 1);
    else drawIconMark(g, drop, x + 4, y + 4, 14); // PRESENT-1 S1 (a): a card too narrow for the plate beside the words shows the footprint over its icon's corner (was dropped); PRESENT-6 G6 (REQ-BFG-113): as the mark in the 14 x 14 box's corner, the icon whole (was G1's grid at iconCell over the box's top-left: the icon showed as a grey grid)
  }
}

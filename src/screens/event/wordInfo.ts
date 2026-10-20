// ENCHANT-2 (REQ-BFG-085, REQ-BFG-087, REQ-BFG-089; BRIEF-ENCHANT2 T3): WHAT A WORD DOES, BEHIND A TAP, on the road event screen. The ASH SHRINE's cards
// print a word's name in its colour (cards.ts); the ENCHANTER's offer card shows the same word with its `ON A RIG: ...` rows behind the tap, and so does the
// shrine: a small `?` on each card that offers a word opens the word's own card over the panel (name in its colour, then a row for each kind of part
// it goes on, from ui/enchantFaces.ts wordFace), and a tap on that card, or Escape, closes it. The `?` is a ui region of its own (the card's tap stays a
// pick); on a phone its hit rect is at least a finger wide (ui/tap.ts TAP_CSS). Pure geometry and one draw call: the screen (event.ts) holds the state.

import type { G } from "../../render/pixel";
import { rect } from "../../render/pixel";
import { C } from "../../render/palette";
import { drawText, icons, textWidth, wrap } from "../../render/font";
import { isEnchantId } from "../../sim/enchant";
import { TAP_CSS } from "../../ui/tap";
import { wordFace } from "../../ui/enchantFaces";
import type { Rect } from "../../ui/ui";

/** The `?` button of a card: drawn 9 x 9 at the card's top-right corner (the corner the odds and the merge badge use on other cards: the shrine's cards have neither), and its
 *  tap target: at least TAP_CSS CSS px each way when `k` (CSS px per logical px) is given, never past the card. */
export function infoButton(card: Rect, k = 0): { btn: Rect; hit: Rect } {
  const btn = { x: card.x + card.w - 13, y: card.y + 6, w: 9, h: 9 };
  const need = k > 0 ? Math.ceil(TAP_CSS / k) : 0;
  const w = Math.min(card.w, Math.max(btn.w + 6, need)), h = Math.min(card.h, Math.max(btn.h + 6, need));
  const x = Math.max(card.x, Math.min(btn.x + btn.w / 2 - w / 2, card.x + card.w - w)), y = Math.max(card.y, Math.min(btn.y + btn.h / 2 - h / 2, card.y + card.h - h));
  return { btn, hit: { x: Math.round(x), y: Math.round(y), w, h } };
}

/** The rows of a word's own card, ready to draw: the title, its colour, and each kind's row as wrapped lines of the 3x5 face within `w` logical px. null for a forged id.
 *  ENCHANT-2W (REQ-BFG-085; W3): `day`, the run's day (event.ts passes it: the card is drawn during a run), so RISING's and GROWING's amounts are the day's as the part's panel
 *  gives them; none (the text sheet): day 1's, as before. */
export function wordInfoRows(word: string, w: number, day?: number): { title: string; colour: string; rows: string[][] } | null {
  if (!isEnchantId(word)) return null;
  const f = wordFace(word, day);
  return { title: f.name, colour: f.color, rows: f.lines.map((l) => wrap(`${l.label}: ${icons(l.text)}`, w, "3")) };
}

/** Draw the word's card inside `r` (the event panel): an ink frame, the word's name in its colour, its rows, and the line that says how to close it. `day`: the run's (wordInfoRows). */
export function drawWordInfo(g: G, r: Rect, word: string, day?: number): void {
  const rows = wordInfoRows(word, r.w - 12, day);
  if (!rows) return;
  rect(g, r.x, r.y, r.w, r.h, C.ink);
  rect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, C.slate0);
  rect(g, r.x + 1, r.y + 1, r.w - 2, 2, rows.colour);
  drawText(g, rows.title, r.x + 6, r.y + 6, rows.colour, { outline: C.ink });
  let y = r.y + 17;
  for (const lines of rows.rows) {
    for (let i = 0; i < lines.length; i++) {
      drawText(g, lines[i], r.x + 6 + (i ? 4 : 0), y, C.bone, { font: "3" });
      y += 8;
    }
  }
  const tip = "TAP TO CLOSE";
  drawText(g, tip, r.x + r.w - 5, r.y + r.h - 9, C.slate4, { font: "3", align: "right" });
}

/** Draw the `?` button: an ink box with a slate face and the mark in the word's colour. */
export function drawInfoButton(g: G, btn: Rect, colour: string, open: boolean): void {
  rect(g, btn.x, btn.y, btn.w, btn.h, C.ink);
  rect(g, btn.x + 1, btn.y + 1, btn.w - 2, btn.h - 2, open ? C.slate3 : C.slate1);
  drawText(g, "?", btn.x + Math.floor((btn.w - textWidth("?", "3")) / 2), btn.y + 2, colour, { font: "3" });
}

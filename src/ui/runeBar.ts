// RUNES-1 (REQ-BFG-058, M2): the RUNE BAR on the build screen, and the rune card the picker and the bar's read-out share.
// - The bar is a row right under the HUD (the top bar), there only while the run holds a rune: one chip per held rune in
//   pick order (runes[i] was taken at the dawn of day i + 1), framed in its tier's colour (palette.ts RARITY_COLOR). A chip
//   is at least TAP_CSS (44) CSS px a side (runeChip: tapPx of the view, never under RUNE_CHIP_MIN art px) and shows the
//   rune's initials over its keyword word in the keyword's colour (no rune icons on this base). One row always: where the
//   screen can't hold every chip, the last place is a "+k" chip that opens the full list.
// - The build screen keeps its layout and lays out in the screen's height less the bar's row, then moves down by the row
//   (shiftLayout): the top bar stays, the shop moves down, the details band gives up the row (the hull stays on a portrait
//   phone); with no rune held nothing changes (row 0).
// - A tap on a chip opens its read-out under the bar (name, "RARE RUNE · TAKEN DAY 4", the effect line, the reminder)
//   until that chip or the read-out is tapped again, or anything else is pressed.

import type { G } from "../render/pixel";
import { frame, rect } from "../render/pixel";
import { C } from "../render/palette";
import { drawText, textWidth } from "../render/font";
import { panel, type Rect } from "./ui";
import { tapPx, TAP_CSS } from "./tap";
import type { View } from "../core/io";
import { drawRich, wrapRich, type RichLine } from "./richText";
import { RUNES, isRune, type RuneDef, type RuneHeld } from "../sim/runes";
import {
  RUNE_KEYWORD_COLOUR, KEYWORD_WORD, runeInitials, runeKeyword, runeReminderSpans, runeSentenceSpans, runeTaken, tierColour,
} from "./runeText";
import { buildLayout, FOE_H, phoneScreen, type BuildLayout } from "../screens/build/layout";
import { cornerTap } from "../screens/build/layout"; // TAP-093b (backlog #340): the corner MENU's finger square
import { OFFERS } from "../sim/content";
import type { BuildScreen } from "../screens/build/build";

/** The smallest chip, art px (its initials over its keyword word: a word up to 19 px of the 3x5 face, PLATE's, fits it;
 *  SUS-B's SHIELD, 23 px, is wider, so its chip widens to 26: runeChipW). FLIP-X2 (REVIEW-FLIPX1 answer 3): the comment
 *  said "PLATE the widest, 19 px", stale since SHIELD. */
export const RUNE_CHIP_MIN = 22;
/** The bar's label column ("RUNES" over the count). */
const LABEL_W = 26;
const PITCH_GAP = 3;

/** TAP-093b (backlog #340, REQ-BFG-040): where the bar's first chip starts while the build screen's corner MENU is up,
 *  its finger target a `tap` px square from the screen's top-left corner (layout.ts cornerTap, cornerTarget): 1 px right
 *  of that square (tap + 1: 31 at x3 @2, 30 at x4 @2.625, 34 at x4 @3), never left of the label column's 28 (x5 @3's
 *  27 px square already ends left of it: 28, as before). Pure. */
export const runeChipX0 = (tap: number): number => Math.max(LABEL_W + 2, tap + 1);

/** A chip's side in art px for a view: a finger's TAP_CSS CSS px (tapPx), at least RUNE_CHIP_MIN. */
export const runeChip = (v: Pick<View, "scale" | "dpr">): number => Math.max(RUNE_CHIP_MIN, tapPx(v));
/** The bar's row height for `n` held runes (0: no bar). */
export const runeRowH = (v: Pick<View, "scale" | "dpr">, n: number): number => (n > 0 ? runeChip(v) + 6 : 0);

export interface RuneBarLayout {
  bar: Rect;
  chip: number;
  /** One per rune shown as a chip, in pick order (runes 0 .. shown - 1). */
  chips: Rect[];
  shown: number;
  /** The "+k" chip (k = n - shown) that opens the full list, or null when every rune has its chip. */
  more: Rect | null;
}

/** The bar for `n` runes on a screen `W` wide, its row's top at `top`, chips `chip` art px tall. Pure (tests).
 *  FLIP-X2 (REVIEW-FLIPX1 answer 3): `ws[i]`, rune i's chip width (runeChipW: at least `chip`, wider when its keyword word
 *  needs it, SHIELD's 26 on the desk's 22 px chips); absent, every chip is `chip` wide and the row is exactly as before
 *  (the same fit: chips while the last one ends inside W - 3, else a "+k" chip, `chip` wide, in the last place that fits).
 *  TAP-093b (backlog #340, REQ-BFG-040): `x0`, where the first chip starts (runeChipX0: right of the build screen's corner
 *  MENU's finger square); absent, LABEL_W + 2 = 28, right of the label column, exactly as before. */
export function runeBarLayout(W: number, top: number, n: number, chip: number, ws: readonly number[] = [], x0 = LABEL_W + 2): RuneBarLayout {
  const bar = { x: 0, y: top, w: W, h: chip + 6 };
  const right = W - 3;
  const wOf = (i: number): number => Math.max(chip, ws[i] ?? chip);
  const xs: number[] = [];
  for (let i = 0, x = x0; i < n; x += wOf(i) + PITCH_GAP, i++) xs.push(x);
  let shown = n;
  if (n > 1 && xs[n - 1] + wOf(n - 1) > right) {
    shown = 0; // the "+k" chip goes in the last place it fits (the chips before it end left of it)
    for (let s = n - 1; s >= 0; s--) if (xs[s] + chip <= right) { shown = s; break; }
  }
  const at = (i: number, w: number): Rect => ({ x: xs[i], y: top + 3, w, h: chip });
  return { bar, chip, chips: Array.from({ length: shown }, (_, i) => at(i, wOf(i))), shown, more: n > shown ? at(shown, chip) : null };
}

/** The build layout moved down by `dy` (the bar's row), the top bar where it was, H the whole screen's. Pure. */
export function shiftLayout(L: BuildLayout, dy: number, H: number): BuildLayout {
  if (!dy) return L;
  const m = (r: Rect): Rect => ({ ...r, y: r.y + dy });
  return {
    ...L, H, cards: L.cards.map(m), reroll: m(L.reroll), frame: { ...L.frame, dy: L.frame.dy + dy }, hull: m(L.hull), pad: m(L.pad),
    cargo: m(L.cargo), fight: m(L.fight), info: m(L.info), foe: L.foe ? m(L.foe) : null, packs: L.packs.map(m),
  };
}

/** pickScale's guard: at `scale`, the build screen with its rune row still fits the screen (its cargo tray and FIGHT on
 *  it; a portrait band that holds NEXT BATTLE). Always true with no rune held. */
export function runeRowFits(s: Pick<BuildScreen, "run" | "refit" | "offers">, pw: number, ph: number, portrait: boolean, scale: number, dpr?: number): boolean {
  const n = s.run.build.runes?.length ?? 0;
  if (!n) return true;
  const W = Math.floor(pw / scale), H = Math.floor(ph / scale), row = runeRowH({ scale, dpr: dpr ?? 1 }, n);
  const phone = dpr !== undefined && phoneScreen(pw, ph, dpr);
  const L = buildLayout(W, H - row, portrait, s.refit ? OFFERS : s.offers().length, phone && portrait, phone ? Math.ceil(TAP_CSS / (scale / dpr!)) : 0);
  const foot = Math.max(L.cargo.y + L.cargo.h, L.fight.y + L.fight.h);
  return foot <= H - row + 2 && (!portrait || L.info.h >= FOE_H);
}

const defsOf = (runes: readonly RuneHeld[] | undefined): RuneDef[] =>
  (runes ?? []).map((q) => (q && isRune(q.id) ? RUNES[q.id] : null)).filter((d): d is RuneDef => !!d);

// ---- drawing -----------------------------------------------------------------------------------------------------------

/** A rune chip: the item slot's frame (ui.ts itemSlot), its bottom edge in the tier's colour; the initials over the
 *  keyword word in its colour (a chip under 20 px: the initials alone). `sel`: a 1 px yellow ring. */
export function drawRuneChip(g: G, r: Rect, def: RuneDef, sel = false): void {
  rect(g, r.x, r.y, r.w, r.h, C.ink);
  rect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, C.slate0);
  rect(g, r.x + 1, r.y + r.h - 3, r.w - 2, 2, tierColour(def.tier));
  const k = runeKeyword(def), ini = runeInitials(def);
  const cx = r.x + r.w / 2;
  if (k && r.h >= 20) {
    const top = r.y + Math.floor((r.h - 3 - 13) / 2);
    drawText(g, ini, cx, top, C.bone, { align: "center" });
    drawText(g, KEYWORD_WORD[k], cx, top + 8, RUNE_KEYWORD_COLOUR[k], { font: "3", align: "center" });
  } else drawText(g, ini, cx, r.y + Math.floor((r.h - 3 - 7) / 2), C.bone, { align: "center" });
  if (sel) frame(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, C.yellow);
}

/** The "+k" chip: the count of runes the row can't show; a tap opens the full list. */
function drawMoreChip(g: G, r: Rect, k: number, sel: boolean): void {
  rect(g, r.x, r.y, r.w, r.h, C.ink);
  rect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, C.slate1);
  const top = r.y + Math.floor((r.h - 13) / 2);
  drawText(g, `+${k}`, r.x + r.w / 2, top, C.yellow, { align: "center" });
  drawText(g, "ALL", r.x + r.w / 2, top + 8, C.slate4, { font: "3", align: "center" });
  if (sel) frame(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, C.yellow);
}

export interface RuneCardOpts {
  /** The line under the name: the tag ("RARE · ARMOR") or the read-out's ("RARE RUNE · TAKEN DAY 4"). */
  sub: string;
  /** A yellow ring: the opened picker card. */
  open?: boolean;
  reminder?: boolean;
  /** A yellow bar under the text ("TAP AGAIN TO TAKE IT"). */
  hint?: string;
}

const CARD_TEXT_Y = 31;
/** A card's text width: its width less the 5 px insets. */
export const runeCardTextW = (w: number): number => w - 10;

/** The card chip's height, and its least width (art px). */
const CARD_CHIP = 22;
/** FLIP-X1 (F-a, REQ-BFG-069): the card chip's width, sized from its keyword word (3x5 textWidth): 22 art px, wider when
 *  the word needs it. SHIELD's six letters (23 px) ran about 1 px past each side of the 22 px box; at 26 the word sits
 *  inside the box's ink edge as PLATE's 19 px sits in 22. Every other word fits 22, so its card is as before. Pure. */
export function runeCardChipW(def: RuneDef): number {
  return runeChipW(def, CARD_CHIP);
}

/** FLIP-X2 (REVIEW-FLIPX1 answer 3): any rune chip's width for a chip `side` art px tall (the bar's runeChip, the picker
 *  tray's RUNE_CHIP_MIN, the card's 22), sized from its keyword word as the card's is: max(side, textWidth(word, 3x5) + 3).
 *  Only SHIELD (23 px) needs more than 22, so a SHIELD chip on the desk's bar and in the tray is 26 wide; the phone's bar
 *  chips (27) already hold it. Pure. */
export function runeChipW(def: RuneDef, side: number): number {
  const k = runeKeyword(def);
  return Math.max(side, k ? textWidth(KEYWORD_WORD[k], "3") + 3 : 0);
}

/** Y-FURN (REQ-BFG-070; TEXT-STYLE 3.1): a card's effect lines at text width `tw`: each sentence of the rune's text
 *  (runeText.ts runeSentences: one trigger and one effect each) starts a line, and wrapRich wraps it where the card is
 *  narrow. A one-sentence text, every rune's but SEARING's and SHATTER SHOT's, wraps as before. Pure (tests). */
export function runeTextLines(def: RuneDef, tw: number): RichLine[] {
  return runeSentenceSpans(def).flatMap((s) => wrapRich(s, tw, "5"));
}

/** A rune card's height at width `w` (R1b-2's mock: a 31 px head, 9 px per effect line, 7 per reminder line, the hint
 *  bar 13, 4 at the foot). Pure (tests). */
export function runeCardH(def: RuneDef, w: number, o: Omit<RuneCardOpts, "sub">): number {
  let h = CARD_TEXT_Y + runeTextLines(def, runeCardTextW(w)).length * 9;
  if (o.reminder) h += 1 + wrapRich(runeReminderSpans(def), runeCardTextW(w), "3").length * 7;
  if (o.hint) h += 13;
  return h + 4;
}

/** A rune card (the picker's, the bar's read-out): the dark panel with its tier's colour on top and bottom, the chip, the
 *  name in the tier's colour, the sub line, the effect (wrapped by richText where the card is narrow), the reminder. */
export function drawRuneCard(g: G, r: Rect, def: RuneDef, o: RuneCardOpts): void {
  const edge = tierColour(def.tier);
  panel(g, r, "dark");
  rect(g, r.x + 1, r.y + 1, r.w - 2, 2, edge);
  rect(g, r.x + 1, r.y + r.h - 3, r.w - 2, 2, edge);
  // RUNES-2a: a legendary card's own frame is yellow, so its open ring is white (every other tier's stays yellow)
  if (o.open) frame(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, def.tier === "legendary" ? C.white : C.yellow);
  const cw = runeCardChipW(def), tx = r.x + 9 + cw; // F-a: the name and sub line 4 px right of the chip (x + 31 at 22)
  drawRuneChip(g, { x: r.x + 5, y: r.y + 6, w: cw, h: CARD_CHIP }, def);
  drawText(g, def.name, tx, r.y + 7, edge, { outline: C.ink });
  drawText(g, o.sub, tx, r.y + 18, C.slate4, { font: "3" });
  const tw = runeCardTextW(r.w);
  let y = r.y + CARD_TEXT_Y;
  for (const l of runeTextLines(def, tw)) { // Y-FURN: each sentence starts a line
    drawRich(g, l, r.x + 5, y, "5");
    y += 9;
  }
  if (o.reminder) {
    y += 1;
    for (const l of wrapRich(runeReminderSpans(def), tw, "3")) {
      drawRich(g, l, r.x + 5, y, "3");
      y += 7;
    }
  }
  if (o.hint) {
    const hw = textWidth(o.hint) + 8, hb = { x: Math.round(r.x + r.w / 2 - hw / 2), y: y + 1, w: hw, h: 11 };
    rect(g, hb.x, hb.y, hb.w, hb.h, C.yellow);
    drawText(g, o.hint, hb.x + 4, hb.y + 2, C.ink);
  }
}

/** The read-outs' width on a screen `W` wide. */
export const readoutW = (W: number): number => Math.min(W - 8, 300);

/** The full list ("+k"): a row per rune (its name and day, then its effect line). Its height. Pure (tests). */
export const runeListH = (n: number): number => 16 + n * 19 + 2;

// ---- the bar on the build screen ---------------------------------------------------------------------------------------

/** The bar's state on one build screen: the chip whose read-out is open (-1 none), or the full list. */
export class RuneBar {
  open = -1;
  list = false;

  /** The bar as the build screen lays it out now (its row right under the top bar), or null with no rune held. */
  layout(s: BuildScreen): RuneBarLayout | null {
    const n = s.run.build.runes?.length ?? 0;
    if (!n) return null;
    const side = runeChip(s.game.view);
    // FLIP-X2 (REVIEW-FLIPX1 answer 3): each chip sized from its word (runeChipW; SHIELD's 26 on the desk's 22 px chips)
    const ws = (s.run.build.runes ?? []).map((q) => (q && isRune(q.id) ? runeChipW(RUNES[q.id], side) : side));
    // TAP-093b (backlog #340): while the corner MENU is up (a portrait phone's bar shorter than a finger's target), the
    // chips start right of its finger's square (runeChipX0), so its target is a full square with runes held; elsewhere
    // (a lifted bar, landscape, the desktop) at 28, as before
    const corner = cornerTap(s.L, tapPx(s.game.view));
    return runeBarLayout(s.game.W, s.L.bar.y + s.L.bar.h, n, side, ws, corner ? runeChipX0(corner) : undefined);
  }

  /** Under the chrome (a grown details panel, the options card and a drag draw over it): the strip and its chips. */
  drawUnder(g: G, s: BuildScreen): void {
    const B = this.layout(s);
    if (!B) {
      this.open = -1;
      this.list = false;
      return;
    }
    const defs = defsOf(s.run.build.runes);
    panel(g, B.bar, "inset");
    drawText(g, "RUNES", 4, B.bar.y + 4, C.slate4, { font: "3" });
    drawText(g, String(defs.length), 4, B.bar.y + 11, C.bone);
    B.chips.forEach((r, i) => drawRuneChip(g, r, defs[i], this.open === i));
    if (B.more) drawMoreChip(g, B.more, defs.length - B.shown, this.list);
  }

  /** Over the chrome: the chips' tap targets (they win over the top bar's grown SND and MENU targets) and the open
   *  read-out. Not while the options card is up or a details panel grown over the bar covers it. */
  drawOver(g: G, s: BuildScreen): void {
    const B = this.layout(s);
    if (!B || s.menu) return;
    const area = s.panelArea();
    if (area !== s.L.info && area.y < B.bar.y + B.bar.h) return;
    const ui = s.game.ui;
    const defs = defsOf(s.run.build.runes);
    ui.add({ id: "runebar", r: B.bar, block: true });
    B.chips.forEach((r, i) => ui.add({ id: `rune-${i}`, r, onTap: () => { this.list = false; this.open = this.open === i ? -1 : i; } }));
    if (B.more) ui.add({ id: "rune-more", r: B.more, onTap: () => { this.open = -1; this.list = !this.list; } });
    const W = s.game.W, w = readoutW(W), x = Math.round(W / 2 - w / 2), y = B.bar.y + B.bar.h + 2;
    if (this.open >= 0 && defs[this.open]) {
      const def = defs[this.open];
      const r = { x, y, w, h: runeCardH(def, w, { reminder: true }) };
      drawRuneCard(g, r, def, { sub: runeTaken(def, this.open + 1), reminder: true });
      ui.add({ id: "rune-readout", r, onTap: () => { this.open = -1; } });
    } else if (this.list) {
      const r = { x, y, w, h: runeListH(defs.length) };
      panel(g, r, "dark");
      drawText(g, `YOUR RUNES ${defs.length}`, r.x + 5, r.y + 5, C.slate4, { font: "3" });
      defs.forEach((d, i) => {
        const ry = r.y + 16 + i * 19;
        drawText(g, d.name, r.x + 5, ry, tierColour(d.tier));
        drawText(g, `DAY ${i + 1}`, r.x + r.w - 5, ry + 1, C.slate4, { font: "3", align: "right" });
        const line = runeTextLines(d, runeCardTextW(r.w))[0] ?? []; // Y-FURN: a two-line rune's first sentence, whole
        drawRich(g, line, r.x + 5, ry + 9, "5");
      });
      ui.add({ id: "rune-readout", r, onTap: () => { this.list = false; } });
    }
  }

  /** Every press (BuildScreen.pressed): one on anything but the bar and its read-out closes the read-out. */
  pressed(region: string | null): void {
    if (region === null || !region.startsWith("rune")) {
      this.open = -1;
      this.list = false;
    }
  }
}

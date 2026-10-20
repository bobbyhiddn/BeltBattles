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
import { button, panel, type Rect } from "./ui"; // ENDLESS-1: + button (the paged YOUR RUNES list's foot)
import { inside, tapRect, type UI } from "./ui"; // EXPLAIN-1 (REQ-BFG-089, E3): the chip's target
import { tapPx, TAP_CSS } from "./tap";
import { isPhone } from "./tap"; // EXPLAIN-1 (E3): a phone's chip target is a finger's
import { runeReminder } from "./runeText"; // EXPLAIN-1 (E3): the hidden line the chip shows
import { runeSourceLine } from "./runeText"; // CARD-4 run 3 (REQ-BFG-081, I): a part-keyed rune's source line, under it
import { drawIconTip, helpCursor, iconTipRect } from "../screens/build/keywords"; // EXPLAIN-1 (E3): the tooltip's style
import type { View } from "../core/io";
import { drawRich, wrapRich, type RichLine } from "./richText";
import { RUNES, isRune, type RuneDef, type RuneHeld } from "../sim/runes";
import { endlessMarked } from "../sim/endless"; // ENDLESS-1 (REQ-BFG-059, 3.5): only an endless-marked run gets the paged YOUR RUNES list
import {
  RUNE_KEYWORD_COLOUR, KEYWORD_WORD, runeInitials, runeKeyword, runeReminderSpans, runeSentenceSpans, runeTaken, tierColour,
} from "./runeText";
import { buildLayout, FOE_H, phoneScreen, type BuildLayout } from "../screens/build/layout";
import { LAND_MIN_H } from "../screens/build/layout"; // ZOOM-1 (REQ-BFG-080): runeRowFits' landscape test, 0.9.8's
import { cornerTap } from "../screens/build/layout"; // TAP-093b (backlog #340): the corner MENU's finger square
import { OFFERS } from "../sim/content";
import type { BuildScreen } from "../screens/build/build";
import { glossaryEntry, RUNE_NOTE, RUNE_REMINDER } from "./glossary"; // CARD-2 (REQ-BFG-081, K2): a rune word's definition
import { runeWordNote } from "./glossary"; // CARD-4 (REQ-BFG-081, T): the numbered notes, the word-only keywords' notes (FIX-099G: on the card's day)
import { lineText } from "./richText"; // CARD-2 (K2): where a keyword sits on a drawn line
import { runeKeywords, runeTextOf as runeTextOfDef, type RuneKeyword } from "./runeText"; // CARD-2 (K2)
import { sightWord, sawWord } from "./firstSight"; // CARD-2 (REQ-BFG-004, K1): the first-sight notes on rune cards
import { clampRect, drawWordTip } from "../screens/build/keywords"; // CARD-2 (K2): U2c's target rules, the tooltip (CARD-4: clipKeep)

const overlapsR = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

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
    cam: { ...L.cam, y: L.cam.y + dy }, // ZOOM-1 (REQ-BFG-080): the carrier's pivot moves with its frame
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
  // ZOOM-1 (REQ-BFG-080): landscape, 0.9.8's test exactly: its cargo tray sat under the hull, so the screen held it where
  // its height held LAND_MIN_H; the tray now sits under FIGHT and always fits, and the scale stays 0.9.8's
  return (portrait ? foot <= H - row + 2 : H - row >= LAND_MIN_H) && (!portrait || L.info.h >= FOE_H);
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

/** ENDLESS-1 (REQ-BFG-059, 3.5): a COMPACT rune chip for the picker's tray when an endless run's ~50 runes would not fit it at
 *  RUNE_CHIP_MIN: RUNE_SMALL_W x RUNE_SMALL_H, the same item-slot frame and tier-coloured bottom edge, the initials alone in the 3x5
 *  face (the keyword word the full chip carries gives way). Display only, like the tray's chips. */
export const RUNE_SMALL_W = 14;
export const RUNE_SMALL_H = 11;
export function drawRuneChipSmall(g: G, r: Rect, def: RuneDef): void {
  rect(g, r.x, r.y, r.w, r.h, C.ink);
  rect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, C.slate0);
  rect(g, r.x + 1, r.y + r.h - 3, r.w - 2, 2, tierColour(def.tier));
  drawText(g, runeInitials(def), r.x + r.w / 2, r.y + 2, C.bone, { font: "3", align: "center" });
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
  /** The reminder's room under the effect lines (runeCardH counts it). EXPLAIN-1 (REQ-BFG-089, E1d): the reminder is
   *  default rules text, so the room stays clear; the line draws there only while `noteOpen` (a tap on the chip, E3). */
  reminder?: boolean;
  /** EXPLAIN-1 (E3): the hidden line shown in its room, in keywords.ts definitionBox's look (drawRuneNote). */
  noteOpen?: boolean;
  /** CARD-2 (REQ-BFG-081, K2; K1): a keyword word of the card (KEYWORD_WORD) whose definition shows in the room in place
   *  of the chip's line (runeWordText), in the same look; whole, growing up over the effect lines where it needs more
   *  rows than the room has (the card's size never changes). */
  word?: string | null;
  /** A yellow bar under the text ("TAP AGAIN TO TAKE IT"). */
  hint?: string;
  /** HULL-1a (REQ-BFG-079): the day the card is read on (a HULL rune's amount: the day's number with HULL_SCALE on). */
  day?: number;
  /** CARD-4 (REQ-BFG-081, P1): a finger's target height in art px (runeTapOf: tapPx on touch, 0 for a mouse): the bar's
   *  band grows to hold a target that tall (runeBarBand); the drawn bar keeps its 11 px, centred in its band. */
  tap?: number;
}

/** CARD-4 (REQ-BFG-081, P2): a take within this many seconds of its card opening is ignored, so a double tap opens a
 *  card and stops there (the build screen's clock: BuildScreen.t, game seconds, real time while the game runs). */
export const TAKE_GUARD_S = 0.35;
/** CARD-4 (P2): the guard's wall clock in ms (performance.now where there is one); tests pin it (TAKE_CLOCK.wall). */
export const TAKE_CLOCK: { wall: () => number } = { wall: () => (typeof performance !== "undefined" ? performance.now() : 0) };
/** CARD-4 (P2): a take `game` s of the build screen's game time and `wallMs` ms of wall time after its card opened passes
 *  the guard once either is past TAKE_GUARD_S: the game's clock runs behind the wall's on slow frames (dt at most 0.05 s a
 *  frame: game.ts loop; READ-4's P under load took 2 of 5 bar taps at 500 ms), and a frame-stepped test runs ahead of it.
 *  A double tap is under 350 ms on both. Pure. */
export const takeGuardPassed = (game: number, wallMs: number): boolean => game >= TAKE_GUARD_S || wallMs >= TAKE_GUARD_S * 1000;

/** CARD-4 (P1): the TAP AGAIN bar's band, art px: 13 (the bar's 11, 1 above and 1 below), or on touch (`tap` > 0) tall
 *  enough that the bar's target (runeBarTarget: from 2 px under the band's top at the lowest, where a note box's foot can
 *  reach, to the card's ink frame) is `tap` tall. Pure. */
export const runeBarBand = (tap = 0): number => Math.max(13, tap - 1);

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
export function runeTextLines(def: RuneDef, tw: number, day?: number): RichLine[] {
  return runeSentenceSpans(def, undefined, day).flatMap((s) => wrapRich(s, tw, "5")); // HULL-1a: `day` (runeAmountText)
}

/** CARD-3 (REQ-BFG-087, D2): the band of an opened card that holds its TAP AGAIN TO TAKE IT bar: the bar's 11 px (runeCardH's
 *  13 for it, then 4 at the foot), the card's width. The pickers pass it to runeWordLayer so a word's tooltip keeps clear.
 *  CARD-4 (P1): on touch (`tap` > 0) the band is runeBarBand(tap) tall. */
export const runeHintBand = (card: Rect, tap = 0): Rect => ({ x: card.x, y: card.y + card.h - 4 - runeBarBand(tap), w: card.w, h: runeBarBand(tap) });

/** CARD-4 (P1): the drawn bar (11 px, `hint`'s width and 4 px a side) on opened card `card`, centred in its band. Pure. */
export function runeBarRect(card: Rect, hint: string, tap = 0): Rect {
  const band = runeHintBand(card, tap), hw = textWidth(hint) + 8;
  return { x: Math.round(card.x + card.w / 2 - hw / 2), y: band.y + Math.floor((band.h - 11) / 2), w: hw, h: 11 };
}

/**
 * CARD-4 (REQ-BFG-081, P1): the TAP AGAIN TO TAKE IT bar's target, the only press that takes the rune: the bar's width
 * (on touch at least `tap` wide, grown about its middle inside the card), from 1 px under its band's top (or the foot of a
 * shown note box `box`, so it is never under a note) down to the card's ink frame: `tap` tall or more on touch (its band
 * is runeBarBand's), 15 px on the desk (the drawn bar's 11 and its band's rows round it). Pure (the pickers, tests).
 */
export function runeBarTarget(card: Rect, hint: string, tap = 0, box: Rect | null = null): Rect {
  const band = runeHintBand(card, tap), bar = runeBarRect(card, hint, tap);
  const top = Math.max(band.y + 1, box ? box.y + box.h : band.y + 1), bottom = card.y + card.h - 1;
  const w = Math.min(card.w - 2, Math.max(bar.w, tap));
  const x = Math.max(card.x + 1, Math.min(card.x + card.w - 1 - w, Math.round(bar.x + bar.w / 2 - w / 2)));
  return { x, y: top, w, h: Math.max(1, bottom - top) };
}

/** CARD-4 run 3 (REQ-BFG-081, I): the chip's note as its 3x5 lines at text width `tw`: the reminder, then, on a line of
 *  its own, a part-keyed rune's source line (runeText.ts runeSourceLine), in `base`. The room, the note box and the
 *  word boxes all count these lines. Pure (the pickers, tests). */
export function runeNoteLines(def: RuneDef, tw: number, base: string = C.slate4): RichLine[] {
  const src = runeSourceLine(def);
  return [...wrapRich(runeReminderSpans(def, base), tw, "3"), ...(src ? wrapRich([{ t: src, c: base }], tw, "3") : [])];
}

/**
 * SHOPCARD-1f (REQ-BFG-081; F7, REVIEW-FIX099G open item 1, open since 0.9.9): the rows of a rune card's note room: the chip's line(s)
 * (runeNoteLines), or, where one of the card's keywords has a definition longer than that at this card width, as many as that needs.
 * CARD-2's K2 box grew UP over the effect lines when a definition needed more rows than the room had: on a phone's 233 px card LOOSE
 * THREAD's two-line FRAY note (the chip's line is one row) hid its one-line effect, `START: THE FOE HAS 2 FRAY.`, all but a sliver of
 * its top row, while the note showed. With the room sized for the card's longest definition the box never grows, and sits clear below
 * the effect lines. Only a card whose definition is longer than its chip's line changes size: at 233 px LOOSE THREAD, TANGLE WIRE,
 * THREAD STORM (their FRAY note) and TOLL ROAD (its RIG note), one row (7 px) taller; at the desk's 300 px none (parts/f7-rows.txt).
 * `day`: the day the card is read on (FRAY's and BURN's numbers, runeWordLines). Pure (the pickers' and the read-out's card heights,
 * drawRuneCard, runeWordBoxOn, tests).
 */
export function runeNoteRows(def: RuneDef, tw: number, day?: number): number {
  return Math.max(runeNoteLines(def, tw).length, runeWordRows(def, tw, day));
}

/** SHOPCARD-1f (F7): the rows of the longest definition any keyword of rune `def` shows at text width `tw` (0 for a card with no
 *  keyword). LAST CHANCE's RUNE card has no reminder room of its own (its details are optional), so it reserves this many. Pure. */
export function runeWordRows(def: RuneDef, tw: number, day?: number): number {
  let n = 0;
  for (const k of runeKeywords(def)) n = Math.max(n, runeWordLines(def, k, tw, day).length);
  return n;
}

/** A rune card's height at width `w` (R1b-2's mock: a 31 px head, 9 px per effect line, 7 per reminder line, the hint
 *  bar 13, 4 at the foot). Pure (tests). CARD-4 (P1): the hint's band runeBarBand(o.tap) (13 on the desk). SHOPCARD-1f (F7): the
 *  reminder's room holds the card's longest definition (runeNoteRows). */
export function runeCardH(def: RuneDef, w: number, o: Omit<RuneCardOpts, "sub">): number {
  let h = CARD_TEXT_Y + runeTextLines(def, runeCardTextW(w), o.day).length * 9;
  if (o.reminder) h += 1 + runeNoteRows(def, runeCardTextW(w), o.day) * 7; // CARD-4 run 3 (I): with the source line; SHOPCARD-1f (F7): the longest definition
  if (o.hint) h += runeBarBand(o.tap);
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
  for (const l of runeTextLines(def, tw, o.day)) { // Y-FURN: each sentence starts a line
    drawRich(g, l, r.x + 5, y, "5");
    y += 9;
  }
  if (o.reminder) {
    // EXPLAIN-1 (REQ-BFG-089, E1d): the reminder's room stays, clear; its line draws only while the chip has it open (E3)
    const ls = runeNoteLines(def, tw, C.bone); // CARD-4 run 3 (I): the reminder, then the source line
    // CARD-2 (K2): a keyword's definition (its tap, or K1's first sight) takes the room in place of the chip's line
    // SHOPCARD-1f (F7): the room holds the card's longest definition (runeNoteRows), so a definition never grows up over the effect lines
    const k = o.word ? runeKeywordOf(def, o.word) : null, rows = runeNoteRows(def, tw, o.day);
    if (k) drawRuneWordNote(g, r, y, rows, runeWordLines(def, k, tw, o.day)); // FIX-099G: the card's day's note
    else if (o.noteOpen) drawRuneNote(g, r, y, ls);
    y += 1 + rows * 7;
  }
  if (o.hint) {
    // CARD-4 (P1): centred in its band (y + 1 in the desk's 13 px band, as before; runeBarRect, on a card runeCardH tall)
    const hw = textWidth(o.hint) + 8, hb = { x: Math.round(r.x + r.w / 2 - hw / 2), y: y + Math.floor((runeBarBand(o.tap) - 11) / 2), w: hw, h: 11 };
    rect(g, hb.x, hb.y, hb.w, hb.h, C.yellow);
    drawText(g, o.hint, hb.x + 4, hb.y + 2, C.ink);
  }
}

// ---- EXPLAIN-1 (REQ-BFG-089, E3): the card's chip is its icon ------------------------------------------------------------

/** EXPLAIN-1 (E3): the chip as drawRuneCard draws it on card `r`. Pure (tests). */
export const runeCardChip = (r: Rect, def: RuneDef): Rect => ({ x: r.x + 5, y: r.y + 6, w: runeCardChipW(def), h: CARD_CHIP });

/** EXPLAIN-1 (E3): the chip's target: the chip, grown on touch (`tap` > 0, a finger's TAP_CSS square in art px) as ui.ts
 *  tapRect grows the buttons, inside the card (1 px in from its frame). Pure (tests). */
export function runeChipTarget(r: Rect, def: RuneDef, tap: number): Rect {
  const c = runeCardChip(r, def);
  return tap ? tapRect(c, tap, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, tap) : c;
}

/** EXPLAIN-1 (E3): the hidden line's box over its room (from `y`, the room's top: drawRuneCard's text y after the effect
 *  lines), keywords.ts definitionBox's look (navy, a slate1 top edge), its lines `ls` where the reminder drew them: whole,
 *  never cut (the room is theirs: runeCardH). Pure geometry: runeNoteBox. */
export function runeNoteBox(r: Rect, y: number, lines: number): Rect {
  return { x: r.x + 2, y: y - 1, w: r.w - 4, h: lines * 7 + 3 };
}

function drawRuneNote(g: G, r: Rect, y: number, ls: readonly RichLine[]): void {
  const box = runeNoteBox(r, y, ls.length);
  rect(g, box.x, box.y, box.w, box.h, C.navy);
  rect(g, box.x, box.y, box.w, 1, C.slate1);
  ls.forEach((l, i) => drawRich(g, l, r.x + 5, y + 1 + i * 7, "3"));
}

/** EXPLAIN-1 (E3): the room's top y on card `r` (drawRuneCard's: the head, then 9 px a line of the effect). Pure.
 *  MERGE-099D (BRIEF-MERGE-099D 1c): `day`, the day the card is drawn on (HULL-1a: its effect lines wrap the day's amount,
 *  so the room starts where drawRuneCard's does); no day: day 1's, as before. */
export const runeNoteY = (r: Rect, def: RuneDef, day?: number): number => r.y + CARD_TEXT_Y + runeTextLines(def, runeCardTextW(r.w), day).length * 9;

/**
 * EXPLAIN-1 (E3): a rune card's chip as its icon, after the card's own region (so a press on it is the chip's, never the
 * card's: no rune is taken, no card is picked): its target (runeChipTarget) toggles the hidden line (`toggle`), and with a
 * mouse, hovering it shows the line in the word tooltip's style beside the card (keywords.ts iconTipRect), on the
 * screen `screen`, with the help cursor. Returns the target. `id` starts with the screen's own prefix (the rune bar's
 * "rune", the pickers'), so their press rules keep the card open.
 */
export function runeChipIcon(g: G, ui: UI, id: string, card: Rect, def: RuneDef, tap: number, toggle: (() => void) | null,
  screen: { W: number; H: number }, canvas?: HTMLCanvasElement | null): Rect {
  const t = runeChipTarget(card, def, tap);
  if (toggle) ui.add({ id, r: t, onTap: toggle });
  const p = ui.pointer;
  if (!tap && p.kind === "mouse" && !p.down && inside(t, p.x, p.y)) {
    const src = runeSourceLine(def); // CARD-4 run 3 (I): the source line under the reminder
    const items = src ? [runeReminder(def), src] : [runeReminder(def)], tr = iconTipRect(items, card, screen);
    drawIconTip(g, items, tr);
    ui.add({ id: `${id}-tip`, r: tr, block: true });
    helpCursor(canvas, true);
  }
  return t;
}

// ---- CARD-2 (REQ-BFG-081, K2): every keyword on a rune card can be reached --------------------------------------------

/** CARD-2 (K2): the keyword token of rune `def` that renders as `word` (KEYWORD_WORD), else null. */
export function runeKeywordOf(def: RuneDef, word: string): RuneKeyword | null {
  return runeKeywords(def).find((k) => KEYWORD_WORD[k] === word) ?? null;
}

/** CARD-2 (K1): the card's keyword words in reading order (each once), as its effect lines draw them. Pure. */
export function runeWordOrder(def: RuneDef): string[] {
  const ks = runeKeywords(def), out: string[] = [];
  for (const m of runeTextOfDef(def).matchAll(/\{\*?([A-Z]+)\}/g)) {
    const k = ks.find((q) => q === m[1]);
    if (k && !out.includes(KEYWORD_WORD[k])) out.push(KEYWORD_WORD[k]);
  }
  return out;
}

/**
 * CARD-2 (K2): what a tap on keyword `k` of rune `def`'s card shows in its note room: the rune's own note where it leads
 * with that word (glossary.ts RUNE_NOTE: SHATTER SHOT's SHIELD, whose hits break a SHIELD), else the keyword's rune
 * reminder (RUNE_REMINDER: what its glossary row says, number-free, its word first), else its glossary row (HULL, BELT,
 * GOLD and DMG, plain words). Pure.
 * FIX-099G (REQ-BFG-079, REQ-BFG-081; REVIEW-MERGE099E ruling 1): `day`, the day the card is read on (drawRuneCard's
 * `day`), so FRAY's and BURN's damage is that day's, as the panels show it (glossary.ts runeWordNote); no day: day 1's.
 */
export function runeWordText(def: RuneDef, k: RuneKeyword, day?: number): string {
  const w = KEYWORD_WORD[k], note = RUNE_NOTE[def.id];
  if (note && note.startsWith(`${w}: `)) return note;
  // CARD-4 (REQ-BFG-081, T): FRAY's and BURN's with their numbers, and the word-only keywords' notes (RUNE_WORD_NOTE)
  return runeWordNote(k, day) ?? RUNE_REMINDER[k] ?? glossaryEntry(w)?.def ?? w;
}

/** CARD-2 (K2): the definition's 3x5 lines at text width `tw`: its word in the keyword's colour, the rest bone, as the
 *  chip's line draws in the room (runeReminderSpans with C.bone). Pure. FIX-099G: `day`, the card's (runeWordText). */
export function runeWordLines(def: RuneDef, k: RuneKeyword, tw: number, day?: number): RichLine[] {
  const t = runeWordText(def, k, day), w = KEYWORD_WORD[k];
  return wrapRich(t.startsWith(w) ? [{ t: w, c: RUNE_KEYWORD_COLOUR[k] }, { t: t.slice(w.length), c: C.bone }] : [{ t, c: C.bone }], tw, "3");
}

/** CARD-2 (K2): the definition's box in a note room whose top is `y` and which holds `room` lines: the chip's line's box
 *  (runeNoteBox) where it fits, else as many rows taller as it needs, up over the effect lines (whole, never cut; the
 *  card keeps its size). Pure. */
export function runeWordBox(r: Rect, y: number, room: number, lines: number): Rect {
  return { x: r.x + 2, y: y - 1 - Math.max(0, lines - room) * 7, w: r.w - 4, h: lines * 7 + 3 };
}

/** CARD-2 (K2): the shown definition in its box (runeWordBox), definitionBox's look (navy, a slate1 top edge). */
export function drawRuneWordNote(g: G, r: Rect, y: number, room: number, ls: readonly RichLine[]): Rect {
  const box = runeWordBox(r, y, room, ls.length);
  rect(g, box.x, box.y, box.w, box.h, C.navy);
  rect(g, box.x, box.y, box.w, 1, C.slate1);
  ls.forEach((l, i) => drawRich(g, l, r.x + 5, box.y + 2 + i * 7, "3"));
  return box;
}

/** CARD-2 (K2): the shown definition's box on a card with a note room (the picker's opened card, the bar's read-out), or
 *  null when `word` is none of the card's keywords. Pure (the screens' regions, tests). MERGE-099D (1c): `day`, the card's
 *  (drawRuneCard's `day`), so the box's region sits where the card draws it. FIX-099G: and its height holds that day's
 *  lines (FRAY's and BURN's numbers: runeWordLines), so the TAP AGAIN target's top (runeBarTarget) follows them. */
export function runeWordBoxOn(r: Rect, def: RuneDef, word: string | null, day?: number): Rect | null {
  const k = word ? runeKeywordOf(def, word) : null;
  if (!k) return null;
  const tw = runeCardTextW(r.w);
  return runeWordBox(r, runeNoteY(r, def, day), runeNoteRows(def, tw, day), runeWordLines(def, k, tw, day).length); // CARD-4 run 3 (I); FIX-099G: the day's lines; SHOPCARD-1f (F7): the room holds the longest definition
}

/** CARD-2 (K2): one keyword on a rune card's effect lines: its keyword and word, what a tap shows, its colour, its glyphs
 *  as drawn (the dotted underline under them) and its grown hit rect. */
export interface RuneWord {
  k: RuneKeyword;
  word: string;
  text: string;
  colour: string;
  glyph: Rect;
  r: Rect;
}

/**
 * CARD-2 (K2): rune `def`'s keyword targets on card `r` (drawRuneCard's effect lines: 5x7 at a 9 px pitch), in reading
 * order: each keyword token as drawn (its word in its colour), its glyphs grown to the line's pitch and at least a pitch
 * wide, as U2c's word targets on panels (keywords.ts keywordTargets); where two grown rects meet they split between their
 * words; each kept inside the card (1 px in) and clear of `avoid` (the chip's target); a word whose middle is no longer in
 * its rect is left out (the chip still shows the card's line). Pure (drawing, the screens, tests).
 * MERGE-099D (BRIEF-MERGE-099D 1c): `day`, the day the card is drawn on (drawRuneCard's `day`; HULL-1a: a rune's amount is
 * the day's number with HULL_SCALE on, so its words sit where that day's lines put them); no day: day 1's, as before.
 */
export function runeWordTargets(r: Rect, def: RuneDef, avoid: readonly Rect[] = [], tap = 0, day?: number): RuneWord[] {
  const ks = runeKeywords(def), raw: (RuneWord & { cx: number; cy: number })[] = [];
  // CARD-4 (REQ-BFG-081, P4): on touch (`tap` > 0, a finger's TAP_CSS in art px) each target is `tap` tall, centred on its
  // word, where the room allows (READ-4 T: a tap 8 CSS px off a 15 px target took the rune); the desk keeps the line's pitch
  const th = tap > 9 ? tap : 9;
  runeTextLines(def, runeCardTextW(r.w), day).forEach((l, li) => {
    const text = lineText(l), y = r.y + CARD_TEXT_Y + li * 9;
    const cols: string[] = []; // each character's colour: a token draws its word in its keyword's colour
    for (const s of l) for (let j = 0; j < s.t.length; j++) cols.push(s.c);
    for (const k of ks) {
      const w = KEYWORD_WORD[k], c = RUNE_KEYWORD_COLOUR[k];
      for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + 1)) {
        let ok = true;
        for (let j = 0; j < w.length; j++) if (cols[i + j] !== c) ok = false;
        if (!ok) continue;
        const gx = r.x + 5 + (i > 0 ? textWidth(text.slice(0, i), "5") + 1 : 0);
        const glyph = { x: gx, y, w: textWidth(w, "5"), h: 7 };
        const nw = Math.max(glyph.w + 2, 9);
        const hit = { x: glyph.x - 1 - Math.floor((nw - glyph.w - 2) / 2), y: y - 1 - Math.floor((th - 9) / 2), w: nw, h: th };
        raw.push({ k, word: w, text: runeWordText(def, k, day), colour: c, glyph, r: hit, cx: glyph.x + glyph.w / 2, cy: y + 3.5 }); // FIX-099G: the day's note
      }
    }
  });
  raw.sort((a, b) => a.glyph.y - b.glyph.y || a.glyph.x - b.glyph.x);
  // the nearest wins: two grown rects that meet split between their words (keywordTargets' rule). CARD-4 (P4): two words
  // on different lines always split across the gap between their lines, half to each (at 9 px rects never met there)
  for (let i = 0; i < raw.length; i++) for (let j = i + 1; j < raw.length; j++) {
    const a = raw[i], b = raw[j];
    if (!overlapsR(a.r, b.r)) continue;
    if (a.glyph.y === b.glyph.y) {
      const [p, q] = a.cx <= b.cx ? [a, b] : [b, a];
      const mid = Math.max(p.glyph.x + p.glyph.w, Math.min(q.glyph.x, Math.round((p.glyph.x + p.glyph.w + q.glyph.x) / 2)));
      p.r = { ...p.r, w: Math.max(1, mid - p.r.x) };
      q.r = { ...q.r, w: Math.max(1, q.r.x + q.r.w - mid), x: mid };
    } else {
      const [p, q] = a.cy <= b.cy ? [a, b] : [b, a];
      const mid = Math.max(p.glyph.y + p.glyph.h, Math.min(q.glyph.y, Math.round((p.glyph.y + p.glyph.h + q.glyph.y) / 2)));
      p.r = { ...p.r, h: Math.max(1, mid - p.r.y) };
      q.r = { ...q.r, h: Math.max(1, q.r.y + q.r.h - mid), y: mid };
    }
  }
  const within = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, out: RuneWord[] = [];
  for (const t of raw) {
    let q: Rect | null = clampRect(t.r, within);
    // CARD-4 (P4): clear of `avoid` (the chip's target; the TAP AGAIN bar's), keeping the side that holds the word's middle
    for (const a of avoid) if (q) q = clipKeep(q, a, Math.floor(t.cx), Math.floor(t.cy));
    if (q && inside(q, Math.floor(t.cx), Math.floor(t.cy))) out.push({ k: t.k, word: t.word, text: t.text, colour: t.colour, glyph: t.glyph, r: q });
  }
  return out;
}

/** CARD-4 (P4): `q` without the part `a` covers: the largest of the pieces above, below, left and right of `a` that still
 *  holds the point (x, y) (a word's middle), else null. Where the largest piece holds the point this is keywords.ts
 *  clipOutRect's (U2c's) rule; where it doesn't, U2c's dropped the word and this keeps its own side. Pure. */
function clipKeep(q: Rect, a: Rect, x: number, y: number): Rect | null {
  if (!overlapsR(q, a)) return q;
  const cands: Rect[] = [
    { x: q.x, y: q.y, w: q.w, h: a.y - q.y },
    { x: q.x, y: a.y + a.h, w: q.w, h: q.y + q.h - (a.y + a.h) },
    { x: q.x, y: q.y, w: a.x - q.x, h: q.h },
    { x: a.x + a.w, y: q.y, w: q.x + q.w - (a.x + a.w), h: q.h },
  ].filter((c) => c.w > 0 && c.h > 0 && inside(c, x, y));
  return cands.length ? cands.sort((p, s) => s.w * s.h - p.w * p.h)[0] : null;
}

/**
 * CARD-2 (K2, K1): an opened rune card's keywords as targets, registered after the card's region and its chip's (so a press
 * on a word is the word's: no rune is taken, no card picked): each word's 1 art px dotted underline in its colour (not
 * under the shown definition's box, `box`), its target `${id}w${i}:${WORD}` (a tap calls `onWord(WORD)`), and with a mouse
 * resting on one, its definition under the word in the word tooltip's style (keywords.ts drawWordTip) with the help
 * cursor. The shown definition's box is a region `${id}def` (a press on it is its own, so it never takes the rune; `onDef`,
 * where the screen hears no press of its own: LAST CHANCE, closes it). A word whose definition is on screen (shown or
 * hovered) is done for K1 (firstSight.ts sawWord). Returns the targets.
 */
export function runeWordLayer(g: G, ui: UI, id: string, card: Rect, def: RuneDef, tap: number, word: string | null, box: Rect | null,
  onWord: (w: string) => void, screen: { W: number; H: number }, canvas?: HTMLCanvasElement | null, onDef?: () => void, bar?: Rect | null,
  take?: Rect | null, day?: number): RuneWord[] {
  // CARD-4 (REQ-BFG-081, P4): on a picker's opened card (the cards with a TAP AGAIN bar: `take`, its target, runeBarTarget)
  // finger-tall on touch and never reaching the bar's target; the rune bar's read-out (no `take`) keeps its targets as they
  // were (CARD-3 E: nothing a press reaches moves when its room opens). MERGE-099D (1c): `day`, the card's day
  const ts = runeWordTargets(card, def, [runeChipTarget(card, def, tap), ...(take ? [take] : [])], take ? tap : 0, day);
  ts.forEach((t, i) => {
    if (box && overlapsR(t.glyph, box)) return;
    for (let x = t.glyph.x; x < t.glyph.x + t.glyph.w; x += 2) rect(g, x, t.glyph.y + t.glyph.h, 1, 1, t.colour === C.bone ? C.slate4 : t.colour);
    ui.add({ id: `${id}w${i}:${t.word}`, r: t.r, onTap: () => onWord(t.word) });
  });
  if (box && word) {
    ui.add({ id: `${id}def`, r: box, block: true, ...(onDef ? { onTap: onDef } : {}) });
    sawWord(word);
  }
  const p = ui.pointer;
  const hov = !tap && p.kind === "mouse" && !p.down ? ts.find((t) => inside(t.r, p.x, p.y) && t.word !== word && !(box && overlapsR(t.glyph, box))) : undefined;
  if (hov) {
    drawWordTip(g, hov.text, hov.colour, hov.glyph, card, screen, bar); // CARD-3 (D2): never over the TAP AGAIN bar
    sawWord(hov.word);
    helpCursor(canvas, true);
  }
  return ts;
}

/** CARD-2 (K1): the word whose definition opens by itself when rune `def`'s card opens: its first effect keyword (in
 *  reading order) whose note is not done, else null (firstSight.ts sightWord). */
export const runeSightWord = (def: RuneDef): string | null => sightWord(runeWordOrder(def));

/** CARD-2 (K1): the chip's line has been on screen: when it is a keyword's own reminder (or the rune's note on a keyword),
 *  that keyword's note is done, as its word's box would be. */
export function sawRuneNote(def: RuneDef): void {
  const s = runeReminder(def);
  for (const k of runeKeywords(def)) if (s.startsWith(`${KEYWORD_WORD[k]}: `)) sawWord(KEYWORD_WORD[k]);
}

/** The read-outs' width on a screen `W` wide. */
export const readoutW = (W: number): number => Math.min(W - 8, 300);

/** The full list ("+k"): a row per rune (its name and day, then its effect line). Its height. Pure (tests). */
export const runeListH = (n: number): number => 16 + n * 19 + 2;

/** ENDLESS-1 (REQ-BFG-059, 3.5; RULING-RUN1-R1: YOUR RUNES running off a phone past about 21 runes, deferred to ENDLESS): the list's
 *  rows are RUNE_ROW_H apart and its title takes RUNE_LIST_HEAD; an endless run holds about 50 runes, 19 px each, so a list taller
 *  than the room under the bar is shown a PAGE of rows at a time, with a foot of two buttons (< and >) and "PAGE 2/5". */
export const RUNE_ROW_H = 19;
export const RUNE_LIST_HEAD = 16;
/** The paged list's foot, at least this tall (art px); on a phone a finger's square (runeTapOf) when that is taller. */
export const RUNE_LIST_FOOT_MIN = 14;

export interface RuneListLayout {
  /** The panel's height: runeListH(n) when the whole list fits, else a page's rows plus the foot (the same on every page). */
  h: number;
  /** The rows a page holds (n when the list is not paged). */
  per: number;
  /** 1 when the whole list fits. */
  pages: number;
  /** The foot's height; 0 when the list is not paged. */
  foot: number;
}

/** The YOUR RUNES list for `n` runes in `avail` px of height (the screen under the bar, less a margin) with a `foot`-tall page foot
 *  when it must be paged. Whole when runeListH(n) fits (exactly as before ENDLESS-1); else the fewest pages that fit, as even as they
 *  can be (50 runes where 16 rows fit: 4 pages of 13, 13, 13 and 11, not 16, 16, 16 and 2, so no page is nearly empty and the panel
 *  is no taller than its fullest page). Pure (tests/endless1.runes.test.ts). */
export function runeListLayout(n: number, avail: number, foot = RUNE_LIST_FOOT_MIN): RuneListLayout {
  const whole = runeListH(n);
  if (n <= 0 || whole <= avail) return { h: whole, per: Math.max(1, n), pages: 1, foot: 0 };
  const most = Math.max(1, Math.floor((avail - RUNE_LIST_HEAD - foot - 2) / RUNE_ROW_H));
  const per = Math.ceil(n / Math.ceil(n / most));
  return { h: RUNE_LIST_HEAD + per * RUNE_ROW_H + foot + 2, per, pages: Math.ceil(n / per), foot };
}

/** ROWS-1 (REQ-BFG-100; F17): a row of the list is the rune's name and day and then its first sentence WHOLE: every line the sentence
 *  wraps to at text width `tw` (the card's, runeCardTextW), in the 5x7 face. runeTextLines()[0] drew only the first of them, so on a
 *  phone FORGE WARD's `EACH SLUG FROM YOUR FACTORY: +104 SHIELD.` read `EACH SLUG FROM YOUR FACTORY:` and stopped. Only the first
 *  sentence: SEARING's and SHATTER SHOT's second sentence stays on the card. Pure (the list, tests). */
export function runeRowLines(def: RuneDef, tw: number, day?: number): RichLine[] {
  const first = runeSentenceSpans(def, undefined, day)[0];
  return first ? wrapRich(first, tw, "5") : [];
}

/** ROWS-1 (F17): a list row's height for `lines` text lines: RUNE_ROW_H (19: the name's row, 9 for its one line and 1 clear) and
 *  9 more for each further line, so a two-line row takes two line heights and rows never overlap. Pure. */
export const runeListRowH = (lines: number): number => RUNE_ROW_H + (Math.max(1, lines) - 1) * 9;

/** ROWS-1 (F17): runeListLayout's answer and where each page starts: `starts` is the first row of each page, then the row count (page p
 *  holds rows starts[p] .. starts[p + 1] - 1; one page: [0, n]). */
export interface RuneListPages extends RuneListLayout {
  starts: number[];
}

/** ROWS-1 (F17): runeListLayout for rows of any height: `rowHs`, each row's height (runeListRowH). Whole when the list fits `avail`
 *  (as runeListLayout: RUNE_LIST_HEAD + the rows + 2); else the fewest pages that fit, each holding as many WHOLE rows in order as the
 *  room under the title and over the foot takes (a row is never split across pages or drawn outside the box), as even as can be (the
 *  least room that still needs no more pages: 50 one-line rows where 16 fit are 13, 13, 13 and 11, not 16, 16, 16 and 2), the panel as
 *  tall as its tallest page on every page. With every row RUNE_ROW_H tall it is runeListLayout's answer, field for field
 *  (tests/rows1.runes.test.ts). Pure. */
export function runeListPages(rowHs: readonly number[], avail: number, foot = RUNE_LIST_FOOT_MIN): RuneListPages {
  const n = rowHs.length, whole = RUNE_LIST_HEAD + rowHs.reduce((a, b) => a + b, 0) + 2;
  if (n <= 0 || whole <= avail) return { h: whole, per: Math.max(1, n), pages: 1, foot: 0, starts: [0, n] };
  const room = avail - RUNE_LIST_HEAD - foot - 2;
  // the pages a row room of `cap` px makes, in order, each at least one row (a row taller than the room stands alone)
  const fill = (cap: number): number[] => {
    const starts = [0];
    let used = 0;
    for (let i = 0; i < n; i++) {
      if (used > 0 && used + rowHs[i] > cap) { starts.push(i); used = 0; }
      used += rowHs[i];
    }
    starts.push(n);
    return starts;
  };
  const fewest = fill(Math.max(1, room)).length - 1;
  let lo = Math.max(...rowHs), hi = Math.max(lo, room);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fill(mid).length - 1 <= fewest) hi = mid;
    else lo = mid + 1;
  }
  const starts = fill(lo);
  let tallest = 0, per = 0;
  for (let p = 0; p + 1 < starts.length; p++) {
    tallest = Math.max(tallest, rowHs.slice(starts[p], starts[p + 1]).reduce((a, b) => a + b, 0));
    per = Math.max(per, starts[p + 1] - starts[p]);
  }
  return { h: RUNE_LIST_HEAD + tallest + foot + 2, per, pages: starts.length - 1, foot, starts };
}

/** ROWS-1 (F17): one row of the list as drawn: its rune's index, the y of its name's row, its height and the lines of its first sentence. */
export interface RuneListRow { index: number; y: number; h: number; lines: RichLine[] }
/** ROWS-1 (F17): the list as drawn on one page: the panel's box, the page, the layout it came from and the page's rows. */
export interface RuneListPlan { box: Rect; layout: RuneListPages; page: number; rows: RuneListRow[] }

/** ROWS-1 (REQ-BFG-100; F17): the YOUR RUNES list for `defs` as drawn on page `page` (clamped), at (`x`, `y`), `w` wide, in `avail` px of
 *  height (the screen under the bar, less a margin; Infinity: the whole list) with a `foot`-tall page foot when it must be paged: the
 *  panel's box and each row of the page, its lines the rune's first sentence whole (runeRowLines at the card's text width on `day`).
 *  The rows follow one another by their own heights, so they never overlap, and every row of the page is inside the box (the box is the
 *  panel's tap target too: it covers every row). drawOver draws exactly this. Pure (tests). */
export function runeListPlan(defs: readonly RuneDef[], x: number, y: number, w: number, avail: number, foot: number, page: number, day?: number): RuneListPlan {
  const lines = defs.map((d) => runeRowLines(d, runeCardTextW(w), day));
  const layout = runeListPages(lines.map((l) => runeListRowH(l.length)), avail, foot);
  const p = Math.max(0, Math.min(layout.pages - 1, page)), rows: RuneListRow[] = [];
  let ry = y + RUNE_LIST_HEAD;
  for (let i = layout.starts[p]; i < layout.starts[p + 1]; i++) {
    const h = runeListRowH(lines[i].length);
    rows.push({ index: i, y: ry, h, lines: lines[i] });
    ry += h;
  }
  return { box: { x, y, w, h: layout.h }, layout, page: p, rows };
}

// ---- the bar on the build screen ---------------------------------------------------------------------------------------

/** The bar's state on one build screen: the chip whose read-out is open (-1 none), or the full list. */
export class RuneBar {
  open = -1;
  list = false;
  /** ENDLESS-1 (REQ-BFG-059, 3.5): the full list's page (0-based) when it is paged (runeListLayout), and the pages it has now (1: whole). */
  page = 0;
  pages = 1;
  private wheelAt = -1;
  /** EXPLAIN-1 (REQ-BFG-089, E3): the open read-out's hidden line is shown (its chip was tapped). */
  note = false;
  /** CARD-2 (REQ-BFG-081, K2; K1): the keyword whose definition the open read-out's room shows (a word's tap, or its first
   *  sight when the read-out opened), else null. */
  word: string | null = null;

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
    // CARD-2 (REQ-BFG-004, K1): a read-out that opens shows its first effect keyword not yet seen, by itself, in its room
    B.chips.forEach((r, i) => ui.add({ id: `rune-${i}`, r, onTap: () => {
      this.list = false; this.note = false; this.open = this.open === i ? -1 : i;
      // (never in a refit: the build screen between a fight's rounds)
      this.word = this.open >= 0 && defs[this.open] && s.run.stage === "caravan" ? runeSightWord(defs[this.open]) : null;
    } }));
    if (B.more) ui.add({ id: "rune-more", r: B.more, onTap: () => { this.open = -1; this.list = !this.list; this.page = 0; } });
    const W = s.game.W, w = readoutW(W), x = Math.round(W / 2 - w / 2), y = B.bar.y + B.bar.h + 2;
    if (this.open >= 0 && defs[this.open]) {
      const def = defs[this.open];
      // CARD-3 (REQ-BFG-089, E; EXPLAIN-1 open item 4): on the bar's read-out only, the card ends after its last line while
      // no note shows, and makes the reminder's room while one does (the chip's line, or a word's definition). Its top, its
      // chip and its words keep their places, so nothing a press reaches moves; only its foot comes up (a press below it
      // closes it, as any press off it always did). The picker's opened card and LAST CHANCE's RUNE card keep their size
      const room = this.note || !!this.word;
      const r = { x, y, w, h: runeCardH(def, w, { reminder: room, day: s.run.day }) }; // HULL-1a: on the run's day
      // EXPLAIN-1 (REQ-BFG-089, E1d, E3): the reminder's room stays clear; the chip shows its line (a tap) or a tooltip (hover)
      // CARD-2 (K2): a keyword's definition (its tap, or K1's first sight) takes the room in place of the chip's line
      drawRuneCard(g, r, def, { sub: runeTaken(def, this.open + 1), reminder: room, noteOpen: this.note, word: this.word, day: s.run.day }); // HULL-1a
      if (this.note) sawRuneNote(def);
      ui.add({ id: "rune-readout", r, onTap: () => { this.open = -1; this.note = false; this.word = null; } });
      runeChipIcon(g, ui, "rune-chip", r, def, runeTapOf(s), () => { this.note = !this.note; this.word = null; }, { W: s.game.W, H: s.game.H }, s.game.canvas);
      // CARD-2 (K2): every keyword on the read-out is a word target (a tap shows or hides its definition in the room)
      // MERGE-099D (1c): its words and the definition's region on the run's day, as the card draws them (HULL-1a)
      runeWordLayer(g, ui, "rune-", r, def, runeTapOf(s), this.word, runeWordBoxOn(r, def, this.word, s.run.day), (wd) => {
        this.note = false;
        this.word = this.word === wd ? null : wd;
      }, { W: s.game.W, H: s.game.H }, s.game.canvas, undefined, undefined, undefined, s.run.day); // MERGE-099E: no `take` (CARD-4 P4: the read-out keeps its targets), then the day
    } else if (this.list) {
      // ENDLESS-1: the whole list when it fits under the bar (exactly as before), else a page of rows and a foot (runeListLayout)
      // (only a run that carries the endless mark pages: any other run's list is the whole list, as it always was)
      // ROWS-1 (REQ-BFG-100; F17): each row is its rune's first sentence WHOLE (runeRowLines: every line it wraps to, was the first
      // line only), so a row is 19 px for one line and 9 more for each further line (runeListRowH); the pages (runeListPages) hold
      // whole rows by those heights. A row's words are the card's at this width: on the desk every row is one line, as before
      const P = runeListPlan(defs, x, y, w, endlessMarked(s.run) ? s.game.H - 4 - y : Infinity, Math.max(RUNE_LIST_FOOT_MIN, runeTapOf(s)), this.page, s.run.day);
      const LL = P.layout, r = P.box;
      this.pages = LL.pages;
      this.page = P.page;
      panel(g, r, "dark");
      drawText(g, `YOUR RUNES ${defs.length}`, r.x + 5, r.y + 5, C.slate4, { font: "3" });
      for (const row of P.rows) {
        const d = defs[row.index];
        drawText(g, d.name, r.x + 5, row.y, tierColour(d.tier));
        drawText(g, `DAY ${row.index + 1}`, r.x + r.w - 5, row.y + 1, C.slate4, { font: "3", align: "right" });
        row.lines.forEach((line, li) => drawRich(g, line, r.x + 5, row.y + 9 + li * 9, "5")); // Y-FURN: a two-line rune's first sentence, whole
      }
      ui.add({ id: "rune-readout", r, onTap: () => { this.list = false; } }); // the panel is the tap target: it holds every row of the page
      if (LL.pages > 1) this.drawFoot(g, s, r, LL); // after the panel's region: the last region wins
    } else this.pages = 1;
  }

  /** ENDLESS-1: the paged list's foot: "<" and ">" (a finger's square on a phone), "PAGE 2/5" between them. */
  private drawFoot(g: G, s: BuildScreen, r: Rect, LL: RuneListLayout): void {
    const ui = s.game.ui, fy = r.y + r.h - LL.foot - 2, bw = Math.max(26, LL.foot);
    const prev = { x: r.x + 4, y: fy, w: bw, h: LL.foot }, next = { x: r.x + r.w - 4 - bw, y: fy, w: bw, h: LL.foot };
    button(ui, g, "rune-pg-prev", prev, "<", { disabled: this.page <= 0, onTap: () => this.turn(-1) });
    button(ui, g, "rune-pg-next", next, ">", { disabled: this.page >= LL.pages - 1, onTap: () => this.turn(1) });
    drawText(g, `PAGE ${this.page + 1}/${LL.pages}`, r.x + r.w / 2, fy + Math.floor((LL.foot - 5) / 2), C.slate4, { font: "3", align: "center" });
  }

  /** ENDLESS-1: turn the paged list's page by `d` (-1 back, 1 on), kept inside the pages it has. */
  turn(d: number): void {
    this.page = Math.max(0, Math.min(this.pages - 1, this.page + d));
  }

  /** ENDLESS-1: the paged list's keys (BuildScreen.key): the arrows and PageUp / PageDown turn the page. True when used. */
  key(k: string): boolean {
    if (!this.list || this.pages < 2) return false;
    if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown") this.turn(1);
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") this.turn(-1);
    else return false;
    return true;
  }

  /** ENDLESS-1: the mouse wheel over the paged list (BuildScreen.wheel): one page a notch, at most one every 0.2 s of the screen's clock
   *  `t`, so a trackpad's swipe cannot spin through them. True (and used) while the paged list is up. */
  wheel(dy: number, t: number): boolean {
    if (!this.list || this.pages < 2 || dy === 0) return false;
    if (this.wheelAt < 0 || t - this.wheelAt >= 0.2) {
      this.turn(dy > 0 ? 1 : -1);
      this.wheelAt = t;
    }
    return true;
  }

  /** Every press (BuildScreen.pressed): one on anything but the bar and its read-out closes the read-out. EXPLAIN-1 (E3):
   *  one on anything but the read-out's chip closes the chip's line. */
  pressed(region: string | null): void {
    if (region !== "rune-chip") this.note = false;
    // CARD-2 (K2): one on anything but the read-out's words closes the word's definition (a word's own tap toggles it)
    if (!region || !region.startsWith("rune-w")) this.word = null;
    if (region === null || !region.startsWith("rune")) {
      this.open = -1;
      this.list = false;
    }
  }
}

/** EXPLAIN-1 (REQ-BFG-089, E3): a rune chip's finger target on a build screen: a TAP_CSS square (tapPx) on a phone or after
 *  a finger's press, else 0 (a mouse: the chip itself, and its hover). */
export function runeTapOf(s: { touch: boolean; game: { view: View } }): number {
  return s.touch || isPhone(s.game.view) ? tapPx(s.game.view) : 0;
}

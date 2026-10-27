// LC-1 (REQ-BFG-073): the LAST CHANCE screen. After a dusk loss to 1 life (before day 10, once a run) the life comes back
// (the dusk card says "LAST CHANCE: +1 LIFE") and, at the next dawn, before the dawn's rune pick, this modal shows over the
// build screen: the title, "+1 LIFE. PICK ONE. FREE." and three cards, all free: the RUNE (runeBar.ts drawRuneCard), the
// PART's face (faces.ts, as the shop's panel reads it: the stat row as icons, then its rule lines) and +500 HULL
// (LAST_CHANCE_HULL; every word below reads the constant). The
// offer is re-derived from the run (run.ts pendingLastChance), never stored, so a reload or CONTINUE shows the same cards.
// The rune picker's interaction: a tap opens a card (a yellow ring and "TAP AGAIN TO TAKE IT"), a tap on the open card
// takes it (run.ts takeLastChance); no skip, no close; it takes every press while it is up. Each card's ⓘ (REQ-BFG-070's
// card rule: details on demand) shows its reminders. Nothing here draws while the switch is off: no run has a pending pick.

import type { G } from "../render/pixel";
import { frame, rect } from "../render/pixel";
import { C, RARITY_COLOR } from "../render/palette";
import { drawText, icons, textWidth } from "../render/font";
import { itemIcon } from "../render/sprites";
import { drawShapePlate, hasGrid, shapeGridSize } from "../ui/shapePic"; // SHOPCARD-1 (REQ-BFG-113, G4): a shaped part's grid on its card
import { isPhone, tapPx } from "../ui/tap"; // a finger's target for the ⓘ on a phone
import { panel, type Rect } from "../ui/ui";
import { drawInfoMarkIn } from "../ui/infoGlyph"; // POLISH-2 (REQ-BFG-089; Q3): the one ⓘ mark
import { colourize, drawRich, wrapRich, type RichLine } from "../ui/richText";
import { faceLines } from "../ui/faces";
import { drawTitlePlate } from "./pickHead"; // TXT-AZ (REQ-BFG-073; REVIEW-STAGE097 R5): the title block on the cards' panel
import { plainRigStats } from "../ui/faces"; // CARD-2 (REQ-BFG-084, K6): the plain rigs' faces (SHAPES-1 x c099-card3, RUN5 2: isPlainRig)
import { plainNotes } from "../ui/faces"; // PLAIN-1F (REQ-BFG-089, M3): the PART card's NOTES lead (was isPlainRig ? RIG_SENTENCE)
import { statRow } from "../ui/icons"; // CARD-2 (K6)
import { HEROES, ITEMS, type Rarity } from "../sim/content";
import { RUNES, type RuneDef } from "../sim/runes";
import { BOONS, LAST_CHANCE_HULL, type Boon, type LastChanceOffer } from "../sim/lastChance";
import { LAST_CHANCE_AT } from "../sim/lastChance"; // RETUNE-1 run 2 (REQ-BFG-096): a hearts run's line
import { heartsRun } from "../sim/hearts"; // RETUNE-1 run 2: the run's mark
import { pendingLastChance, takeLastChance, type Run } from "../game/run";
import { drawRuneCard, runeCardH } from "../ui/runeBar";
import { runeChipIcon, runeTapOf } from "../ui/runeBar"; // EXPLAIN-1 (REQ-BFG-089, E3): the rune card's chip as its icon
import { drawRuneWordNote, runeHintBand, runeKeywordOf, runeSightWord, runeWordLayer, runeWordLines } from "../ui/runeBar"; // CARD-2 (K2; K1)
import { runeWordRows } from "../ui/runeBar"; // SHOPCARD-1f (F7): the open RUNE card's room for its longest keyword definition
import { TAKE_CLOCK, runeBarBand, runeBarTarget, takeGuardPassed } from "../ui/runeBar"; // CARD-4 (REQ-BFG-081, P): the RUNE card's bar alone takes it
import { runeTag, tierWord } from "../ui/runeText";
import { runeNoteLines } from "../ui/runeBar"; // CARD-4 run 3 (REQ-BFG-081, I): the RUNE card's details, the reminder and its source line
import { textOpts } from "./build/inspector";
import { hullShown } from "../sim/hullScale"; // HULL-1a (REQ-BFG-079): the HULL card on the day's hull
import type { BuildScreen } from "./build/build";
import { GAP as ITEM_GAP, GAP_MIN as ITEM_GAP_MIN } from "../ui/spacing"; // CARD-3 (REQ-BFG-087, D5, D6): the gaps between a card's items (GAP here is the cards')
// ENCHANT-1 (REQ-BFG-085, E5c, E7): a rig or turret part arrives enchanted (lastChanceWord): its word's spark on the PART card, the word before the
// part's name and the word's line in the card's details (ⓘ). Nothing of it with the switch off.
import { ENCHANT_DEFS, enchantKindOf, enchantRules, type EnchantId } from "../sim/enchant";
import { lastChanceWord } from "../sim/enchantSources";
import { wordLine } from "../ui/enchantFaces";
import { SPARK_SIZE, drawSparkAt } from "../render/enchantMarks"; // POLISH-1 (REQ-BFG-085; P2): the spark inside the card (was drawBoardSpark on the frame's corner)

export const LC_TITLE = "LAST CHANCE";
/** The line under the title: the life came back, and the pick. */
export const LC_LINE = "+1 LIFE. PICK ONE. FREE.";
export const LC_TAKE = "TAP AGAIN TO TAKE IT";
/** "DUSK OF DAY 6 · TAP TO READ" */
export const lcHint = (day: number): string => `DUSK OF DAY ${day} · TAP TO READ`;
/** The PART card's sub line ("EPIC PART · TO CARGO · FREE": its tier, where it goes) and the HULL card's. */
/** HULL-1d (REQ-BFG-073): `stars`, the card's star (lastChance.ts partStars: ★2 with HULL_SCALE on); 1: as before. */
export const lcPartSub = (rarity: Rarity, stars = 1): string => `${tierWord(rarity)} PART${stars > 1 ? ` ★${stars}` : ""} · TO CARGO · FREE`;
export const LC_HULL_SUB = "MAX HULL · KEPT ALL RUN";
/** The HULL card's name: "+500 ♥" for LAST_CHANCE_HULL (the HULL icon). */
export const hullName = (n: number): string => icons(`+${n} {HULL}`);
/** The summary's STOP cell on the dusk that fired LAST CHANCE (STOP_W holds it: "WARLORD"-wide labels). */
export const LC_STOP = "+1 LIFE";
/** RETUNE-1 run 2 (REQ-BFG-096): on a hearts run (hearts.ts heartsRun) LAST CHANCE fires at the first loss that would leave
 *  1 heart or fewer and keeps the run on 1 heart: the line under the title says so (LC_LINE's form), and the summary's
 *  STOP cell says SAVED. A run without the mark: LC_LINE and LC_STOP, as before. */
export const LC_LINE_HEARTS = `SAVED ON ${LAST_CHANCE_AT} HEART. PICK ONE. FREE.`;
export const LC_STOP_HEARTS = "SAVED";
export const lcLine = (run: { hearts?: boolean }): string => (heartsRun(run) ? LC_LINE_HEARTS : LC_LINE);
export const lcStop = (run: { hearts?: boolean }): string => (heartsRun(run) ? LC_STOP_HEARTS : LC_STOP);
/** The summary row's mark: the card taken (the rune's or part's name, or "+500 ♥"); "PICK" while it is pending. */
export function lastChanceTag(lc: { boon?: Boon; id?: string }): string {
  if (lc.boon === "rune" && lc.id && RUNES[lc.id]) return RUNES[lc.id].name;
  if (lc.boon === "part" && lc.id && ITEMS[lc.id]) return ITEMS[lc.id].name;
  if (lc.boon === "hull") return hullName(LAST_CHANCE_HULL);
  return "PICK";
}

/** The toast after a pick. HULL-1a (REQ-BFG-079): `day`, the run's day (the HULL card's amount on the day's hull). */
export function lcToast(boon: Boon, offer: LastChanceOffer, day?: number): string {
  if (boon === "rune") return `RUNE TAKEN: ${RUNES[offer.rune!.id].name}`;
  if (boon === "part") return `TO CARGO: ${ITEMS[offer.part!].name}${(offer.partStars ?? 1) > 1 ? ` ★${offer.partStars}` : ""}`; // HULL-1d: its star
  return `MAX HULL ${hullName(hullShown(offer.hull, day))}`;
}

/** HULL-1a (REQ-BFG-079): the HULL card's name on `day` ("+500 ♥"; with HULL_SCALE on, M(d) x 500: "+3000 ♥" on day 10). */
export const lcHullName = (offer: LastChanceOffer, day?: number): string => hullName(hullShown(offer.hull, day));

/** HULL-1a: the HULL card's line's two numbers on `day`: the hull now and with the card (each the day's number). */
export function lcHullNow(run: Pick<Run, "hero" | "build">, n: number, day?: number): [number, number] {
  const base = HEROES[run.hero].hull + run.build.hullBonus;
  return [hullShown(base, day), hullShown(base + n, day)];
}

const GAP = 7;
const HEAD = 31;
const INFO = 11; // the ⓘ box's side

/** CARD-3 (REQ-BFG-087, D5; SPACE-1 open item 8): a card's text as separate items (a stat row, a rule, a reminder, the
 *  where-it-goes line), each its wrapped lines: drawBody puts the gap between items (lcGaps), the pitch inside one. */
type Items = RichLine[][];
/** CARD-3 (D5): the lines of `items`, and how many gaps sit between them. Pure. */
const lineCount = (items: Items): number => items.reduce((n, it) => n + it.length, 0);
const gapCount = (items: Items): number => Math.max(0, items.length - 1);
/** CARD-3 (D5, D6): the gaps a card's items take: G (src/ui/spacing.ts GAP, 5x7 5 between its lines' items, 3x5 4
 *  between its details'), or Gmin (3 and 2) where the screen can't hold three cards with G (LastChancePicker.layout). */
export const lcGaps = (min = false): { lines: number; info: number } => (min ? { lines: ITEM_GAP_MIN["5"], info: ITEM_GAP_MIN["3"] } : { lines: ITEM_GAP["5"], info: ITEM_GAP["3"] });

/**
 * SHOPCARD-1f (REQ-BFG-081; F7, REVIEW-FIX099G open item 1): the rows of the room under the open RUNE card's effect lines, where its details (ⓘ: the chip's
 * note, `info`) and a keyword's definition (a word's tap) show. CARD-2's K2 box grew UP over the effect lines when the card had no room (the details
 * closed: every definition, from the row it needs; the details open: one longer than they are), and on a phone's 233 px card LOOSE THREAD's two-line
 * FRAY note hid its one-line effect and half its sub line. The open card now keeps room for the longest definition its keywords have (runeWordRows), so
 * the box sits under the effect lines and nothing above it is covered; a closed card, and a card with no keyword, are as before. Pure (layout, draw, tests).
 */
export function lcRoomRows(def: RuneDef, cardW: number, open: boolean, info: Items, day?: number): number {
  return open ? Math.max(lineCount(info), runeWordRows(def, cardW - 10, day)) : lineCount(info);
}
/** SHOPCARD-1f (F7): `info` with `pad` blank 3x5 rows added to its first item (or as one item): drawBody keeps the room under the effect lines. */
const padInfo = (info: Items, pad: number): Items => {
  const blank = Array.from({ length: pad }, () => [] as RichLine);
  return info.length ? [[...info[0], ...blank], ...info.slice(1)] : [blank];
};

/** The PART card's lines at text width `tw`: the stat row(s) as icons, then each rule (its brass label first). CARD-2
 *  (REQ-BFG-084, K6; REVIEW-EXPLAIN1 open item 1): a plain stat rig (faces.ts PLAIN_RIGS: WHETSTONE, TEMPER, BARBED SPOOL)
 *  draws its plain face, the panel's: plainRigStats' stat row ({DMG}+20), no HIT: line (it read faceLines' rule).
 *  CARD-3 (D5): as items: the stat rows one (the second continues the first, as the panel ties them), each rule one.
 *  HULL-1d (REQ-BFG-073): `stars`, the card's star (★2 with HULL_SCALE on: the face at ★2); 1: as before. MERGE-099D: a
 *  plain rig's stat row at that star and on the run's day too, as its rule line would read (MERGE-099C 6ed6e27's rule) */
export function partLines(def: string, tw: number, run: Pick<Run, "hero" | "build">, stars = 1): Items { // CARD-3: exported for the tests
  const o = textOpts(run as Run);
  const plain = plainRigStats(def, stars, o.day);
  if (plain) return [wrapRich(colourize(statRow(plain), C.bone), tw, "5")];
  const fl = faceLines(def, stars, o);
  if (!fl) return [];
  const out: Items = [];
  const stats = [fl.stats, fl.stats2].flatMap((s) => (s ? wrapRich(colourize(icons(s), C.bone), tw, "5") : []));
  if (stats.length) out.push(stats);
  for (const r of fl.rules) {
    // the rule's text starts with its trigger label ("SHOT: ..."): the label in brass, as the inspector's face draws it
    const text = icons(r.text), label = r.label ? icons(r.label) : "";
    const spans = label && text.startsWith(label) ? [{ t: label, c: C.brass3 }, ...colourize(text.slice(label.length), C.bone)] : colourize(text, C.bone);
    out.push(wrapRich(spans, tw, "5"));
  }
  return out;
}

/** The PART card's details (ⓘ): its keywords' reminders, then where it goes (HULL-1d: at the card's star). CARD-2
 *  (REQ-BFG-084, K6): a plain stat rig's rig sentence first (faces.ts RIG_SENTENCE: the trigger its face no longer prints,
 *  as its panel's ⓘ NOTES lead with it). CARD-3 (D5): each sentence an item. */
export function partInfo(def: string, tw: number, run: Pick<Run, "hero" | "build">, stars = 1, word?: { ench: EnchantId } | null): Items { // CARD-3: exported for the tests
  const o = textOpts(run as Run); // ENCHANT-2W (REQ-BFG-085; W3): its day (the run's, when the card is drawn in a run) is the word line's day too
  const fl = faceLines(def, stars, o);
  // PLAIN-1F (REQ-BFG-089, M3): a plain rig's NOTES lead (faces.ts plainNotes: the rig sentence, as before with PLAIN_RIGS
  // off; SCALE GUARD's carry line after it; BALLAST's own line in its place), then the reminders at the card's star
  const rem = [...plainNotes(def), ...(fl?.reminders ?? []), `FREE. IT GOES TO CARGO AT ★${stars}; PLACE IT AS ANY PART.`];
  const items = rem.map((t) => wrapRich(colourize(icons(t), C.slate4), tw, "3"));
  const w = word && enchantRules() ? lcWordItem(def, word.ench, tw, stars, o.day) : null; // ENCHANT-1: the word it arrives with, first
  return w ? [w, ...items] : items;
}

/** ENCHANT-1 (REQ-BFG-085, E5c, E7): the details' first item for a PART that arrives enchanted: `ENCHANTED: FIERY. ADDS +1 {BURN} TO EACH HIT.` (ENCHANT-2, T4c: was `ITS HIT: {BURN}+1.`),
 *  the word in its colour and its line for this kind of piece at the card's star (enchantFaces.ts wordLine, the panels' own text). Null
 *  for a piece that takes no word. ENCHANT-2W (W3): `day`, the run's day (partInfo reads it from the run): RISING's and GROWING's amounts are the day's, as the part's panel gives them; none: day 1's. */
export function lcWordItem(def: string, id: EnchantId, tw: number, stars = 1, day?: number): RichLine[] | null {
  const kind = enchantKindOf(ITEMS[def]);
  const line = kind ? wordLine(id, kind, stars, day) : null;
  if (!line) return null;
  return wrapRich([{ t: "ENCHANTED: ", c: C.slate4 }, { t: ENCHANT_DEFS[id].name, c: ENCHANT_DEFS[id].color }, { t: ". ", c: C.slate4 }, ...colourize(icons(line), C.slate4)], tw, "3");
}

/** ENCHANT-1: the word the PART card's piece arrives with, or null (the switch off, gear, a piece that takes none): re-derived from the
 *  run's seed and the day LAST CHANCE fired on, as takeLastChance gives it (enchantSources.ts lastChanceWord). */
export function lcWord(run: Pick<Run, "seed">, o: Pick<LastChanceOffer, "day" | "part">): { ench: EnchantId; enchDir?: number } | null {
  return enchantRules() && o.part ? lastChanceWord(run.seed, o.day, o.part) : null;
}

/** The HULL card's line and details (CARD-3, D5: one item each). */
const hullLines = (now: number, n: number, tw: number): Items => [wrapRich(colourize(icons(`YOUR {HULL}: ${now} TO ${now + n}.`), C.bone), tw, "5")];
const hullInfo = (tw: number): Items => [wrapRich(colourize(icons("MAX {HULL} FOR THE REST OF THE RUN. EVERY FIGHT STARTS FULL."), C.slate4), tw, "3")];

export interface LcLayout {
  top: number;
  cardW: number;
  cards: Rect[];
  /** each card's ⓘ box */
  infos: Rect[];
  bottom: number;
  /** CARD-3 (D5, D6): the gaps the cards' items take (lcGaps: G, or Gmin where three cards with G overrun the screen). */
  gap?: { lines: number; info: number };
}

/** One card's height at width `w`: the head, its lines, the details when shown, the take bar when open. CARD-3 (D5): and
 *  the gaps between their items (lcGaps). */
export function cardH(lines: Items, info: Items, open: boolean, gap = lcGaps()): number { // CARD-3: exported for the tests
  return HEAD + lineCount(lines) * 9 + gapCount(lines) * gap.lines + (info.length ? 1 + lineCount(info) * 7 + gapCount(info) * gap.info : 0) + (open ? 13 : 0) + 4;
}

/** The screen's layout at W x H. Pure (tests): `hs` each card's height. */
export function lcLayout(W: number, H: number, hs: readonly number[]): LcLayout {
  const cardW = Math.min(W - 8, 300), x = Math.round(W / 2 - cardW / 2);
  const total = 33 + hs.reduce((s, h) => s + h, 0) + GAP * Math.max(0, hs.length - 1);
  const top = Math.max(4, Math.min(40, Math.floor((H - total) / 3)));
  const cards: Rect[] = [], infos: Rect[] = [];
  let y = top + 33;
  hs.forEach((h, i) => {
    cards.push({ x, y, w: cardW, h });
    infos.push({ x: x + cardW - INFO - 3, y: y + 4, w: INFO, h: INFO });
    y += h + (i < hs.length - 1 ? GAP : 0);
  });
  return { top, cardW, cards, infos, bottom: y };
}

/** The ⓘ button in its box: the one mark of every info button (ui/infoGlyph.ts: the 5x7 face's `?`, the glyph keywords.ts drawInfoGlyph draws on a part's panel),
 *  centred in the 11 px box's interior; the box, its sizes and its colours are this screen's own. POLISH-2 (REQ-BFG-089; Q3): was a hand-drawn "i" (a dot over a
 *  stem on a foot), the glyph POLISH-1 replaced on the part's panel. */
export function drawInfo(g: G, r: Rect, on: boolean): void { // POLISH-2 (Q3): exported for tests/polish2.glyph.test.ts
  rect(g, r.x, r.y, r.w, r.h, C.ink);
  rect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, on ? C.brass1 : C.slate0);
  drawInfoMarkIn(g, r, on ? C.yellow : C.brass3);
}

/** SHOPCARD-1 (REQ-BFG-113, G4): where a shaped part's grid plate sits on its card `r` (null: not a shaped piece, or no room): in
 *  the head's free room, left of the ⓘ box (INFO and 3 px in, 4 px clear), 7 px under the card's top, and 3 px clear of the name
 *  (5x7) and the sub line (3x5) that start 31 px in (on a card too narrow for both, the words win and the plate gives way). Pure (tests). */
export function lcPartPlate(r: Rect, defId: string, name: string, sub: string): Rect | null {
  if (!hasGrid(defId)) return null;
  const sz = shapeGridSize(defId), w = sz.w + 2, x = r.x + r.w - 3 - INFO - 4 - w;
  return x < r.x + 31 + Math.max(textWidth(name), textWidth(sub, "3")) + 3 ? null : { x, y: r.y + 7, w, h: sz.h + 2 };
}

/**
 * POLISH-1 (REQ-BFG-085; P2, BUMP-1F's review F2): where the word's spark sits on a PART card `r`: its top-left. It was (r.x + r.w - 5, r.y - 1), on the card
 * frame's top-right corner, where it straddled the border and read as a stray dot. Now it is whole inside the card, on the top-right corner of the part's
 * picture plate (drawHead's plate: the ink box at (r.x + 5, r.y + 6), 22 x 22, its slate floor 20 x 20 from (r.x + 6, r.y + 7)), flush with the floor's corner as
 * the cargo slot's spark is flush with the slot's (ui.ts itemSlot): the mark of the piece, in the place the board and the cargo show a word's spark. The piece's
 * picture is 12 x 12 centred on the floor (cols 4-15, rows 4-15 of it), so the 3 x 3 spark clears it; the head's words start 31 px in, the ⓘ box is 3 px from the
 * right edge, and the rarity bars and the frame are outside the floor. Pure (tests).
 */
export function lcSparkAt(r: Rect): { x: number; y: number } {
  return { x: r.x + 6 + 20 - SPARK_SIZE, y: r.y + 7 };
}

/** A part or hull card's frame and head: the dark panel with `edge` top and bottom, the icon box, the name and sub. */
function drawHead(g: G, r: Rect, edge: string, icon: CanvasImageSource | string, name: string, nameColour: string, sub: string, open: boolean, word?: { name: string; color: string }): void {
  panel(g, r, "dark");
  rect(g, r.x + 1, r.y + 1, r.w - 2, 2, edge);
  rect(g, r.x + 1, r.y + r.h - 3, r.w - 2, 2, edge);
  if (open) frame(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, C.yellow);
  rect(g, r.x + 5, r.y + 6, 22, 22, C.ink);
  rect(g, r.x + 6, r.y + 7, 20, 20, C.slate0);
  // a sprite (the part's icon), or a font glyph drawn at twice its size (the HULL card's HULL icon)
  if (typeof icon === "string") drawText(g, icon, r.x + 16, r.y + 11, nameColour, { align: "center", scale: 2, outline: C.ink });
  else g.drawImage(icon, r.x + 16 - Math.floor((icon as { width: number }).width / 2), r.y + 17 - Math.floor((icon as { height: number }).height / 2));
  // ENCHANT-1 (REQ-BFG-085, E7): a part that arrives enchanted prints its word first, in the word's colour (the name keeps its rarity colour)
  const wx = word ? drawText(g, word.name, r.x + 31, r.y + 7, word.color, { outline: C.ink }) + textWidth(" ") + 1 : 0;
  drawText(g, name, r.x + 31 + wx, r.y + 7, nameColour, { outline: C.ink });
  drawText(g, sub, r.x + 31, r.y + 18, C.slate4, { font: "3" });
}

/** CARD-4 (P1): the RUNE card's TAP AGAIN target region (the one press that takes its rune). */
export const LC_BAR = "lcrune-take";
/** CARD-4 (P2): the build screen's clock (BuildScreen.t, game seconds); 0 where a caller's screen has none (tests). */
const clock = (s: object): number => {
  const t = (s as { t?: unknown }).t;
  return typeof t === "number" ? t : 0;
};

/** Lines, then the details, then the take bar, from the card's text top. CARD-3 (REQ-BFG-087, D5): the gap `gap` between
 *  two items (lcGaps), the pitch inside one. CARD-4 (P1): the bar centred in its band `band` (13: y + 1, as before). */
function drawBody(g: G, r: Rect, lines: Items, info: Items, hint: string | null, gap = lcGaps(), band = 13): void {
  let y = r.y + HEAD;
  lines.forEach((it, i) => {
    if (i) y += gap.lines;
    for (const l of it) {
      drawRich(g, l, r.x + 5, y, "5");
      y += 9;
    }
  });
  if (info.length) {
    y += 1;
    info.forEach((it, i) => {
      if (i) y += gap.info;
      for (const l of it) {
        drawRich(g, l, r.x + 5, y, "3");
        y += 7;
      }
    });
  }
  if (hint) {
    const hw = textWidth(hint) + 8, hb = { x: Math.round(r.x + r.w / 2 - hw / 2), y: y + Math.floor((band - 11) / 2), w: hw, h: 11 };
    rect(g, hb.x, hb.y, hb.w, hb.h, C.yellow);
    drawText(g, hint, hb.x + 4, hb.y + 2, C.ink);
  }
}

/** The picker's state on one build screen. */
export class LastChancePicker {
  /** The opened card (-1: none) and the cards whose details (ⓘ) are shown. */
  open = -1;
  info = new Set<number>();
  /** CARD-2 (REQ-BFG-081, K2; REQ-BFG-004, K1): the keyword whose definition the open RUNE card shows (a word's tap, or its
   *  first sight when the card opened), in its details' room (over its effect lines' foot while its details are closed:
   *  the card keeps its size); null for none. Any other press closes it (each region's tap, and the screen's). */
  word: string | null = null;
  /** CARD-4 (REQ-BFG-081, P3): `word`'s note opened by itself (K1, when the RUNE card opened), not by a tap. */
  auto = false;
  /** CARD-4 (P3): this press only closed a note that opened by itself: its tap does nothing else. */
  private eaten = false;
  /** CARD-4 (P2): when the open card opened (the build screen's game seconds; TAKE_CLOCK: the wall's ms). */
  private openedAt = 0;
  private openedWall = 0;
  private key = "";

  /** CARD-4 (REQ-BFG-081, P3): every press while the picker is up (BuildScreen.pressed): while a note that opened by
   *  itself is on screen, the press only closes it (its tap then does nothing: eat). */
  pressed(_region: string | null): void {
    this.eaten = false;
    if (this.auto && this.word) {
      this.word = null;
      this.eaten = true;
    }
    this.auto = false;
  }

  /** CARD-4 (P3): true (once) when this press only closed a self-opened note: the caller's tap does nothing. */
  private eat(): boolean {
    if (!this.eaten) return false;
    this.eaten = false;
    return true;
  }

  /** The pending offer while the run is at its caravan (not a refit), else null. */
  offer(s: Pick<BuildScreen, "run" | "refit">): LastChanceOffer | null {
    const run: Run = s.run;
    if (s.refit || run.stage !== "caravan") return null;
    return pendingLastChance(run);
  }

  up(s: Pick<BuildScreen, "run" | "refit">): boolean {
    return !!this.offer(s);
  }

  /** The cards on offer, in the screen's order (rune, part, hull; a card the offer lacks is left out). */
  boons(o: LastChanceOffer): Boon[] {
    return BOONS.filter((b) => (b === "rune" ? !!o.rune : b === "part" ? !!o.part : true));
  }

  /** A tap on card i: open it, or take it when it is open already. CARD-4 (REQ-BFG-081, P1): not the RUNE card: a tap on
   *  its open body takes nothing; only its TAP AGAIN bar does (take). */
  tap(s: BuildScreen, i: number, boon: Boon, o: LastChanceOffer): void {
    if (this.eat()) return;
    if (this.open !== i) {
      this.open = i;
      // CARD-2 (K1): an opened RUNE card shows its first effect keyword not yet seen, by itself (no tap is counted)
      this.word = boon === "rune" && o.rune ? runeSightWord(RUNES[o.rune.id]) : null;
      this.auto = !!this.word; // CARD-4 (P3)
      this.openedAt = clock(s); // CARD-4 (P2)
      this.openedWall = TAKE_CLOCK.wall();
      return;
    }
    if (boon === "rune") {
      this.word = null; // CARD-4 (P1): a press on the open RUNE card's body closes an open note, nothing more
      return;
    }
    this.takeBoon(s, boon, o);
  }

  /** CARD-4 (REQ-BFG-081, P1, P2): the open RUNE card's TAP AGAIN bar: take it, unless it opened under TAKE_GUARD_S ago (a
   *  double tap's second tap: ignored) or this press only closed a self-opened note (P3). */
  take(s: BuildScreen, i: number, o: LastChanceOffer): void {
    if (this.eat()) return;
    if (this.open !== i || !takeGuardPassed(clock(s) - this.openedAt, TAKE_CLOCK.wall() - this.openedWall)) return;
    this.takeBoon(s, "rune", o);
  }

  /** The pick itself (run.ts takeLastChance), the open card's. */
  private takeBoon(s: BuildScreen, boon: Boon, o: LastChanceOffer): void {
    this.word = null;
    const r = takeLastChance(s.run, boon);
    if (!r.ok) {
      s.game.error(r.reason ?? "NO LAST CHANCE TO PICK");
      return;
    }
    this.open = -1;
    this.info.clear();
    s.lcHeartT = 0; // the regained heart's animation on the bar
    s.touched();
    s.game.resize();
    s.game.toast(lcToast(boon, o, s.run.day), C.lime, "pickup");
  }

  /** Each card's lines and details at width `w` (pure on the run). */
  private texts(run: Run, o: LastChanceOffer, w: number): { boon: Boon; lines: Items; info: Items }[] {
    const tw = w - 10;
    return this.boons(o).map((boon, i) => {
      const shown = this.info.has(i);
      if (boon === "rune") return { boon, lines: [], info: shown ? [runeNoteLines(RUNES[o.rune!.id], tw)] : [] }; // CARD-4 run 3 (I): with the source line
      if (boon === "part") return { boon, lines: partLines(o.part!, tw, run, o.partStars ?? 1), info: shown ? partInfo(o.part!, tw, run, o.partStars ?? 1, lcWord(run, o)) : [] }; // HULL-1d; ENCHANT-1: its word, in the details
      const [now, next] = lcHullNow(run, o.hull, run.day); // HULL-1a: the day's numbers
      return { boon, lines: hullLines(now, next - now, tw), info: shown ? hullInfo(tw) : [] };
    });
  }

  layout(s: Pick<BuildScreen, "run" | "game" | "touch">, o: LastChanceOffer): LcLayout {
    const { W, H } = s.game;
    const w = Math.min(W - 8, 300);
    const texts = this.texts(s.run, o, w);
    const tap = s.game.view ? runeTapOf(s) : 0; // CARD-4 (P1): the open RUNE card's bar band holds a finger's target on touch
    const hs = (gap: { lines: number; info: number }) => texts.map((t, i) => {
      if (t.boon !== "rune") return cardH(t.lines, t.info, i === this.open, gap);
      // SHOPCARD-1f (F7): the open RUNE card keeps a room for its longest keyword definition (lcRoomRows), details shown or not
      const rows = lcRoomRows(RUNES[o.rune!.id], w, i === this.open, t.info, s.run.day);
      return runeCardH(RUNES[o.rune!.id], w, i === this.open ? { hint: LC_TAKE, tap, day: s.run.day } : { day: s.run.day }) + (rows ? 1 + rows * 7 + gapCount(t.info) * gap.info : 0);
    });
    // CARD-3 (REQ-BFG-087, D5, D6): the gaps at G; Gmin where three cards with G would overrun the screen
    const L = lcLayout(W, H, hs(lcGaps()));
    if (L.bottom <= H) return { ...L, gap: lcGaps() };
    return { ...lcLayout(W, H, hs(lcGaps(true))), gap: lcGaps(true) };
  }

  draw(g: G, s: BuildScreen): void {
    const o = this.offer(s);
    if (!o) {
      this.open = -1;
      this.info.clear();
      this.word = null;
      return;
    }
    const key = `${o.day}|${o.rune?.id}|${o.part}`;
    if (key !== this.key) {
      // another offer than the one drawn last (a fresh picker starts closed: open -1, no details)
      if (this.key) {
        this.open = -1;
        this.info.clear();
        this.word = null;
      }
      this.key = key;
    }
    const { W, H, ui } = s.game;
    const L = this.layout(s, o);
    this.wordBox = null;
    g.globalAlpha = 0.86;
    rect(g, 0, 0, W, H, C.ink);
    g.globalAlpha = 1;
    // CARD-2 (K2): a press anywhere off the RUNE card's words closes a word's definition (the regions over it close it too)
    ui.add({ id: "lcpick", r: { x: 0, y: 0, w: W, h: H }, block: true, onTap: () => { if (!this.eat()) this.word = null; } });
    const cx = Math.round(W / 2);
    drawTitlePlate(g, W, L.top, L.cardW); // TXT-AZ (REVIEW-STAGE097 R5): a clean ground under the title, its line and the hint
    drawText(g, LC_TITLE, cx, L.top, C.yellow, { align: "center", outline: C.ink });
    drawText(g, lcLine(s.run), cx, L.top + 11, C.lime, { align: "center" }); // RETUNE-1 run 2: a hearts run's words
    drawText(g, lcHint(o.day), cx, L.top + 22, C.slate4, { font: "3", align: "center" });
    const texts = this.texts(s.run, o, L.cardW);
    const tap = runeTapOf(s); // CARD-4 (P1)
    let take: Rect | null = null;
    texts.forEach((t, i) => {
      const r = L.cards[i], open = i === this.open, hint = open ? LC_TAKE : null;
      if (t.boon === "rune") {
        const def = RUNES[o.rune!.id];
        drawRuneCard(g, r, def, { sub: `${runeTag(def)} · FREE`, open, hint: undefined, day: s.run.day }); // HULL-1a
        // the rune card's own body is drawRuneCard's; its details and the take bar follow its text (CARD-4, P1: the bar
        // centred in a band that holds a finger's target on touch)
        const base = runeCardH(def, r.w, { day: s.run.day }) - 4;
        // SHOPCARD-1f (F7): the open card's room under its effect lines holds its longest keyword definition (lcRoomRows), blank rows after the details' own
        const rows = lcRoomRows(def, r.w, open, t.info, s.run.day), pad = rows - lineCount(t.info);
        drawBody(g, { ...r, y: r.y + base - HEAD }, [], pad > 0 ? padInfo(t.info, pad) : t.info, hint, L.gap, runeBarBand(open ? tap : 0));
        // CARD-2 (K2; K1): the shown keyword's definition, in the details' room. SHOPCARD-1f (F7): that room is the card's own (was, with the details closed,
        // over the effect lines' foot, growing up and hiding them): whole, and the card keeps its size. Its first row is the effect text's foot (r.y + base, as
        // the picker's room: its box is 1 px above and 1 below the room's rows), so the box's foot is the TAP AGAIN band's top + 1 and the bar's target
        // (runeBarTarget: from the box's foot) is the note-free one; was drawBody's y + 1, one px lower
        const k = open && this.word ? runeKeywordOf(def, this.word) : null;
        if (k) this.wordBox = drawRuneWordNote(g, r, r.y + base, rows, runeWordLines(def, k, r.w - 10, s.run.day)); // FIX-099G: the card's day's note (cap, oracle f65b53f23c6b70c1)
        // CARD-4 (REQ-BFG-081, P1): the open RUNE card's body takes nothing; its bar's target alone takes it (never under
        // the word's box)
        if (open) take = runeBarTarget(r, LC_TAKE, tap, this.wordBox);
      } else if (t.boon === "part") {
        const def = ITEMS[o.part!];
        const word = lcWord(s.run, o); // ENCHANT-1 (REQ-BFG-085, E5c): the word the part arrives with (null with the switch off)
        drawHead(g, r, RARITY_COLOR[def.rarity], itemIcon(def.id), def.name, RARITY_COLOR[def.rarity], lcPartSub(def.rarity, o.partStars ?? 1), open, word ? ENCHANT_DEFS[word.ench] : undefined); // HULL-1d
        // SHOPCARD-1 (REQ-BFG-113, G4): a shaped part's grid on its ink plate in the head's free room, left of the ⓘ box, 7 px under
        // the card's top (the head is 31 px: the tallest plate, SPIKE RAIL's 18, ends 25 px down); the name and the sub line end well before it
        const plate = lcPartPlate(r, def.id, word ? `${ENCHANT_DEFS[word.ench].name} ${def.name}` : def.name, lcPartSub(def.rarity, o.partStars ?? 1));
        if (plate) drawShapePlate(g, def.id, plate.x, plate.y);
        drawBody(g, r, t.lines, t.info, hint, L.gap);
        if (word) { const sp = lcSparkAt(r); drawSparkAt(g, sp.x, sp.y, ENCHANT_DEFS[word.ench].color); } // ENCHANT-1 (E7); POLISH-1 (P2): the word's spark whole inside the card, on its part's plate (lcSparkAt; was on the frame's top-right corner, half outside it)
      } else {
        drawHead(g, r, C.lime, icons("{HULL}"), lcHullName(o, s.run.day), C.lime, LC_HULL_SUB, open); // HULL-1a: the day's
        drawBody(g, r, t.lines, t.info, hint, L.gap);
      }
      ui.add({ id: `lcpick-${t.boon}`, r, onTap: () => this.tap(s, i, t.boon, o) });
      if (t.boon === "rune" && open && take) ui.add({ id: LC_BAR, r: take, onTap: () => this.take(s, i, o) });
      drawInfo(g, L.infos[i], this.info.has(i));
      // the ⓘ's target, over the card's: its box and 4 px round it, and on a phone a finger's square (tap.ts tapPx) in the
      // card's top-right corner (the rest of the card stays the card's)
      const ir = L.infos[i], side = Math.max(ir.w + 8, isPhone(s.game.view) ? tapPx(s.game.view) : 0);
      const right = r.x + r.w, tr = { x: right - side, y: r.y, w: side, h: Math.min(side, r.h) };
      ui.add({ id: `lcinfo-${t.boon}`, r: tr, onTap: () => {
        if (this.eat()) return; // CARD-4 (P3)
        this.word = null; // CARD-2 (K2): another press closes a word's definition
        if (this.info.has(i)) this.info.delete(i);
        else this.info.add(i);
      } });
    });
    // EXPLAIN-1 (REQ-BFG-089, E3, E7): the RUNE card's chip is its icon, as on the dawn picker: its region over the card's,
    // so a tap on it never picks the card; it shows the card's hidden line (its details, as the card's ⓘ does: the rune's
    // reminder under its effect); with a mouse, hovering it shows the line beside the card. After every card (no card draws
    // over the tooltip)
    texts.forEach((t, i) => {
      if (t.boon !== "rune") return;
      runeChipIcon(g, ui, "lcchip-rune", L.cards[i], RUNES[o.rune!.id], tap, () => {
        if (this.eat()) return; // CARD-4 (P3)
        this.word = null; // CARD-2 (K2): the chip's line replaces a word's definition
        if (this.info.has(i)) this.info.delete(i);
        else this.info.add(i);
      }, { W, H }, s.game.canvas);
      // CARD-2 (REQ-BFG-081, K2): the open RUNE card's keywords are word targets, over the card's region (a tap on one shows
      // or hides its definition and never picks the card); a closed card's are not (a tap on it opens it, as before).
      // CARD-4 (P4): finger-tall on touch, clear of the bar's target
      if (i === this.open) {
        runeWordLayer(g, ui, "lcrune-", L.cards[i], RUNES[o.rune!.id], tap, this.word, this.word ? this.wordBox : null, (wd) => {
          if (this.eat()) return;
          this.word = this.word === wd ? null : wd;
        }, { W, H }, s.game.canvas, () => { if (!this.eat()) this.word = null; }, runeHintBand(L.cards[i], tap), take, s.run.day); // CARD-3 (REQ-BFG-087, D2); MERGE-099D: the card's day
      }
    });
  }

  /** CARD-2 (K2): the shown word's definition box as last drawn (its region). */
  private wordBox: { x: number; y: number; w: number; h: number } | null = null;

  /** Tooling (bb.lastChance()): the picker as drawn, or null when it is not up. */
  infoOf(s: BuildScreen): { day: number; boons: Boon[]; rune: string | null; part: string | null; hull: number; open: number; layout: LcLayout } | null {
    const o = this.offer(s);
    if (!o) return null;
    return { day: o.day, boons: this.boons(o), rune: o.rune?.id ?? null, part: o.part, hull: o.hull, open: this.open, layout: this.layout(s, o) };
  }
}

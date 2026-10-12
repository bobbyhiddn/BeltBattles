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
import { isPhone, tapPx } from "../ui/tap"; // a finger's target for the ⓘ on a phone
import { panel, type Rect } from "../ui/ui";
import { colourize, drawRich, wrapRich, type RichLine } from "../ui/richText";
import { faceLines } from "../ui/faces";
import { PLAIN_RIGS, RIG_SENTENCE, plainRigStats } from "../ui/faces"; // CARD-2 (REQ-BFG-084, K6): the plain rigs' faces
import { statRow } from "../ui/icons"; // CARD-2 (K6)
import { HEROES, ITEMS, type Rarity } from "../sim/content";
import { RUNES } from "../sim/runes";
import { BOONS, LAST_CHANCE_HULL, type Boon, type LastChanceOffer } from "../sim/lastChance";
import { pendingLastChance, takeLastChance, type Run } from "../game/run";
import { drawRuneCard, runeCardH } from "../ui/runeBar";
import { runeChipIcon, runeTapOf } from "../ui/runeBar"; // EXPLAIN-1 (REQ-BFG-089, E3): the rune card's chip as its icon
import { drawRuneWordNote, runeHintBand, runeKeywordOf, runeSightWord, runeWordLayer, runeWordLines } from "../ui/runeBar"; // CARD-2 (K2; K1)
import { TAKE_CLOCK, runeBarBand, runeBarTarget, takeGuardPassed } from "../ui/runeBar"; // CARD-4 (REQ-BFG-081, P): the RUNE card's bar alone takes it
import { runeTag, tierWord } from "../ui/runeText";
import { runeNoteLines } from "../ui/runeBar"; // CARD-4 run 3 (REQ-BFG-081, I): the RUNE card's details, the reminder and its source line
import { textOpts } from "./build/inspector";
import type { BuildScreen } from "./build/build";
import { GAP as ITEM_GAP, GAP_MIN as ITEM_GAP_MIN } from "../ui/spacing"; // CARD-3 (REQ-BFG-087, D5, D6): the gaps between a card's items (GAP here is the cards')

export const LC_TITLE = "LAST CHANCE";
/** The line under the title: the life came back, and the pick. */
export const LC_LINE = "+1 LIFE. PICK ONE. FREE.";
export const LC_TAKE = "TAP AGAIN TO TAKE IT";
/** "DUSK OF DAY 6 · TAP TO READ" */
export const lcHint = (day: number): string => `DUSK OF DAY ${day} · TAP TO READ`;
/** The PART card's sub line ("EPIC PART · TO CARGO · FREE": its tier, where it goes) and the HULL card's. */
export const lcPartSub = (rarity: Rarity): string => `${tierWord(rarity)} PART · TO CARGO · FREE`;
export const LC_HULL_SUB = "MAX HULL · KEPT ALL RUN";
/** The HULL card's name: "+500 ♥" for LAST_CHANCE_HULL (the HULL icon). */
export const hullName = (n: number): string => icons(`+${n} {HULL}`);
/** The summary's STOP cell on the dusk that fired LAST CHANCE (STOP_W holds it: "WARLORD"-wide labels). */
export const LC_STOP = "+1 LIFE";
/** The summary row's mark: the card taken (the rune's or part's name, or "+500 ♥"); "PICK" while it is pending. */
export function lastChanceTag(lc: { boon?: Boon; id?: string }): string {
  if (lc.boon === "rune" && lc.id && RUNES[lc.id]) return RUNES[lc.id].name;
  if (lc.boon === "part" && lc.id && ITEMS[lc.id]) return ITEMS[lc.id].name;
  if (lc.boon === "hull") return hullName(LAST_CHANCE_HULL);
  return "PICK";
}

/** The toast after a pick. */
export function lcToast(boon: Boon, offer: LastChanceOffer): string {
  if (boon === "rune") return `RUNE TAKEN: ${RUNES[offer.rune!.id].name}`;
  if (boon === "part") return `TO CARGO: ${ITEMS[offer.part!].name}`;
  return `MAX HULL ${hullName(offer.hull)}`;
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

/** The PART card's lines at text width `tw`: the stat row(s) as icons, then each rule (its brass label first). CARD-2
 *  (REQ-BFG-084, K6; REVIEW-EXPLAIN1 open item 1): a plain stat rig (faces.ts PLAIN_RIGS: WHETSTONE, TEMPER, BARBED SPOOL)
 *  draws its plain face, the panel's: plainRigStats' stat row ({DMG}+20), no HIT: line (it read faceLines' rule).
 *  CARD-3 (D5): as items: the stat rows one (the second continues the first, as the panel ties them), each rule one. */
export function partLines(def: string, tw: number, run: Pick<Run, "hero" | "build">): Items { // CARD-3: exported for the tests
  const plain = plainRigStats(def, 1);
  if (plain) return [wrapRich(colourize(statRow(plain), C.bone), tw, "5")];
  const fl = faceLines(def, 1, textOpts(run as Run));
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

/** The PART card's details (ⓘ): its keywords' reminders, then where it goes. CARD-2 (REQ-BFG-084, K6): a plain stat rig's
 *  rig sentence first (faces.ts RIG_SENTENCE: the trigger its face no longer prints, as its panel's ⓘ NOTES lead with it).
 *  CARD-3 (D5): each sentence an item. */
export function partInfo(def: string, tw: number, run: Pick<Run, "hero" | "build">): Items { // CARD-3: exported for the tests
  const fl = faceLines(def, 1, textOpts(run as Run));
  const rem = [...(PLAIN_RIGS.includes(def) ? [RIG_SENTENCE] : []), ...(fl?.reminders ?? []), "FREE. IT GOES TO CARGO AT ★1; PLACE IT AS ANY PART."];
  return rem.map((t) => wrapRich(colourize(icons(t), C.slate4), tw, "3"));
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

/** The ⓘ glyph (keywords.ts drawInfoGlyph's "i": a dot over a stem on a foot) in its box. */
function drawInfo(g: G, r: Rect, on: boolean): void {
  rect(g, r.x, r.y, r.w, r.h, C.ink);
  rect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, on ? C.brass1 : C.slate0);
  const c = on ? C.yellow : C.brass3, x = r.x + 4, y = r.y + 3;
  rect(g, x + 1, y, 1, 1, c);
  rect(g, x + 1, y + 2, 1, 3, c);
  rect(g, x, y + 2, 1, 1, c);
  rect(g, x, y + 4, 3, 1, c);
}

/** A part or hull card's frame and head: the dark panel with `edge` top and bottom, the icon box, the name and sub. */
function drawHead(g: G, r: Rect, edge: string, icon: CanvasImageSource | string, name: string, nameColour: string, sub: string, open: boolean): void {
  panel(g, r, "dark");
  rect(g, r.x + 1, r.y + 1, r.w - 2, 2, edge);
  rect(g, r.x + 1, r.y + r.h - 3, r.w - 2, 2, edge);
  if (open) frame(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, C.yellow);
  rect(g, r.x + 5, r.y + 6, 22, 22, C.ink);
  rect(g, r.x + 6, r.y + 7, 20, 20, C.slate0);
  // a sprite (the part's icon), or a font glyph drawn at twice its size (the HULL card's HULL icon)
  if (typeof icon === "string") drawText(g, icon, r.x + 16, r.y + 11, nameColour, { align: "center", scale: 2, outline: C.ink });
  else g.drawImage(icon, r.x + 16 - Math.floor((icon as { width: number }).width / 2), r.y + 17 - Math.floor((icon as { height: number }).height / 2));
  drawText(g, name, r.x + 31, r.y + 7, nameColour, { outline: C.ink });
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
    s.game.toast(lcToast(boon, o), C.lime, "pickup");
  }

  /** Each card's lines and details at width `w` (pure on the run). */
  private texts(run: Run, o: LastChanceOffer, w: number): { boon: Boon; lines: Items; info: Items }[] {
    const tw = w - 10;
    return this.boons(o).map((boon, i) => {
      const shown = this.info.has(i);
      if (boon === "rune") return { boon, lines: [], info: shown ? [runeNoteLines(RUNES[o.rune!.id], tw)] : [] }; // CARD-4 run 3 (I): with the source line
      if (boon === "part") return { boon, lines: partLines(o.part!, tw, run), info: shown ? partInfo(o.part!, tw, run) : [] };
      const now = HEROES[run.hero].hull + run.build.hullBonus;
      return { boon, lines: hullLines(now, o.hull, tw), info: shown ? hullInfo(tw) : [] };
    });
  }

  layout(s: Pick<BuildScreen, "run" | "game" | "touch">, o: LastChanceOffer): LcLayout {
    const { W, H } = s.game;
    const w = Math.min(W - 8, 300);
    const texts = this.texts(s.run, o, w);
    const tap = s.game.view ? runeTapOf(s) : 0; // CARD-4 (P1): the open RUNE card's bar band holds a finger's target on touch
    const hs = (gap: { lines: number; info: number }) => texts.map((t, i) => (t.boon === "rune"
      ? runeCardH(RUNES[o.rune!.id], w, i === this.open ? { hint: LC_TAKE, tap } : {}) + (t.info.length ? 1 + lineCount(t.info) * 7 + gapCount(t.info) * gap.info : 0)
      : cardH(t.lines, t.info, i === this.open, gap)));
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
    drawText(g, LC_TITLE, cx, L.top, C.yellow, { align: "center", outline: C.ink });
    drawText(g, LC_LINE, cx, L.top + 11, C.lime, { align: "center" });
    drawText(g, lcHint(o.day), cx, L.top + 22, C.slate4, { font: "3", align: "center" });
    const texts = this.texts(s.run, o, L.cardW);
    const tap = runeTapOf(s); // CARD-4 (P1)
    let take: Rect | null = null;
    texts.forEach((t, i) => {
      const r = L.cards[i], open = i === this.open, hint = open ? LC_TAKE : null;
      if (t.boon === "rune") {
        const def = RUNES[o.rune!.id];
        drawRuneCard(g, r, def, { sub: `${runeTag(def)} · FREE`, open, hint: undefined });
        // the rune card's own body is drawRuneCard's; its details and the take bar follow its text (CARD-4, P1: the bar
        // centred in a band that holds a finger's target on touch)
        const base = runeCardH(def, r.w, {}) - 4;
        drawBody(g, { ...r, y: r.y + base - HEAD }, [], t.info, hint, L.gap, runeBarBand(open ? tap : 0));
        // CARD-2 (K2; K1): the shown keyword's definition, in the details' room (its lines' place: drawBody's y + 1), or,
        // with the details closed, over the effect lines' foot, growing up: whole, and the card keeps its size
        const k = open && this.word ? runeKeywordOf(def, this.word) : null;
        if (k) this.wordBox = drawRuneWordNote(g, r, t.info.length ? r.y + base + 1 : r.y + base - 2, lineCount(t.info), runeWordLines(def, k, r.w - 10));
        // CARD-4 (REQ-BFG-081, P1): the open RUNE card's body takes nothing; its bar's target alone takes it (never under
        // the word's box)
        if (open) take = runeBarTarget(r, LC_TAKE, tap, this.wordBox);
      } else if (t.boon === "part") {
        const def = ITEMS[o.part!];
        drawHead(g, r, RARITY_COLOR[def.rarity], itemIcon(def.id), def.name, RARITY_COLOR[def.rarity], lcPartSub(def.rarity), open);
        drawBody(g, r, t.lines, t.info, hint, L.gap);
      } else {
        drawHead(g, r, C.lime, icons("{HULL}"), hullName(o.hull), C.lime, LC_HULL_SUB, open);
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
        }, { W, H }, s.game.canvas, () => { if (!this.eat()) this.word = null; }, runeHintBand(L.cards[i], tap), take); // CARD-3 (REQ-BFG-087, D2)
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

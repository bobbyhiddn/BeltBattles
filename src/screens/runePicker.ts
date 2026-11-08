// RUNES-1 (REQ-BFG-058, M2): the dawn RUNE PICKER. One rune at every dawn, before the shop: 1 of 3 on days 1-4, 1 of 2
// from day 5, free, no skip, no rerolls (the operator's; src/sim/runes.ts). A modal the build screen draws over itself
// whenever today's pick is pending (src/game/run.ts pendingRune) and the run is at its caravan; the offer is re-derived
// from the run (never stored), so a reload or CONTINUE shows the same cards. While it is up it takes every press (a
// full-screen region over the screen's; BuildScreen.key, move and down return early), so nothing under it moves; it has
// no close. A tap on a card opens it (a yellow ring, its keyword reminder and a yellow "TAP AGAIN TO TAKE IT" bar); a tap
// on the open card takes it (run.ts takeRune), saves the run and closes. The runes already held show as a tray of chips.

import type { G } from "../render/pixel";
import { rect } from "../render/pixel";
import { C } from "../render/palette";
import { drawText, textWidth } from "../render/font";
import { panel, type Rect } from "../ui/ui";
import { drawRich } from "../ui/richText";
import { pendingRune, takeRune, type Run } from "../game/run";
import { RUNES, isRune, type RuneDef } from "../sim/runes";
import { endlessMarked } from "../sim/endless"; // ENDLESS-1 (REQ-BFG-059, 3.5): only an endless-marked run gets the compact tray
import { drawRuneCard, drawRuneChip, RUNE_CHIP_MIN, runeCardH, runeChipW } from "../ui/runeBar";
import { drawRuneChipSmall, RUNE_SMALL_H, RUNE_SMALL_W } from "../ui/runeBar"; // ENDLESS-1 (REQ-BFG-059, 3.5): the compact tray's chips
import { runeChipIcon, runeTapOf } from "../ui/runeBar"; // EXPLAIN-1 (REQ-BFG-089, E3): the chip as the card's icon
import { runeHintBand, runeSightWord, runeWordBoxOn, runeWordLayer, sawRuneNote } from "../ui/runeBar"; // CARD-2 (REQ-BFG-081, K2; K1)
import { TAKE_CLOCK, runeBarTarget, runeCardTextW, runeNoteBox, runeNoteY, takeGuardPassed } from "../ui/runeBar"; // CARD-4 (REQ-BFG-081, P): only the bar takes, never too soon
import { runeNoteLines } from "../ui/runeBar"; // CARD-4 (P1): the chip's line's box (the bar's target is never under it); run 3 (I): with the source line
import { runeTag, tierColour, tierWord } from "../ui/runeText";
import type { BuildScreen } from "./build/build";
import { titlePlate } from "./pickHead"; // TXT-AZ (REQ-BFG-073; REVIEW-STAGE097 R5): the title block's plate; BACKDROP-2: pickGround starts at its top (the ground is that plate grown down the column, drawn in draw(), no longer drawTitlePlate)

export const PICK_TITLE = "PICK A RUNE";
export const PICK_TAKE = "TAP AGAIN TO TAKE IT";
/** EXPLAIN-1 (REQ-BFG-089, E3): the opened card's chip's region. */
export const PICK_CHIP = "runepick-chip";
/** CARD-2 (REQ-BFG-081, K2): the opened card's word targets' prefix ("runepick-w0:PAIR") and its definition box's id. */
export const PICK_WORD = "runepick-w";
export const PICK_DEF = "runepick-def";
/** CARD-4 (REQ-BFG-081, P1): the opened card's TAP AGAIN TO TAKE IT bar's target, the one region that takes the rune. */
export const PICK_BAR = "runepick-take";
/** CARD-4 (P2): the build screen's clock (BuildScreen.t, game seconds); 0 where a caller's screen has none (tests). */
const clock = (s: object): number => {
  const t = (s as { t?: unknown }).t;
  return typeof t === "number" ? t : 0;
};
/** "1 OF 3. FREE. KEPT ALL RUN. TAP TO READ." (2 from day 5). */
export const pickHint = (cards: number): string => `1 OF ${cards}. FREE. KEPT ALL RUN. TAP TO READ.`;
/** The dawn line's two parts: "DAWN OF DAY 4 · " and the tier's ("RARE RUNES", in its colour). */
export const pickDawn = (day: number, tier: RuneDef["tier"]): [string, string] => [`DAWN OF DAY ${day} · `, `${tierWord(tier)} RUNES`];

const TRAY_LABEL = "YOUR RUNES";
const GAP = 7;

export interface PickLayout {
  /** The title's y; the dawn line and the hint below it. */
  top: number;
  cardW: number;
  cards: Rect[];
  /** The held runes' tray, or null with none held. */
  tray: Rect | null;
  trayChips: Rect[];
  /** The lowest row anything is drawn on (exclusive). */
  bottom: number;
  /** ENDLESS-1 (REQ-BFG-059, 3.5; RULING-RUN1-R1): the tray is COMPACT (RUNE_SMALL_W x RUNE_SMALL_H chips, "YOUR RUNES n" on a row of its
   *  own above them) because the runes held did not fit the screen as full chips. Absent otherwise (every tray as before). */
  compact?: boolean;
}

/** ENDLESS-1: a compact tray's rows: the label's row, then RUNE_SMALL_H + 1 a row. */
const SMALL_PITCH_X = RUNE_SMALL_W + 1, SMALL_PITCH_Y = RUNE_SMALL_H + 1, SMALL_HEAD = 12;

/** The picker on a screen W x H: `ids` the cards, `open` the opened one (-1 none), `held` the runes held. Pure (tests).
 *  FLIP-X2 (REVIEW-FLIPX1 answer 3): `heldIds`, the held runes' ids in pick order, sizes each tray chip from its keyword
 *  word (runeChipW: SHIELD's 26, every other word's 22); absent, every chip is 22 wide and the tray is exactly as before.
 *  CARD-4 (P1): `tap`, a finger's target in art px (runeTapOf; 0 for a mouse): the opened card's bar band holds it.
 *  HULL-1a (REQ-BFG-079): `day`, the dawn's day (a HULL rune's amount: the day's number with HULL_SCALE on). */
export function pickLayout(W: number, H: number, ids: readonly string[], open: number, held: number, heldIds?: readonly string[], tap = 0, day?: number, compactOk = false): PickLayout {
  const cardW = Math.min(W - 8, 300), x = Math.round(W / 2 - cardW / 2);
  const hs = ids.map((id, i) => runeCardH(RUNES[id], cardW, i === open ? { reminder: true, hint: PICK_TAKE, tap, day } : { day }));
  // the tray: "YOUR RUNES n" then the chips in rows (display only: RUNE_CHIP_MIN, not a finger's size)
  const chip = RUNE_CHIP_MIN, pitch = chip + 3;
  const x0 = x + 5 + textWidth(`${TRAY_LABEL} 10`, "3") + 5, right = x + cardW - 4;
  const cw = (i: number): number => (heldIds && isRune(heldIds[i]) ? runeChipW(RUNES[heldIds[i]], chip) : chip);
  // left to right, a new row when the next chip would end past the tray's right edge (a row holds at least one chip): with
  // every chip 22 wide this is the old perRow = max(1, floor((right - x0 + 3) / pitch)) exactly
  const at: [number, number][] = [];
  for (let i = 0, cx = x0, row = 0; i < held; i++) {
    if (cx > x0 && cx + cw(i) > right) { cx = x0; row++; }
    at.push([cx, row]);
    cx += cw(i) + 3;
  }
  const rows = held ? at[held - 1][1] + 1 : 0;
  const trayH = held ? rows * pitch + 5 : 0;
  const body = 33 + hs.reduce((s, h) => s + h, 0) + GAP * Math.max(0, ids.length - 1);
  const total = body + (held ? 9 + trayH : 0);
  let top = Math.max(4, Math.min(40, Math.floor((H - total) / 3)));
  // ENDLESS-1 (REQ-BFG-059, 3.5; RULING-RUN1-R1): an endless run holds about 50 runes, and the full chips' tray (22 px chips, 3 or 4 a
  // row on a phone) would run off the screen. When the tray as it was does not fit, it is laid out COMPACT: small chips, the label on
  // a row of its own, as many to a row as the card holds. Whenever it fits, every number above is exactly as before; and `compactOk`
  // (the caller's: the run carries the endless mark, sim/endless.ts endlessMarked) is false for every run without it, so a run of
  // today's rules (ENDLESS off) draws the tray it always drew, fit or not.
  if (compactOk && held && top + total > H - 4) {
    const left = x + 5, perRow = Math.max(1, Math.floor((x + cardW - 4 - left + 1) / SMALL_PITCH_X));
    const smallRows = Math.ceil(held / perRow), smallH = SMALL_HEAD + smallRows * SMALL_PITCH_Y + 3;
    top = Math.max(4, Math.min(40, Math.floor((H - (body + 9 + smallH)) / 3)));
    const cards: Rect[] = [];
    let y = top + 33;
    hs.forEach((h, i) => {
      cards.push({ x, y, w: cardW, h });
      y += h + (i < hs.length - 1 ? GAP : 0);
    });
    const tray: Rect = { x, y: y + 9, w: cardW, h: smallH };
    const trayChips: Rect[] = Array.from({ length: held }, (_, i) => ({
      x: left + (i % perRow) * SMALL_PITCH_X, y: tray.y + SMALL_HEAD + Math.floor(i / perRow) * SMALL_PITCH_Y, w: RUNE_SMALL_W, h: RUNE_SMALL_H,
    }));
    return { top, cardW, cards, tray, trayChips, bottom: tray.y + tray.h, compact: true };
  }
  const cards: Rect[] = [];
  let y = top + 33;
  hs.forEach((h, i) => {
    cards.push({ x, y, w: cardW, h });
    y += h + (i < hs.length - 1 ? GAP : 0);
  });
  let tray: Rect | null = null;
  const trayChips: Rect[] = [];
  if (held) {
    tray = { x, y: y + 9, w: cardW, h: trayH };
    for (let i = 0; i < held; i++) trayChips.push({ x: at[i][0], y: tray.y + 3 + at[i][1] * pitch, w: cw(i), h: chip });
    y = tray.y + tray.h;
  }
  return { top, cardW, cards, tray, trayChips, bottom: y };
}

/**
 * BACKDROP-2 (REQ-BFG-058; BACKDROP-1's report, section 8): how far the card column's ground stands out past the cards' sides, and below the column's foot: the same 4 and 4 as LAST CHANCE's
 * (lastChancePicker.ts GROUND_SIDE and GROUND_FOOT; tests/backdrop2.ground.test.ts pins them equal; they are not imported so this picker keeps no dependency on LAST CHANCE's screen). The open card's
 * ring is one px outside its card, so both are at least 1; 4 puts the ring on the panel's first fill column and row (bevel2's frame and bevel take the 3 px before it).
 */
export const PICK_GROUND_SIDE = 4;
export const PICK_GROUND_FOOT = 4;

/**
 * BACKDROP-2 (REQ-BFG-058; BACKDROP-1's report, section 8): the one solid ground under the dawn picker's column. The picker's scrim (draw: ink at 0.86) is not opaque, so every gap in the column
 * showed the build screen behind it, dimmed: the 7 px between two cards (GAP), the 9 px between the last card and the YOUR RUNES tray, and the bevel band between the title plate and the first card
 * (cut pieces of the shop row and the ship's outline). The ground is ONE "dark" panel (the cards' own look; ui.ts panel) from the title plate's top (pickHead.ts titlePlate: the plate and the ground read
 * as one ground, no seam or frame line under the title block) to the foot of the column's last element, PICK_GROUND_SIDE px wider than the column on each side and PICK_GROUND_FOOT px under the foot, clamped
 * inside the screen (on a tight screen `top` is 4, which puts the plate's top 2 px above it, and the column may run past H). The column is the plate, every card and the held-runes tray (the tray has
 * the cards' x and width: pickLayout), so the foot is the tray's, or the last card's with none held (`L.bottom`). It holds the plate, every card (the open card's ring too) and the tray. Drawn after the
 * scrim and before the title's text, the cards and the tray (draw), in place of drawTitlePlate. Pure (draw, tests); nothing of the layout moves.
 */
export function pickGround(W: number, H: number, L: Pick<PickLayout, "top" | "cardW" | "cards" | "tray" | "bottom">): Rect {
  const p = titlePlate(W, L.top, L.cardW);
  let x0 = p.x, x1 = p.x + p.w, y1 = Math.max(p.y + p.h, L.bottom);
  for (const c of L.tray ? [...L.cards, L.tray] : L.cards) {
    x0 = Math.min(x0, c.x);
    x1 = Math.max(x1, c.x + c.w);
    y1 = Math.max(y1, c.y + c.h);
  }
  x0 = Math.max(0, x0 - PICK_GROUND_SIDE);
  x1 = Math.min(W, x1 + PICK_GROUND_SIDE);
  const y0 = Math.max(0, p.y);
  y1 = Math.min(H, y1 + PICK_GROUND_FOOT);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The picker's state on one build screen. */
export class RunePicker {
  /** The opened card (-1: none). */
  open = -1;
  /** EXPLAIN-1 (REQ-BFG-089, E3): the opened card's hidden line is shown (its chip was tapped). */
  note = false;
  /** CARD-2 (REQ-BFG-081, K2; REQ-BFG-004, K1): the keyword whose definition the opened card's room shows: a word's tap,
   *  or its first sight when the card opened (never the "TAP AGAIN TO TAKE IT" tap: it is no tap at all). */
  word: string | null = null;
  /** CARD-4 (REQ-BFG-081, P3): `word`'s note opened by itself (K1's first sight when the card opened), not by a tap. */
  auto = false;
  /** CARD-4 (P3): this press only closed a note that opened by itself: its tap does nothing else (eat). */
  private eaten = false;
  /** CARD-4 (P2): when the open card opened (clock: the build screen's game seconds; TAKE_CLOCK: the wall's ms). */
  private openedAt = 0;
  private openedWall = 0;
  private day = 0;

  /** EXPLAIN-1 (E3): every press while the picker is up (BuildScreen.pressed): one anywhere but the opened card's chip
   *  closes its line. CARD-2 (K2): one anywhere but its words closes a word's definition (a word's own tap toggles it).
   *  CARD-4 (REQ-BFG-081, P3): while a note that opened by itself is on screen, the next press anywhere only closes it (its
   *  tap, on the bar, a word, a chip or another card, then does nothing: eat). */
  pressed(region: string | null): void {
    this.eaten = false;
    if (this.auto && this.word) {
      this.word = null;
      this.note = false;
      this.auto = false;
      this.eaten = true;
      return;
    }
    this.auto = false;
    if (region !== PICK_CHIP) this.note = false;
    if (!region || !region.startsWith(PICK_WORD)) this.word = null;
  }

  /** CARD-4 (P3): true (once) when this press only closed a note that opened by itself: the caller's tap does nothing. */
  private eat(): boolean {
    if (!this.eaten) return false;
    this.eaten = false;
    return true;
  }

  /** Today's offer while the pick is pending and the run is at its caravan (not a refit), else null. */
  offer(s: Pick<BuildScreen, "run" | "refit">): ReturnType<typeof pendingRune> {
    const run: Run = s.run;
    if (s.refit || run.stage !== "caravan") return null;
    return pendingRune(run);
  }

  /** The picker is up (it takes every press and key). */
  up(s: Pick<BuildScreen, "run" | "refit">): boolean {
    return !!this.offer(s);
  }

  /** A tap on card i: open it. CARD-4 (REQ-BFG-081, P1): a tap on the open card does nothing (its words, chip and bar
   *  have their own regions); only its TAP AGAIN bar takes it (take). */
  tap(s: BuildScreen, i: number, id: string): void {
    if (this.eat()) return;
    if (this.open === i) return;
    this.open = i;
    this.note = false;
    this.word = runeSightWord(RUNES[id]); // CARD-2 (K1): its first effect keyword not yet seen opens by itself
    this.auto = !!this.word; // CARD-4 (P3)
    this.openedAt = clock(s); // CARD-4 (P2)
    this.openedWall = TAKE_CLOCK.wall();
  }

  /** CARD-4 (REQ-BFG-081, P1, P2): the open card's TAP AGAIN bar: take card i's rune (run.ts takeRune), unless it opened
   *  under TAKE_GUARD_S ago (a double tap's second tap: ignored) or this press only closed a self-opened note (P3). */
  take(s: BuildScreen, i: number, id: string): void {
    if (this.eat()) return;
    if (this.open !== i || !takeGuardPassed(clock(s) - this.openedAt, TAKE_CLOCK.wall() - this.openedWall)) return;
    const r = takeRune(s.run, id);
    if (!r.ok) {
      s.game.error(r.reason ?? "NO RUNE TO PICK");
      return;
    }
    this.open = -1;
    s.touched(); // the model (a HULL rune changes the hull) and saveRun
    s.game.resize(); // the rune bar's row may change the build screen's scale (BuildScreen.pickScale)
    s.game.toast(`RUNE TAKEN: ${RUNES[id].name}`, C.lime, "pickup");
  }

  draw(g: G, s: BuildScreen): void {
    const o = this.offer(s);
    if (!o) {
      this.open = -1;
      return;
    }
    if (this.day !== o.day) {
      this.day = o.day;
      this.open = -1;
      this.note = false;
      this.word = null;
      this.auto = false;
    }
    const { W, H, ui } = s.game;
    const held = (s.run.build.runes ?? []).map((q) => q.id).filter(isRune);
    const tap = runeTapOf(s); // CARD-4 (P1): the bar's band holds a finger's target on touch
    const L = pickLayout(W, H, o.ids, this.open, held.length, held, tap, o.day, endlessMarked(s.run)); // FLIP-X2: the tray's chips sized from their words; ENDLESS-1: compact on an endless-marked run when it must
    g.globalAlpha = 0.86;
    rect(g, 0, 0, W, H, C.ink);
    g.globalAlpha = 1;
    ui.add({ id: "runepick", r: { x: 0, y: 0, w: W, h: H }, block: true });
    const cx = Math.round(W / 2);
    panel(g, pickGround(W, H, L), "dark"); // TXT-AZ (REVIEW-STAGE097 R5): a clean ground under the title, its line and the hint, as the LAST CHANCE picker's; BACKDROP-2: and under every card, gap and the YOUR RUNES tray (pickGround: the plate grown down the column), in place of drawTitlePlate
    drawText(g, PICK_TITLE, cx, L.top, C.yellow, { align: "center", outline: C.ink });
    const [a, b] = pickDawn(o.day, o.tier);
    const dw = textWidth(a + b);
    drawRich(g, [{ t: a, c: C.bone }, { t: b, c: tierColour(o.tier) }], Math.round(cx - dw / 2), L.top + 11, "5");
    drawText(g, pickHint(o.ids.length), cx, L.top + 22, C.slate4, { font: "3", align: "center" });
    o.ids.forEach((id, i) => {
      const def = RUNES[id], r = L.cards[i], open = i === this.open;
      // EXPLAIN-1 (REQ-BFG-089, E1d): the opened card keeps its reminder's room, clear until its chip shows the line (E3)
      // CARD-2 (K2): a keyword's definition (its tap, or K1's first sight) takes the room in place of the chip's line
      drawRuneCard(g, r, def, { sub: runeTag(def), open, reminder: open, noteOpen: open && this.note, word: open ? this.word : null, hint: open ? PICK_TAKE : undefined, tap, day: o.day }); // HULL-1a
      if (open && this.note) sawRuneNote(def);
      // CARD-4 (REQ-BFG-081, P1): a closed card's tap opens it; the open card's body takes nothing (a press there closes
      // an open note: pressed), and only its bar's target takes the rune, never under a note box (runeBarTarget)
      if (!open) ui.add({ id: `runepick-${i}`, r, onTap: () => this.tap(s, i, id) });
      else {
        ui.add({ id: `runepick-${i}`, r, block: true });
        ui.add({ id: PICK_BAR, r: runeBarTarget(r, PICK_TAKE, tap, this.boxOn(r, def, o.day)), onTap: () => this.take(s, i, id) }); // MERGE-099E: the note box on the dawn's day
      }
    });
    // EXPLAIN-1 (E3): each card's chip is its icon, its region over the card's: on the opened card a tap shows its hidden
    // line in its room (never the "TAP AGAIN TO TAKE IT" tap); on a closed card a tap opens it as the card does; with a
    // mouse, hovering a chip shows the line beside its card. After every card, so no card draws over a tooltip
    o.ids.forEach((id, i) => {
      const open = i === this.open;
      runeChipIcon(g, ui, open ? PICK_CHIP : `runepick-${i}-chip`, L.cards[i], RUNES[id], tap,
        open ? () => { if (this.eat()) return; this.note = !this.note; this.word = null; } : () => this.tap(s, i, id), { W, H }, s.game.canvas);
      // CARD-2 (REQ-BFG-081, K2): the opened card's keywords are word targets, their regions over the card's (a tap on one
      // shows or hides its definition in the room and never takes the rune); a closed card's words are not (a tap anywhere
      // on it opens it, as before). CARD-4 (P4): finger-tall on touch, clear of the bar's target
      if (open) {
        // MERGE-099D (BRIEF-MERGE-099D 1c): its words and the definition's region on the dawn's day, as the card draws them
        // (HULL-1a: `day: o.day` above); MERGE-099E: the bar's target under the note box on that day too (boxOn)
        const r = L.cards[i], def = RUNES[id];
        runeWordLayer(g, ui, "runepick-", r, def, tap, this.word, runeWordBoxOn(r, def, this.word, o.day), (wd) => {
          if (this.eat()) return;
          this.note = false;
          this.word = this.word === wd ? null : wd;
        }, { W, H }, s.game.canvas, undefined, runeHintBand(r, tap), // CARD-3 (REQ-BFG-087, D2): the tooltip keeps clear of TAP AGAIN
        runeBarTarget(r, PICK_TAKE, tap, this.boxOn(r, def, o.day)), o.day);
      }
    });
    if (L.tray) {
      panel(g, L.tray, "inset");
      if (L.compact) {
        // ENDLESS-1: the compact tray (an endless run's ~50 runes): the label on its own row, the small chips under it
        drawText(g, `${TRAY_LABEL} ${held.length}`, L.tray.x + 5, L.tray.y + 4, C.slate4, { font: "3" });
        held.forEach((id, i) => drawRuneChipSmall(g, L.trayChips[i], RUNES[id]));
      } else {
        drawText(g, `${TRAY_LABEL} ${held.length}`, L.tray.x + 5, L.tray.y + 3 + Math.floor((RUNE_CHIP_MIN - 5) / 2), C.slate4, { font: "3" });
        held.forEach((id, i) => drawRuneChip(g, L.trayChips[i], RUNES[id]));
      }
    }
  }

  /** CARD-4 (P1): the note box shown on open card `r` (a word's definition, or the chip's line), else null. MERGE-099E
   *  (BRIEF-MERGE-099E 1c; REPORT-CARD4 s11's silent item): on `day`, the dawn's day the card is drawn on (HULL-1a: a HULL
   *  rune's effect lines, so the note's top, follow the day), so the TAP AGAIN target's top follows the box as drawn. */
  private boxOn(r: Rect, def: RuneDef, day: number): Rect | null {
    if (this.word) return runeWordBoxOn(r, def, this.word, day);
    if (this.note) return runeNoteBox(r, runeNoteY(r, def, day), runeNoteLines(def, runeCardTextW(r.w)).length); // CARD-4 run 3 (I)
    return null;
  }

  /** Tooling (bb.runePicker()): the picker as drawn, or null when it is not up. CARD-4 (P1): `bar`, the open card's TAP
   *  AGAIN target as drawn (null with no card open). */
  info(s: BuildScreen): { day: number; tier: string; ids: string[]; open: number; layout: PickLayout; bar: Rect | null } | null {
    const o = this.offer(s);
    if (!o) return null;
    const held = (s.run.build.runes ?? []).map((q) => q.id).filter(isRune), tap = runeTapOf(s);
    const layout = pickLayout(s.game.W, s.game.H, o.ids, this.open, held.length, held, tap, o.day, endlessMarked(s.run)); // HULL-1a: the dawn's day
    const card = this.open >= 0 ? layout.cards[this.open] : null;
    const bar = card ? runeBarTarget(card, PICK_TAKE, tap, this.boxOn(card, RUNES[o.ids[this.open]], o.day)) : null; // MERGE-099E
    return { day: o.day, tier: o.tier, ids: [...o.ids], open: this.open, layout, bar };
  }
}

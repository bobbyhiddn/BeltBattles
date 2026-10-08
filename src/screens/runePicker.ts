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
import { drawRuneCard, drawRuneChip, RUNE_CHIP_MIN, runeCardH, runeChipW } from "../ui/runeBar";
import { runeTag, tierColour, tierWord } from "../ui/runeText";
import type { BuildScreen } from "./build/build";
import { drawTitlePlate } from "./pickHead"; // TXT-AZ (REQ-BFG-073; REVIEW-STAGE097 R5): the title block on the cards' panel

export const PICK_TITLE = "PICK A RUNE";
export const PICK_TAKE = "TAP AGAIN TO TAKE IT";
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
}

/** The picker on a screen W x H: `ids` the cards, `open` the opened one (-1 none), `held` the runes held. Pure (tests).
 *  FLIP-X2 (REVIEW-FLIPX1 answer 3): `heldIds`, the held runes' ids in pick order, sizes each tray chip from its keyword
 *  word (runeChipW: SHIELD's 26, every other word's 22); absent, every chip is 22 wide and the tray is exactly as before. */
export function pickLayout(W: number, H: number, ids: readonly string[], open: number, held: number, heldIds?: readonly string[]): PickLayout {
  const cardW = Math.min(W - 8, 300), x = Math.round(W / 2 - cardW / 2);
  const hs = ids.map((id, i) => runeCardH(RUNES[id], cardW, i === open ? { reminder: true, hint: PICK_TAKE } : {}));
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
  const total = 33 + hs.reduce((s, h) => s + h, 0) + GAP * Math.max(0, ids.length - 1) + (held ? 9 + trayH : 0);
  const top = Math.max(4, Math.min(40, Math.floor((H - total) / 3)));
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

/** The picker's state on one build screen. */
export class RunePicker {
  /** The opened card (-1: none). */
  open = -1;
  private day = 0;

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

  /** A tap on card i: open it, or take it when it is open already. */
  tap(s: BuildScreen, i: number, id: string): void {
    if (this.open !== i) {
      this.open = i;
      return;
    }
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
    }
    const { W, H, ui } = s.game;
    const held = (s.run.build.runes ?? []).map((q) => q.id).filter(isRune);
    const L = pickLayout(W, H, o.ids, this.open, held.length, held); // FLIP-X2: the tray's chips sized from their words
    g.globalAlpha = 0.86;
    rect(g, 0, 0, W, H, C.ink);
    g.globalAlpha = 1;
    ui.add({ id: "runepick", r: { x: 0, y: 0, w: W, h: H }, block: true });
    const cx = Math.round(W / 2);
    drawTitlePlate(g, W, L.top, L.cardW); // TXT-AZ (REVIEW-STAGE097 R5): as the LAST CHANCE picker's, one plate for both
    drawText(g, PICK_TITLE, cx, L.top, C.yellow, { align: "center", outline: C.ink });
    const [a, b] = pickDawn(o.day, o.tier);
    const dw = textWidth(a + b);
    drawRich(g, [{ t: a, c: C.bone }, { t: b, c: tierColour(o.tier) }], Math.round(cx - dw / 2), L.top + 11, "5");
    drawText(g, pickHint(o.ids.length), cx, L.top + 22, C.slate4, { font: "3", align: "center" });
    o.ids.forEach((id, i) => {
      const def = RUNES[id], r = L.cards[i], open = i === this.open;
      drawRuneCard(g, r, def, { sub: runeTag(def), open, reminder: open, hint: open ? PICK_TAKE : undefined });
      ui.add({ id: `runepick-${i}`, r, onTap: () => this.tap(s, i, id) });
    });
    if (L.tray) {
      panel(g, L.tray, "inset");
      drawText(g, `${TRAY_LABEL} ${held.length}`, L.tray.x + 5, L.tray.y + 3 + Math.floor((RUNE_CHIP_MIN - 5) / 2), C.slate4, { font: "3" });
      held.forEach((id, i) => drawRuneChip(g, L.trayChips[i], RUNES[id]));
    }
  }

  /** Tooling (bb.runePicker()): the picker as drawn, or null when it is not up. */
  info(s: BuildScreen): { day: number; tier: string; ids: string[]; open: number; layout: PickLayout } | null {
    const o = this.offer(s);
    if (!o) return null;
    const held = (s.run.build.runes ?? []).length;
    return { day: o.day, tier: o.tier, ids: [...o.ids], open: this.open, layout: pickLayout(s.game.W, s.game.H, o.ids, this.open, held) };
  }
}

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
import { HEROES, ITEMS, type Rarity } from "../sim/content";
import { RUNES } from "../sim/runes";
import { BOONS, LAST_CHANCE_HULL, type Boon, type LastChanceOffer } from "../sim/lastChance";
import { pendingLastChance, takeLastChance, type Run } from "../game/run";
import { drawRuneCard, runeCardH } from "../ui/runeBar";
import { runeChipIcon, runeTapOf } from "../ui/runeBar"; // EXPLAIN-1 (REQ-BFG-089, E3): the rune card's chip as its icon
import { drawRuneWordNote, runeKeywordOf, runeSightWord, runeWordLayer, runeWordLines } from "../ui/runeBar"; // CARD-2 (K2; K1)
import { runeReminderSpans, runeTag, tierWord } from "../ui/runeText";
import { textOpts } from "./build/inspector";
import type { BuildScreen } from "./build/build";

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

/** The PART card's lines at text width `tw`: the stat row(s) as icons, then each rule (its brass label first). */
function partLines(def: string, tw: number, run: Pick<Run, "hero" | "build">): RichLine[] {
  const fl = faceLines(def, 1, textOpts(run as Run));
  if (!fl) return [];
  const out: RichLine[] = [];
  for (const s of [fl.stats, fl.stats2]) if (s) out.push(...wrapRich(colourize(icons(s), C.bone), tw, "5"));
  for (const r of fl.rules) {
    // the rule's text starts with its trigger label ("SHOT: ..."): the label in brass, as the inspector's face draws it
    const text = icons(r.text), label = r.label ? icons(r.label) : "";
    const spans = label && text.startsWith(label) ? [{ t: label, c: C.brass3 }, ...colourize(text.slice(label.length), C.bone)] : colourize(text, C.bone);
    out.push(...wrapRich(spans, tw, "5"));
  }
  return out;
}

/** The PART card's details (ⓘ): its keywords' reminders, then where it goes. */
function partInfo(def: string, tw: number, run: Pick<Run, "hero" | "build">): RichLine[] {
  const fl = faceLines(def, 1, textOpts(run as Run));
  const rem = [...(fl?.reminders ?? []), "FREE. IT GOES TO CARGO AT ★1; PLACE IT AS ANY PART."];
  return rem.flatMap((t) => wrapRich(colourize(icons(t), C.slate4), tw, "3"));
}

/** The HULL card's line and details. */
const hullLines = (now: number, n: number, tw: number): RichLine[] => wrapRich(colourize(icons(`YOUR {HULL}: ${now} TO ${now + n}.`), C.bone), tw, "5");
const hullInfo = (tw: number): RichLine[] => wrapRich(colourize(icons("MAX {HULL} FOR THE REST OF THE RUN. EVERY FIGHT STARTS FULL."), C.slate4), tw, "3");

export interface LcLayout {
  top: number;
  cardW: number;
  cards: Rect[];
  /** each card's ⓘ box */
  infos: Rect[];
  bottom: number;
}

/** One card's height at width `w`: the head, its lines, the details when shown, the take bar when open. */
function cardH(lines: number, info: number, open: boolean): number {
  return HEAD + lines * 9 + (info ? 1 + info * 7 : 0) + (open ? 13 : 0) + 4;
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

/** Lines, then the details, then the take bar, from the card's text top. */
function drawBody(g: G, r: Rect, lines: readonly RichLine[], info: readonly RichLine[], hint: string | null): void {
  let y = r.y + HEAD;
  for (const l of lines) {
    drawRich(g, l, r.x + 5, y, "5");
    y += 9;
  }
  if (info.length) {
    y += 1;
    for (const l of info) {
      drawRich(g, l, r.x + 5, y, "3");
      y += 7;
    }
  }
  if (hint) {
    const hw = textWidth(hint) + 8, hb = { x: Math.round(r.x + r.w / 2 - hw / 2), y: y + 1, w: hw, h: 11 };
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
  private key = "";

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

  /** A tap on card i: open it, or take it when it is open already. */
  tap(s: BuildScreen, i: number, boon: Boon, o: LastChanceOffer): void {
    if (this.open !== i) {
      this.open = i;
      // CARD-2 (K1): an opened RUNE card shows its first effect keyword not yet seen, by itself (no tap is counted)
      this.word = boon === "rune" && o.rune ? runeSightWord(RUNES[o.rune.id]) : null;
      return;
    }
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
  private texts(run: Run, o: LastChanceOffer, w: number): { boon: Boon; lines: RichLine[]; info: RichLine[] }[] {
    const tw = w - 10;
    return this.boons(o).map((boon, i) => {
      const shown = this.info.has(i);
      if (boon === "rune") return { boon, lines: [], info: shown ? wrapRich(runeReminderSpans(RUNES[o.rune!.id]), tw, "3") : [] };
      if (boon === "part") return { boon, lines: partLines(o.part!, tw, run), info: shown ? partInfo(o.part!, tw, run) : [] };
      const now = HEROES[run.hero].hull + run.build.hullBonus;
      return { boon, lines: hullLines(now, o.hull, tw), info: shown ? hullInfo(tw) : [] };
    });
  }

  layout(s: Pick<BuildScreen, "run" | "game">, o: LastChanceOffer): LcLayout {
    const { W, H } = s.game;
    const w = Math.min(W - 8, 300);
    const hs = this.texts(s.run, o, w).map((t, i) => (t.boon === "rune"
      ? runeCardH(RUNES[o.rune!.id], w, i === this.open ? { hint: LC_TAKE } : {}) + (t.info.length ? 1 + t.info.length * 7 : 0)
      : cardH(t.lines.length, t.info.length, i === this.open)));
    return lcLayout(W, H, hs);
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
    ui.add({ id: "lcpick", r: { x: 0, y: 0, w: W, h: H }, block: true, onTap: () => { this.word = null; } });
    const cx = Math.round(W / 2);
    drawText(g, LC_TITLE, cx, L.top, C.yellow, { align: "center", outline: C.ink });
    drawText(g, LC_LINE, cx, L.top + 11, C.lime, { align: "center" });
    drawText(g, lcHint(o.day), cx, L.top + 22, C.slate4, { font: "3", align: "center" });
    const texts = this.texts(s.run, o, L.cardW);
    texts.forEach((t, i) => {
      const r = L.cards[i], open = i === this.open, hint = open ? LC_TAKE : null;
      if (t.boon === "rune") {
        const def = RUNES[o.rune!.id];
        drawRuneCard(g, r, def, { sub: `${runeTag(def)} · FREE`, open, hint: undefined });
        // the rune card's own body is drawRuneCard's; its details and the take bar follow its text
        const base = runeCardH(def, r.w, {}) - 4;
        drawBody(g, { ...r, y: r.y + base - HEAD }, [], t.info, hint);
        // CARD-2 (K2; K1): the shown keyword's definition, in the details' room (its lines' place: drawBody's y + 1), or,
        // with the details closed, over the effect lines' foot, growing up: whole, and the card keeps its size
        const k = open && this.word ? runeKeywordOf(def, this.word) : null;
        if (k) this.wordBox = drawRuneWordNote(g, r, t.info.length ? r.y + base + 1 : r.y + base - 2, t.info.length, runeWordLines(def, k, r.w - 10));
      } else if (t.boon === "part") {
        const def = ITEMS[o.part!];
        drawHead(g, r, RARITY_COLOR[def.rarity], itemIcon(def.id), def.name, RARITY_COLOR[def.rarity], lcPartSub(def.rarity), open);
        drawBody(g, r, t.lines, t.info, hint);
      } else {
        drawHead(g, r, C.lime, icons("{HULL}"), hullName(o.hull), C.lime, LC_HULL_SUB, open);
        drawBody(g, r, t.lines, t.info, hint);
      }
      ui.add({ id: `lcpick-${t.boon}`, r, onTap: () => this.tap(s, i, t.boon, o) });
      drawInfo(g, L.infos[i], this.info.has(i));
      // the ⓘ's target, over the card's: its box and 4 px round it, and on a phone a finger's square (tap.ts tapPx) in the
      // card's top-right corner (the rest of the card stays the card's)
      const ir = L.infos[i], side = Math.max(ir.w + 8, isPhone(s.game.view) ? tapPx(s.game.view) : 0);
      const right = r.x + r.w, tr = { x: right - side, y: r.y, w: side, h: Math.min(side, r.h) };
      ui.add({ id: `lcinfo-${t.boon}`, r: tr, onTap: () => {
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
      runeChipIcon(g, ui, "lcchip-rune", L.cards[i], RUNES[o.rune!.id], runeTapOf(s), () => {
        this.word = null; // CARD-2 (K2): the chip's line replaces a word's definition
        if (this.info.has(i)) this.info.delete(i);
        else this.info.add(i);
      }, { W, H }, s.game.canvas);
      // CARD-2 (REQ-BFG-081, K2): the open RUNE card's keywords are word targets, over the card's region (a tap on one shows
      // or hides its definition and never picks the card); a closed card's are not (a tap on it opens it, as before)
      if (i === this.open) {
        runeWordLayer(g, ui, "lcrune-", L.cards[i], RUNES[o.rune!.id], runeTapOf(s), this.word, this.word ? this.wordBox : null, (wd) => {
          this.word = this.word === wd ? null : wd;
        }, { W, H }, s.game.canvas, () => { this.word = null; });
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

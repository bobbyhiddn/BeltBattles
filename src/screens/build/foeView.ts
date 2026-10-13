// SCOUT-1c (REQ-BFG-082; presentation only): once a SCOUT road stop has revealed tonight's dusk foe ("SCOUTED: TONIGHT'S
// DUSK DECK", events.ts `reveal`, event.ts drawReveal, then REFIT), a tap on the build screen's NEXT BATTLE card opens
// that foe's carrier, read only, in the carrier's place at the build screen's own zoom: a tap on any part opens its face
// (battleScout.ts's one face path: faceText, partAt, readOnlyBlock, BattleFaces), CLOSE or empty space closes the face,
// BACK (where FIGHT is) or Escape returns to the build screen, until the dusk fight. Without a reveal the card is exactly
// as before: no tap action, no new words. The game still hides an unrevealed dusk deck until the fight (cap's call: a
// look at every foe at dawn would make the SCOUT stop's reward worthless; that would be a rules call).
// Nothing here writes the run, the shop, the foe or the seed: the view reads the stored foe's build and draws it.

import type { Run, DuskFoe } from "../../game/run";
import { storedFoe } from "../../game/day";
import { C } from "../../render/palette";
import { frame, type G } from "../../render/pixel";
import { drawText, textWidth } from "../../render/font";
import { CELL } from "../../sim/content";
import { defOf, itemByUid, kx, ky, rotOf, turretSlots } from "../../sim/deck";
import { footBox } from "../../sim/foot"; // SHAPES-1 (R1): a piece's turned box
import { localX, localY, sx, sy, TURRET_LY } from "../../render/frame";
import { cruiserModel, drawTurrets, type CruiserModel, type CruiserView } from "../../render/cruiser";
import { drawMachinery } from "../../render/machinery";
import { drawStillCarrier } from "../../render/ship";
import { DEFAULT_SKIN } from "../../render/styles";
import { tag } from "../../ui/captain";
import { duskStakes } from "../../ui/stakes"; // c099-hullon: drawFoeCard's hearts at stake
import { tapPx } from "../../ui/tap";
import { button, tapRect, type Rect } from "../../ui/ui";
import { BACK_LABEL, BattleFaces, partAt, type PartSel } from "../battleScout";
import { INFO_FREE_MIN } from "./keywords";
import { drawFoe } from "./inspector";
import { inCarrier, toDeck, toScreen, type BuildLayout } from "./layout";
import type { BuildScreen } from "./build";

/** The view's one line while no face is open (docs/TEXT-STYLE.md; the road fork's TAP A STOP TO INSPECT IT). */
export const FOE_HINT = "TAP A PART TO INSPECT IT";
/** The card's tag once its foe can be opened: the SCOUT stop's own word (SCOUTED: TONIGHT'S DUSK DECK). */
export const SCOUTED_TAG = "SCOUTED";

/**
 * Tonight's dusk foe when a SCOUT road stop revealed it today, else null. The signal is the run's own mark of the reveal:
 * events.ts pickChoice sets run.event.reveal when SPY wins, and the event (with its day) is saved with the run, so it
 * holds through a reload (event.ts reads the same mark). storedFoe alone is not the test: online it also fills when
 * tonight's ghost arrives during the build screen without a reveal (BuildScreen.update).
 */
export function scoutedFoe(run: Pick<Run, "event" | "day" | "dusk">): DuskFoe | null {
  const ev = run.event;
  return ev && ev.day === run.day && ev.reveal === true ? storedFoe(run as Run) : null;
}

/** The view's rects on build layout L with a finger's target tp (logical px): the NEXT BATTLE card (in its place, the
 *  view's header) and its tap target, BACK where FIGHT is and its target, and the face's area (portrait: the band and
 *  the shop's rows above the card, the build screen's band layout; landscape: the left column, top to foot). */
export function foeViewRects(L: BuildLayout, tp: number): { card: Rect | null; cardHit: Rect | null; back: Rect; backHit: Rect; area: Rect; band: boolean } {
  const screen = { x: 0, y: 0, w: L.W, h: L.H };
  const card = L.foe;
  // the card's target grows inside the band (portrait; over the idle hero card, never over the shop or the carrier) or
  // its column (landscape)
  const within = !card ? screen : L.portrait ? { x: 0, y: L.info.y, w: L.W, h: L.info.h } : { x: card.x - 2, y: 0, w: card.w + 4, h: L.fight.y - 1 };
  const cardHit = card ? tapRect(card, tp, within, tp) : null;
  const back = L.fight, backHit = tapRect(back, tp, screen, tp);
  const area = L.portrait
    ? { x: 3, y: 2, w: L.W - 6, h: Math.max(20, (card ? card.y : L.info.y + L.info.h) - 4) }
    : { x: L.info.x, y: 2, w: L.info.w, h: L.H - 4 };
  return { card, cardHit, back, backHit, area, band: L.portrait };
}

/** A part's point on screen (logical px) in the carrier's place on layout L: a turret's mount, an item's middle, a
 *  belt's middle cell (tooling, tests: the touchcheck's taps). */
export function foePartsOnScreen(L: BuildLayout, foe: DuskFoe): { sel: PartSel; name: string; x: number; y: number }[] {
  const b = foe.build, out: { sel: PartSel; name: string; x: number; y: number }[] = [];
  const at = (sel: PartSel, name: string, lx: number, ly: number): void => {
    const p = toScreen(L, sx(L.frame, lx, ly), sy(L.frame, lx, ly));
    out.push({ sel, name, x: p.x, y: p.y });
  };
  turretSlots(b).forEach((s, i) => { if (s.td) at({ kind: "turret", index: i }, "TURRET", (s.col0 + s.width / 2) * CELL, TURRET_LY); });
  // SHAPES-1 (R1): an item's middle is its turned footprint's box centre (a 1-cell rig's and a 2x2's as before)
  for (const p of b.items) { const bx = footBox(defOf(p), rotOf(p)); at({ kind: "item", uid: p.uid }, defOf(p).name, (p.x + bx.w / 2) * CELL, (p.y + bx.h / 2) * CELL); }
  b.routes.forEach((r, i) => { const k = r.cells[Math.floor(r.cells.length / 2)]; if (k !== undefined) at({ kind: "route", index: i }, "BELT ROUTE", (kx(k) + 0.5) * CELL, (ky(k) + 0.5) * CELL); });
  return out;
}

/** The NEXT BATTLE card (chrome.ts, both places it draws): inspector.ts drawFoe as before; with a revealed foe also a
 *  lime frame, the SCOUTED tag where it fits, and its tap target, which opens the view. */
export function drawFoeCard(g: G, s: BuildScreen, r: Rect): void {
  drawFoe(g, s.foe, r, s.note(), duskStakes(s.run)); // c099-hullon: RETUNE-1 run 2 (REQ-BFG-096), the hearts at stake on the NEXT BATTLE card
  const foe = scoutedFoe(s.run);
  if (!foe || foe !== s.foe || s.modalUp()) return; // without a reveal: exactly as before
  frame(g, r.x, r.y, r.w, r.h, C.lime);
  // the tag at the name row's right end (drawFoe's: a stand-in's portrait, the name, its STAND-IN tag), where it fits
  const standin = foe.kind === "standin", ps = r.h >= 32 ? 24 : 16, tw = textWidth(SCOUTED_TAG, "3") + 5;
  const used = r.x + 5 + (standin ? ps + 5 : 0) + textWidth(foe.name) + (standin ? 4 + textWidth("STAND-IN", "3") + 5 : 0);
  if (r.x + r.w - 4 - tw >= used + 4) tag(g, SCOUTED_TAG, r.x + r.w - 4 - tw, r.y + 14, C.lime);
  const R = foeViewRects(s.L, tapPx(s.game.view));
  s.game.ui.add({ id: "foecard", r: R.cardHit ?? r, onTap: () => s.foeView.show(), block: true });
}

/** The scouted foe's view on the build screen (BuildScreen.foeView). */
export class FoeView {
  open = false;
  /** The faces (their keyword state is this object's, keywords.ts keeps it per owner). */
  readonly faces = new BattleFaces();
  private model: { build: unknown; m: CruiserModel } | null = null;
  /** Tooling: the last frame's rects. */
  last: { card: Rect | null; back: Rect; area: Rect } | null = null;

  show(): void {
    this.open = true;
    this.faces.close();
  }

  close(): void {
    this.open = false;
    this.faces.close();
    this.last = null;
  }

  /** A press on the screen (no button took it): a part of the foe's carrier opens its face (or swaps to it); anything
   *  else closes the face. */
  press(s: BuildScreen, x: number, y: number): void {
    const foe = scoutedFoe(s.run);
    if (!foe) return this.close();
    const p = toDeck(s.L, x, y);
    const sel = partAt(foe.build, localX(s.L.frame, p.x, p.y), localY(s.L.frame, p.x, p.y));
    this.faces.open = sel ? { side: 1, sel } : null;
  }

  /** Escape closes the open face, then the view; other keys do nothing here. */
  key(k: string): void {
    if (k !== "Escape") return;
    if (this.faces.open) this.faces.close();
    else this.close();
  }

  /** Draw the view over the build screen's sea (BuildScreen.drawFrame, instead of the deck and its chrome). */
  draw(g: G, s: BuildScreen): void {
    const foe = scoutedFoe(s.run);
    if (!foe) return this.close();
    const L = s.L, ui = s.game.ui, tp = tapPx(s.game.view);
    if (!this.model || this.model.build !== foe.build) this.model = { build: foe.build, m: cruiserModel(foe.build) };
    const v: CruiserView = { side: 0, build: foe.build, model: this.model.m, frame: L.frame, t: s.t, tread: 0, skin: DEFAULT_SKIN };
    const o = this.faces.open;
    inCarrier(g, L, () => {
      drawStillCarrier(g, foe.hero, L.frame, 0, DEFAULT_SKIN.floor, DEFAULT_SKIN.carrier);
      drawMachinery(g, v);
      drawTurrets(g, v);
      if (o) markPart(g, L, foe, o.sel, Math.floor(s.t * 5) % 2 ? C.white : C.yellow);
    });
    const R = foeViewRects(L, tp);
    if (R.card) drawFoe(g, foe, R.card, s.note());
    button(ui, g, "foeback", R.back, BACK_LABEL, { onTap: () => this.close(), hit: R.backHit });
    if (!o) drawText(g, FOE_HINT, R.area.x + Math.floor(R.area.w / 2), R.area.y + R.area.h - 9, C.bone, { font: "3", align: "center", outline: C.ink });
    const free = (r: Rect): Rect | null => {
      if (L.portrait) return null;
      const q = { x: r.x + 2, y: r.y + r.h + 1, w: r.w - 4, h: R.area.y + R.area.h - (r.y + r.h + 1) };
      return q.h >= INFO_FREE_MIN ? q : null;
    };
    // CNT-DAY (REQ-BFG-082, REQ-BFG-079): the face on the run's day (s.run is the game's run: tonight's dusk is on it)
    this.faces.drawOn(g, s.game, foe.build, { area: R.area, band: R.band }, free, DEFAULT_SKIN.panel, null, s.run.day);
    this.last = { card: R.cardHit, back: R.backHit, area: R.area };
  }

  /** Tooling (bb.foeView, scripts/touchcheck.mjs): whether the card opens a foe, the view's state, the card's target (the
   *  card's own place without a reveal too: a tap there must change nothing), BACK's, the open face, and every part's
   *  point on screen (none without a reveal). */
  info(s: BuildScreen): { scouted: boolean; open: boolean; card: Rect | null; back: Rect; face: BattleFaces["last"]; parts: ReturnType<typeof foePartsOnScreen> } {
    const foe = scoutedFoe(s.run), R = foeViewRects(s.L, tapPx(s.game.view));
    return { scouted: !!foe, open: this.open, card: R.cardHit, back: R.backHit, face: this.faces.last, parts: foe ? foePartsOnScreen(s.L, foe) : [] };
  }
}

/** The open part framed on the foe's deck, as the build screen frames a selection (in the carrier's space). */
function markPart(g: G, L: BuildLayout, foe: DuskFoe, sel: PartSel, col: string): void {
  const f = L.frame, b = foe.build;
  const box = (lx: number, ly: number, w: number, h: number): void => {
    const x0 = Math.min(sx(f, lx, ly), sx(f, lx + w, ly + h)), y0 = Math.min(sy(f, lx, ly), sy(f, lx + w, ly + h));
    frame(g, Math.round(x0) - 1, Math.round(y0) - 1, Math.round(Math.abs(sx(f, lx + w, ly + h) - sx(f, lx, ly))) + 2, Math.round(Math.abs(sy(f, lx + w, ly + h) - sy(f, lx, ly))) + 2, col);
  };
  if (sel.kind === "item") {
    const p = itemByUid(b, sel.uid);
    if (p) { const bx = footBox(defOf(p), rotOf(p)); box(p.x * CELL, p.y * CELL, bx.w * CELL, bx.h * CELL); } // SHAPES-1: its turned box
  } else if (sel.kind === "route") {
    for (const k of b.routes[sel.index]?.cells ?? []) box(kx(k) * CELL, ky(k) * CELL, CELL, CELL);
  } else {
    const t = turretSlots(b)[sel.index];
    if (t?.td) { const r = t.td.kind === "heavy" ? 12 : 9, cx = (t.col0 + t.width / 2) * CELL; box(cx - r, TURRET_LY - r, 2 * r, 2 * r); }
  }
}

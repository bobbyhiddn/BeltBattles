// CUSTOM-2a (REQ-BFG-072): the CUSTOMIZE screen (CUSTOM-1's study, section 5; stills a and e). From the title. A preview
// on top: the player's carrier held still on the day's sea (the saved run's deck and day when one exists, else the first
// hero's starting deck on CALM SEA), its board plate, belts, machinery and turrets in the previewed styles, and under it
// a battle plate and a part-panel strip (a stat number and every keyword in its colour) in the previewed panel style.
// Then three tabs (FLOOR, BELTS, PANELS) and the open tab's five styles, one row each (46 px, a finger's height).
// - One tap on an open row wears it (saved at once). A tap on a locked row previews it without wearing it: the preview
//   says PREVIEW: NOT YOURS YET. in its own band, over no machinery, turret or plate (REVIEW-CUSTOM1 R7); another row,
//   another tab or BACK (and ESC) brings back what you wear.
// - A locked row says how to earn it (LOCKED: ...., capitals, at most 44 characters; R6's DIFFERENT HEROES), with its
//   progress as a number and a thin bar under the line (R8: 9/60 fills 15%). Long goals carry a LONG GOAL tag; a style
//   unlocked since the last visit a NEW tag (opening the screen marks them seen, so the title's NEW dot goes).
// Display only: styles change looks, never rules (game/profile.ts holds the choice; the sim never reads it).
// CUSTOM-3 (REQ-BFG-074): a fourth tab, CARRIER (the hull's styles, render/carrier.ts): its rows' swatch is the ship's bow
// at 1:1, and a row's tap restyles the preview's carrier (the stern band and the bow show around the board). The four
// tabs share the row the three had; on a phone each tab's target is still at least a finger tall.

import type { Game, Screen } from "../game/game";
import { loadRun } from "../game/run";
import { online } from "../game/session"; // PROFILE-UP (REQ-BFG-074 clause 4): a worn style uploads, online only
import {
  chosenSkin, counterValue, isOpen, loadProfile, markSeen, saveProfile, unseen, wear, type Profile,
} from "../game/profile";
import { defaultScale } from "../core/io";
import { settings } from "../core/settings";
import { HEROES, type HeroId } from "../sim/content";
import { PLAYABLE_HEROES, heroStartBuild } from "../sim/heroBuilds";
import type { Build } from "../sim/deck";
import { C } from "../render/palette";
import { frame as frameRect, rect, type G } from "../render/pixel";
import { ICON, ICON_COLOUR, drawText, textWidth, wrap } from "../render/font";
import { HULL_A, HULL_L, frameForHull, type Box, type DeckFrame } from "../render/frame";
import { heroPalette, styledTiles } from "../render/hull";
import { beltCorner, beltStraight, turntable } from "../render/sprites";
import { SeaBackdrop } from "../render/backdrop";
import { seaForDay, stillSeaSeed } from "../render/motion";
import { drawCarrierSwatch, drawStillCarrier, plateBox, stillShipPoint } from "../render/ship";
import { Fx } from "../render/fx"; // CUSTOM-3 tooling: the damage probe (the battle's own smoke and fire particles)
import { cruiserModel, drawTurrets, type CruiserModel, type CruiserView } from "../render/cruiser";
import { drawMachinery } from "../render/machinery";
import {
  SURFACES, floorStyle, panelSkin, styleKey, stylesOf, type AnyStyle, type BeltStyle, type CarrierStyle, type FloorStyle,
  type PanelSkin, type Skin, type Surface,
} from "../render/styles";
import { hullBar } from "../ui/hud";
import { button, statsPanel, tapRect, type Rect } from "../ui/ui";
import { isPhone, tapPx } from "../ui/tap";
import { TitleScreen } from "./title";

export const TAB_LABEL: Record<Surface, string> = { floor: "FLOOR", belt: "BELTS", panel: "PANELS", carrier: "CARRIER" };
/** The preview's notice (TEXT-STYLE 8.3: LABEL: TEXT.), drawn in its own band (R7). */
export const PREVIEW_NOTE = "PREVIEW: NOT YOURS YET.";
export const FOOTER = "STYLES CHANGE LOOKS ONLY. YOUR CHOICE IS SAVED.";
/** A row's height: a finger's (REVIEW-CUSTOM1 section 5). */
export const ROW_H = 46;
/** The logical height the portrait layout wants (CustomizeScreen.pickScale steps the scale down until it has it). */
export const WANT_H = 494;
const KEYWORDS: [string, string][] = [
  ["BURN", ICON_COLOUR[ICON.BURN]], ["STUN", ICON_COLOUR[ICON.STUN]], ["HEAT", ICON_COLOUR[ICON.HEAT]],
  // CARD-3 (REQ-BFG-107): the player's words, each in its mechanic's colour (SHIELD the soak's plate3, WARD the block's rune3)
  ["FRAY", ICON_COLOUR[ICON.FRAY]], ["SHIELD", ICON_COLOUR[ICON.PLATE]], ["PAIR", ICON_COLOUR[ICON.PAIR]],
  ["WARD", ICON_COLOUR[ICON.SHIELD]], ["HEAL", ICON_COLOUR[ICON.HEAL]], ["REGEN", ICON_COLOUR[ICON.REGEN]],
];

// ------------------------------------------------------------------------------------------------- the state

type Store = Pick<Storage, "getItem" | "setItem">;

export interface RowState {
  style: AnyStyle;
  key: string;
  open: boolean;
  worn: boolean;
  shown: boolean;
  fresh: boolean;
  /** A locked style's progress [have (at most need), need]; null when open. */
  progress: [number, number] | null;
}

/** CUSTOMIZE's choices, apart from the drawing (tests/customize.test.ts drives it): the open tab, the previewed style,
 *  wearing an open one (saved at once) and previewing a locked one (never worn). */
export class CustomizeState {
  tab: Surface = "floor";
  /** The style the preview shows on the open tab. */
  pick: string;
  /** Unlocks not yet announced when the screen opened (their rows show NEW). */
  readonly fresh: ReadonlySet<string>;

  constructor(readonly profile: Profile, private readonly store?: Store | null) {
    this.fresh = new Set(unseen(profile));
    if (this.fresh.size) {
      markSeen(profile); // the title's NEW dot goes once the screen has shown them
      saveProfile(profile, store);
    }
    this.pick = this.worn.floor;
  }

  /** What the player wears (the profile's open choices). */
  get worn(): Skin {
    return chosenSkin(this.profile);
  }

  /** What the preview shows: what you wear, with the open tab's previewed style. */
  get preview(): Skin {
    return { ...this.worn, [this.tab]: this.pick } as Skin;
  }

  /** The preview shows a style that isn't yours yet. */
  previewLocked(): boolean {
    return !isOpen(this.profile, this.tab, this.pick);
  }

  rows(): RowState[] {
    const worn = this.worn;
    return stylesOf(this.tab).map((style) => {
      const key = styleKey(this.tab, style.id);
      const open = isOpen(this.profile, this.tab, style.id);
      const need = style.need ?? 1;
      return {
        style, key, open, worn: worn[this.tab] === style.id, shown: this.pick === style.id, fresh: this.fresh.has(key),
        progress: open || !style.counter ? null : [Math.min(need, counterValue(this.profile, style.counter)), need],
      };
    });
  }

  tapTab(s: Surface): void {
    this.tab = s;
    this.pick = this.worn[s];
  }

  /** A row's tap: an open style is worn (and saved); a locked one is previewed only. */
  tapRow(id: string): "worn" | "preview" | "none" {
    if (!stylesOf(this.tab).some((s) => s.id === id)) return "none";
    this.pick = id;
    if (!isOpen(this.profile, this.tab, id)) return "preview";
    if (wear(this.profile, this.tab, id)) {
      saveProfile(this.profile, this.store);
      online()?.profileChanged?.("pick"); // PROFILE-UP: debounced; offline there is no session, so nothing
    }
    return "worn";
  }

  /** BACK (or ESC): the preview goes back to what you wear. */
  back(): void {
    this.pick = this.worn[this.tab];
  }
}

// ------------------------------------------------------------------------------------------------- the layout

export interface CustomizeLayout {
  W: number;
  H: number;
  portrait: boolean;
  /** A finger's target in logical px (ui/tap.ts tapPx: 44 CSS px; 0 for a mouse-only check). */
  tap: number;
  back: Rect;
  backHit: Rect;
  /** The preview's notice band: under the header, above the carrier's highest pixel (R7). */
  band: Rect;
  /** The carrier's deck frame and hull box (bow up, as the build screen draws it). */
  frame: DeckFrame;
  hull: Box;
  /** The battle plate and the part-panel strip, in the previewed panel style. */
  plate: Rect;
  keys: Rect;
  tabs: Rect[];
  /** The tabs' targets: each tab's column of the band they sit in, at least a finger tall. */
  tabHits: Rect[];
  /** The five rows: ROW_H tall each in portrait (a finger's height), 2 px apart. */
  rows: Rect[];
  footY: number;
}

/** The ship's stern stands this far past the board's top and bottom (render/carrier.ts STERN_B 152 vs the board's 140). */
const STERN_PAST = 6;
/** The tabs' drawn height. */
const TAB_H = 18;

/** CUSTOMIZE's frame on a W x H logical screen. Portrait: the header, the notice band, the carrier, the battle plate and
 *  the part-panel strip, the tabs, the five rows and the footer, top to bottom. Landscape and desktop: the preview in the
 *  left half, the tabs and the rows in the right half. `tap`: a finger's target (logical px). */
export function customizeLayout(W: number, H: number, portrait: boolean, tap = 0): CustomizeLayout {
  const colW = portrait ? W : Math.round(W / 2); // landscape: the preview in the left half
  const lx = portrait ? 6 : colW + 4, lw = portrait ? W - 12 : W - lx - 6;
  const back = { x: 3, y: 3, w: 34, h: 16 };
  const band = { x: 0, y: 24, w: colW, h: 9 };
  // BACK's target: a finger's, grown down over the band and the carrier's top where the header is shorter (nothing else
  // is a target there)
  const backHit = tapRect(back, tap, { x: 0, y: 0, w: Math.round(colW / 2), h: Math.max(band.y + band.h, tap + 6) }, tap);
  const hull = { x: Math.round(colW / 2 - HULL_A / 2), y: band.y + band.h + 1 + STERN_PAST, w: HULL_A, h: HULL_L };
  const frame = frameForHull(0, hull.x, hull.y);
  const plate = { x: 8, y: hull.y + hull.h + 2, w: colW - 16, h: 13 };
  const keys = { x: plate.x, y: plate.y + plate.h + 2, w: plate.w, h: keywordsHeight(plate.w) };
  // the tabs sit in a band at least a finger tall (each tab's target is its column of it), the rows under it
  const zoneTop = portrait ? keys.y + keys.h : band.y;
  const zoneH = Math.max(TAB_H + 9, tap);
  const tabY = zoneTop + Math.floor((zoneH - TAB_H) / 2);
  // CUSTOM-3: one tab per surface (four), 2 px apart; the last takes the remainder
  const n = SURFACES.length;
  const tw = Math.floor((lw - 2 * (n - 1)) / n);
  const tabs = SURFACES.map((_, i) => ({ x: lx + i * (tw + 2), y: tabY, w: i === n - 1 ? lw - (n - 1) * (tw + 2) : tw, h: TAB_H }));
  const tabHits = tabs.map((t) => ({ x: t.x, y: zoneTop, w: t.w, h: zoneH }));
  const top = zoneTop + zoneH;
  const footY = H - 9;
  const pitch = Math.max(32, Math.min(portrait ? ROW_H + 2 : 58, Math.floor((footY - 2 - top) / 5)));
  const rows = [0, 1, 2, 3, 4].map((i) => ({ x: lx, y: top + i * pitch, w: lw, h: pitch - 2 }));
  return { W, H, portrait, tap, back, backHit, band, frame, hull, plate, keys, tabs, tabHits, rows, footY };
}

/** The part-panel strip's height for a width (the stat number and the nine keywords, wrapped). */
export function keywordsHeight(w: number): number {
  return 4 + keywordLines(w).length * 7 + 2;
}

function keywordLines(w: number): [string, string][][] {
  const words: [string, string][] = [["147", C.white], ...KEYWORDS];
  const lines: [string, string][][] = [[]];
  let cx = 0;
  for (const wd of words) {
    const ww = textWidth(wd[0], "3");
    if (cx > 0 && cx + ww > w - 8) { lines.push([]); cx = 0; }
    lines[lines.length - 1].push(wd);
    cx += ww + 4;
  }
  return lines;
}

/** CUSTOMIZE's integer scale: the menu scale where the portrait layout has WANT_H logical px, else the largest smaller
 *  scale that does, never under one CSS px per logical px (as the title, titleLayout.ts titleScale). */
export function customizeScale(pw: number, ph: number, portrait: boolean, dpr = 1): number {
  const menu = defaultScale(pw, ph, portrait);
  if (!portrait) return menu;
  const least = Math.min(menu, Math.max(1, Math.ceil(dpr - 1e-6)));
  for (let s = menu; s > least; s--) if (Math.floor(ph / s) >= WANT_H) return s;
  return least;
}

// ------------------------------------------------------------------------------------------------- the screen

/** A 5 x 6 padlock. */
function lock(g: G, x: number, y: number, col: string): void {
  frameRect(g, x + 1, y, 3, 3, col);
  rect(g, x, y + 2, 5, 4, col);
  rect(g, x + 2, y + 3, 1, 2, C.ink);
}

export class CustomizeScreen implements Screen {
  private t = 0;
  private readonly sea = new SeaBackdrop();
  readonly state: CustomizeState;
  private readonly hero: HeroId;
  private readonly day: number;
  private readonly build: Build;
  private readonly model: CruiserModel;
  private L: CustomizeLayout | null = null;
  private left = false;

  constructor(private game: Game) {
    this.state = new CustomizeState(loadProfile());
    // the deck shown: the saved run's (CONTINUE) when one exists, else the first hero's starting deck (day 1, CALM SEA)
    const save = loadRun();
    this.hero = save ? save.hero : PLAYABLE_HEROES[0];
    this.day = save ? save.day : 1;
    this.build = save ? save.build : heroStartBuild(this.hero, 1);
    this.model = cruiserModel(this.build);
  }

  pickScale(pw: number, ph: number, portrait: boolean, dpr?: number): number {
    return customizeScale(pw, ph, portrait, dpr ?? (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  }

  update(dt: number): void {
    this.t += dt;
  }

  /** Back to the title (what you wear stays as saved; a previewed locked style is dropped). */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.state.back();
    this.game.go(new TitleScreen(this.game));
  }

  key(k: string): void {
    if (k === "Escape" || k === "Backspace") this.leave();
    else if (k === "1" || k === "2" || k === "3" || k === "4") this.state.tapTab(SURFACES[+k - 1]);
  }

  /** Tooling (read only; tests and the stills): the layout as drawn and the rows' state. CUSTOM-3: the preview carrier's
   *  ship-local origin on screen (`ship`: ship x 0, y 0) and its board plate's box (scripts/stylecheck.mjs). */
  info(): { tab: Surface; pick: string; worn: Skin; preview: Skin; locked: boolean; L: CustomizeLayout | null; ship: { x: number; y: number } | null; plate: Box | null; rows: { id: string; open: boolean; worn: boolean; shown: boolean; fresh: boolean; progress: [number, number] | null }[] } {
    const s = this.state, L = this.L;
    const o = L ? stillShipPoint(L.frame, 0, 0) : null;
    return {
      tab: s.tab, pick: s.pick, worn: s.worn, preview: s.preview, locked: s.previewLocked(), L,
      ship: o ? { x: o[0], y: o[1] } : null, plate: L ? plateBox(null as unknown as G, L.frame) : null, // HullPainter.map reads no context
      rows: s.rows().map((r) => ({ id: r.style.id, open: r.open, worn: r.worn, shown: r.shown, fresh: r.fresh, progress: r.progress })),
    };
  }

  draw(g: G): void {
    const { W, H, portrait, ui } = this.game;
    const tap = isPhone(this.game.view) ? tapPx(this.game.view) : 0; // a finger's target on a phone (ui/tap.ts)
    const L = (this.L = customizeLayout(W, H, portrait, tap));
    const s = this.state, sk = s.preview;
    // the day's sea, held still (one cached blit), as the build screen draws it
    this.sea.drawStill(g, { W, H, kind: seaForDay(this.day), dist: 0, t: 0, reduced: false, seed: stillSeaSeed(this.day), scale: this.game.view.scale, dpr: this.game.view.dpr });
    // the preview: the player's carrier held still, in the previewed floor, belts and carrier style
    drawStillCarrier(g, this.hero, L.frame, 0, sk.floor, sk.carrier);
    const v: CruiserView = { side: 0, build: this.build, model: this.model, frame: L.frame, t: settings.reducedMotion ? 0 : this.t, tread: 0, skin: sk };
    drawMachinery(g, v);
    drawTurrets(g, v);
    if (this.probe) this.drawProbe(g, L.frame, this.probe);
    // R7: a locked style's preview says so in its own band, above the carrier (no machinery, turret or plate under it)
    if (s.previewLocked()) {
      rect(g, L.band.x, L.band.y, L.band.w, L.band.h, C.ink);
      drawText(g, PREVIEW_NOTE, L.band.x + L.band.w / 2, L.band.y + 2, C.amber, { font: "3", align: "center" });
    }
    // the battle plate and the part-panel strip in the previewed panel style
    this.drawPlate(g, L.plate, panelSkin(sk.panel));
    this.drawKeywords(g, L.keys, panelSkin(sk.panel));
    // the header over the sea
    rect(g, 0, 0, W, 22, C.ink);
    rect(g, 0, 22, W, 1, C.slate1);
    button(ui, g, "back", L.back, "BACK", { font: "3", onTap: () => this.leave(), hit: L.backHit });
    drawText(g, "CUSTOMIZE", W / 2, 8, C.yellow, { align: "center", outline: C.ink });
    // the tabs (each one's target: its column of the band they sit in, at least a finger tall)
    SURFACES.forEach((surface, i) => {
      button(ui, g, `tab-${surface}`, L.tabs[i], TAB_LABEL[surface], { font: "3", active: s.tab === surface, onTap: () => s.tapTab(surface), hit: L.tabHits[i] });
    });
    // the rows
    s.rows().forEach((row, i) => this.drawRow(g, L.rows[i], row));
    drawText(g, FOOTER, L.portrait ? W / 2 : L.rows[0].x + L.rows[0].w / 2, L.footY, C.slate3, { font: "3", align: "center" });
  }

  /** CUSTOM-3 tooling (scripts/stylecheck.mjs only; nothing sets it in play): draw the battle's damage effects over the
   *  preview carrier's stern band and bow, as arenaReact.ts damageFx spawns them below 50% hull (light smoke, a few
   *  sparks) and below 25% (heavy smoke, embers, sparks), with the battle's own particles (render/fx.ts), a fixed seed and
   *  a fixed age, so the readability check measures them against each style's paint. */
  probe: 0 | 50 | 25 = 0;

  private drawProbe(g: G, f: DeckFrame, state: 50 | 25): void {
    const fx = new Fx();
    fx.reseed(state === 25 ? 0x2525 : 0x5050);
    const crit = state === 25;
    const sparky = [C.fire4, C.yellow, C.white] as const; // arenaReact.ts SPARKY
    // the visible ship: the stern band (ship x 0..22) above and below the funnels, and the bow (ship x 153..183)
    const pts: [number, number][] = [[3, 18], [10, 26], [16, 16], [5, 130], [12, 124], [17, 136], [157, 56], [163, 62], [157, 94], [164, 90], [170, 70]];
    for (const [x, y] of pts) {
      const [sx, sy] = stillShipPoint(f, x, y);
      fx.smoke(sx, sy, 1, crit, crit ? 16 : 10);
      if (crit) fx.embers(sx, sy, 2);
      fx.sparks(sx, sy, crit ? 4 : 2, sparky, 45);
    }
    fx.update(crit ? 0.1 : 0.12);
    fx.draw(g, 0, 0);
  }

  private drawPlate(g: G, r: Rect, p: PanelSkin): void {
    statsPanel(g, r, p.id);
    const name = HEROES[this.hero].name;
    const ty = r.y + Math.floor((r.h - 5) / 2);
    drawText(g, name, r.x + 3, ty, C.white, { font: "3" });
    const hpText = "132";
    drawText(g, hpText, r.x + r.w - 3, ty, C.bone, { font: "3", align: "right" });
    const bx = r.x + 3 + textWidth(name, "3") + 3;
    const bw = r.x + r.w - 3 - textWidth(hpText, "3") - 3 - bx;
    if (bw > 8) hullBar(g, bx, ty - 1, bw, 7, 132, 132, 160, C.lime, 0, this.t);
  }

  private drawKeywords(g: G, r: Rect, p: PanelSkin): void {
    statsPanel(g, r, p.id);
    keywordLines(r.w).forEach((line, j) => {
      let x = r.x + 4;
      for (const [wd, col] of line) {
        drawText(g, wd, x, r.y + 4 + j * 7, col, { font: "3" });
        x += textWidth(wd, "3") + 4;
      }
    });
  }

  private drawRow(g: G, r: Rect, row: RowState): void {
    const ui = this.game.ui;
    const s = row.style;
    statsPanel(g, r, "slate");
    if (row.shown) frameRect(g, r.x, r.y, r.w, r.h, row.open ? C.yellow : C.slate4);
    // the swatch, drawn by the game's own sprites (locked ones dimmed, with a padlock, but whole)
    const side = Math.min(r.h - 6, 40);
    const sw = { x: r.x + 3, y: r.y + 3, w: side, h: side };
    g.save();
    g.beginPath();
    g.rect(sw.x, sw.y, sw.w, sw.h);
    g.clip();
    this.swatch(g, sw, s);
    g.restore();
    frameRect(g, sw.x - 1, sw.y - 1, sw.w + 2, sw.h + 2, C.ink);
    if (!row.open) {
      g.globalAlpha = 0.55;
      rect(g, sw.x, sw.y, sw.w, sw.h, C.ink);
      g.globalAlpha = 1;
      lock(g, sw.x + Math.floor(sw.w / 2) - 2, sw.y + Math.floor(sw.h / 2) - 3, C.steel3);
    }
    const tx = sw.x + sw.w + 5, right = r.x + r.w - 5;
    drawText(g, s.name, tx, r.y + 5, row.open ? C.white : C.slate4);
    if (row.fresh) drawText(g, "NEW", right, r.y + 5, C.lime, { font: "3", align: "right" });
    else if (s.long && !row.open) drawText(g, "LONG GOAL", right, r.y + 5, C.plum4, { font: "3", align: "right" });
    if (row.open) {
      drawText(g, row.worn ? "YOU WEAR IT." : "TAP TO WEAR IT.", tx, r.y + 16, row.worn ? C.lime : C.bone, { font: "3" });
    } else {
      // TEXT-STYLE 8.3: a notice reads LABEL: TEXT. R8: the progress as a number and a thin bar under the line
      const [have, need] = row.progress ?? [0, 1];
      const num = `${have}/${need}`;
      lock(g, tx, r.y + 15, C.amber);
      const lines = wrap(`LOCKED: ${s.how}.`, right - tx - 8 - textWidth(num, "3") - 4, "3").slice(0, 2);
      lines.forEach((ln, i) => drawText(g, ln, tx + 8, r.y + 16 + i * 7, C.amber, { font: "3" }));
      drawText(g, num, right, r.y + 16, C.slate4, { font: "3", align: "right" });
      const by = r.y + 16 + lines.length * 7 + 1, bw = right - tx;
      if (by + 2 <= r.y + r.h - 2) {
        rect(g, tx, by, bw, 2, C.ink);
        const fill = Math.round((bw * have) / Math.max(1, need));
        if (fill > 0) rect(g, tx, by, fill, 2, C.amber);
      }
    }
    ui.add({ id: `style-${this.state.tab}-${s.id}`, r, onTap: () => { this.state.tapRow(s.id); } });
  }

  private swatch(g: G, r: Rect, s: AnyStyle): void {
    const tab = this.state.tab, worn = this.state.worn;
    const pal = heroPalette(this.hero);
    const fr = settings.reducedMotion ? 0 : Math.floor(this.t * 8);
    if (tab === "floor") {
      styledTiles(g, r.x - 4, r.y - 4, 4, 4, s as FloorStyle, 7, pal);
      // a belt across it in the worn belt style, so the tile edges read against a belt
      for (let i = 0; i < 4; i++) g.drawImage(beltStraight(1, fr, "normal", "n", worn.belt), r.x - 4 + i * 12, r.y + 20);
    } else if (tab === "belt") {
      beltLoop(g, r.x + Math.floor((r.w - 36) / 2), r.y + Math.floor((r.h - 36) / 2), s as BeltStyle, floorStyle(worn.floor), pal, fr);
    } else if (tab === "carrier") {
      // CUSTOM-3: the ship's bow at 1:1 on the sea's colour (the stem, the crest, ram, eyes or laurel, the bow wave)
      rect(g, r.x, r.y, r.w, r.h, C.night);
      drawCarrierSwatch(g, this.hero, (s as CarrierStyle).id, r.x, r.y, r.w);
    } else {
      const ps = s as PanelSkin;
      statsPanel(g, { x: r.x, y: r.y, w: r.w + 12, h: r.h + 12 }, ps.id);
      drawText(g, "147", r.x + 6, r.y + 7, C.bone, { font: "3" });
      drawText(g, "BURN", r.x + 6, r.y + 15, ICON_COLOUR[ICON.BURN], { font: "3" });
      drawText(g, "STUN", r.x + 6, r.y + 23, ICON_COLOUR[ICON.STUN], { font: "3" });
    }
  }
}

/** A 3 x 3 belt loop in a belt style on a floor: chevrons in all four directions, one fast and one slow tile beside the
 *  normal ones, and four corners with their turntables. */
export function beltLoop(g: G, x: number, y: number, belt: BeltStyle, floor: FloorStyle, pal: ReturnType<typeof heroPalette>, fr: number): void {
  styledTiles(g, x, y, 3, 3, floor, 7, pal);
  const b = belt.id;
  g.drawImage(beltStraight(1, fr, "normal", "n", b), x + 12, y);
  g.drawImage(beltStraight(2, fr, "normal", "f", b), x + 24, y + 12);
  g.drawImage(beltStraight(3, fr, "normal", "n", b), x + 12, y + 24);
  g.drawImage(beltStraight(0, fr, "normal", "s", b), x, y + 12);
  const corner = (a: number, out: number, cx: number, cy: number) => {
    g.drawImage(beltCorner(a, out, fr, "normal", "n", b), cx, cy);
    g.drawImage(turntable(Math.floor(fr / 6), "normal", b), cx, cy);
  };
  corner(3, 2, x + 24, y);
  corner(0, 3, x + 24, y + 24);
  corner(1, 0, x, y + 24);
  corner(2, 1, x, y);
}

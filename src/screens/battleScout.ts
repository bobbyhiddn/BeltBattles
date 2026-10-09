// SCOUT-1 (REQ-BFG-076; presentation only): scouting both carriers before a fight, and VIEW BATTLEFIELD after it.
//
// Scouting: after the sail-in the camera eases to CLOSE (today's framing) and the carriers sail steady; a tap on any part
// of either board opens its face, the build screen's own panel for that part, read only; FIGHT starts the 3-2-1 count
// and the camera eases back to WIDE. VIEW BATTLEFIELD: from the result card, the camera eases to CLOSE over both carriers
// as the fight left them; each part's face adds this fight's numbers for a turret (game/arena.ts partShots and
// partDamage), and each side's summary sits in the open floor beside its own carrier; BACK returns to the card, and the
// card's primary action is in the bar too. Nothing here reads or writes the sim beyond what the arena drew: the faces
// read each side's build (the enemy's from its own build and hero), the summaries the battle's side stats.

import type { Game } from "../game/game";
import type { Arena } from "../game/arena";
import type { ArenaMotion } from "../game/arenaMotion";
import type { BattleLayout } from "../game/battleLayout";
import type { Run } from "../game/run";
import type { Side } from "../sim/battle";
import { CELL, ITEMS } from "../sim/content";
import { inGrid, key, kx, ky, occupancy, turretSlots, type Build } from "../sim/deck";
import { itemByUid, defOf } from "../sim/deck";
import { TURRET_LY } from "../render/frame";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { beltIcon, itemIcon } from "../render/sprites";
import { skinOf } from "../render/styles";
import { button, panel, statsPanel, tapRect, type Rect } from "../ui/ui";
import { tapPx } from "../ui/tap";
import { fmtCount, fmtDmg } from "../ui/statFormat";
import type { Sel } from "./build/layout";
import {
  columnButtons, drawFamHead, drawLine, fitHead, itemPanel, planPanel, routePanel, selFamilies, turretPanel, visibleLines,
  type Block, type PanelPlan, type PanelText,
} from "./build/inspector";
import { slotIcon } from "./build/turretPanel";
import { INFO_FREE_MIN, drawKeywordLayer, keywordsPressed } from "./build/keywords";

/** A part on one side's board: a placed item (a factory or a rig), a belt route or an installed turret. */
export type PartSel = Extract<Sel, { kind: "item" } | { kind: "route" } | { kind: "turret" }>;
export interface FacePick { side: Side; sel: PartSel }

/** The scouting line (docs/TEXT-STYLE.md: game words in capitals). */
export const SCOUT_HINT = "SCOUT · TAP ANY PART";
export const SCOUT_HINT_SHORT = ["SCOUT", "TAP ANY PART"];
export const FIGHT_LABEL = "FIGHT";
export const VIEW_LABEL = "VIEW BATTLEFIELD";
export const BACK_LABEL = "BACK";

/** A side's build as the build screen's panels read it: they read the run's build and hero only, so a run made of the
 *  side's own build (the enemy's for an enemy part: its stars, its hero's class factor, its upgrades and runes) gives
 *  that side's face. Nothing of the player's own shop, cargo or gold is in it. */
export function faceRun(build: Build): Run {
  return { hero: build.hero, build, gold: 0, inventory: [], shop: { wagons: [], free: 0 } } as unknown as Run;
}

/** The part under a point in a board's deck px (its local frame): an installed turret's mount (above the grid's first
 *  row, at TURRET_LY; its hit box as the build screen's turretRect), else the tile's item or belt; null: nothing there. */
export function partAt(build: Build, lx: number, ly: number): PartSel | null {
  const slots = turretSlots(build);
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.td) continue; // an empty slot has no face
    const r = s.td.kind === "heavy" ? 12 : 9;
    const px = (s.col0 + s.width / 2) * CELL;
    if (lx >= px - r && lx < px + r && ly >= TURRET_LY - r && ly < TURRET_LY + r) return { kind: "turret", index: i };
  }
  const cx = Math.floor(lx / CELL), cy = Math.floor(ly / CELL);
  if (!inGrid(cx, cy)) return null;
  const occ = occupancy(build)[key(cx, cy)];
  if (occ.item >= 0) return { kind: "item", uid: occ.item };
  if (occ.route >= 0) return { kind: "route", index: occ.route };
  return null;
}

/** The part under a screen point (logical px) on either board, through the camera and the board's inverse. */
export function pickPart(a: Arena, m: ArenaMotion, x: number, y: number): FacePick | null {
  const p = [0, 0];
  for (const side of [0, 1] as Side[]) {
    if (!a.show[side]) continue;
    m.localAt(a, side, x, y, p);
    const sel = partAt(a.b.sides[side].build, p[0], p[1]);
    if (sel) return { side, sel };
  }
  return null;
}

/** Tooling (bb.parts): every part on `side`'s board with a point inside it on screen now (logical px): each installed
 *  turret's mount centre, each item's middle tile and each belt's middle cell. */
export function partsOnScreen(a: Arena, m: ArenaMotion, side: Side): { sel: PartSel; name: string; x: number; y: number }[] {
  const b = a.b.sides[side].build, out: { sel: PartSel; name: string; x: number; y: number }[] = [];
  const at = (sel: PartSel, name: string, lx: number, ly: number): void => {
    const [x, y] = m.localToScreen(a, side, lx, ly);
    out.push({ sel, name, x, y });
  };
  turretSlots(b).forEach((s, i) => {
    if (s.td) at({ kind: "turret", index: i }, s.turret ? ITEMS[s.turret.def]?.name ?? "TURRET" : "TURRET", (s.col0 + s.width / 2) * CELL, TURRET_LY);
  });
  for (const p of b.items) {
    const d = defOf(p), n = d.size ?? 1;
    at({ kind: "item", uid: p.uid }, d.name, (p.x + n / 2) * CELL, (p.y + n / 2) * CELL);
  }
  b.routes.forEach((r, i) => {
    const k = r.cells[Math.floor(r.cells.length / 2)];
    if (k !== undefined) at({ kind: "route", index: i }, "BELT ROUTE", (kx(k) + 0.5) * CELL, (ky(k) + 0.5) * CELL);
  });
  return out;
}

/** VIEW BATTLEFIELD's line for a turret: this fight's shots and the damage they dealt on landing (game/arena.ts); null for
 *  any other part (no event names a factory, rig or belt as the source of damage). */
export function fightLine(a: Pick<Arena, "partShots" | "partDamage">, pick: FacePick): string | null {
  if (pick.sel.kind !== "turret") return null;
  const n = a.partShots[pick.side][pick.sel.index] ?? 0, d = a.partDamage[pick.side][pick.sel.index] ?? 0;
  if (n === 0) return "THIS FIGHT: NO SHOTS.";
  return `THIS FIGHT: ${fmtDmg(d)} DAMAGE IN ${fmtCount(n)} SHOT${n === 1 ? "" : "S"}.`;
}

/**
 * A part's face, read only: the build screen's panel for it (inspector.ts itemPanel, rigPanel via itemPanel, turretPanel,
 * routePanel) on the side's own build, without its buttons (ROTATE, TO CARGO, SELL, UPGRADE, REMOVE CORE, REMOVE GEAR,
 * REMOVE BELT) and without the hints that tell its owner how to turn, move, drag or lay belt; its ⓘ view stays (the
 * keyword layer). `line`: VIEW BATTLEFIELD's fight line, kept, first. Null: no such part.
 */
export function faceText(build: Build, sel: PartSel, line: string | null = null): PanelText | null {
  const run = faceRun(build);
  const t = sel.kind === "turret" ? turretPanel(run, sel.index) : sel.kind === "item" ? itemPanel(run, sel.uid) : routePanel(run, sel.index);
  if (!t) return null;
  const head: Block[] = line ? [{ role: "note", text: line, keep: true, colour: C.yellow }] : [];
  const strip = (bs: readonly Block[]): Block[] => [...head, ...bs.flatMap((b) => { const r = readOnlyBlock(b); return r ? [r] : []; })];
  return { ...t, body: strip(t.body), variants: t.variants?.map((v) => ({ ...v, body: strip(v.body) })), labels: [CLOSE_LABEL] };
}

/** A panel block as a face shows it, read only: none of the owner's how-to hints (turn, move, drag, lay belt), nothing of
 *  the shop (a starting turret's free copy and whether it sells; a level's UPGRADE and its price: a level line keeps its
 *  level, "SPEED: LEVEL 1/4."); everything else as the build screen reads it. */
export function readOnlyBlock(b: Block): Block | null {
  if (b.role === "hint" || b.text.startsWith("STARTING TURRET:") || b.text.startsWith("UPGRADE")) return null;
  const cut = b.text.indexOf(" UPGRADE:");
  return cut > 0 ? { ...b, text: b.text.slice(0, cut) } : b;
}

/** The face's one button: it closes the face (as a tap on empty space does). */
export const CLOSE_LABEL = "CLOSE";

/** The face's icon, as the build screen's panel draws it. */
function faceIcon(build: Build, sel: PartSel): HTMLCanvasElement | null {
  if (sel.kind === "turret") return slotIcon(build, sel.index);
  if (sel.kind === "route") return beltIcon();
  const p = itemByUid(build, sel.uid);
  return p ? itemIcon(defOf(p).id) : null;
}

/** Where a face opens: in the open floor between the bows (L.gapBox), over neither board, so both boards stay in sight
 *  and a tap on any part of either swaps it. Portrait: the floor's rows across the screen, the build screen's band layout
 *  (its compact forms where the floor is short); its ⓘ view may grow into the room above it. Landscape: the floor's
 *  column between the carriers, down to the bar, sized to its text; its ⓘ view may grow down the column. In VIEW
 *  BATTLEFIELD an open face covers the summaries (they are back when it closes). */
export function faceArea(L: BattleLayout, side: Side): { area: Rect; band: boolean } {
  const gb = L.gapBox;
  if (L.portrait) return { area: { x: 2, y: gb.y + 1, w: L.W - 4, h: gb.h - 2 }, band: true };
  // a landscape floor too narrow for a face's text (the 1366x768 laptop's 61 px at x4): over the other carrier's
  // columns instead, sized to its text (the tapped part stays in sight; a part under it needs CLOSE first)
  if (gb.w < FACE_MIN_W) { const o = L.hulls[side === 0 ? 1 : 0]; return { area: { x: o.x + 2, y: 2, w: o.w - 4, h: L.bar.y - 4 }, band: false }; }
  return { area: { x: gb.x + 2, y: 2, w: gb.w - 4, h: L.bar.y - 4 }, band: false };
}

/** The narrowest landscape floor a face opens in (logical px): about 16 capitals of its 5x7 text a line. */
export const FACE_MIN_W = 100;

/** The room past a face's panel `r` its ⓘ view may grow into (keywords.ts infoFree's role): portrait, above the floor (over
 *  the enemy's board, while the view is open); landscape, down the column under the panel. Null: none (at least
 *  INFO_FREE_MIN rows). */
export function faceFree(L: BattleLayout, area: Rect, r: Rect): Rect | null {
  const q = L.portrait ? { x: r.x + 2, y: 2, w: r.w - 4, h: r.y - 3 } : { x: r.x + 2, y: r.y + r.h + 1, w: r.w - 4, h: area.y + area.h - (r.y + r.h + 1) };
  return q.h >= INFO_FREE_MIN ? q : null;
}

/** Each side's damage summary rows (label, value), from the same sources as the result card: the battle's side stats
 *  (DAMAGE DEALT, SHOTS: battleHud.ts resultRows reads the same SideStats through finishDay), its hull, its plating pool
 *  (SideState.plate.absorbed) and its SHIELD's stopped hits (SideState.blocked). */
export function summaryRows(a: Pick<Arena, "b">, side: Side): [string, string][] {
  const s = a.b.sides[side];
  return [
    ["DAMAGE DEALT", fmtDmg(s.stats.damage)],
    ["SHOTS", String(s.stats.shots)],
    ["HULL LOST", fmtDmg(Math.max(0, s.hull.max - Math.max(0, s.hull.hp)))],
    ["PLATING SOAKED", fmtDmg(s.plate.absorbed)],
    ["SHIELD STOPS", fmtCount(s.blocked ?? 0)],
  ];
}

const ROW = 7;

/** The summaries' rects in the open floor (L.gapBox), each beside its own carrier: portrait, across the screen (the floor
 *  runs edge to edge), the enemy's at the floor's top (under its bow) and yours at its bottom, two columns of rows;
 *  landscape, stacked in the floor between the carriers, the enemy's above yours, one column. */
export function summaryRects(L: BattleLayout): { r: [Rect, Rect]; cols: number; stacked: boolean } {
  const gb = L.gapBox;
  if (L.portrait) {
    const w = Math.min(L.W - 4, 220), cols = 2, h = 4 + ROW + Math.ceil(5 / cols) * ROW + 2;
    const x = Math.round((L.W - w) / 2);
    return { r: [{ x, y: gb.y + gb.h - 2 - h, w, h }, { x, y: gb.y + 2, w, h }], cols, stacked: false };
  }
  // one column; where the floor is too narrow for a label and its value on one row (the 1366x768 laptop), the value goes
  // under its label (a 6 px pitch)
  const w = Math.min(gb.w - 4, 160), stacked = w < SUMMARY_ROW_W, h = 4 + ROW + (stacked ? 5 * 2 * 6 : 5 * ROW) + 2;
  const x = Math.round(gb.x + (gb.w - w) / 2);
  const top = gb.y + Math.max(2, Math.floor((gb.h - 2 * h - 6) / 2));
  return { r: [{ x, y: top + h + 6, w, h }, { x, y: top, w, h }], cols: 1, stacked };
}

/** The narrowest summary that holds a label and its value on one row: PLATING SOAKED and a 5-figure value, 3x5. */
const SUMMARY_ROW_W = 96;

/** Draw both sides' summaries (VIEW BATTLEFIELD). */
export function drawSummaries(g: G, a: Arena, L: BattleLayout): void {
  const { r, cols, stacked } = summaryRects(L);
  for (const side of [0, 1] as Side[]) {
    const q = r[side];
    statsPanel(g, q, skinOf(a.views[side].skin).panel);
    drawText(g, side === 0 ? "YOU" : "FOE", q.x + 4, q.y + 3, side === 0 ? C.lime : C.red, { font: "3" });
    const rows = summaryRows(a, side), cw = Math.floor((q.w - 8) / cols);
    rows.forEach(([lb, v], i) => {
      if (stacked) {
        const y = q.y + 3 + ROW + i * 12;
        drawText(g, lb, q.x + 4, y, C.slate4, { font: "3" });
        drawText(g, v, q.x + q.w - 4, y + 6, C.white, { font: "3", align: "right" });
        return;
      }
      const col = cols === 2 ? i % 2 : 0, row = cols === 2 ? Math.floor(i / 2) : i;
      const x = q.x + 4 + col * cw, y = q.y + 3 + ROW + row * ROW;
      drawText(g, lb, x, y, C.slate4, { font: "3" });
      drawText(g, v, x + cw - (cols === 2 && col === 0 ? 6 : 0), y, C.white, { font: "3", align: "right" });
    });
  }
}

/** The scouting line in the open floor's middle (one line, or two where the floor is narrow). */
export function drawScoutHint(g: G, L: BattleLayout, k = 1): Rect {
  const gb = L.gapBox, cx = Math.round(gb.x + gb.w / 2), cy = Math.round(gb.y + gb.h / 2);
  const one = textWidth(SCOUT_HINT, "3") + 8 <= gb.w;
  const lines = one ? [SCOUT_HINT] : SCOUT_HINT_SHORT;
  const w = Math.max(...lines.map((s) => textWidth(s, "3"))) + 8, h = lines.length * 8 + 4;
  const r = { x: cx - Math.round(w / 2), y: cy - Math.round(h / 2), w, h };
  if (k <= 0) return r;
  g.globalAlpha = 0.86 * Math.min(1, k);
  rect(g, r.x, r.y, r.w, r.h, C.ink);
  g.globalAlpha = Math.min(1, k);
  lines.forEach((s, i) => drawText(g, s, cx, r.y + 3 + i * 8, i === 0 && s.startsWith("SCOUT") ? C.yellow : C.bone, { font: "3", align: "center" }));
  g.globalAlpha = 1;
  return r;
}

/** The tap target a finger needs here (TAP_CSS CSS px in this view's logical px). */
export const fingerPx = (game: Pick<Game, "view">): number => tapPx(game.view);

/** VIEW BATTLEFIELD's bar, where the playback bar sits: the fight's clock, BACK, and the card's primary action (null:
 *  none, a warlord's part pick still waiting on the card). Returns the buttons' hit rects (tooling). */
export function drawViewBar(g: G, game: Game, r: Rect, clock: string, back: () => void, primary: { label: string; onTap: () => void } | null): { back: Rect; primary: Rect | null } {
  const ui = game.ui, tp = fingerPx(game);
  const screen = { x: 0, y: 0, w: game.W, h: game.H };
  panel(g, r, "dark");
  const big = r.h >= 14, bh = r.h - 2, by = r.y + 1;
  drawText(g, clock, r.x + 4, r.y + Math.floor((r.h - (big ? 7 : 5)) / 2), C.bone, { font: big ? "5" : "3", outline: C.ink });
  const bw = Math.max(textWidth(BACK_LABEL, "3") + 12, 26);
  const x0 = r.x + 4 + textWidth(clock, big ? "5" : "3") + 4;
  const br = { x: x0, y: by, w: bw, h: bh };
  const bhit = tapRect(br, tp, screen, tp);
  button(ui, g, "viewback", br, BACK_LABEL, { font: "3", onTap: back, hit: bhit });
  if (!primary) return { back: bhit, primary: null };
  const pw = Math.min(r.x + r.w - 2 - (x0 + bw + 3), textWidth(primary.label, "3") + 12);
  const pr = { x: r.x + r.w - 2 - pw, y: by, w: pw, h: bh };
  const phit = tapRect(pr, tp, { ...screen, x: br.x + br.w + 1, w: game.W - (br.x + br.w + 1) }, tp);
  button(ui, g, "viewnext", pr, primary.label, { font: "3", primary: true, onTap: primary.onTap, hit: phit });
  return { back: bhit, primary: phit };
}

/**
 * The faces of one battle (scouting and VIEW BATTLEFIELD): which part is open, and its drawing. The open face's keyword
 * state (its ⓘ view, a word's definition) belongs to this object (keywords.ts keeps it per owner).
 */
export class BattleFaces {
  open: FacePick | null = null;
  /** Tooling: the last face drawn (its title, sub line and body text) and its rects. */
  last: { title: string; sub: string; lines: string[]; r: Rect; close: Rect | null; side: Side; sel: PartSel; line: string | null } | null = null;

  /** A press on the battlefield (not on a button or the face): a part opens its face (or swaps to it); anything else
   *  closes the face. True when a part was hit. */
  press(a: Arena, m: ArenaMotion, x: number, y: number): boolean {
    const p = pickPart(a, m, x, y);
    this.open = p;
    return !!p;
  }

  close(): void {
    this.open = null;
    this.last = null;
  }

  /** Every press the screen sees (Game.pointerDown, before routing): a press off a keyword target closes an open
   *  definition or ⓘ view, as the build screen's does. */
  pressed(region: string | null): void {
    keywordsPressed(this, region);
  }

  /** Draw the open face (if any) over the other carrier's half; `view`: VIEW BATTLEFIELD (its fight line). */
  draw(g: G, game: Game, a: Arena, L: BattleLayout, view: boolean): void {
    const o = this.open;
    if (!o) {
      this.last = null;
      return;
    }
    const build = a.b.sides[o.side].build;
    const line = view ? fightLine(a, o) : null;
    const t = faceText(build, o.sel, line);
    if (!t) {
      this.close();
      return;
    }
    const run = faceRun(build), tp = fingerPx(game);
    const fa = faceArea(L, o.side);
    const plan: PanelPlan = planPanel(t, fa.area, selFamilies(run, o.sel), { tap: tp, band: fa.band });
    const r = plan.r, ui = game.ui;
    // the panel wears its side's panel style, as its plate does (the player's chosen style; a foe's the default)
    statsPanel(g, r, skinOf(a.views[o.side].skin).panel);
    ui.add({ id: "face", r, block: true });
    rect(g, r.x + 4, r.y + 4, 16, 16, C.ink);
    rect(g, r.x + 5, r.y + 5, 14, 14, C.slate0);
    const icon = faceIcon(build, o.sel);
    if (icon) g.drawImage(icon, r.x + 12 - Math.floor(icon.width / 2), r.y + 12 - Math.floor(icon.height / 2));
    // its one button, CLOSE: under the text in the column, else on the header row (planPanel's places)
    const cr = plan.column ? columnButtons(1, r, tp)[0] : plan.rects ? plan.rects[0] : null;
    const hit = cr ? tapRect(cr, tp, r, tp) : null;
    if (cr) button(ui, g, "faceclose", cr, CLOSE_LABEL, { font: "3", onTap: () => this.close(), hit: hit ?? undefined });
    fitHead(g, t.title, r.x + 23, r.y + 4, plan.subMax, t.color, true);
    const subColor = t.subColor ?? C.slate4;
    if (plan.body.sub) fitHead(g, plan.body.sub, r.x + 23, r.y + 13, plan.subMax, plan.body.subColor ?? subColor, false);
    else if (plan.subs.length > 1) plan.subs.forEach((s, i) => fitHead(g, s, r.x + 23, r.y + 13 + i * 6, plan.subMax, subColor, false));
    else fitHead(g, t.subShort && textWidth(t.sub, "3") > plan.subMax ? t.subShort : t.sub, r.x + 23, r.y + 13, plan.subMax, subColor, false);
    drawFamHead(g, plan);
    const shown = visibleLines(plan);
    for (const v of shown) {
      if (v.line === "rule") rect(g, r.x + 5, v.y + 1, r.w - 10, 1, C.slate1);
      else drawLine(g, v.line, r.x + 5, v.y);
    }
    // the ⓘ button and the keyword targets (the build screen's layer, on this side's build: the enemy's runes too)
    drawKeywordLayer(g, this, ui, run, { show: o.sel, t, plan }, shown, hit ? [hit] : [], tp, game.canvas, faceFree(L, fa.area, r));
    this.last = {
      title: t.title, sub: t.sub, side: o.side, sel: o.sel, line, r: { ...r }, close: hit,
      lines: shown.flatMap((v) => (v.line === "rule" ? [] : [v.line.spans.map((s) => s.t).join("")])),
    };
  }
}

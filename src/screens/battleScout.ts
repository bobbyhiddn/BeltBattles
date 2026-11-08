// SCOUT-1 (REQ-BFG-076; presentation only): VIEW BATTLEFIELD after a fight. SCOUT-1b (REQ-BFG-082): the scouting pause
// before the fight is gone (the fight starts at once, as before SCOUT-1); the faces stay general (a face for any side's
// build), for VIEW BATTLEFIELD and for scouting from the build screen later.
//
// VIEW BATTLEFIELD: from the result card, the camera eases to CLOSE (today's framing) over both carriers as the fight left
// them and the carriers sail steady; a tap on any part of either board opens its face, the build screen's own panel for
// that part, read only, with this fight's numbers for a turret (game/arena.ts partShots and partDamage); each side's
// summary sits in the open floor beside its own carrier; BACK returns to the card, and the card's primary action is in
// the bar too. Nothing here reads or writes the sim beyond what the arena drew: the faces read each side's build (the
// enemy's from its own build and hero), the summaries the battle's side stats.

import type { Game } from "../game/game";
import type { Arena } from "../game/arena";
import type { ArenaMotion } from "../game/arenaMotion";
import type { BattleLayout } from "../game/battleLayout";
import type { Run } from "../game/run";
import type { Side } from "../sim/battle";
import { CELL, ITEMS } from "../sim/content";
import { inGrid, key, kx, ky, occupancy, turretSlots, type Build } from "../sim/deck";
import { itemByUid, defOf, rotOf } from "../sim/deck";
import { footBox } from "../sim/foot"; // SHAPES-1 (R1): a piece's turned box
import { TURRET_LY } from "../render/frame";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { beltIcon, itemIcon } from "../render/sprites";
import { skinOf, type PanelId } from "../render/styles";
import { button, panel, statsPanel, tapRect, type Rect } from "../ui/ui";
import { tapPx } from "../ui/tap";
import { TITLE_ROW_DY } from "../ui/spacing";
import { fmtCount, fmtDmg } from "../ui/statFormat";
import type { Sel } from "./build/layout";
import {
  columnButtons, drawFamHead, drawLine, fitHead, fitTitle, fitTitleRows, itemPanel, planPanel, routePanel, rulesWhole, selFamilies, turretPanel, visibleLines,
  explainPanel, type Block, type PanelPlan, type PanelText,
} from "./build/inspector";
import { slotIcon } from "./build/turretPanel";
import { shapedPiece } from "./build/shapeEdit"; // PRESENT-1 S1 (f): a shaped piece's face shows its shape picture
import { shapePic } from "../ui/shapePic";
import { INFO_FREE_MIN, drawKeywordLayer, keywordsPressed } from "./build/keywords";
import { textDay } from "../ui/fightDay"; // CNT-DAY (REQ-BFG-082, REQ-BFG-079): a face's numbers on the fight's day

/** A part on one side's board: a placed item (a factory or a rig), a belt route or an installed turret. */
export type PartSel = Extract<Sel, { kind: "item" } | { kind: "route" } | { kind: "turret" }>;
export interface FacePick { side: Side; sel: PartSel }

/** VIEW BATTLEFIELD's words (docs/TEXT-STYLE.md: game words in capitals). */
export const VIEW_LABEL = "VIEW BATTLEFIELD";
export const BACK_LABEL = "BACK";

/** A side's build as the build screen's panels read it: they read the run's build and hero only, so a run made of the
 *  side's own build (the enemy's for an enemy part: its stars, its hero's class factor, its upgrades and runes) gives
 *  that side's face. Nothing of the player's own shop, cargo or gold is in it. CNT-DAY (REQ-BFG-082, REQ-BFG-079): `day`,
 *  the day the face is read on (a fight's: fightDay.ts textDay; the scouted foe's: the run's), as the panels read run.day
 *  (inspector.ts textOpts, keywords.ts panelPiece): their numbers x D(d) and S(d) on that day. No day: day 1's, as before. */
export function faceRun(build: Build, day?: number): Run {
  return { hero: build.hero, build, gold: 0, inventory: [], shop: { wagons: [], free: 0 }, day } as unknown as Run;
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
    const d = defOf(p), bx = footBox(d, rotOf(p)); // SHAPES-1 (R1): its turned box's centre (1-cell and 2x2 as before)
    at({ kind: "item", uid: p.uid }, d.name, (p.x + bx.w / 2) * CELL, (p.y + bx.h / 2) * CELL);
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
 * keyword layer). `line`: VIEW BATTLEFIELD's fight line, kept, first. Null: no such part. CNT-DAY (REQ-BFG-082): `day`, the
 * day it is read on (faceRun's), so its numbers are that day's; no day: day 1's, as before.
 */
export function faceText(build: Build, sel: PartSel, line: string | null = null, day?: number, owner?: string): PanelText | null {
  const run = faceRun(build, day);
  const t = sel.kind === "turret" ? turretPanel(run, sel.index) : sel.kind === "item" ? itemPanel(run, sel.uid) : routePanel(run, sel.index);
  if (!t) return null;
  const head: Block[] = line ? [{ role: "note", text: line, keep: true, colour: C.yellow }] : [];
  const strip = (bs: readonly Block[]): Block[] => [...head, ...bs.flatMap((b) => { const r = readOnlyBlock(b); return r ? [r] : []; })];
  // EXPLAIN-1 (REQ-BFG-089), at the merge: a face hides what its card hides (flavour into NOTES; a plain rig's rig
  // sentence), run after readOnlyBlock has stripped the hints, so no hint lands in NOTES.
  const def = sel.kind === "item" ? itemByUid(build, sel.uid)?.def : undefined;
  // ENCHANT-2W (REQ-BFG-085; W5, E2-02's WHOSE rider): `owner`, a FOE's name (battle.ts VIEW BATTLEFIELD's foe side, foeView.ts the scouted foe): the sub line names whose part it is
  // (`SPARKFANG'S HEAVY TURRET IN SLOT 1`), and so does its short form. Absent (your own parts, the text sheet, every other caller): the sub lines exactly as before.
  // The desk column breaks a sub wider than it after the owner (planPanel: PanelText.subOwner), so the sub is never cut; POLISH-3b: your own parts' subs break at a space as well (facePlan's `wrap`).
  const sub = owner ? { sub: ownerSub(owner, t.sub), subOwner: `${owner}'S`, ...(t.subShort ? { subShort: ownerSub(owner, t.subShort) } : {}) } : {};
  const vsub = (v: { sub?: string }): { sub?: string } => (owner && v.sub ? { sub: ownerSub(owner, v.sub) } : {}); // a compact form's own sub line (a rig's IDLE warning) names the owner too
  return explainPanel({ ...t, ...sub, body: strip(t.body), variants: t.variants?.map((v) => ({ ...v, ...vsub(v), body: strip(v.body) })), labels: [CLOSE_LABEL] }, def);
}

/** ENCHANT-2W (REQ-BFG-085; W5): a foe part's sub line with its owner in front, in the house possessive (docs/TEXT-STYLE.md): `SPARKFANG'S HEAVY TURRET IN SLOT 1`. */
export const ownerSub = (owner: string, sub: string): string => `${owner}'S ${sub}`;

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

/**
 * POLISH-3 (REQ-BFG-089; Q2 (b)): the plan a face is drawn from. A face keeps every one of its own rule lines: where the column's plan (the 5x7 face, with a shorter form of the same text where the
 * full one does not fit: CORE and GEAR rows without their rule lines) is not the full rule text (rulesWhole: fullText less the belt rows) and the same text planned with `small` (the 3x5 face: planPanel's option, PRESENT-2 F's rule
 * for a panel grown from the band) is, the face is drawn from that plan. Every other face (the band's, a plan that is the full text already, one the 3x5 face cannot make whole either) is planPanel's
 * own plan, as before. `tap`: a finger's target (tapPx). Pure (drawOn, tests).
 * POLISH-3b (REQ-BFG-089; P2, the review's N1): and where NEITHER plan is the rule text whole, the face is drawn from the plan that gives away fewer ability blocks (abilityGone), the 3x5 plan on a tie or a win.
 * SPARKFANG's RISING SCRAP CANNON (turret slot 0, days 8/12/16) gave away its stat row and `IT TAKES BELTS ON COLUMNS` in the 5x7 plan's shorter form (five ability blocks of its full text); the 3x5 plan gives away `SPEED: LEVEL 2/4.` only.
 * POLISH-3b (REQ-BFG-087; P1, cap's ruling 1 on POLISH-3's question 1): every battle face is planned with planPanel's `wrap`, yours as well as the foe's: in the column (the 100 px one at 1920x1080) a title wider than its room
 * breaks onto a second 3x5 row (`RISING RAMPART` / `CANNON ★`) and a sub wider than its room breaks at a space (`HEAVY TURRET IN` / `SLOT 1`), so the star and the slot number show and nothing is cut with a dot.
 */
export function facePlan(t: PanelText, fa: { area: Rect; band: boolean }, families: Parameters<typeof planPanel>[2], tap: number): PanelPlan {
  const plan = facePlanWith(t, fa, families, tap);
  if (!plan.column || rulesWhole(plan) || !t.labels.length) return plan;
  // POLISH-4 (REQ-BFG-089; P4-3, cap's ruling 2): the CLOSE row yields to the piece's own ability lines. On a landscape phone at a pixel ratio of 2.625 to 3 the face is the whole floor between the boards (106-122 x 162-169 px) and the finger-sized
  // CLOSE row (19-22 px and the 6 under the text) took the room of `IT TAKES BELTS ON COLUMNS ...` and `SPEED: LEVEL n/4.`: 156 of 2,242 own faces at 851x393@2.75, 127 at 915x412@2.625, 74 at 926x428@3, 36 at 812x375@3 and 6 at 1920x1080 were short
  // of a rule line. Where the face with its row is not the rule text whole and the same face WITHOUT the row is, or gives away fewer ability blocks, it is drawn without the row (`bare`); every other face keeps its CLOSE row exactly as before.
  // A press on the battlefield off any part closes a face (BattleFaces.press) and so does BACK: nothing is added for it, no hint and no words.
  const bare = facePlanWith({ ...t, labels: [] }, fa, families, tap);
  return rulesWhole(bare) || abilityGone(t, bare) < abilityGone(t, plan) ? { ...bare, bare: true } : plan;
}

/** facePlan as POLISH-3b left it (the face with its CLOSE row): planPanel's 5x7 plan, the 3x5 plan where that is the rule text whole, else the one that gives away fewer ability blocks (the 3x5 on a tie).
 *  POLISH-4 (REQ-BFG-089; P4-4, cap's ruling 3): and a belt's face, where its plan is the rule text whole but gives hit rows away, takes the 3x5 plan if that gives away fewer (hitRowsGone). */
function facePlanWith(t: PanelText, fa: { area: Rect; band: boolean }, families: Parameters<typeof planPanel>[2], tap: number): PanelPlan {
  const plan = planPanel(t, fa.area, families, { tap, band: fa.band, wrap: true });
  if (!plan.column) return plan;
  // POLISH-4 (REQ-BFG-089; P4-4, cap's ruling 3): a belt's hit rows are the belt's own text (planRung's reason for the build screen's panel). In the column (the desk, the laptop, a landscape phone) the 5x7 plan gives whole trailing rows away
  // (`+N MORE HIT TILES`) on 84 of 316 belts at 1920x1080 (519 rows), 63 at 1366x768 and 844x390, 131 at 851x393@2.75; a face tall enough for every row does not exist (+44 px at the median, +149 at most, where the face is 198 of 216 px).
  // The 3x5 plan gives away fewer (519 -> 290 rows at 1920x1080, 389 -> 203 at 1366x768 and 844x390): it is the face where it does, though no belt becomes whole by it. The build screen's belt panel (planRung) is as it was.
  if (rulesWhole(plan)) {
    if (!hitRowsGone(plan)) return plan;
    const sm = planPanel(t, fa.area, families, { tap, band: fa.band, small: true, wrap: true });
    return rulesWhole(sm) && hitRowsGone(sm) < hitRowsGone(plan) ? sm : plan;
  }
  const small = planPanel(t, fa.area, families, { tap, band: fa.band, small: true, wrap: true });
  if (rulesWhole(small)) return small;
  return abilityGone(t, small) <= abilityGone(t, plan) ? small : plan;
}

/**
 * POLISH-3b (REQ-BFG-089; P2): how many ability blocks of a face's full text (variant 0: `t.body`) the plan does not draw whole. A block it leaves out, cuts, or draws in a shorter form (a compact variant's: the 5x7 plan's
 * variant 6 has no rule lines of its own) counts as given away: a block is drawn when a block of the same role, words and label is shown and every one of its lines is within the plan's room. Pure (facePlan, tests).
 */
export function abilityGone(t: Pick<PanelText, "body">, plan: PanelPlan): number {
  const drawn = new Set(visibleLines(plan).map((v) => v.line));
  const keyOf = (b: Block): string => `${b.role}|${b.text}|${b.label ?? ""}`;
  const shown = new Set(plan.body.shown.filter((l) => l.lines.length > 0 && l.lines.every((ln) => drawn.has(ln))).map((l) => keyOf(l.b)));
  return t.body.filter((b) => b.role === "ability" && !shown.has(keyOf(b))).length;
}

/** POLISH-4 (REQ-BFG-089; P4-4): how many of a belt's hit rows (the `trim` blocks that are not JOINS rows) the plan gives away: the rows `+N MORE HIT TILES` counts. Pure (facePlan, tests). */
export function hitRowsGone(plan: Pick<PanelPlan, "body">): number {
  return plan.body.dropped.filter((b) => b.trim && !b.join).length;
}

/** The face's icon, as the build screen's panel draws it. */
export function faceIcon(build: Build, sel: PartSel): HTMLCanvasElement | null {
  if (sel.kind === "turret") return slotIcon(build, sel.index);
  if (sel.kind === "route") return beltIcon();
  const p = itemByUid(build, sel.uid);
  // PRESENT-1 S1 (f): as the build screen's panel (inspector.ts panelIcon): a shaped piece shows its shape picture (ui/shapePic.ts), in the header's 16x16 box, where every other piece keeps its icon
  return p ? (shapedPiece(defOf(p).id) ? shapePic(defOf(p).id) : itemIcon(defOf(p).id)) : null;
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

/** The room past a face's panel `r` its ⓘ view may grow into (keywords.ts infoFree's role), never over a board (a tap
 *  there must reach a part, to swap the face): landscape, down the column under the panel; portrait, none (the floor's
 *  rows are the panel's own: the view pages inside it). Null: none (at least INFO_FREE_MIN rows). */
export function faceFree(L: BattleLayout, area: Rect, r: Rect): Rect | null {
  if (L.portrait) return null;
  const q = { x: r.x + 2, y: r.y + r.h + 1, w: r.w - 4, h: area.y + area.h - (r.y + r.h + 1) };
  return q.h >= INFO_FREE_MIN ? q : null;
}

/** Each side's damage summary rows (label, value), from the same sources as the result card: the battle's side stats
 *  (DAMAGE DEALT, SHOTS: battleHud.ts resultRows reads the same SideStats through finishDay), its hull, its plating pool
 *  (SideState.plate.absorbed) and its SHIELD's stopped hits (SideState.blocked). WIND-1 (REQ-BFG-093, REQ-BFG-097): WIND
 *  TAKEN (SideStats.windTaken: the dark wind's damage to this hull, the same on both sides); PLATING SOAKED and SHIELD STOPS
 *  are PLATE BLOCKED and SHIELD BLOCKED, the words their pops say (arenaReact BLOCKED). */
export function summaryRows(a: Pick<Arena, "b">, side: Side): [string, string][] {
  const s = a.b.sides[side];
  return [
    ["DAMAGE DEALT", fmtDmg(s.stats.damage)],
    ["SHOTS", String(s.stats.shots)],
    ["HULL LOST", fmtDmg(Math.max(0, s.hull.max - Math.max(0, s.hull.hp)))],
    ["WIND TAKEN", fmtDmg(s.stats.windTaken)],
    // CARD-3 (REQ-BFG-107): the soak layer's and the block's words, as their pops' colours (was PLATE and SHIELD BLOCKED)
    ["SHIELD BLOCKED", fmtDmg(s.plate.absorbed)],
    ["WARD BLOCKED", fmtCount(s.blocked ?? 0)],
  ];
}

/** WIND-1 (REQ-BFG-093): the summaries' row count (summaryRows'), which sizes their rects. */
export const SUMMARY_ROWS = 6;

const ROW = 7;

/** The summaries' rects in the open floor (L.gapBox), each beside its own carrier: portrait, across the screen (the floor
 *  runs edge to edge), the enemy's at the floor's top (under its bow) and yours at its bottom, two columns of rows;
 *  landscape, stacked in the floor between the carriers, the enemy's above yours, one column. */
export function summaryRects(L: BattleLayout): { r: [Rect, Rect]; cols: number; stacked: boolean } {
  const gb = L.gapBox;
  if (L.portrait) {
    const w = Math.min(L.W - 4, 220), cols = 2, h = 4 + ROW + Math.ceil(SUMMARY_ROWS / cols) * ROW + 2; // WIND-1: from the rows (was 5)
    const x = Math.round((L.W - w) / 2);
    return { r: [{ x, y: gb.y + gb.h - 2 - h, w, h }, { x, y: gb.y + 2, w, h }], cols, stacked: false };
  }
  // one column; where the floor is too narrow for a label and its value on one row (the 1366x768 laptop), the value goes
  // under its label (a 6 px pitch)
  const w = Math.min(gb.w - 4, 160), stacked = w < SUMMARY_ROW_W, h = 4 + ROW + (stacked ? SUMMARY_ROWS * 2 * 6 : SUMMARY_ROWS * ROW) + 2; // WIND-1: from the rows
  const x = Math.round(gb.x + (gb.w - w) / 2);
  // WIND-1 (REQ-BFG-093): where the floor's rows can't hold both (the 1366x768 laptop's stack with its 6 rows), the column
  // between the carriers from the screen's top to the bar, as a face uses it (faceArea), 2 px between the two
  const fits = 2 * h + 6 + 4 <= gb.h, gap = fits ? 6 : 2;
  const top = fits ? gb.y + Math.max(2, Math.floor((gb.h - 2 * h - 6) / 2)) : 2 + Math.max(0, Math.floor((L.bar.y - 4 - 2 * h - gap) / 2));
  return { r: [{ x, y: top + h + gap, w, h }, { x, y: top, w, h }], cols: 1, stacked };
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

/** The tap target a finger needs here (TAP_CSS CSS px in this view's logical px). */
export const fingerPx = (game: Pick<Game, "view">): number => tapPx(game.view);

/** VIEW BATTLEFIELD's bar, where the playback bar sits: the fight's clock, BACK, and the card's primary action (null:
 *  none, a warlord's part pick still waiting on the card). Returns the buttons' hit rects (tooling), and their drawn buttons (`backBtn`, `primaryBtn`: what a hit rect that is trimmed must still hold;
 *  POLISH-6 P6-2 (REQ-BFG-089): ON TO DAWN's too, its tap target lay under an open face at the five landscape phones like BACK's did). */
export function drawViewBar(g: G, game: Game, r: Rect, clock: string, back: () => void, primary: { label: string; onTap: () => void } | null): { back: Rect; backBtn: Rect; primary: Rect | null; primaryBtn: Rect | null } {
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
  if (!primary) return { back: bhit, backBtn: br, primary: null, primaryBtn: null };
  const pw = Math.min(r.x + r.w - 2 - (x0 + bw + 3), textWidth(primary.label, "3") + 12);
  const pr = { x: r.x + r.w - 2 - pw, y: by, w: pw, h: bh };
  const phit = tapRect(pr, tp, { ...screen, x: br.x + br.w + 1, w: game.W - (br.x + br.w + 1) }, tp);
  button(ui, g, "viewnext", pr, primary.label, { font: "3", primary: true, onTap: primary.onTap, hit: phit });
  return { back: bhit, backBtn: br, primary: phit, primaryBtn: pr };
}

/**
 * POLISH-5 (REQ-BFG-089; P5-4): a button's hit rect `hit` (tapRect grew it past the drawn button `keep`: BACK's is 59 x 46 CSS px at 851x393@2.75, 11 px above the bar) trimmed so it no longer meets `over`, an open face drawn after the bar
 * (its region is added last, so it wins a press in the overlap: 26 x 11 CSS px of BACK's rect lay under the face's foot, 1,166 of 10,856 sampled points reached the face). The tooling reports the rect, so the rect it reports is now what a press reaches.
 * The largest rect inside `hit` that clears `over` and still holds `keep`, cut from one side only (the drawn button and its centre are never cut); `hit` is changed in place (the button's region and the tooling's rect are the one object).
 * No overlap, or no cut that holds `keep`: nothing changes. True when it cut. Pure but for `hit`.
 */
export function trimHit(hit: Rect, over: Rect | null, keep: Rect): boolean {
  if (!over) return false;
  const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  if (!meets(hit, over)) return false;
  const cuts: Rect[] = [
    { x: hit.x, y: over.y + over.h, w: hit.w, h: hit.y + hit.h - (over.y + over.h) }, // the face lies over the top of the rect: keep what is under its foot
    { x: hit.x, y: hit.y, w: hit.w, h: over.y - hit.y }, // over the bottom
    { x: over.x + over.w, y: hit.y, w: hit.x + hit.w - (over.x + over.w), h: hit.h }, // over the left
    { x: hit.x, y: hit.y, w: over.x - hit.x, h: hit.h }, // over the right
  ];
  const holds = (c: Rect): boolean => c.w > 0 && c.h > 0 && c.x >= hit.x && c.y >= hit.y && c.x + c.w <= hit.x + hit.w && c.y + c.h <= hit.y + hit.h && !meets(c, over)
    && c.x <= keep.x && c.y <= keep.y && c.x + c.w >= keep.x + keep.w && c.y + c.h >= keep.y + keep.h;
  let best: Rect | null = null;
  for (const c of cuts) if (holds(c) && (!best || c.w * c.h > best.w * best.h)) best = c;
  if (!best) return false;
  hit.x = best.x; hit.y = best.y; hit.w = best.w; hit.h = best.h;
  return true;
}

/**
 * The faces of one battle (VIEW BATTLEFIELD; general: any side's build): which part is open, and its drawing. The open face's keyword
 * state (its ⓘ view, a word's definition) belongs to this object (keywords.ts keeps it per owner).
 */
export class BattleFaces {
  open: FacePick | null = null;
  /** Tooling: the last face drawn (its title, sub line and body text) and its rects. */
  last: { title: string; sub: string; subDrawn: string; lines: string[]; r: Rect; close: Rect | null; side: Side; sel: PartSel; line: string | null } | null = null;

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

  /** Draw the open face (if any) over the other carrier's half; `view`: VIEW BATTLEFIELD (its fight line).
   *  ENCHANT-2W (REQ-BFG-085; W5): `foe`, the foe's name: a face on the FOE's side (side 1) names whose part it is in its sub line; your own side's faces are as before. */
  draw(g: G, game: Game, a: Arena, L: BattleLayout, view: boolean, foe?: string): void {
    const o = this.open;
    if (!o) {
      this.last = null;
      return;
    }
    const fa = faceArea(L, o.side);
    // the panel wears its side's panel style, as its plate does (the player's chosen style; a foe's the default)
    // CNT-DAY (REQ-BFG-082, REQ-BFG-079): its numbers on the fight's day (textDay), as the fight line's damage landed
    this.drawOn(g, game, a.b.sides[o.side].build, fa, (r) => faceFree(L, fa.area, r), skinOf(a.views[o.side].skin).panel, view ? fightLine(a, o) : null, textDay(a.b), o.side === 1 ? foe : undefined);
  }

  /** SCOUT-1c (REQ-BFG-082): the one face path. The open face on `build` in `fa` (planPanel's area, and whether it is a
   *  band), its ⓘ view growing into free(panel rect), in panel style `style`; `line`: VIEW BATTLEFIELD's fight line. The
   *  battle (draw above) and the build screen's scouted foe (build/foeView.ts) both draw through it. CNT-DAY: `day`, the
   *  day its text is read on (faceRun's), for the text, its planned box and its keyword layer alike. ENCHANT-2W (W5): `owner`, a foe's name for its sub line (faceText). */
  drawOn(g: G, game: Game, build: Build, fa: { area: Rect; band: boolean }, free: (r: Rect) => Rect | null, style: PanelId, line: string | null, day?: number, owner?: string): void {
    const o = this.open;
    if (!o) {
      this.last = null;
      return;
    }
    const t = faceText(build, o.sel, line, day, owner);
    if (!t) {
      this.close();
      return;
    }
    const run = faceRun(build, day), tp = fingerPx(game);
    const plan: PanelPlan = facePlan(t, fa, selFamilies(run, o.sel), tp);
    const r = plan.r, ui = game.ui;
    statsPanel(g, r, style);
    ui.add({ id: "face", r, block: true });
    rect(g, r.x + 4, r.y + 4, 16, 16, C.ink);
    rect(g, r.x + 5, r.y + 5, 14, 14, C.slate0);
    const icon = faceIcon(build, o.sel);
    if (icon) g.drawImage(icon, r.x + 12 - Math.floor(icon.width / 2), r.y + 12 - Math.floor(icon.height / 2));
    // its one button, CLOSE: under the text in the column, else on the header row (planPanel's places); POLISH-4 (P4-3): none for a bare plan (facePlan), which a press off any part or BACK closes as any face
    const cr = plan.bare ? null : plan.column ? columnButtons(1, r, tp)[0] : plan.rects ? plan.rects[0] : null;
    const hit = cr ? tapRect(cr, tp, r, tp) : null;
    if (cr) button(ui, g, "faceclose", cr, CLOSE_LABEL, { font: "3", onTap: () => this.close(), hit: hit ?? undefined });
    // POLISH-3 (REQ-BFG-087; Q2 (a)): a title the column cannot hold in one row breaks at a space onto two 3x5 rows (planOnce: titleRows); the sub rows start 6 px lower (dy)
    if (plan.titleRows) fitTitleRows(g, t, r.x + 23, r.y + 4, plan.titleRows);
    else fitTitle(g, t, r.x + 23, r.y + 4, plan.subMax); // ENCHANT-1 (REQ-BFG-085, E7): an enchanted piece's word first in its colour (= fitHead for a plain one)
    const dy = plan.titleRows ? TITLE_ROW_DY : 0; // POLISH-4 (P4-1): spacing.ts, shared with the family head's place (headDy)
    const subColor = t.subColor ?? C.slate4;
    const sub1 = plan.subFit ?? (t.subShort && textWidth(t.sub, "3") > plan.subMax ? t.subShort : t.sub); // POLISH-5 (P5-3): subFit, the band's shorter wording of a turret's sub
    if (plan.body.sub) fitHead(g, plan.body.sub, r.x + 23, r.y + 13 + dy, plan.subMax, plan.body.subColor ?? subColor, false);
    else if (plan.subs.length > 1) plan.subs.forEach((s, i) => fitHead(g, s, r.x + 23, r.y + 13 + dy + i * 6, plan.subMax, subColor, false));
    else fitHead(g, sub1, r.x + 23, r.y + 13 + dy, plan.subMax, subColor, false);
    drawFamHead(g, plan);
    const shown = visibleLines(plan);
    for (const v of shown) {
      if (v.line === "rule") rect(g, r.x + 5, v.y + 1, r.w - 10, 1, C.slate1);
      else drawLine(g, v.line, r.x + 5, v.y);
    }
    // the ⓘ button and the keyword targets (the build screen's layer, on this side's build: the enemy's runes too)
    drawKeywordLayer(g, this, ui, run, { show: o.sel, t, plan }, shown, hit ? [hit] : [], tp, game.canvas, free(r));
    this.last = {
      title: t.title, sub: t.sub, subDrawn: plan.body.sub ?? (plan.subs.length > 1 ? plan.subs.join(" ") : sub1), side: o.side, sel: o.sel, line, r: { ...r }, close: hit,
      lines: shown.flatMap((v) => (v.line === "rule" ? [] : [v.line.spans.map((s) => s.t).join("")])),
    };
  }
}

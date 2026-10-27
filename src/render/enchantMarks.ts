// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E7; REQ-BFG-050): THE MARKS. An enchanted piece carries a small spark in its word's colour on
// the board, and a piece holding GROWING shows its counter. One module, one hook per piece kind, so every surface that draws the deck
// shows the same mark:
//   - drawEnchantMachinery(g, v), the last call of machinery.ts drawMachinery: the rigs and factories of v.build (the build screen's deck,
//     the battle world through ArenaMotion, the replay, the scouted foe's view, the summary: they all draw through drawMachinery);
//   - drawEnchantTurrets(g, v), the last call of cruiser.ts drawTurrets: the installed turrets of v.build (the same surfaces).
//   - the cards that print no name get drawSparkAt (ui.ts itemSlot, the lifted tile of the carry in build/cues.ts drawLifted, the LAST
//     CHANCE part card); the shop's own cards never do (the shop never sells an enchanted piece).
// WHERE THE MARK SITS (the corner is chosen against what the board already draws; every mark is screen-upright, so it reads the same on
// all four facings):
//   - a rig or factory: the SPARK on the top-right corner of its top-right cell, 3x3 art px at (cell + 9, cell + 0): inside the sprite, clear
//     of a rig's arrows (the 4-wide nozzle sits on the middle of a side: cols 4-7), of a factory's chute (it straddles the edge of the first
//     belt cell, 8 wide from 2 px in), of the star pips (the bottom), of the FACTORY level mark (the bottom-left) and of the stall `!`.
//     A shaped piece (an L, a T, a line, a 2x3 factory) takes the top-right cell of its footprint's top row, so the mark is always on the piece.
//   - GROWING's COUNTER (ENCHANT-1b N5): the battle's count box (9 px tall, the numeral's width + 4: game/counters.ts BOX_H and boxW), ink
//     inside, the numeral in white with a 1 px ink outline, its 1 px frame in GROWING's green; 7 x 9 for one digit, 11 x 9 for two. It hangs
//     off the bottom-right corner of its bottom-right cell, its top-left at (cell + 10, cell + 9): clear of every nozzle (they end at row 7 on
//     the right side and at col 7 on the bottom side), of the star pips (the third ends at col 9) and of the arrowhead a rig's right arrow
//     drives into the next tile (rows 3-8): the box only grows down and to the right of that corner, so none of those zones is reached. It
//     grows to the right for a second digit.
//   - a turret: turret-local, like its chamber pips, gear boxes and level plate (it turns with the hull): the SPARK ahead of the head of the
//     pip column, forward-right of the barrel, 3x3 at (pip column - 5, -14) (the TURRET SPEED level plate sits at u = pip column.., so the
//     two never meet; sparkColumn moves it out for the adaptable gun's heavy art); the COUNTER right behind the spark's plate along the
//     gun's axis (its first row the one after the plate's last, v -10), centred on the spark across the axis but never nearer the pips than
//     the column before the first chamber pip (it stops at u = pip column - 1, and at - 2 with the bow sideways, which keeps the level plate
//     clear too). No spot beside the gun is clear of its art for a box this size (nor was one for the old 5x7 badge), so it lies over the
//     base's shoulder and a stretch of the barrel's rear; it never covers the spark, its plate, a chamber or store pip or the level plate.
// Everything here asks the switch (enchant.ts liveWord/enchantRules): off, no function draws a pixel, so every frame is as before.

import { CELL, ITEMS, type ItemDef } from "../sim/content";
import { cellsOf, hero, kx, ky, turretSlots } from "../sim/deck";
import type { Placed } from "../sim/deck";
import { ENCHANT_DEFS, enchantKindOf, enchantRules, liveWord, type EnchantId } from "../sim/enchant";
import { C } from "./palette";
import { rect, type G } from "./pixel";
import { drawText, textWidth } from "./font";
import { TURRET_LY, footX, footY, sx, sy, turnX, turnY, type DeckFrame } from "./frame";
import { pipColumn } from "./raceArt";
import { drawEnchantSpark } from "./enchantArt";
import type { CruiserView } from "./cruiser";

/** The spark's size (art px): enchantArt.ts drawEnchantSpark's. */
export const SPARK_SIZE = 3;
/** GROWING's counter badge: 9 px tall, the battle's count boxes' height (game/counters.ts BOX_H); one digit 7 wide, two digits 11 (boxW: the
 *  numeral's width + 4). */
export const COUNTER_H = 9;
/** The most the counter prints (two digits). */
export const COUNTER_MAX = 99;
/** On a rig or factory the badge's top-left sits this far in from the right edge and this far up from the bottom edge of the bottom-right
 *  cell: 2 px in and 3 px up, so it hangs off the corner (the piece's own marks stay clear: the nozzles end at col 7 on the bottom side and
 *  row 7 on the right side, the ★3 pips at col 9 on row 10, and a belt tile's arrowhead past the right edge ends at row 8). */
export const COUNTER_IN = 2, COUNTER_UP = 3;

/** What a piece's word draws: the word, its colour and (GROWING only) the counter above 0. */
export interface WordMark {
  id: EnchantId;
  color: string;
  grow: number;
}

/**
 * The mark a piece shows, or undefined: the switch is off, the piece holds no word, the word is not one of the eight, or the word cannot
 * go on this kind of piece (a stray `ench` on gear, MASSIVE on a rig: the panels read it the same way, enchantFaces.ts wordOn). `def`: the
 * piece's def or its id. GROWING's counter is its `grow` (the dusk fights the piece has been through), whole and above 0.
 */
export function wordMark(p: { ench?: string; grow?: number } | undefined, def: ItemDef | string | undefined): WordMark | undefined {
  const id = liveWord(p);
  if (!id) return undefined;
  const d = typeof def === "string" ? (Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined) : def;
  const kind = enchantKindOf(d);
  if (!kind || !ENCHANT_DEFS[id].kinds.includes(kind)) return undefined;
  const g = p?.grow;
  const grow = id === "growing" && typeof g === "number" && Number.isFinite(g) ? Math.max(0, Math.floor(g)) : 0;
  return { id, color: ENCHANT_DEFS[id].color, grow };
}

/** The colour of a piece's spark (the card marks: a cargo slot, the lifted tile), or undefined for no mark. */
export function markColour(p: { ench?: string; grow?: number } | undefined, def: ItemDef | string | undefined): string | undefined {
  return wordMark(p, def)?.color;
}

/**
 * The spark colour of the piece a carry holds (build/actions.ts Carry: where it came from and its uid): a deck piece, a cargo piece or an
 * installed turret lifted off its slot. A piece still on a shop card (uid -1) is never enchanted. undefined: no mark.
 */
export function carriedMark(
  run: { build: { items: readonly Placed[]; turrets?: readonly { slot: number; def: string; ench?: string; grow?: number }[] }; inventory: readonly { uid: number; def: string; ench?: string; grow?: number }[] },
  c: { src: { from: string; uid?: number; index?: number }; def: string; uid: number },
): string | undefined {
  if (!enchantRules()) return undefined;
  const s = c.src;
  if (s.from === "deck") return markColour(run.build.items.find((p) => p.uid === c.uid), c.def);
  if (s.from === "cargo") return markColour(run.inventory.find((i) => i.uid === c.uid), c.def);
  if (s.from === "mount" || s.from === "turret") return markColour(run.build.turrets?.find((t) => t.slot === s.index), c.def);
  return undefined;
}

/** Draw the spark of colour `colour` with its top-left at (x, y): the card marks (a cargo slot's corner, the lifted tile's, a LAST CHANCE
 *  card's). One call into enchantArt.ts, so the art lives in one place. */
export function drawSparkAt(g: G, x: number, y: number, colour: string): void {
  drawEnchantSpark(g, Math.round(x), Math.round(y), colour);
}

/**
 * The spark on the BOARD: set on a small ink plate (the 3x3 spark's plus, one pixel round it: a 5x5 without its corners), so it reads on
 * any sprite, a yellow hazard border and the SWIFT-yellow spark included. The board's other small marks sit on ink too (levelMark.ts:
 * the level numeral on a 5x7 ink plate). The plate reaches 1 px past the cell's top and right edges where the spark is on the corner.
 */
export function drawBoardSpark(g: G, x: number, y: number, colour: string): void {
  x = Math.round(x);
  y = Math.round(y);
  rect(g, x, y - 1, SPARK_SIZE, SPARK_SIZE + 2, C.ink);
  rect(g, x - 1, y, SPARK_SIZE + 2, SPARK_SIZE, C.ink);
  drawEnchantSpark(g, x, y, colour);
}

// ------------------------------------------------------------------------------------------------------------ GROWING's counter

const counterText = (n: number): string => String(Math.min(COUNTER_MAX, Math.max(0, Math.floor(n))));

/** The counter badge's size for `n`: 7 x 9 for one digit, 11 x 9 for two (the battle's count box: boxW(numeral) x BOX_H). */
export function counterSize(n: number): { w: number; h: number } {
  return { w: textWidth(counterText(n), "3") + 4, h: COUNTER_H };
}

/**
 * GROWING's counter (REQ-BFG-050; ENCHANT-1b N5): the battle's count box (screens/battleCounters.ts boxImage and badgeImage: game/counters.ts
 * BOX_H 9 tall, boxW wide) at its own size: ink inside, the number in the 3x5 face in white with a 1 px ink outline, 2 px in and 2 px down;
 * the 1 px frame is `colour`, the word's green, so the box still ties to the word. Its top-left at (x, y); `n` the dusk fights the piece has
 * been through (two digits at most). It was a 5 x 7 badge with the word's green as the fill and an ink numeral on it: a small green glyph at
 * phone size. White on ink is the contrast every other count on the board has.
 */
export function drawGrowCounter(g: G, x: number, y: number, n: number, colour: string): void {
  const t = counterText(n), { w } = counterSize(n);
  x = Math.round(x);
  y = Math.round(y);
  rect(g, x, y, w, COUNTER_H, colour);
  rect(g, x + 1, y + 1, w - 2, COUNTER_H - 2, C.ink);
  drawText(g, t, x + 2, y + 2, C.white, { font: "3", outline: C.ink });
}

// ------------------------------------------------------------------------------------------------------------ the board

interface Pt { x: number; y: number }

/** A footprint cell's screen top-left (12 x 12), whole px, as machinery.ts places it. */
const cellAt = (f: DeckFrame, k: number): Pt => ({ x: Math.round(footX(f, kx(k), ky(k))), y: Math.round(footY(f, kx(k), ky(k))) });

/** The cells a mark sits on: the footprint's top-right cell (its top row, then its right-most cell) and its bottom-right cell (its bottom
 *  row, then its right-most), on screen. A 1-cell rig has one cell for both; a 2x2 factory its box's two right corners. */
export function pieceCorners(f: DeckFrame, p: Placed): { top: Pt; bottom: Pt } {
  let top: Pt | null = null, bottom: Pt | null = null;
  for (const k of cellsOf(p)) {
    const c = cellAt(f, k);
    if (!top || c.y < top.y || (c.y === top.y && c.x > top.x)) top = c;
    if (!bottom || c.y > bottom.y || (c.y === bottom.y && c.x > bottom.x)) bottom = c;
  }
  return { top: top!, bottom: bottom! };
}

/** Where a rig's or factory's marks go on frame `f`: the spark's top-left and (GROWING) the counter's top-left, screen px. */
export function pieceMarkAt(f: DeckFrame, p: Placed): { spark: Pt; counter: Pt } {
  const { top, bottom } = pieceCorners(f, p);
  return { spark: { x: top.x + CELL - SPARK_SIZE, y: top.y }, counter: { x: bottom.x + CELL - COUNTER_IN, y: bottom.y + CELL - COUNTER_UP } };
}

/** POLISH-1 (REQ-BFG-085; P1): one word's mark on the board: what it draws and where its spark and its counter go (screen px). */
interface BoardMark { m: WordMark; spark: Pt; counter: Pt }

/** The marks of the view's rigs and factories with a word. A piece lifted off the deck (v.hideItem) draws none, as it draws no sprite. */
function machineryMarks(v: CruiserView): BoardMark[] {
  const out: BoardMark[] = [];
  for (const p of v.build.items) {
    if (p.ench === undefined || p.uid === v.hideItem) continue;
    const m = wordMark(p, p.def);
    if (!m) continue;
    const at = pieceMarkAt(v.frame, p);
    out.push({ m, spark: at.spark, counter: at.counter });
  }
  return out;
}

/** The rigs and factories of the view's build with a word: the spark on each, GROWING's counter on those above 0. A piece lifted off the
 *  deck (v.hideItem) draws none, as it draws no sprite. */
export function drawEnchantMachinery(g: G, v: CruiserView): void {
  if (!enchantRules()) return;
  for (const k of machineryMarks(v)) {
    drawBoardSpark(g, k.spark.x, k.spark.y, k.m.color);
    if (k.m.grow > 0) drawGrowCounter(g, k.counter.x, k.counter.y, k.m.grow, k.m.color);
  }
}

/** A turret-local rect (u across, v along the bow axis, forward = -v) on screen for pivot (px, py): cruiser.ts trect's mapping (and
 *  levelMark.ts onScreen's), so a mark lands on the pixel grid the gun's own marks use, on every facing. */
function turretRect(f: DeckFrame, px: number, py: number, u: number, v: number, w: number, h: number): { x: number; y: number } {
  switch (f.facing) {
    case 0: return { x: px + u, y: py + v };
    case 2: return { x: px + u, y: py - v - h };
    case 1: return { x: px - v - h, y: py + u };
    default: return { x: px + v, y: py + u };
  }
}

/** The spark's turret-local place: ahead of the head of the pip column, its top at v = -14 (the TURRET SPEED level plate sits at v -14..-8
 *  from the pip column on; the barrels end at v = -16 and the base at |v| 10). */
export const TURRET_SPARK_V = -14;

/** The spark's first column (turret-local u): `pip column - 5`, which clears the light, medium and heavy guns' barrels (they end at u 1, 2
 *  and 5, the dwarf's at 3) and the level plate (from the pip column on); the ADAPTABLE gun wears the heavy art but its pip column is a
 *  light gun's 9, so it is moved out to 7, past the heavy barrels' edge at 5 and their brake at 6. */
export const sparkColumn = (kind: string, pu: number): number => (kind === "adaptable" ? Math.max(pu - 5, 7) : pu - 5);

/** Where a turret's marks go: the spark's top-left and the counter's top-left (screen px) for the gun of `kind` at pivot (px, py) with pip
 *  column `pu`. The counter's badge is screen-upright (7 x 9, 11 x 9 for two digits) and sits behind the spark along the gun's axis, on the
 *  pivot's side of it, its first row the one after the last row of the spark's plate (so the plate stays whole: with the bow up the plate's
 *  last row is v = -11 and the badge's rows run from v = -10 down to -2). Across the axis it is centred on the spark, moved toward the barrel
 *  only as far as it takes to stay off the chamber pips' column (u = pip column on): its pip-side edge ends at u = pip column - 1, or at
 *  pip column - 2 with the bow sideways, where the TURRET SPEED level plate (u = pip column - 1 on, v -14..-10) would otherwise be touched. */
export function turretMarkAt(f: DeckFrame, px: number, py: number, pu: number, n = 1, kind = "light"): { spark: Pt; counter: Pt } {
  const spark = turretRect(f, px, py, sparkColumn(kind, pu), TURRET_SPARK_V, SPARK_SIZE, SPARK_SIZE);
  const { w, h } = counterSize(n);
  const cx = Math.min(spark.x + 1 - Math.floor(w / 2), px + pu - 1 - (w - 1)), cy = Math.min(spark.y + 1 - Math.floor(h / 2), py + pu - 2 - (h - 1));
  const counter = f.facing === 0 ? { x: cx, y: spark.y + SPARK_SIZE + 1 } : f.facing === 2 ? { x: cx, y: spark.y - h - 1 } : f.facing === 1 ? { x: spark.x - w - 1, y: cy } : { x: spark.x + SPARK_SIZE + 1, y: cy };
  return { spark, counter };
}

/** The marks of the view's installed turrets with a word (none when no turret holds one). */
function turretMarks(v: CruiserView): BoardMark[] {
  const out: BoardMark[] = [];
  if (!v.build.turrets?.some((t) => t.ench !== undefined)) return out;
  const f = v.frame, h = hero(v.build), slots = turretSlots(v.build);
  for (let i = 0; i < slots.length; i++) {
    const t = slots[i].turret, td = h.turrets[i];
    if (!t || t.ench === undefined || !td || td.empty) continue;
    const m = wordMark(t, t.def);
    if (!m) continue;
    const px = Math.round(sx(f, (td.col0 + td.width / 2) * CELL, TURRET_LY)), py = Math.round(sy(f, (td.col0 + td.width / 2) * CELL, TURRET_LY));
    const at = turretMarkAt(f, px, py, pipColumn(td.kind, h.faction), m.grow, td.kind);
    out.push({ m, spark: at.spark, counter: at.counter });
  }
  return out;
}

/** The installed turrets of the view's build with a word: the spark on each, GROWING's counter on those above 0. */
export function drawEnchantTurrets(g: G, v: CruiserView): void {
  if (!enchantRules()) return;
  for (const k of turretMarks(v)) {
    drawBoardSpark(g, k.spark.x, k.spark.y, k.m.color);
    if (k.m.grow > 0) drawGrowCounter(g, k.counter.x, k.counter.y, k.m.grow, k.m.color);
  }
}

/**
 * POLISH-1 (REQ-BFG-085; P1, BUMP-1F's review F1): every GROWING counter of the view's build drawn once more, over whatever lay on it. The build
 * screen draws the selection's frames after the machinery and the turrets (build/build.ts drawSelection), and a frame's 1 px line lay over a
 * counter's top-left (the selected piece's own frame cuts a rig's counter at cell + 12, a neighbour's or a belt tile's frame cuts the next one):
 * a selected GROWING rig showed a 3 as a 9. drawSelection calls this last, as it draws the level marks again over the frames (D11), so the box and its
 * number are whole whether a piece is selected or not and the frame still shows the selection round the piece. The pixels are the ones
 * drawEnchantMachinery and drawEnchantTurrets drew (the same places from the same two lists): where no frame lay over a box nothing changes.
 */
export function drawEnchantCounters(g: G, v: CruiserView): void {
  if (!enchantRules()) return;
  for (const k of [...machineryMarks(v), ...turretMarks(v)]) if (k.m.grow > 0) drawGrowCounter(g, k.counter.x, k.counter.y, k.m.grow, k.m.color);
}

// COUNT-1 (REQ-BFG-100; REQ-BFG-053's waiting count; display only): every count the fight keeps, as data the battle view
// draws on the thing it counts. Each value is read from the sim's own state by view code; nothing here writes the sim or
// the arena, and nothing under src/sim changes for it. The drawing is screens/battleCounters.ts; the words a player reads
// are ui/counterText.ts (one module); docs: output-count1/REPORT.md section 9 (the status-row API, the readers table).
//
// The status row (C1, the foe's; C2, yours) is STATUS_CHIPS: one entry per chip (key, icon, colours, value, text,
// reminder key, order). SCALE-2b's POISON fills the reserved slot's `value`; SCALE-2c's hits-taken chip (C7) is one more
// entry: the row's drawing reads the list and never names a chip.

import type { Battle, RouteState, Side, SideState, TurretState } from "../sim/battle";
import { FRAY_MAX, JAM_THRESHOLD, type ItemDef } from "../sim/content";
import { ROUTINES } from "../sim/cores";
import { ICON, type KeywordName } from "../render/font";
import { C } from "../render/palette";
import { fmtCount } from "../ui/statFormat";

/** A count a chip, a gun or a belt shows (the readers table's key too). */
export type CountKey = "burn" | "poison" | "fray" | "stun" | "plate" | "shield" | "waiting" | "belt";

type Sides = Pick<Battle, "sides">;

// ------------------------------------------------------------------------------------------------------------- values

/** BURN stacks on a hull: the sum of each entry's `dps` (sim/battle.ts HullState.burns: an entry's `dps` IS its stacks,
 *  each dealing BURN_DPS a second). Not `burns.length`, which counts entries (0.9.9's dot counted those). */
export function burnStacks(s: Pick<SideState, "hull">): number {
  let n = 0;
  for (const b of s.hull.burns) n += b.dps;
  return n;
}

/** The side's parts with a STUN running now: LODESTONE's own count (sim/battle.ts applyHit, `perStalled`), copied here
 *  predicate for predicate so the view never calls into the sim: its working rigs (a wrecked rig is no STUN), factories
 *  and turrets with a `disrupted` or `frozen` timer above 0, plus its belt tiles with one. tests/count1.test.ts holds the
 *  two equal at every LODESTONE hit of a real fight. */
export function stunnedParts(s: Pick<SideState, "gates" | "factories" | "turrets" | "routes">): number {
  let n = 0;
  for (const g of s.gates) if (!g.wrecked && (g.disrupted > 0 || g.frozen > 0)) n++;
  for (const f of s.factories) if (f.disrupted > 0 || f.frozen > 0) n++;
  for (const tu of s.turrets) if (tu.disrupted > 0 || tu.frozen > 0) n++;
  for (const r of s.routes) for (const t of r.cellDisrupt) if (t > 0) n++;
  return n;
}

/** C6: the slugs waiting at a gun, as PRESSURE BREECH counts them when it fires (sim/battle.ts chambers: `queued`): those
 *  backed up near its intakes (`waiting`, the jam rule's own count), plus its chamber's loads and a HOPPER's store. */
export function slugsWaiting(tu: Pick<TurretState, "waiting" | "stack" | "store">): number {
  return tu.waiting + tu.stack.length + tu.store.length;
}

/** The gun can jam: neither its core's routine (PRESSURE BREECH's noJam) nor its gear (HOPPER ★3) says it never does: the
 *  jam rule's own exemptions (sim/battle.ts chambers). */
export function canJam(tu: TurretState): boolean {
  return !tu.noJam && !ROUTINES[tu.core.routine].noJam(tu);
}

/** C6's colour state: "jam" (red) from the gun's `jam` event until it fires again; "full" (amber) while the jam rule's own
 *  count (`waiting`, the slugs backed up at its intakes) is at JAM_THRESHOLD or more on a gun that can jam: the rule then
 *  skips its next shot (unless its jam cooldown runs); else "ok" (white). The sum C6 prints can pass 4 on a gun that won't
 *  jam (its chamber's loads count, and PRESSURE BREECH never jams), so the amber rule reads `waiting` alone. */
export type GunState = "ok" | "full" | "jam";
export function gunState(tu: TurretState, jammed: boolean): GunState {
  if (jammed) return "jam";
  return canJam(tu) && tu.waiting >= JAM_THRESHOLD ? "full" : "ok";
}
export const GUN_COLOUR: Record<GunState, string> = { ok: C.white, full: C.amber, jam: C.red };

/**
 * C6's jam memory, per side and turret slot: set by a `jam` event, cleared by that gun's next `fire` event (the arena's
 * events, as react() reads them; display only). A skipped shot is no `fire`, so the red holds from the jam through the
 * skip until the gun really fires again. `clear()` at a SKIP (Arena.finish drops the events it steps).
 */
export class JamMemory {
  private readonly on: [Set<number>, Set<number>] = [new Set(), new Set()];
  event(e: { type: string; side?: Side; turret?: number }): void {
    if (e.side === undefined || e.turret === undefined) return;
    if (e.type === "jam") this.on[e.side].add(e.turret);
    else if (e.type === "fire") this.on[e.side].delete(e.turret);
  }
  jammed(side: Side, slot: number): boolean {
    return this.on[side].has(slot);
  }
  clear(): void {
    this.on[0].clear();
    this.on[1].clear();
  }
}

// ------------------------------------------------------------------------------------------------- the readers table

/**
 * The live pieces (bb-0.9.7) that read a count C1-C6 shows: content.ts and REPORT-SCALE1 1.2's last paragraph. `whose`:
 * the count on the reader's own side ("own") or on its foe ("foe"). The status row's dim-0 rule reads it (a chip some
 * piece in the fight reads shows at 0, dimmed), and BELT_COUNTS "readers" (none live: CROWD PRESS is 1E's).
 * QUENCH TANK is not here: it turns the BURN riding on the slug it hits into damage (`p.burn`, the slug's), not the hull's.
 */
export interface Reader {
  id: string;
  kind: "gate" | "factory" | "core" | "rune";
  reads: CountKey;
  whose: "own" | "foe";
}
export const READERS: readonly Reader[] = [
  { id: "lodestone", kind: "gate", reads: "stun", whose: "foe" }, // +DMG for each foe part a STUN holds now
  { id: "scrapper", kind: "factory", reads: "stun", whose: "own" }, // stamps on each STUN the foe lands on its side (harassAccepted)
  { id: "anvil", kind: "core", reads: "plate", whose: "own" }, // +DMG for each point of your soak layer
  { id: "steam", kind: "core", reads: "plate", whose: "own" }, // faster while your soak layer holds any
  { id: "pressure", kind: "core", reads: "waiting", whose: "own" }, // +DMG for each slug waiting at its gun
  { id: "widows_web", kind: "rune", reads: "fray", whose: "foe" }, // +n% DMG for each FRAY on the foe
  { id: "snare_knot", kind: "rune", reads: "fray", whose: "foe" }, // +DMG on a hull at its FRAY cap
];

/** Side `s` holds reader `r` (its piece on the board, its core fitted, its rune held). */
export function holds(s: Pick<SideState, "gates" | "factories" | "turrets" | "build">, r: Reader): boolean {
  if (r.kind === "gate") return s.gates.some((g) => g.def.id === r.id);
  if (r.kind === "factory") return s.factories.some((f) => f.def.id === r.id);
  if (r.kind === "core") return s.turrets.some((tu) => tu.core.def === r.id);
  return !!s.build.runes?.some((q) => q.id === r.id);
}

/** Some piece in the fight reads count `key` on `side`'s row: a reader of that count on that side ("own") or on its foe
 *  ("foe"). */
export function readCount(b: Sides, side: Side, key: CountKey): boolean {
  const own = b.sides[side], foe = b.sides[side === 0 ? 1 : 0];
  return READERS.some((r) => r.reads === key && holds(r.whose === "own" ? own : foe, r));
}

// ------------------------------------------------------------------------------------------------------ the status row

/** A chip's number as drawn: `num` in the chip's number colour, then `tail` in slate4 (FRAY's "/15"). */
export interface ChipText { num: string; tail: string }

/** One chip of the status row (C1/C2): the API the PIECES lane's 1E jobs add to (REPORT section 9). */
export interface StatusChip {
  key: CountKey;
  /** the 5x7 icon glyph (font.ts ICON) */
  icon: string;
  /** the icon's colour, and the number's (FRAY's is one step lighter than its icon: see FRAY_NUM) */
  colour: string;
  numColour: string;
  /** the count on `side` now; null: the sim keeps no such count yet (a reserved slot: no chip at all) */
  value: (b: Sides, side: Side) => number | null;
  text: (n: number) => ChipText;
  /** the keyword whose reminder its tap shows (faces.ts REMINDER's key; glossary.ts row `kw`) */
  reminder: KeywordName | null;
  /** left to right in the tab */
  order: number;
}

/** FRAY's number: plum4 (its icon's colour) reads 3.51:1 on the counter box's navy, under 4.5:1 for a number at phone
 *  scale, so the number is one step lighter (palette.ts plum5); the icon stays plum4. */
export const FRAY_NUM = C.plum5;

const whole = (n: number): ChipText => ({ num: fmtCount(n), tail: "" });

/** The status row's chips, in order: BURN stacks, POISON (reserved: SCALE-2b fills its value), FRAY n/15, STUN. */
export const STATUS_CHIPS: readonly StatusChip[] = [
  { key: "burn", icon: ICON.BURN, colour: C.fire3, numColour: C.fire3, value: (b, s) => burnStacks(b.sides[s]), text: whole, reminder: "BURN", order: 10 },
  { key: "poison", icon: "", colour: C.lime, numColour: C.lime, value: () => null, text: whole, reminder: null, order: 20 },
  {
    key: "fray", icon: ICON.FRAY, colour: C.plum4, numColour: FRAY_NUM, value: (b, s) => b.sides[s].hull.fray,
    text: (n) => ({ num: fmtCount(n), tail: `/${fmtCount(FRAY_MAX)}` }), reminder: "FRAY", order: 30,
  },
  { key: "stun", icon: ICON.STUN, colour: C.cyan, numColour: C.cyan, value: (b, s) => stunnedParts(b.sides[s]), text: whole, reminder: "STUN", order: 40 },
];

/** A chip as the row shows it now: its count and whether it is dimmed (0, shown because a piece reads it). */
export interface ShownChip { chip: StatusChip; n: number; dim: boolean }

/** The chips `side`'s row shows now, in order: a count above 0, or 0 dimmed where a piece in the fight reads it; a
 *  reserved slot (value null) never. Pure. */
export function shownChips(b: Sides, side: Side, chips: readonly StatusChip[] = STATUS_CHIPS,
  reads: (b: Sides, side: Side, key: CountKey) => boolean = readCount): ShownChip[] {
  const out: ShownChip[] = [];
  for (const chip of [...chips].sort((x, y) => x.order - y.order)) {
    const n = chip.value(b, side);
    if (n === null) continue;
    if (n > 0) out.push({ chip, n, dim: false });
    else if (reads(b, side, chip.key)) out.push({ chip, n: 0, dim: true });
  }
  return out;
}

/** The tab: 11 px tall (1 px ink frame, a 1 px slate2 top edge, the 5x7 row 2 px down), 4 px in at each end, chips 6 px
 *  apart, each its 5x7 icon, 1 px, its number. */
export const STATUS_H = 11;
export const STATUS_PAD = 4;
export const CHIP_GAP = 6;
export const ICON_W = 5;

/** A chip's place in the tab (x: its icon's left edge; numX: its number's). */
export interface ChipBox { x: number; numX: number; w: number }

/**
 * The status tab of `side`'s plate `r` (logical px, as drawn): right-aligned with the plate's right edge (where 0.9.9's
 * dots were), on the plate's hull side: under it where the plate sits above its hull (the foe's on every view, yours on
 * the desk), above it where it sits under (yours on a portrait phone). `widths`: each chip's number width (its text,
 * tail included, in the 5x7 face). It shrinks from its outer (left) end; no chips, no tab (null). Pure.
 */
export function statusTab(r: { x: number; y: number; w: number; h: number }, below: boolean, widths: readonly number[]): { x: number; y: number; w: number; h: number; chips: ChipBox[] } | null {
  if (!widths.length) return null;
  const w = STATUS_PAD * 2 + widths.reduce((a, n) => a + ICON_W + 1 + n, 0) + CHIP_GAP * (widths.length - 1);
  const x = r.x + r.w - w, y = below ? r.y + r.h : r.y - STATUS_H;
  const chips: ChipBox[] = [];
  let cx = x + STATUS_PAD;
  for (const n of widths) {
    chips.push({ x: cx, numX: cx + ICON_W + 1, w: ICON_W + 1 + n });
    cx += ICON_W + 1 + n + CHIP_GAP;
  }
  return { x, y, w, h: STATUS_H, chips };
}

/** The plate's hull side: true where the tab hangs under the plate (the plate's centre above its hull's). Pure. */
export function tabBelow(plate: { y: number; h: number }, hull: { y: number; h: number }): boolean {
  return plate.y + plate.h / 2 < hull.y + hull.h / 2;
}

// ------------------------------------------------------------------------------------------------ the board counters

/** C5's rule (cap's call, both built): "all" draws a belt's slug count on every belt holding a slug while the fight runs;
 *  "readers" only on belts some piece reads (CROWD PRESS, 1E: none live, so nothing shows today).
 *  PAIR-1c (cap's ruling; REQ-BFG-100), under both: a one-tile joining belt (RouteState.join set, fewer than 2 cells: with
 *  SHAPES on, every par I3 ASSEMBLY LINE's exit) is a connector, so it shows no count unless a belt reader works it. Its
 *  slugs are counted one tile later, on the belt they join, which has its own box. */
export type BeltCounts = "all" | "readers";
export const BELT_COUNTS: BeltCounts = "all";
/** The belt-count readers (none live at bb-0.9.7: CROWD PRESS is SCALE-2's). A count a piece reads always shows: C5 shows
 *  on every belt holding a slug that one of them works, under both modes, a one-tile joining belt too. */
export const BELT_READERS: readonly string[] = [];

/** C5 shows on this belt under `mode`: it holds a slug, and with "readers" a rig in `readers` (BELT_READERS) works it. Under
 *  "all" a one-tile joining belt (a `join`, fewer than 2 cells; PAIR-1c) shows only where such a rig works it, as under
 *  "readers". Multi-tile joining belts and one-tile belts without a join (a gun's intake) keep "all"'s rule. The drawing
 *  and the belt's tap and hover group read this one rule (screens/battleCounters.ts drawBoard). Pure. */
export function beltShows(s: Pick<SideState, "gates">, route: Pick<RouteState, "index" | "cells" | "join"> & { ammo: readonly unknown[] },
  mode: BeltCounts, readers: readonly string[] = BELT_READERS): boolean {
  if (!route.ammo.length) return false;
  if (mode === "all" && !(route.join && route.cells.length < 2)) return true;
  return s.gates.some((g) => readers.includes(g.def.id) && g.hits.some((h) => h.route === route.index));
}

/** The 3x5 counter box (C5, C6): 9 px tall, text 2 px in and 2 px down; `textW` its text's width. */
export const BOX_H = 9;
export const boxW = (textW: number): number => textW + 4;

/** C6's box offset from the gun's pivot on screen (the spec's +7, -4). */
export const GUN_DX = 7, GUN_DY = -4;

/**
 * PAIR-CUE (REQ-BFG-100; REVIEW-COUNT1 ruling 4): where C6's w x h box goes for a gun whose pivot is at (px, py) on screen,
 * on a board whose bow points (bx, by) on screen (frame.ts fwdX, fwdY) and whose tiles cover `deck` on screen: on the
 * pivot's outward side, over the rail or the open water, never over the board's tiles. A bow pointing left (the foe on the
 * desk and on a phone held sideways) mirrors the spec's +7 to the pivot's left (-7 - w); every other bow keeps +7, -4 (your
 * guns everywhere, both sides on a portrait phone). Then, should the box still touch the tiles (a deep WIDE zoom brings the
 * pivot within reach of the deck's edge), it moves out along the bow until it is clear. Pure.
 */
export function gunBoxAt(px: number, py: number, w: number, h: number, bx: number, by: number,
  deck: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  let x = bx < 0 ? Math.round(px) - GUN_DX - w : Math.round(px) + GUN_DX, y = Math.round(py) + GUN_DY;
  if (overlap({ x, y, w, h }, deck)) {
    if (bx > 0) x = Math.ceil(deck.x + deck.w);
    else if (bx < 0) x = Math.floor(deck.x) - w;
    else if (by < 0) y = Math.floor(deck.y) - h;
    else if (by > 0) y = Math.ceil(deck.y + deck.h);
  }
  return { x, y };
}
/** C5's box centre from the belt's last tile centre on screen: this far back along the belt, away from its gun. */
export const BELT_BACK = 4;

/** A box kept on the W x H screen (logical px), whole; null when its anchor (ax, ay) is off the screen (CLOSE). Pure. */
export function keepOnScreen(ax: number, ay: number, x: number, y: number, w: number, h: number, W: number, H: number): { x: number; y: number; w: number; h: number } | null {
  if (!(ax >= 0 && ay >= 0 && ax < W && ay < H)) return null;
  return { x: Math.max(0, Math.min(W - w, Math.round(x))), y: Math.max(0, Math.min(H - h, Math.round(y))), w, h };
}

/** Two rects overlap. */
export const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---------------------------------------------------------------------------------------------- C11, a reader's add

/** C11: the least add a reader's pop shows, and the game's own big-hit line (sim/battle.ts: a big impact at 140). */
export const ADD_MIN = 10;
export const ADD_BIG = 140;

/** Unused by the sim; for the REPORT's C11 table: the live rigs whose add is count-driven (a FOR EACH or TIMES add), and
 *  the count each multiplies. */
export const COUNT_ADDS: readonly { id: string; count: string; field: keyof NonNullable<ItemDef["gate"]> }[] = [
  { id: "lodestone", count: "foe parts stunned now", field: "perStalled" },
  { id: "longhaul", count: "rig hits the slug already took", field: "perPriorGate" },
  { id: "pincer", count: "other working rigs on its tile", field: "pincer" },
  { id: "counterweight", count: "belt tiles the slug has ridden", field: "perTile" },
  { id: "quench", count: "BURN stacks riding on the slug", field: "quench" },
];

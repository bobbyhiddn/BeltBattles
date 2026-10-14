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
import { scaleRules } from "../sim/scale"; // SCALE-2b (REQ-BFG-108): the POISON chip, SCALE_RIGS on only
import { onSetScaleRigs } from "../sim/scale"; // SCALE-2c (REQ-BFG-100, C7): the hits chip joins the row, SCALE_RIGS on only
import { heartsLost, startHearts } from "../sim/scale"; // SCALE-2c (REQ-BFG-100, C9): the run record's hearts
import type { ReadCount } from "../sim/content"; // SCALE-2c: the `reads` counts that light a chip (READ_CHIPS)

/** A count a chip, a gun or a belt shows (the readers table's key too). */
export type CountKey = "burn" | "poison" | "fray" | "stun" | "plate" | "shield" | "waiting" | "belt" | "hits"; // SCALE-2c: + hits (C7)

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
  // SCALE-2b (REQ-BFG-108; REPORT-SCALE2a section 10): a POISON reader is a `reads` line counting foePoison (a rig's, or a
  // gun part's: SCALE-2c's ROT GAUGE and LEECH COIL), held by the foe of the hull whose POISON it reads. SCALE-2c
  // (REQ-BFG-100; BRIEF-SCALE2c section 2): the same rule for every `reads` count a chip shows (READ_CHIPS): KINDLING and
  // CINDER MAIL light the foe's BURN chip, ROT GAUGE and LEECH COIL its POISON chip, SPALL CATCHER your hits chip (C7)
  for (const rc of READ_CHIPS) if (rc.key === key && readsLine(rc.whose === "own" ? own : foe, rc.count)) return true;
  return READERS.some((r) => r.reads === key && holds(r.whose === "own" ? own : foe, r));
}

/** SCALE-2c (REQ-BFG-100): the `reads` counts (content.ts ReadCount) a status-row chip shows, and whose row: the reader's
 *  foe's (BURN and POISON on the foe's hull) or its own (the hits on your hull). Data-only reader lines exist only with
 *  SCALE_RIGS on (scale.ts), so off this adds nothing. */
export const READ_CHIPS: readonly { key: CountKey; count: ReadCount; whose: "own" | "foe" }[] = [
  { key: "burn", count: "foeBurn", whose: "foe" },
  { key: "poison", count: "foePoison", whose: "foe" },
  { key: "hits", count: "hitsTaken", whose: "own" },
];

/** SCALE-2c: side `s` holds a piece whose `reads` line counts `count`: a rig's (gate.reads) or a gun part's (a turret's
 *  `reads`, gearStats). */
export function readsLine(s: Pick<SideState, "gates" | "turrets">, count: ReadCount): boolean {
  return s.gates.some((g) => g.def.gate?.reads?.count === count) || s.turrets.some((tu) => !!tu.reads?.some((r) => r.count === count));
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
  /** SCALE-2c (C7): a chip with no keyword (reminder null): its tap's sentence, with its count */
  sentence?: ChipSentence;
}

/** FRAY's number: plum4 (its icon's colour) reads 3.51:1 on the counter box's navy, under 4.5:1 for a number at phone
 *  scale, so the number is one step lighter (palette.ts plum5); the icon stays plum4. */
export const FRAY_NUM = C.plum5;

const whole = (n: number): ChipText => ({ num: fmtCount(n), tail: "" });

/** SCALE-2c (C7): the hits chip's number colour: C.red's own step where it reads 4.5:1 on the counter box's navy, else a
 *  lighter one (FRAY_NUM's rule; tests/scale2c.counters.test.ts measures it). */
export const HITS_NUM = C.red;
/** SCALE-2c (C7): the hits chip's tap sentence. */
export const hitsText = (n: number): string => `HITS ON YOU THIS FIGHT: ${fmtCount(n)}.`;

/** SCALE-2b (REQ-BFG-108, REQ-BFG-100 C1): the POISON on `side`'s hull (sim/battle.ts HullState.poison: it only climbs, the
 *  fight long), or null while SCALE_RIGS is off: the battle's own switch (Battle.scaleRigs, read once when it was made),
 *  else the switch now. Off, no hull ever holds POISON and the chip is the reserved slot it was (no chip at all). */
export function poisonStacks(b: Sides, side: Side): number | null {
  const on = (b as { scaleRigs?: boolean }).scaleRigs ?? scaleRules();
  return on ? b.sides[side].hull.poison ?? 0 : null;
}

/** SCALE-2c (REQ-BFG-100, C7; BRIEF-SCALE2c section 4; REPORT-SCALE1 1.2): the hits on your hull this fight (sim/battle.ts
 *  SideState.hitsTaken: every enemy impact, any target, blocked or not; kept only while the battle's switch is on), on your
 *  row (side 0's, C2) while you hold a hits-taken reader (SPALL CATCHER), else null (no chip at all): off, never. */
export function hitsShown(b: Sides, side: Side): number | null {
  const on = (b as { scaleRigs?: boolean }).scaleRigs ?? scaleRules();
  if (!on || side !== 0 || !readsLine(b.sides[side], "hitsTaken")) return null;
  return b.sides[side].hitsTaken ?? 0;
}

/** SCALE-2c (C7): the hits chip's tap sentence (ui/counterText.ts's words, built here so the chip carries them). */
export type ChipSentence = (n: number) => string;

/** The status row's chips, in order: BURN stacks, POISON (SCALE-2b: SCALE_RIGS on), FRAY n/15, STUN, the hits on you
 *  (SCALE-2c's C7: SCALE_RIGS on, with a hits-taken reader aboard). */
export const STATUS_CHIPS: readonly StatusChip[] = [
  { key: "burn", icon: ICON.BURN, colour: C.fire3, numColour: C.fire3, value: (b, s) => burnStacks(b.sides[s]), text: whole, reminder: "BURN", order: 10 },
  // SCALE-2b (REQ-BFG-108): the reserved slot filled: the drop and its number in venom, beside BURN's; its tap shows POISON's
  // reminder. With no POISON on the hull and no POISON reader aboard (readCount below), no chip; off, never a chip
  { key: "poison", icon: ICON.POISON, colour: C.venom, numColour: C.venom, value: poisonStacks, text: whole, reminder: "POISON", order: 20 },
  {
    key: "fray", icon: ICON.FRAY, colour: C.plum4, numColour: FRAY_NUM, value: (b, s) => b.sides[s].hull.fray,
    text: (n) => ({ num: fmtCount(n), tail: `/${fmtCount(FRAY_MAX)}` }), reminder: "FRAY", order: 30,
  },
  { key: "stun", icon: ICON.STUN, colour: C.cyan, numColour: C.cyan, value: (b, s) => stunnedParts(b.sides[s]), text: whole, reminder: "STUN", order: 40 },
];

/** SCALE-2c (REQ-BFG-100, C7): the hits chip: the crack (font.ts ICON.CRACK, not enumerable) and its count in red, order 50
 *  (after STUN); no keyword (HITS has no glossary row), so its tap is its own sentence, "HITS ON YOU THIS FIGHT: 14.". It
 *  joins STATUS_CHIPS only while SCALE_RIGS is on (the switch's hook below), so with the switch off the list is COUNT-1's
 *  four (tests/count1.test.ts pins them) and every row is as before. */
export const HITS_CHIP: StatusChip = {
  key: "hits", icon: ICON.CRACK, colour: C.red, numColour: HITS_NUM, value: hitsShown, text: whole, reminder: null, order: 50, sentence: hitsText,
};
onSetScaleRigs((on) => {
  const list = STATUS_CHIPS as StatusChip[], at = list.indexOf(HITS_CHIP);
  if (on && at < 0) list.push(HITS_CHIP);
  else if (!on && at >= 0) list.splice(at, 1);
});

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

// ------------------------------------------------- SCALE-2c (REQ-BFG-100): C8, a reader's running bonus; C9, the run record

/**
 * C8 (BRIEF-SCALE2c section 4; REPORT-SCALE1 1.2): a reader whose count only the piece itself shows wears a red badge with
 * the bonus it gives on its next hit or shot: POWDER KEG (its own hits, a rig) and SPALL CATCHER (the hits on your ship, a
 * gun part), any `reads` line counting ownHits or hitsTaken. On your side (side 0) only, with the battle's switch on (the
 * counts are kept only then). `bonus` is in the sim's own units, as C11's pop for the same piece (its `add`):
 *  - a rig counting its own hits: `each` x (hits so far + 1), what its next hit adds, its count including that hit;
 *  - a gun part counting hits taken: `each` x the hits on you now (its gun's next shot reads the count then; more may land
 *    first). A gun with two such parts shows their sum.
 * Pure; [] off.
 */
export interface RampBadge { kind: "rig" | "gun"; ref: number; bonus: number; count: number }
export function rampBadges(b: Sides, side: Side): RampBadge[] {
  const on = (b as { scaleRigs?: boolean }).scaleRigs ?? scaleRules();
  if (!on || side !== 0) return [];
  const s = b.sides[side], out: RampBadge[] = [];
  for (const g of s.gates) {
    const r = g.def.gate?.reads;
    if (!r || g.wrecked) continue;
    if (r.count === "ownHits") { const n = g.ownHits ?? 0; out.push({ kind: "rig", ref: g.uid, bonus: r.each * (n + 1), count: n }); }
    else if (r.count === "hitsTaken") { const n = s.hitsTaken ?? 0; out.push({ kind: "rig", ref: g.uid, bonus: r.each * n, count: n }); }
  }
  for (const tu of s.turrets) {
    const each = (tu.reads ?? []).filter((r) => r.count === "hitsTaken").reduce((a, r) => a + r.each, 0);
    if (each > 0) { const n = s.hitsTaken ?? 0; out.push({ kind: "gun", ref: tu.index, bonus: each * n, count: n }); }
  }
  return out;
}

/** C9 (BRIEF-SCALE2c section 4): the run record your plate shows, `4W 6♥`, while a GRUDGE ROD or TROPHY CHAIN (any reader of
 *  hearts lost or wins) is aboard your side, with the battle's switch on; else null. `run`: the run's wins and hearts
 *  (Run.wins, Run.lives) and its hearts mark (scale.ts startHearts: 10 on a hearts run). Fixed for the fight. Pure. */
export interface RunRecord { wins: number; left: number; of: number; lost: number }
export function runRecord(b: Sides, side: Side, run: { wins: number; lives: number; hearts?: boolean } | null | undefined): RunRecord | null {
  const on = (b as { scaleRigs?: boolean }).scaleRigs ?? scaleRules();
  if (!on || side !== 0 || !run) return null;
  const s = b.sides[side];
  if (!readsLine(s, "heartsLost") && !readsLine(s, "wins")) return null;
  return { wins: Math.max(0, Math.floor(run.wins)), left: Math.max(0, Math.floor(run.lives)), of: startHearts(run), lost: heartsLost(run.lives, run) };
}

/** C9's tag after your name, as the ghost's plate writes its record (game/day.ts ghostName: `0W 5♥`). */
export const recordTag = (r: RunRecord): string => `${fmtCount(r.wins)}W ${fmtCount(r.left)}♥`;

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

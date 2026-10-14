// Battle HUD: a name plate + tick hull bar bolted to each cruiser, one docked bar with the
// clock and the playback controls (0.5X 1X 2X 4X, SKIP, II pause), and the dusk result card.

import type { Game } from "../game/game";
import type { Arena } from "../game/arena";
import type { BattleLayout } from "../game/battleLayout";
import { DESK_BAR_W, DESK_WIND_W } from "../game/battleLayout"; // HULL-1d (REQ-BFG-079; ruling Q4): the desk bar's wind slot
import type { DayResult } from "../game/run";
import { record, refundCardLine } from "../game/day";
import { lastChanceCardLine } from "../game/day"; // LC-1 (REQ-BFG-073)
import { livesCap } from "../sim/hearts"; // RETUNE-1 run 2 (REQ-BFG-096): a hearts run's 10 hearts on the dusk card
import { heartsWord } from "../ui/stakes"; // RETUNE-1 run 2: "-3 HEARTS"
import { SOURCE_OFFLINE, SOURCE_ONLINE } from "../game/session";
import { settings } from "../core/settings";
import { START_LIVES, WIND_START } from "../sim/content";
import { TICK } from "../sim/content"; // PAIR-2 (REQ-BFG-100): regenNow's wind test on the tick count, as Battle.heal's
import type { Side } from "../sim/battle";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { wrap } from "../render/font"; // WIND-1 (REQ-BFG-093): the callout's smaller line, where the floor is narrow
import { ICON, ICON_COLOUR } from "../render/font"; // SUS-B (REQ-BFG-069): SHIELD's pips and REGEN's badge, one source
import type { SideFx } from "../game/arena"; // WIND-1: the bars' wind flash
import type { ArenaMotion } from "../game/arenaMotion"; // WIND-1: the callout's floor, through the camera
import { PLATE_COLOUR, SHIELD_COLOUR } from "../game/arenaReact"; // WIND-1 (REQ-BFG-097): plating's and SHIELD's colours (ICON_COLOUR)
import { SHIELD_CAP } from "../sim/content"; // SUS-B: the pips' count
import { fmtDmg } from "../ui/statFormat"; // SUS-B: the REGEN badge prints as the faces print REGEN
import { fmtClock, fmtCount, fmtReadPct } from "../ui/statFormat"; // NUM-4 (REQ-BFG-047): the clocks and the results; WIND-1: SHIELD's count
import { heartIcon } from "../render/sprites";
import { button, panel, statsPanel, tapRect, type Rect } from "../ui/ui";
import { skinOf } from "../render/styles"; // CUSTOM-2a (REQ-BFG-072): the plate wears its board's panel style
import { hullBar } from "../ui/hud";
import { CLANK_TIME, STRIP_H, drawPlatingStrip } from "../render/raceFx"; // 0.8.0 H1 M3: BASTION's plating strip
import { PLATE_CAP, PLATE_PER_SLUG } from "../sim/races/bastion";
import { holdsPlating } from "../render/wave3Moments"; // 0.8.0 I1 M4: wave 3's plating on any hull
import type { Battle } from "../sim/battle"; // HULL-1c (REQ-BFG-079; REVIEW-HULL1A N3): windReadout's battle
import { windShareBp } from "../sim/hullScale"; // HULL-1c: the wind's share a second, the bar's read-out
import { sustShown } from "../sim/hullScale"; // CNT-DAY2 (REQ-BFG-100): the REGEN badge on the fight's day, x S(d)
import { textDay } from "../ui/fightDay"; // CNT-DAY2: the fight's day (the day's hull only; else none: as before)

/** Playback speeds (REQ-BFG-014, spec §22): presentation only, the sim steps the same fixed ticks. */
export const SPEEDS = [0.5, 1, 2, 4];
export const SPEED_LABELS = ["0.5X", "1X", "2X", "4X"];
export const SPEED_1X = 1;
const SPEED_IDS = ["sp0", "sp1", "sp2", "sp3"];

/**
 * 0.7.0 (R1 M1, online only): the enemy plate's source line (session.ts foeNote: ONLINE GHOST or OFFLINE STAND-IN) is a
 * row of 3x5 text with a 1 px ink outline, 1 px clear of the plate: it needs NOTE_ROW px free above the plate.
 */
export const NOTE_ROW = 8;
const GHOST_PREFIX = "GHOST · "; // day.ts ghostName: "GHOST · WEAVER · 0W 5♥"

/**
 * 0.7.0 (R1 M1): where the enemy plate's source line goes on a battle layout (at rest; the line rides with its plate).
 * "above": the free row the layout leaves over the plate, where 0.7.0a drew it (desktop 1920x1080, landscape screens with
 * room). "plate": inside the plate's strip, as a tag before the name (plateSource), where no row is free: a phone's plate
 * sits at the screen's top edge, and 0.7.0a's line then fell under it, on the enemy hull's top rail. The layout itself
 * is never changed, so the framing (and the open floor's share) is 0.6.2's, online and offline.
 */
export function notePlace(L: Pick<BattleLayout, "plates">): "above" | "plate" {
  return L.plates[1].y >= NOTE_ROW ? "above" : "plate";
}

/**
 * 0.7.0 (R1 M1): the source line's form inside the enemy plate: a short tag and the name it goes with. An online ghost
 * ("GHOST · WEAVER · 0W 5♥") is ONLINE · WEAVER · 0W 5♥: the tag says what GHOST said, and where it came from. A stand-in
 * keeps its captain's name: OFFLINE · SILKSHADE. Any other note is its own tag.
 */
export function plateSource(name: string, note: string): { tag: string; name: string } {
  if (note === SOURCE_ONLINE) return { tag: "ONLINE", name: name.startsWith(GHOST_PREFIX) ? name.slice(GHOST_PREFIX.length) : name };
  if (note === SOURCE_OFFLINE) return { tag: "OFFLINE", name };
  return { tag: note, name };
}

/** The tag as the plate draws it, before the name: "ONLINE ·". */
export const plateTag = (tag: string) => `${tag} ·`;

/** WIND-1 (REQ-BFG-093): the least hull bar a plate keeps where it can (logical px). The hull's "/max", then SHIELD's pips
 *  (its count stays, after one SHIELD glyph), then REGEN's badge give way to it, in that order; the current hull never does. */
export const BAR_MIN = 36;

/** WIND-1: the plating strip's colours on the plate (raceFx.ts drawPlatingStrip's `cols`): plate2 full, plate1 part full,
 *  plate3 its top edge and the shine (was the rune blue SHIELD wears). */
const PLATE_STRIP = { full: C.plate2, part: C.plate1, edge: C.plate3, shine: C.plate3 } as const;

/** WIND-1 (REQ-BFG-093, REQ-BFG-097): a plate's row, left to right: [tag] NAME [SHIELD] [the hull bar, plating's layer on
 *  it] [PLATE n] [+REGEN] HULL. `ty` is the 3x5 row's top, `hy` the hull number's (the 5x7 face, which every plate's height
 *  holds); x positions are left edges but `regenX`, the badge's right edge. */
export interface PlateRow {
  ty: number;
  hy: number;
  hull: string;
  max: string | null;
  hullX: number;
  shield: { x: number; pips: boolean; count: string } | null;
  /** plating's number (`text`, digits only) after the PLATE icon at `x`, ICON_GAP px apart (flush, the 3x5 icon read as a 7) */
  plate: { x: number; text: string } | null;
  regenX: number | null;
  bar: { x: number; w: number };
}

/**
 * WIND-1 (REQ-BFG-093, REQ-BFG-097): the plate's row in the plate's own rect (the layout never changes: no plate grows).
 * The hull: its current hull (fmtDmg of s.hull.hp, read directly) in the 5x7 face, and "/max" (fmtDmg of s.hull.max) after
 * it in the 3x5 face where the bar keeps BAR_MIN; `shield` (null: the side can't hold SHIELD) its count, after its pips where
 * room allows; `plate` (null: no plating layer) plating's number with the PLATE icon; `regenRoom` REGEN's badge room (0:
 * none). `lead`: the tag's and the name's width from the plate's left text edge. Pure (tests/wind1.test.ts).
 */
export function plateRow(o: { x: number; y: number; w: number; h: number; lead: number; hp: number; max: number; shield: number | null; regenRoom: number; plate: number | null }): PlateRow {
  const ty = o.y + Math.floor((o.h - 5) / 2), hy = o.y + Math.max(0, Math.floor((o.h - 7) / 2));
  const hull = fmtDmg(Math.max(0, o.hp)), max = `/${fmtDmg(o.max)}`;
  const curW = textWidth(hull, "5"), maxW = textWidth(max, "3") + 1;
  const count = o.shield === null ? "" : fmtCount(o.shield);
  const pipsW = SHIELD_PIPS_W + ICON_GAP + textWidth(count, "3"), oneW = textWidth(ICON.SHIELD, "3") + ICON_GAP + textWidth(count, "3");
  const plateText = o.plate === null ? "" : fmtDmg(o.plate), plateW = textWidth(ICON.PLATE, "3") + ICON_GAP + textWidth(plateText, "3");
  const right = o.x + o.w - 3, left = o.x + 3 + o.lead + 3;
  const forms = [[true, true, true], [false, true, true], [false, false, true], [false, false, false]];
  let row: PlateRow | null = null;
  for (let i = 0; i < forms.length; i++) {
    const [withMax, pips, regen] = forms[i];
    const hullX = right - curW - (withMax ? maxW : 0);
    let rx = hullX - 3;
    const regenX = o.regenRoom && regen ? rx : null;
    if (regenX !== null) rx -= o.regenRoom;
    const plate = o.plate === null ? null : { x: rx - plateW, text: plateText };
    if (plate) rx = plate.x - 3;
    let lx = left;
    const shield = o.shield === null ? null : { x: lx, pips, count };
    if (shield) lx += (pips ? pipsW : oneW) + 3;
    row = { ty, hy, hull, max: withMax ? max : null, hullX, shield, plate, regenX, bar: { x: lx, w: rx - lx } };
    if (row.bar.w >= BAR_MIN) break;
  }
  return row!;
}

/** PANEL-FIT (REQ-BFG-100, REQ-BFG-093; cap's rule 10-13): the least bar (px) the lead gives way to: drawPlate draws the
 *  bar, and plating's strip on it, only above 8 px. */
export const LEAD_BAR = 9;
/** PANEL-FIT: the mark at a cut name's end: ".", one 3x5 glyph (the 3x5 face has no ellipsis glyph). */
export const CUT_MARK = ".";
/** PANEL-FIT: a cut name keeps at least its first CUT_KEEP characters. */
export const CUT_KEEP = 3;

/** PANEL-FIT: the lead's width from the panel's left text edge, as drawPlate draws it: the tag ("ONLINE ·") and 4 px,
 *  then the name, in the 3x5 face. */
export const leadWidth = (name: string, tag?: string | null): number => (tag ? textWidth(plateTag(tag), "3") + 4 : 0) + textWidth(name, "3");

/** PANEL-FIT: what fitLead decided. `tag` is the tag drawn (null: none, or dropped). `name` is the name drawn (cut: its
 *  first characters, then CUT_MARK). `step` is "full" (as before), "tag" (the tag dropped) or "cut" (the tag dropped, the
 *  name cut). `lead` is the drawn lead's width, and `row` is plateRow's row for it. */
export interface LeadFit {
  tag: string | null;
  name: string;
  step: "full" | "tag" | "cut";
  lead: number;
  row: PlateRow;
}

/**
 * PANEL-FIT (REQ-BFG-100, REQ-BFG-093; cap's rule 10-13): nothing is ever drawn over the tag or the name.
 * 1. plateRow runs with the full lead (tag and name). If its bar keeps LEAD_BAR, that row is used, as before.
 * 2. Else the tag drops, and plateRow runs with the name alone, so its usual order (/max, WARD's pips, the REGEN badge)
 *    uses the freed room. If the bar now keeps LEAD_BAR, stop there.
 * 3. Else the name is cut from its end, just enough that the bar keeps LEAD_BAR in plateRow's last form. The cut is
 *    marked with CUT_MARK, and the name keeps at least CUT_KEEP characters. The forms are not tried again after a cut:
 *    the bar is then under BAR_MIN, so plateRow gives its last form.
 *    Run 2 (cap 10-13): before the mark, a cut part (split at spaces) that holds a digit goes whole, then any end " " or "·".
 * 4. Where even CUT_KEEP characters can't keep LEAD_BAR, the bar takes what is left.
 * Pure.
 */
export function fitLead(o: Omit<Parameters<typeof plateRow>[0], "lead">, name: string, tag?: string): LeadFit {
  const full = leadWidth(name, tag), row = plateRow({ ...o, lead: full });
  if (row.bar.w >= LEAD_BAR) return { tag: tag || null, name, step: "full", lead: full, row };
  const alone = textWidth(name, "3"), bare = tag ? plateRow({ ...o, lead: alone }) : row;
  if (bare.bar.w >= LEAD_BAR) return { tag: null, name, step: "tag", lead: alone, row: bare };
  // the bar is under BAR_MIN, so `bare` is plateRow's last form, whose bar loses 1 px for each px of lead: `most` is the
  // widest lead that keeps LEAD_BAR. Keep the longest start of the name (CUT_KEEP characters at least) that fits it
  const chars = Array.from(name), most = alone + bare.bar.w - LEAD_BAR;
  if (chars.length <= CUT_KEEP) return { tag: null, name, step: tag ? "tag" : "full", lead: alone, row: bare }; // no cut keeps CUT_KEEP: rule 4
  let k = chars.length - 1;
  while (k > CUT_KEEP && textWidth(chars.slice(0, k).join("") + CUT_MARK, "3") > most) k--;
  // never part of a number ("10W" cut to "1"): a part the cut ends inside goes whole if it holds a digit; then no gap at
  // the end. Shorter only, so the bar only grows; if fewer than CUT_KEEP characters would stay, the raw cut stays
  let j = k, s = k, e = k;
  while (s > 0 && chars[s - 1] !== " ") s--;
  while (e < chars.length && chars[e] !== " ") e++;
  if (chars[k] !== " " && /\d/.test(chars.slice(s, e).join(""))) j = s;
  while (j > 0 && (chars[j - 1] === " " || chars[j - 1] === "·")) j--;
  if (j >= CUT_KEEP) k = j;
  const cut = chars.slice(0, k).join("") + CUT_MARK, lead = textWidth(cut, "3");
  return { tag: null, name: cut, step: "cut", lead, row: plateRow({ ...o, lead }) };
}

/** WIND-1 (REQ-BFG-097): the gap between an icon and its number on the plate (px): flush, the 3x5 PLATE icon and a digit
 *  read as one number ("70" for plating 0). */
export const ICON_GAP = 2;

/** WIND-1 tooling (bb.windInfo): a plate as drawn: its rect, its hull text ("current" or "current/max"), the hull number's
 *  box and face, the bar's box, the SHIELD count and plating number shown (null: none). */
export interface PlateInfo {
  side: Side;
  r: Rect;
  hull: string;
  font: "5";
  hullBox: Rect;
  bar: Rect;
  shield: string | null;
  plate: string | null;
  windFlash: boolean;
  /** PANEL-FIT (REQ-BFG-100): the lead as drawn: the tag (null: none, or dropped), the name (maybe cut), and their box */
  lead: { tag: string | null; name: string; box: Rect };
}

/** Name plate: [NAME ▮▮▮▮▮▮▮▮ 147] on a dark panel, player lime / enemy red. 0.7.0 (R1 M1): `tag` (online, the enemy
 *  plate where no row is free above it) goes first, grey: [ONLINE · WEAVER · 0W 5♥ ▮▮▮▮ 147]. WIND-1 (REQ-BFG-093,
 *  REQ-BFG-097): the row is plateRow's: the hull as a number you can read (white, the 5x7 face, "/max" where it fits; read
 *  from s.hull directly, so `hpText` is no longer drawn), SHIELD's count with its pips, plating's layer with its number in
 *  plating's colour; the bar flashes the wind's colour on a wind tick. Returns what it drew (tooling). */
export function drawPlate(g: G, game: Game, a: Arena, r: Rect, side: Side, name: string, hpText: string, tag?: string): PlateInfo {
  void hpText; // WIND-1: the plate reads the hull itself (current and max)
  const s = a.b.sides[side];
  const f = a.sfx[side];
  statsPanel(g, r, skinOf(a.views[side].skin).panel); // CUSTOM-2a: the player's plate wears its panel style; a foe's the default
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.4): a side that can hold SHIELD shows its pips before its bar (lit up to its count, the
  // rest of SHIELD_CAP dim; a broken one flashes out), and a side with REGEN (MENDING LOOMs, FLIP-X1: or GREEN THREAD) its
  // REGEN badge before its HP. Their room is kept from the start, so the bar never moves. WIND-1 (REQ-BFG-097): SHIELD's
  // count after its pips; plating's layer (whenever plated() or the side holds any) with its number
  // CNT-DAY2 (REQ-BFG-100): on the day's hull Battle.heal lands the second's REGEN (sustainTick's one sum) x S(d), rounded
  // down; the badge shows that heal, and its room (from regenMax, so the bar still never moves) that number's width. No day
  // (textDay undefined: no day, or the switch off) gives regenNow and regenMax themselves, as before
  const day = textDay(a.b);
  const shows = showsShield(a, side), plating = plated(a, side) || s.plate.plate > 0;
  const rmax = sustShown(regenMax(a, side), day), regenRoom = rmax > 0 ? textWidth(`+${fmtDmg(rmax)}`, "3") + 3 : 0;
  // PANEL-FIT (REQ-BFG-100, REQ-BFG-093; cap's rule 10-13): plateRow's row for the lead that fits (fitLead: the full lead
  // where the bar keeps LEAD_BAR, as before; else the tag drops; else the name is cut). The tag and the name are drawn
  // after the row is known, before anything else in the row, as before
  const fit = fitLead({ x: r.x, y: r.y, w: r.w, h: r.h, hp: s.hull.hp, max: s.hull.max, shield: shows ? s.shield ?? 0 : null, regenRoom, plate: plating ? s.plate.plate : null }, name, tag);
  let tx = r.x + 3;
  const ty0 = r.y + Math.floor((r.h - 5) / 2);
  if (fit.tag) {
    const t = plateTag(fit.tag);
    drawText(g, t, tx, ty0, C.slate4, { font: "3" });
    tx += textWidth(t, "3") + 4;
  }
  drawText(g, fit.name, tx, ty0, side === 0 ? C.white : C.red, { font: "3" });
  const row = fit.row;
  const ty = row.ty;
  drawText(g, row.hull, row.hullX, row.hy, C.white, { font: "5" });
  if (row.max) drawText(g, row.max, row.hullX + textWidth(row.hull, "5") + 1, row.hy + 2, C.bone, { font: "3" });
  const broke = f.shieldBreak > 0 ? f.shieldAt : -1;
  if (row.shield) {
    const n = s.shield ?? 0;
    if (row.shield.pips) {
      drawShieldPips(g, row.shield.x, ty, n, broke, game.t);
      drawText(g, row.shield.count, row.shield.x + SHIELD_PIPS_W + ICON_GAP, ty, SHIELD_COLOUR, { font: "3" });
    } else {
      const flash = broke >= n && f.shieldBreak > 0 && (settings.reducedMotion || Math.floor(game.t * 12) % 2 === 0);
      drawText(g, ICON.SHIELD, row.shield.x, ty, n > 0 ? SHIELD_COLOUR : flash ? C.white : C.slate2, { font: "3", mono: true });
      drawText(g, row.shield.count, row.shield.x + textWidth(ICON.SHIELD, "3") + ICON_GAP, ty, SHIELD_COLOUR, { font: "3" });
    }
  }
  if (row.regenX !== null) {
    const now = sustShown(regenNow(a, side), day); // CNT-DAY2: the heal that lands each second on this fight
    if (now > 0) drawText(g, `+${fmtDmg(now)}`, row.regenX, ty, ICON_COLOUR[ICON.REGEN], { font: "3", align: "right" });
  }
  if (row.plate) {
    drawText(g, ICON.PLATE, row.plate.x, ty, PLATE_COLOUR, { font: "3", mono: true });
    drawText(g, row.plate.text, row.plate.x + textWidth(ICON.PLATE, "3") + ICON_GAP, ty, PLATE_COLOUR, { font: "3" });
  }
  const bx = row.bar.x, bw = row.bar.w;
  if (bw > 8 && plating) {
    // 0.8.0 H1 M3: BASTION's plating strip on top of the hull bar, in the bar's 7 rows: plating takes hits before HP, so
    // the strip drains (white where just lost) while the bar below holds; the dark wind goes straight to the bar
    // 0.8.0 I1 M4: the side's pool (P1's E1: SideState.plate, which IS BASTION's RaceSide.plating), so wave 3's plating
    // shows on any hull that holds a source of it. WIND-1 (REQ-BFG-097): in plating's colours, its number beside the bar
    // HULL-1d (REQ-BFG-079): the strip's full width is the pool's own cap (platingMax: PLATE_CAP x S(d) on the day's hull),
    // its segments the slugs that fill it, as before (the cap and a slug's plating both take S)
    drawPlatingStrip(g, bx, ty - 1, bw, s.plate.plate, f.plateShown, platingMax(s), PLATE_CAP / PLATE_PER_SLUG, f.plateShine / CLANK_TIME, PLATE_STRIP);
    hullBar(g, bx, ty - 1 + STRIP_H, bw, 7 - STRIP_H, Math.max(0, s.hull.hp), f.hpShown, s.hull.max, side === 0 ? C.lime : C.red, f.barFlash, game.t, windTint(f));
  } else if (bw > 8) hullBar(g, bx, ty - 1, bw, 7, Math.max(0, s.hull.hp), f.hpShown, s.hull.max, side === 0 ? C.lime : C.red, f.barFlash, game.t, windTint(f));
  // COUNT-1 (REQ-BFG-100): the 2x2 FRAY and BURN dots that sat at r.y - 2 (off the canvas over the foe's plate, which sits
  // at y 0; and counting BURN's entries, not its stacks) are gone: the status row (screens/battleCounters.ts) counts them
  const hullW = textWidth(row.hull, "5") + (row.max ? textWidth(row.max, "3") + 1 : 0);
  return {
    side, r: { ...r }, hull: row.max ? `${row.hull}${row.max}` : row.hull, font: "5", hullBox: { x: row.hullX, y: row.hy, w: hullW, h: 7 },
    bar: { x: bx, y: ty - 1, w: Math.max(0, bw), h: 7 }, shield: row.shield ? row.shield.count : null, plate: row.plate ? row.plate.text : null,
    windFlash: f.windFlash > 0,
    lead: { tag: fit.tag, name: fit.name, box: { x: r.x + 3, y: ty0, w: fit.lead, h: 5 } },
  };
}

/** WIND-1 (REQ-BFG-093): the hull bar's tint on a dark wind tick (both bars: arenaReact windPop sets each side's flash), or
 *  none. */
export const windTint = (f: Pick<SideFx, "windFlash">): string | undefined => (f.windFlash > 0 ? C.windHit : undefined);

/** WIND-1 (REQ-BFG-093): the DARK WIND callout's words (docs/TEXT-STYLE.md: game words in capitals; the old banner's
 *  "THE STORM HURTS BOTH HULLS", cut to what the player needs) and how long it shows (s, real time; once a fight). */
export const WIND_CALL = "DARK WIND";
export const WIND_CALL_SUB = "HITS BOTH HULLS";
export const WIND_CALL_TIME = 2;
/** WIND-1: the callout's wipe open from its centre (s; none with Reduce Motion). */
const WIND_CALL_WIPE = 0.2;
/** WIND-1: the margin kept from each carrier in the open floor (logical px), for their drift. */
const FLOOR_PAD = 4;

/**
 * WIND-1 (REQ-BFG-093): the open floor between the carriers as it is on screen now (logical px): the layout's gapBox through
 * the camera's screen map (FIELD-1: WIDE draws the floor smaller about its focus), FLOOR_PAD in from each carrier. Portrait
 * takes the floor's rows across the whole screen (nothing else is in them: a face's band does the same); landscape its
 * column between the carriers. Without a camera, the gapBox itself.
 */
export function floorOnScreen(L: Pick<BattleLayout, "portrait" | "gapBox" | "W">, m: Pick<ArenaMotion, "camera" | "scr"> | null): Rect {
  const gb = L.gapBox, s = m && m.camera ? m.scr : null;
  const x = s ? s.a * gb.x + s.e : gb.x, y = s ? s.d * gb.y + s.f : gb.y;
  const w = s ? s.a * gb.w : gb.w, h = s ? s.d * gb.h : gb.h;
  if (L.portrait) return { x: 2, y: Math.round(y) + FLOOR_PAD, w: L.W - 4, h: Math.max(0, Math.round(h) - 2 * FLOOR_PAD) };
  return { x: Math.round(x) + FLOOR_PAD, y: Math.round(y), w: Math.max(0, Math.round(w) - 2 * FLOOR_PAD), h: Math.round(h) };
}

/** WIND-1: the callout's box in `floor` (centred) and its text: DARK WIND in the 5x7 face, twice its size where the floor
 *  holds it, once where it doesn't; the smaller line in the 3x5 face, on two lines where one won't fit. */
export function windCallLayout(floor: Rect): { r: Rect; scale: number; lines: string[] } {
  const scale = textWidth(WIND_CALL) * 2 + 10 <= floor.w ? 2 : 1;
  const lines = textWidth(WIND_CALL_SUB, "3") + 10 <= floor.w ? [WIND_CALL_SUB] : wrap(WIND_CALL_SUB, Math.max(8, floor.w - 10), "3");
  const tw = Math.max(textWidth(WIND_CALL) * scale, ...lines.map((l) => textWidth(l, "3")));
  const w = Math.min(Math.max(0, floor.w), tw + 10), h = 4 + 7 * scale + 3 + lines.length * 6 + 3;
  return { r: { x: Math.round(floor.x + (floor.w - w) / 2), y: Math.round(floor.y + (floor.h - h) / 2), w, h }, scale, lines };
}

/**
 * WIND-1 (REQ-BFG-093): the DARK WIND callout, once a fight for WIND_CALL_TIME s from the windwarn (or the first wind tick):
 * a short banner in the open floor between the carriers on screen (floorOnScreen), never over a board: DARK WIND in the
 * wind's colour, HITS BOTH HULLS under it. The battle and the replay both draw it. Returns its box (null: not showing).
 */
export function drawWindCall(g: G, a: Pick<Arena, "windCallT">, L: BattleLayout, m: Pick<ArenaMotion, "camera" | "scr"> | null, reduced: boolean): Rect | null {
  const t = a.windCallT;
  if (t < 0 || t >= WIND_CALL_TIME) return null;
  const { r, scale, lines } = windCallLayout(floorOnScreen(L, m));
  const k = reduced ? 1 : Math.min(1, t / WIND_CALL_WIPE);
  const bw = Math.round(r.w * k), x0 = r.x + Math.round((r.w - bw) / 2);
  g.globalAlpha = 0.86;
  rect(g, x0, r.y, bw, r.h, C.ink);
  g.globalAlpha = 1;
  rect(g, x0, r.y, bw, 2, C.windHit);
  rect(g, x0, r.y + r.h - 2, bw, 2, C.windHit);
  if (k < 0.98) return r;
  drawText(g, WIND_CALL, r.x + r.w / 2, r.y + 4, C.windHit, { align: "center", scale, outline: C.ink });
  lines.forEach((ln, i) => drawText(g, ln, r.x + r.w / 2, r.y + 4 + 7 * scale + 3 + i * 6, C.bone, { font: "3", align: "center" }));
  return r;
}

/** HULL-1d (REQ-BFG-079; BRIEF-HULL1D 2 (h)1): the plating strip's full amount: the side's pool cap (PlateState.cap, which
 *  battle.ts sets to PLATE_CAP x S(d) only on the day's hull with S above 1), else PLATE_CAP, as before. */
export const platingMax = (s: { plate: { cap?: number } }): number => s.plate.cap ?? PLATE_CAP;

/** SUS-B (REQ-BFG-069): the SHIELD pips' room on a plate: SHIELD_CAP 3x5 glyphs at a 4 px pitch. */
export const SHIELD_PIPS_W = SHIELD_CAP * 4 - 1;

/** SUS-B (REQ-BFG-069): the side can hold SHIELD (SideState.shield: WARD STONE's start gain, or any gain; a WARD BELL's
 *  turret, TurretState.bell), so its plate shows its pips from the start. */
export function showsShield(a: Pick<Arena, "b">, side: Side): boolean {
  const s = a.b.sides[side];
  return s.shield !== undefined || s.turrets.some((tu) => !!tu.bell);
}

/** PAIR-2 (REQ-BFG-100; CNT-DAY3 finding 7.2): the dark wind's first tick on the battle's integer tick count, as battle.ts
 *  WIND_TICKS (Battle.heal's rule: nothing heals from it): 1500, where the float clock b.t is still a hair under WIND_START. */
const WIND_TICKS = Math.round(WIND_START / TICK);

/** SUS-B (REQ-BFG-069): the REGEN the side's working MENDING LOOMs (TurretState.regen; a STUN or freeze on the turret
 *  pauses one, Battle.sustainTick) give its living hull now; 0 in the dark wind, where nothing heals. FLIP-X1 (F-b): plus
 *  its rune's REGEN (GREEN THREAD, SideState.rune.regen, which nothing pauses), as Battle.sustainTick sums them. PAIR-2
 *  (REQ-BFG-100): the wind is Battle.heal's own test, the tick count (b.ticks >= WIND_TICKS), so the badge is gone on the
 *  wind's first tick, where that second's heal is lost; it read the float clock, b.t >= WIND_START, one frame late. */
export function regenNow(a: Pick<Arena, "b">, side: Side): number {
  const s = a.b.sides[side];
  if (a.b.ticks >= WIND_TICKS || s.hull.hp <= 0) return 0;
  let n = s.rune?.regen ?? 0; // F-b: GREEN THREAD's REGEN starts the sum, as in Battle.sustainTick
  for (const tu of s.turrets) if (tu.regen && !(tu.disrupted > 0) && !(tu.frozen > 0)) n += tu.regen;
  return n;
}

/** SUS-B: the most REGEN the side's looms give (its badge's room, kept from the start). FLIP-X1 (F-b): its rune's too. */
export function regenMax(a: Pick<Arena, "b">, side: Side): number {
  const s = a.b.sides[side];
  let n = s.rune?.regen ?? 0; // F-b: GREEN THREAD's
  for (const tu of s.turrets) if (tu.regen) n += tu.regen;
  return n;
}

/** SUS-B: SHIELD_CAP pips in the 3x5 SHIELD glyph from (x, y): the first `n` lit (SHIELD's rune glow), the rest dim; the
 *  pip at `broke` (a SHIELD just broken, its index the count after the break) flashes white, steady with Reduced Motion. */
export function drawShieldPips(g: G, x: number, y: number, n: number, broke: number, t: number): void {
  for (let i = 0; i < SHIELD_CAP; i++) {
    const flash = i === broke && i >= n;
    const col = i < n ? ICON_COLOUR[ICON.SHIELD] : flash && (settings.reducedMotion || Math.floor(t * 12) % 2 === 0) ? C.white : C.slate2;
    drawText(g, ICON.SHIELD, x + i * 4, y, col, { font: "3", mono: true });
  }
}

/** 0.8.0 H1 M3: the side's plate shows a plating strip: a BASTION hull (the one hero whose bulwark slugs plate). 0.8.0
 *  I1 M4: or any hull that holds a wave-3 source of plating (P1's E1; wave3Moments.ts holdsPlating). */
export function plated(a: Pick<Arena, "b">, side: Side): boolean {
  const s = a.b.sides[side];
  return (s.build.hero === "bastion" && !!s.race) || holdsPlating(s.build);
}

export interface BarState {
  speed: number;
  compact: boolean;
  showSpeeds: boolean;
  paused: boolean;
  onSpeed: (() => void)[]; // pre-bound per speed index
  onCycle: () => void;
  onSkip: () => void;
  onPause: () => void;
  /** HULL-1d (REQ-BFG-079; ruling Q4): a desk (landscape) bar with HULL_SCALE on: battleLayout.ts gave it DESK_WIND_W more,
   *  kept for its wind read-out (battle.ts sets it each frame); absent or false, as before. */
  deskWind?: boolean;
}

/** HULL-1c (REQ-BFG-079; REVIEW-HULL1A N3): a share a second in basis points (hullScale.ts windShareBp) as the bar prints
 *  it: a percent with at most one decimal ("0.5%", "1%", "1.5%"). */
export const windShareText = (bp: number): string => `${Math.round(bp / 10) / 10}%`;

/** HULL-1c (REQ-BFG-079; REVIEW-HULL1A N3): the bar's wind read-out. On the day's hull (Battle.scaled: HULL_SCALE on and a
 *  day) the share of its own max hull that BOTH hulls lose a second ("WIND 1%/S"; each hull's own amount pops over it,
 *  arenaReact); otherwise 0.9.7's damage a second, windDps ("WIND 20/S"), as before. */
export function windReadout(b: Pick<Battle, "t" | "scaled" | "windDps">): string {
  return b.scaled ? `WIND ${windShareText(windShareBp(b.t - WIND_START))}/S` : `WIND ${b.windDps()}/S`;
}

/** HULL-1d (REQ-BFG-079; ruling Q4): the room a full bar keeps for its wind read-out: a wide (phone) bar's 40, as before; a
 *  desk bar with HULL_SCALE on (`deskWind`) the DESK_WIND_W its layout added (battleLayout.ts); else none, as before. */
export const barWindRoom = (w: number, deskWind = false): number => (w > 200 ? 40 : deskWind && w >= DESK_BAR_W + DESK_WIND_W ? DESK_WIND_W : 0);

/** A full bar's speed row (drawBar's arithmetic, in one place): the clock's end `x0`, the wind read-out's room, the speed
 *  buttons' width `sw` and the first one's x. The wind read-out is drawn where first - x0 holds it whole. */
export function barSpeedRow(r: Rect, clock: string, deskWind = false): { x0: number; windRoom: number; sw: number; first: number } {
  const big = r.h >= 14, bh = r.h - 2, right = r.x + r.w - 2;
  const x0 = r.x + 4 + textWidth(clock, big ? "5" : "3") + 4;
  const menuW = Math.max(10, Math.round(bh * 0.9)), skipW = Math.max(18, Math.round(bh * 1.7));
  const skipX = right - menuW - 2 - skipW;
  const windRoom = barWindRoom(r.w, deskWind), n = SPEEDS.length;
  const sw = Math.max(15, Math.min(Math.round(bh * 1.5), Math.floor((skipX - 2 - x0 - windRoom - (n - 1)) / n)));
  return { x0, windRoom, sw, first: skipX - 2 - n * (sw + 1) + 1 };
}

/** Docked control bar: clock (plum once the dark wind blows) + 0.5X 1X 2X 4X SKIP + II (pause). */
export function drawBar(g: G, game: Game, a: Arena, r: Rect, clock: string, st: BarState): void {
  const ui = game.ui;
  panel(g, r, "dark");
  const wind = a.b.t >= WIND_START;
  const big = r.h >= 14;
  const cy = r.y + Math.floor((r.h - (big ? 7 : 5)) / 2);
  drawText(g, clock, r.x + 4, cy, wind ? C.plum4 : C.bone, { font: big ? "5" : "3", outline: C.ink });
  const x0 = r.x + 4 + textWidth(clock, big ? "5" : "3") + 4;
  const bh = r.h - 2, by = r.y + 1;
  const right = r.x + r.w - 2;
  const menuW = Math.max(10, Math.round(bh * 0.9));
  // II pauses in place and shows > (play) until it resumes; P and Space do the same
  button(ui, g, "pause", { x: right - menuW, y: by, w: menuW, h: bh }, st.paused ? ">" : "II", { font: "3", active: st.paused, onTap: st.onPause });
  if (!st.showSpeeds) return;
  const skipW = Math.max(18, Math.round(bh * 1.7));
  const skipX = right - menuW - 2 - skipW;
  button(ui, g, "skip", { x: skipX, y: by, w: skipW, h: bh }, "SKIP", { font: "3", onTap: st.onSkip });
  if (st.compact) {
    const sw = Math.max(18, Math.round(bh * 1.3));
    button(ui, g, "spd", { x: skipX - 2 - sw, y: by, w: sw, h: bh }, SPEED_LABELS[st.speed], {
      font: "3", active: st.speed !== SPEED_1X, onTap: st.onCycle,
    });
    return;
  }
  // wide bars keep room for the wind readout; the button width never changes mid-battle. HULL-1d (REQ-BFG-079; ruling Q4):
  // so does the desk bar with HULL_SCALE on (st.deskWind: its layout's DESK_WIND_W more, so its buttons keep their width);
  // the row's arithmetic is barSpeedRow's (as before)
  const { windRoom, sw, first } = barSpeedRow(r, clock, st.deskWind);
  const n = SPEEDS.length;
  // HULL-1c (REQ-BFG-079; REVIEW-HULL1A N3): windReadout (the share both hulls lose, on the day's hull), only where it fits
  // whole: a share may read wider than 38 px ("WIND 10.3%/S" is 44); 0.9.7's read-outs are 38 at most, so their 38 holds
  const wr = wind ? windReadout(a.b) : "";
  if (wind && windRoom && first - x0 >= Math.max(38, textWidth(wr, "3"))) drawText(g, wr, x0, r.y + Math.floor((r.h - 5) / 2), C.plum4, { font: "3" });
  for (let i = 0; i < n; i++) {
    button(ui, g, SPEED_IDS[i], { x: first + i * (sw + 1), y: by, w: sw, h: bh }, SPEED_LABELS[i], { font: "3", active: st.speed === i, onTap: st.onSpeed[i] });
  }
}

export function hudRects(L: BattleLayout): { plates: [Rect, Rect]; bar: Rect } {
  return { plates: L.plates, bar: L.bar };
}

/** Lives as hearts at a 6 px pitch; `lost` (>= 0) marks the heart just lost: it stays empty and
 *  flashes a white rim for a moment (no flash with Reduced Motion). */
export function drawHearts(g: G, x: number, y: number, lives: number, t = 0, lost = -1, gained = -1, slots = START_LIVES, perRow = slots): number {
  // RETUNE-1 run 2 (REQ-BFG-096): `slots` hearts (a hearts run's 10: hearts.ts livesCap), `perRow` to a row at a 6 px pitch
  // (the bars: two rows of 5); by default START_LIVES in one row, exactly as before
  for (let i = 0; i < slots; i++) {
    const hx = x + (i % perRow) * 6, hy = y + Math.floor(i / perRow) * 6;
    if (i === lost) {
      rect(g, hx - 1, hy - 1, 7, 7, C.red);
      if (!settings.reducedMotion && t < 1.4 && Math.floor(t * 6) % 2 === 0) rect(g, hx - 1, hy - 1, 7, 7, C.white);
    }
    // LC-1 (REQ-BFG-073): the heart LAST CHANCE gave back, lit lime (blinking white at first, as a lost one blinks)
    if (i === gained) {
      rect(g, hx - 1, hy - 1, 7, 7, C.lime);
      if (!settings.reducedMotion && t < 1.4 && Math.floor(t * 6) % 2 === 1) rect(g, hx - 1, hy - 1, 7, 7, C.white);
    }
    g.drawImage(heartIcon(i < lives), hx, hy);
  }
  return Math.min(slots, perRow) * 6 - 1;
}

/** RETUNE-1 run 2 (REQ-BFG-096): the dusk card's loss line beside the hearts: "-N HEARTS" ("-1 HEART") on a hearts run's loss
 *  (DayResult.heartsLost, what the loss cost), else "-1 LIFE" as before. */
export const lossLine = (r: Pick<DayResult, "heartsLost">): string =>
  r.heartsLost !== undefined ? `-${r.heartsLost} ${heartsWord(r.heartsLost)}` : "-1 LIFE";

/** The dusk result card's rows: [label, you, foe]. 0.6.2 RULE SHOCK ROW: SHOCK STUNS (NUM-4; was SHOCK STALLS), beside the damage and Burn rows:
 *  the enemy machines each side's Shock stalled (DayResult.shocks, counted by the Arena; "-" in a result saved before
 *  0.6.2). Display only. 0.8.0 H1 M3: then FOUNDRY's and BASTION's rows (DayResult.race, raceReadout): FUSED SLUGS
 *  when either side is FOUNDRY, PLATING GAINED and PLATING SPENT when either is BASTION; "-" for the other side. A
 *  Furnace or Weaver fight has no such rows. */
export function resultRows(r: Pick<DayResult, "player" | "enemy" | "shocks" | "race">): [string, string, string][] {
  const p = r.player, e = r.enemy;
  // NUM-4 (REQ-BFG-047; N1 2.5): the totals are sums of whole events, printed as they are (fmtDmg; was Math.round);
  // FIRST SHOT is a clock reading, whole elapsed seconds (fmtClock; was toFixed(1)); GUNS IDLE a measured share, a reading
  // (fmtReadPct, the one rounded %)
  const idle = (s: typeof p) => fmtReadPct(s.idle / Math.max(0.001, s.turretTime));
  const rows: [string, string, string][] = [
    ["DAMAGE DEALT", fmtDmg(p.damage), fmtDmg(e.damage)],
    ["SHOTS", String(p.shots), String(e.shots)],
    ["FIRST SHOT", p.firstShot < 0 ? "NEVER" : `${fmtClock(p.firstShot)}S`, e.firstShot < 0 ? "NEVER" : `${fmtClock(e.firstShot)}S`],
    ["GUNS IDLE", idle(p), idle(e)],
    ["JAMS", String(p.jams), String(e.jams)],
    ["BURN DAMAGE", fmtDmg(p.burnDealt), fmtDmg(e.burnDealt)],
    // NUM-4 (REVIEW-NUM3 F2): one word for one stop, SHOCK STUNS (was SHOCK STALLS); the counts as before
    ["SHOCK STUNS", r.shocks ? String(r.shocks[0]) : "-", r.shocks ? String(r.shocks[1]) : "-"],
  ];
  // NUM-4: whole sums printed as they are (a count, or plating through fmtDmg; was Math.round)
  const v = (x: number | null, f: (n: number) => string = fmtDmg): string => (x === null ? "-" : f(x));
  const race = r.race;
  if (race?.fused) rows.push(["FUSED SLUGS", v(race.fused[0], fmtCount), v(race.fused[1], fmtCount)]);
  // CARD-3 (REQ-BFG-107): the soak layer's word (was PLATING GAINED and PLATING SPENT)
  if (race?.plated) rows.push(["SHIELD GAINED", v(race.plated[0]), v(race.plated[1])]);
  if (race?.spent) rows.push(["SHIELD SPENT", v(race.spent[0]), v(race.spent[1])]);
  return rows;
}

/** The rows 0.6.2's card holds at its 170 px. */
export const CARD_ROWS = 7;

/**
 * 0.8.0 H1 M3: the result card's height and row pitch for `n` rows on a screen H px high. Up to CARD_ROWS rows: 0.6.2's
 * 170 px and 8 px, whatever H (a Furnace or Weaver card is unchanged). Each race row adds a pitch; where the card would
 * not fit H with 2 px to spare, the pitch closes to 7, then 6 (the 3x5 rows stay apart).
 * SCOUT-1b (REQ-BFG-082): `view`, VIEW BATTLEFIELD's row (VIEW_ROW_H px) under the rows: the card with that row must fit
 * H with 2 px to spare. The pitch closes 8 -> 7 -> 6 at any row count (a 7-row card too), and where pitch 6 is still too
 * tall the gap between the INCOME line and the buttons closes as well, by at most CARD_GAP_CUT of its 16 px. `h` is the
 * card's height without the row (the caller adds it). With no `view`, exactly as before.
 */
export function resultCard(n: number, H: number, view = 0): { h: number; pitch: number } {
  if (view > 0) {
    const m = Math.max(n, CARD_ROWS);
    let h = 0;
    for (const pitch of [8, 7, 6]) {
      h = 170 + (m - CARD_ROWS) * 8 - (8 - pitch) * (m + 1);
      if (h + view <= H - 4) return { h, pitch };
    }
    return { h: h - Math.min(CARD_GAP_CUT, h + view - (H - 4)), pitch: 6 };
  }
  if (n <= CARD_ROWS) return { h: 170, pitch: 8 };
  let h = 0;
  for (const pitch of [8, 7, 6]) {
    h = 170 + (n - CARD_ROWS) * 8 - (8 - pitch) * (n + 1);
    if (h <= H - 4) return { h, pitch };
  }
  return { h, pitch: 6 };
}

/** SCOUT-1b (REQ-BFG-082): the most a card with VIEW BATTLEFIELD's row closes the gap between its INCOME line and its
 *  buttons (16 px), where pitch 6 alone doesn't fit it: 7 px stay clear. */
export const CARD_GAP_CUT = 9;

/** LC-1 (REQ-BFG-073): how long the build screen's bar lights the heart LAST CHANCE gave back (seconds). */
export const LC_HEART_S = 4;

/** Dusk result card: WIN, LOSS (-1 LIFE) or DRAW; the fight's numbers; income; then the next DAWN. SCOUT-1 (REQ-BFG-076):
 *  `onView`, VIEW BATTLEFIELD: its own row right above the primary action (never in its place), the card a row taller;
 *  absent, the card exactly as before. Its tap target is `viewHit` px tall at least (a finger's, TAP_CSS). SCOUT-1b
 *  tooling: returns the card's box as drawn this frame. REPLAY-1 (REQ-BFG-112): `onReplay`, the card's REPLAY, at the
 *  right end of VIEW BATTLEFIELD's row (viewRow); absent, that row exactly as before. REPLAY-1b (REVIEW-REPLAY1 ruling 2):
 *  the primary's target is `viewHit` px tall at least too (primaryTap), its drawing as before. */
export function drawResult(g: G, game: Game, r: DayResult, pt: number, label: string, onNext: () => void, onView?: () => void, viewHit = 0, onReplay?: () => void): Rect {
  const { W, H, ui } = game;
  const run = game.run!;
  const rows = resultRows(r);
  const extra = onView ? VIEW_ROW_H : 0;
  const card = resultCard(rows.length, H, extra); // 0.6.2: 170 (+8 for the SHOCK STALLS row); 0.8.0 H1 M3: + race rows
  const pitch = card.pitch, h = card.h + extra; // SCOUT-1b (REQ-BFG-082): with VIEW BATTLEFIELD's row it fits H - 4
  const w = Math.min(W - 10, 214);
  const x = Math.round(W / 2 - w / 2), y = Math.round(H / 2 - h / 2);
  const k = Math.min(1, pt / 0.25);
  g.globalAlpha = 0.55 * k;
  rect(g, 0, 0, W, H, C.ink);
  g.globalAlpha = 1;
  const yy = y + Math.round((1 - k) * 30);
  panel(g, { x, y: yy, w, h }, "raised");
  ui.add({ id: "resultbg", r: { x: 0, y: 0, w: W, h: H }, block: true });
  const loss = r.outcome === "loss";
  const title = r.outcome === "win" ? "WIN" : loss ? "LOSS" : "DRAW";
  const tc = r.outcome === "win" ? C.lime : loss ? C.red : C.bone;
  drawText(g, title, W / 2, yy + 6, tc, { align: "center", scale: 2, outline: C.ink });
  drawText(g, `DUSK · DAY ${r.day} · ${fmtClock(r.time)}S`, W / 2, yy + 23, C.slate4, { font: "3", align: "center" }); // NUM-4: a clock
  drawText(g, `VS ${r.foe}`, W / 2, yy + 31, C.bone, { font: "3", align: "center" });
  // lives, with the heart just lost blinking and -1 LIFE beside them; the W-L record on the right. 0.6.2 RULE
  // EARLY-LOSS REFUND: the hearts are the lives after this dusk (the refund comes at the dawn the card leads to)
  const hx = x + 10;
  const after = run.lives - (r.refund ?? 0);
  // LC-1 (REQ-BFG-073): a LAST CHANCE dusk's heart came straight back: lit lime, not lost (the line below says why)
  const lc = !!r.lastChance;
  // RETUNE-1 run 2 (REQ-BFG-096): a hearts run's 10 hearts in one row and what the loss cost ("-3 HEARTS"); else as before
  const slots = livesCap(run);
  drawHearts(g, hx, yy + 42, after, pt, loss && !lc ? after : -1, lc ? after - 1 : -1, slots);
  if (loss) drawText(g, lossLine(r), hx + slots * 6 + 4, yy + 42, C.red, { font: "3", outline: C.ink });
  drawText(g, `W-L ${record(run)}`, x + w - 10, yy + 42, C.white, { font: "3", align: "right" });
  let ry = yy + 53;
  drawText(g, "YOU", x + w - 52, ry, C.lime, { font: "3", align: "right" });
  drawText(g, "FOE", x + w - 10, ry, C.red, { font: "3", align: "right" });
  ry += pitch;
  for (const [lb, a, bb] of rows) {
    drawText(g, lb, x + 10, ry, C.slate4, { font: "3" });
    drawText(g, a, x + w - 52, ry, C.white, { font: "3", align: "right" });
    drawText(g, bb, x + w - 10, ry, C.bone, { font: "3", align: "right" });
    ry += pitch;
  }
  drawText(g, `INCOME +${r.income}G`, x + 10, ry + 3, C.yellow);
  // 0.6.2 RULE EARLY-LOSS REFUND: said here too, on the card that leads to that dawn
  const back = refundCardLine(r) ?? lastChanceCardLine(r); // LC-1: "LAST CHANCE: +1 LIFE" (never both: day 2 v 5-9)
  if (back) drawText(g, back, x + w - 10, ry + 3, C.lime, { align: "right" });
  const nb = { x: x + 10, y: yy + h - 27, w: w - 20, h: 21 }, vb = { x: x + 10, y: yy + h - 27 - VIEW_ROW_H, w: w - 20, h: 21 };
  // REPLAY-1b (REQ-BFG-112; REVIEW-REPLAY1 ruling 2): the primary's target a finger's tall on a phone (primaryTap: down
  // first, never onto VIEW BATTLEFIELD's or REPLAY's targets, never off the screen); the button drawn as before
  const nh = primaryTap(nb, viewHit, H, onView ? viewFloor(vb) : nb.y);
  if (pt > 0.35) button(ui, g, "next", nb, label, { primary: true, onTap: onNext, ...(nh !== nb ? { hit: nh } : {}) });
  if (pt > 0.35 && onView) viewRow(ui, g, vb, { x, y: yy, w, h }, onView, viewHit, onReplay);
  return { x, y: yy, w, h };
}

/** REPLAY-1 (REQ-BFG-112): the card's REPLAY button: its label and its UI region's id. */
export const REPLAY_LABEL = "REPLAY", CARD_REPLAY = "cardreplay";
/** REPLAY-1: the gap between VIEW BATTLEFIELD and REPLAY in their row (the row's own gap over the primary action). */
export const REPLAY_GAP = 4;

/**
 * REPLAY-1 (REQ-BFG-112): VIEW BATTLEFIELD's row `b` shared with the card's REPLAY, a secondary button at the row's right
 * end, so the card keeps its size and every row and the primary action keep their places: REPLAY as wide as its label
 * needs (+ 12) and at least `hit` (a finger's, so on a phone it is TAP_CSS wide), REPLAY_GAP px after VIEW BATTLEFIELD,
 * which keeps the rest of the row. Where that would leave VIEW BATTLEFIELD's label less than 3 px a side (a card under
 * 165 px; none of the game's views today), REPLAY takes the 3x5 face and 4 px a side. Pure (tests).
 */
export function cardReplayRow(b: Rect, hit = 0): { view: Rect; replay: Rect; font: "5" | "3" } {
  let font: "5" | "3" = "5", rw = Math.max(hit, textWidth(REPLAY_LABEL) + 12);
  if (b.w - rw - REPLAY_GAP < textWidth("VIEW BATTLEFIELD") + 6) {
    font = "3";
    rw = Math.max(hit, textWidth(REPLAY_LABEL, "3") + 8);
  }
  return { view: { x: b.x, y: b.y, w: b.w - rw - REPLAY_GAP, h: b.h }, replay: { x: b.x + b.w - rw, y: b.y, w: rw, h: b.h }, font };
}

/** REPLAY-1: VIEW BATTLEFIELD's row on a result card (dusk or warlord): with `onReplay`, VIEW BATTLEFIELD and REPLAY side
 *  by side (cardReplayRow), each tap target grown to `hit` px inside the card as viewButton grows VIEW BATTLEFIELD's (never
 *  onto the primary action's row below); without, VIEW BATTLEFIELD alone, exactly as before. */
export function viewRow(ui: Game["ui"], g: G, b: Rect, card: Rect, onView: () => void, hit = 0, onReplay?: () => void): void {
  if (!onReplay) return viewButton(ui, g, b, card, onView, hit);
  const row = cardReplayRow(b, hit), q = row.replay;
  viewButton(ui, g, row.view, card, onView, hit);
  const within = { x: card.x, y: card.y, w: card.w, h: viewFloor(q) - card.y };
  button(ui, g, CARD_REPLAY, q, REPLAY_LABEL, { font: row.font, onTap: onReplay, ...(hit ? { hit: tapRect(q, hit, within, hit) } : {}) });
}

/** SCOUT-1: the card's VIEW BATTLEFIELD row (a 21 px button and its 4 px gap above the primary action). */
export const VIEW_ROW_H = 25;

/** SCOUT-1: VIEW BATTLEFIELD on a result card (dusk or warlord): a secondary button, its tap target grown to `hit` px
 *  inside the card (never onto the primary action's row below it). */
export function viewButton(ui: Game["ui"], g: G, b: Rect, card: Rect, onTap: () => void, hit = 0): void {
  const within = { x: card.x, y: card.y, w: card.w, h: viewFloor(b) - card.y };
  button(ui, g, "viewfield", b, "VIEW BATTLEFIELD", { onTap, ...(hit ? { hit: tapRect(b, hit, within, hit) } : {}) });
}

/** REPLAY-1b (REQ-BFG-112): the lowest edge (exclusive) VIEW BATTLEFIELD's and REPLAY's grown targets reach for their row
 *  `b`: 2 px into the 4 px gap over the primary action (viewButton's and viewRow's `within`, as SCOUT-1 and REPLAY-1 set
 *  it), so a primary's target that starts there or lower (primaryTap's `top`) never covers them. */
export const viewFloor = (b: Rect): number => b.y + b.h + 2;

/**
 * REPLAY-1b (REQ-BFG-112; REVIEW-REPLAY1 ruling 2): the tap target of a result card's primary button drawn `b` (the dusk's
 * ON TO DAWN · DAY n or SEE THE RUN, 21 px; the warlord's ON TO THE ROAD, 20 px). Where `hit` (a finger's: fingerPx, TAP_CSS,
 * as VIEW BATTLEFIELD's and REPLAY's) is taller, the target grows to `hit` and the drawing stays as it is: down first, into
 * the card's bottom margin and on over the full-screen blocker (resultbg) below the card, never past the screen's bottom
 * `H`; then, only where that is not enough, up into the gap over the button, never above `top` (viewFloor of VIEW
 * BATTLEFIELD's row, so their targets are never covered; the button's own top where the card has no such row). Its width is
 * the button's (the card's less 20 px: far wider than a finger). `b` itself where it is already that tall. Pure (tests).
 */
export function primaryTap(b: Rect, hit: number, H: number, top = b.y): Rect {
  if (!(hit > b.h)) return b;
  const down = Math.max(0, Math.min(hit - b.h, H - (b.y + b.h)));
  const up = Math.max(0, Math.min(hit - b.h - down, b.y - top));
  return down + up > 0 ? { x: b.x, y: b.y - up, w: b.w, h: b.h + down + up } : b;
}

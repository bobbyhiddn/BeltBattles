// Battle HUD: a name plate + tick hull bar bolted to each cruiser, one docked bar with the
// clock and the playback controls (0.5X 1X 2X 4X, SKIP, II pause), and the dusk result card.

import type { Game } from "../game/game";
import type { Arena } from "../game/arena";
import type { BattleLayout } from "../game/battleLayout";
import type { DayResult } from "../game/run";
import { record, refundCardLine } from "../game/day";
import { SOURCE_OFFLINE, SOURCE_ONLINE } from "../game/session";
import { settings } from "../core/settings";
import { START_LIVES, WIND_START } from "../sim/content";
import type { Side } from "../sim/battle";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { ICON, ICON_COLOUR } from "../render/font"; // SUS-B (REQ-BFG-069): SHIELD's pips and REGEN's badge, one source
import { SHIELD_CAP } from "../sim/content"; // SUS-B: the pips' count
import { fmtDmg } from "../ui/statFormat"; // SUS-B: the REGEN badge prints as the faces print REGEN
import { fmtClock, fmtCount, fmtReadPct } from "../ui/statFormat"; // NUM-4 (REQ-BFG-047): the clocks and the results
import { heartIcon } from "../render/sprites";
import { button, panel, type Rect } from "../ui/ui";
import { hullBar } from "../ui/hud";
import { CLANK_TIME, STRIP_H, drawPlatingStrip } from "../render/raceFx"; // 0.8.0 H1 M3: BASTION's plating strip
import { PLATE_CAP, PLATE_PER_SLUG } from "../sim/races/bastion";
import { holdsPlating } from "../render/wave3Moments"; // 0.8.0 I1 M4: wave 3's plating on any hull

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

/** Name plate: [NAME ▮▮▮▮▮▮▮▮ 147] on a dark panel, player lime / enemy red. 0.7.0 (R1 M1): `tag` (online, the enemy
 *  plate where no row is free above it) goes first, grey: [ONLINE · WEAVER · 0W 5♥ ▮▮▮▮ 147]. */
export function drawPlate(g: G, game: Game, a: Arena, r: Rect, side: Side, name: string, hpText: string, tag?: string): void {
  const s = a.b.sides[side];
  const f = a.sfx[side];
  panel(g, r, "dark");
  let tx = r.x + 3;
  const ty = r.y + Math.floor((r.h - 5) / 2);
  if (tag) {
    const t = plateTag(tag);
    drawText(g, t, tx, ty, C.slate4, { font: "3" });
    tx += textWidth(t, "3") + 4;
  }
  const nameW = textWidth(name, "3");
  const hpW = textWidth(hpText, "3");
  drawText(g, name, tx, ty, side === 0 ? C.white : C.red, { font: "3" });
  drawText(g, hpText, r.x + r.w - 3, ty, C.bone, { font: "3", align: "right" });
  let bx = tx + nameW + 3, bw = r.x + r.w - 3 - hpW - 3 - bx;
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.4): a side that can hold SHIELD shows its pips before its bar (lit up to its count, the
  // rest of SHIELD_CAP dim; a broken one flashes out), and a side with MENDING LOOMs its REGEN badge before its HP. Their
  // room is kept from the start, so the bar never moves; a plate without either draws exactly as before
  if (bw > 8 + SHIELD_PIPS_W && showsShield(a, side)) {
    drawShieldPips(g, bx, ty, s.shield ?? 0, f.shieldBreak > 0 ? f.shieldAt : -1, game.t);
    bx += SHIELD_PIPS_W + 3;
    bw -= SHIELD_PIPS_W + 3;
  }
  const rmax = regenMax(a, side), room = rmax > 0 ? textWidth(`+${fmtDmg(rmax)}`, "3") + 3 : 0;
  if (room && bw > 8 + room) {
    const now = regenNow(a, side);
    if (now > 0) drawText(g, `+${fmtDmg(now)}`, r.x + r.w - 3 - hpW - 3, ty, ICON_COLOUR[ICON.REGEN], { font: "3", align: "right" });
    bw -= room;
  }
  if (bw > 8 && plated(a, side)) {
    // 0.8.0 H1 M3: BASTION's plating strip on top of the hull bar, in the bar's 7 rows: plating takes hits before HP, so
    // the strip drains (white where just lost) while the bar below holds; the dark wind goes straight to the bar
    // 0.8.0 I1 M4: the side's pool (P1's E1: SideState.plate, which IS BASTION's RaceSide.plating), so wave 3's plating
    // shows on any hull that holds a source of it
    drawPlatingStrip(g, bx, ty - 1, bw, s.plate.plate, f.plateShown, PLATE_CAP, PLATE_CAP / PLATE_PER_SLUG, f.plateShine / CLANK_TIME);
    hullBar(g, bx, ty - 1 + STRIP_H, bw, 7 - STRIP_H, Math.max(0, s.hull.hp), f.hpShown, s.hull.max, side === 0 ? C.lime : C.red, f.barFlash, game.t);
  } else if (bw > 8) hullBar(g, bx, ty - 1, bw, 7, Math.max(0, s.hull.hp), f.hpShown, s.hull.max, side === 0 ? C.lime : C.red, f.barFlash, game.t);
  // status pips: fray / burn
  const burn = s.hull.burns.length;
  if (s.hull.fray > 0 || burn > 0) {
    const px = r.x + r.w - 3;
    if (s.hull.fray > 0) rect(g, px - 2, r.y - 2, 2, 2, C.ice);
    if (burn > 0) rect(g, px - 5, r.y - 2, 2, 2, C.fire3);
  }
}

/** SUS-B (REQ-BFG-069): the SHIELD pips' room on a plate: SHIELD_CAP 3x5 glyphs at a 4 px pitch. */
export const SHIELD_PIPS_W = SHIELD_CAP * 4 - 1;

/** SUS-B (REQ-BFG-069): the side can hold SHIELD (SideState.shield: WARD STONE's start gain, or any gain; a WARD BELL's
 *  turret, TurretState.bell), so its plate shows its pips from the start. */
export function showsShield(a: Pick<Arena, "b">, side: Side): boolean {
  const s = a.b.sides[side];
  return s.shield !== undefined || s.turrets.some((tu) => !!tu.bell);
}

/** SUS-B (REQ-BFG-069): the REGEN the side's working MENDING LOOMs (TurretState.regen; a STUN or freeze on the turret
 *  pauses one, Battle.sustainTick) give its living hull now; 0 in the dark wind, where nothing heals. */
export function regenNow(a: Pick<Arena, "b">, side: Side): number {
  const s = a.b.sides[side];
  if (a.b.t >= WIND_START || s.hull.hp <= 0) return 0;
  let n = 0;
  for (const tu of s.turrets) if (tu.regen && !(tu.disrupted > 0) && !(tu.frozen > 0)) n += tu.regen;
  return n;
}

/** SUS-B: the most REGEN the side's looms give (its badge's room, kept from the start). */
export function regenMax(a: Pick<Arena, "b">, side: Side): number {
  let n = 0;
  for (const tu of a.b.sides[side].turrets) if (tu.regen) n += tu.regen;
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
  // wide bars keep room for the wind readout; the button width never changes mid-battle
  const windRoom = r.w > 200 ? 40 : 0;
  const n = SPEEDS.length;
  const sw = Math.max(15, Math.min(Math.round(bh * 1.5), Math.floor((skipX - 2 - x0 - windRoom - (n - 1)) / n)));
  const first = skipX - 2 - n * (sw + 1) + 1;
  if (wind && windRoom && first - x0 >= 38) drawText(g, `WIND ${a.b.windDps()}/S`, x0, r.y + Math.floor((r.h - 5) / 2), C.plum4, { font: "3" });
  for (let i = 0; i < n; i++) {
    button(ui, g, SPEED_IDS[i], { x: first + i * (sw + 1), y: by, w: sw, h: bh }, SPEED_LABELS[i], { font: "3", active: st.speed === i, onTap: st.onSpeed[i] });
  }
}

export function hudRects(L: BattleLayout): { plates: [Rect, Rect]; bar: Rect } {
  return { plates: L.plates, bar: L.bar };
}

/** Lives as hearts at a 6 px pitch; `lost` (>= 0) marks the heart just lost: it stays empty and
 *  flashes a white rim for a moment (no flash with Reduced Motion). */
export function drawHearts(g: G, x: number, y: number, lives: number, t = 0, lost = -1): number {
  for (let i = 0; i < START_LIVES; i++) {
    const hx = x + i * 6;
    if (i === lost) {
      rect(g, hx - 1, y - 1, 7, 7, C.red);
      if (!settings.reducedMotion && t < 1.4 && Math.floor(t * 6) % 2 === 0) rect(g, hx - 1, y - 1, 7, 7, C.white);
    }
    g.drawImage(heartIcon(i < lives), hx, y);
  }
  return START_LIVES * 6 - 1;
}

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
  if (race?.plated) rows.push(["PLATING GAINED", v(race.plated[0]), v(race.plated[1])]);
  if (race?.spent) rows.push(["PLATING SPENT", v(race.spent[0]), v(race.spent[1])]);
  return rows;
}

/** The rows 0.6.2's card holds at its 170 px. */
export const CARD_ROWS = 7;

/**
 * 0.8.0 H1 M3: the result card's height and row pitch for `n` rows on a screen H px high. Up to CARD_ROWS rows: 0.6.2's
 * 170 px and 8 px, whatever H (a Furnace or Weaver card is unchanged). Each race row adds a pitch; where the card would
 * not fit H with 2 px to spare, the pitch closes to 7, then 6 (the 3x5 rows stay apart).
 */
export function resultCard(n: number, H: number): { h: number; pitch: number } {
  if (n <= CARD_ROWS) return { h: 170, pitch: 8 };
  let h = 0;
  for (const pitch of [8, 7, 6]) {
    h = 170 + (n - CARD_ROWS) * 8 - (8 - pitch) * (n + 1);
    if (h <= H - 4) return { h, pitch };
  }
  return { h, pitch: 6 };
}

/** Dusk result card: WIN, LOSS (-1 LIFE) or DRAW; the fight's numbers; income; then the next DAWN. */
export function drawResult(g: G, game: Game, r: DayResult, pt: number, label: string, onNext: () => void): void {
  const { W, H, ui } = game;
  const run = game.run!;
  const rows = resultRows(r);
  const { h, pitch } = resultCard(rows.length, H); // 0.6.2: 170 (+8 for the SHOCK STALLS row); 0.8.0 H1 M3: + race rows
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
  drawHearts(g, hx, yy + 42, after, pt, loss ? after : -1);
  if (loss) drawText(g, "-1 LIFE", hx + START_LIVES * 6 + 4, yy + 42, C.red, { font: "3", outline: C.ink });
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
  const back = refundCardLine(r);
  if (back) drawText(g, back, x + w - 10, ry + 3, C.lime, { align: "right" });
  if (pt > 0.35) button(ui, g, "next", { x: x + 10, y: yy + h - 27, w: w - 20, h: 21 }, label, { primary: true, onTap: onNext });
}

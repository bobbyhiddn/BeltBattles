// Battle HUD: a name plate + tick hull bar bolted to each cruiser, one docked bar with the
// clock and the playback controls (0.5X 1X 2X 4X, SKIP, II pause), and the dusk result card.

import type { Game } from "../game/game";
import type { Arena } from "../game/arena";
import type { BattleLayout } from "../game/battleLayout";
import type { DayResult } from "../game/run";
import { record } from "../game/day";
import { settings } from "../core/settings";
import { START_LIVES, WIND_START } from "../sim/content";
import type { Side } from "../sim/battle";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { heartIcon } from "../render/sprites";
import { button, panel, type Rect } from "../ui/ui";
import { hullBar } from "../ui/hud";

/** Playback speeds (REQ-BFG-014, spec §22): presentation only, the sim steps the same fixed ticks. */
export const SPEEDS = [0.5, 1, 2, 4];
export const SPEED_LABELS = ["0.5X", "1X", "2X", "4X"];
export const SPEED_1X = 1;
const SPEED_IDS = ["sp0", "sp1", "sp2", "sp3"];

/** Name plate: [NAME ▮▮▮▮▮▮▮▮ 147] on a dark panel, player lime / enemy red. */
export function drawPlate(g: G, game: Game, a: Arena, r: Rect, side: Side, name: string, hpText: string): void {
  const s = a.b.sides[side];
  const f = a.sfx[side];
  panel(g, r, "dark");
  const tx = r.x + 3, ty = r.y + Math.floor((r.h - 5) / 2);
  const nameW = textWidth(name, "3");
  const hpW = textWidth(hpText, "3");
  drawText(g, name, tx, ty, side === 0 ? C.white : C.red, { font: "3" });
  drawText(g, hpText, r.x + r.w - 3, ty, C.bone, { font: "3", align: "right" });
  const bx = tx + nameW + 3, bw = r.x + r.w - 3 - hpW - 3 - bx;
  if (bw > 8) hullBar(g, bx, ty - 1, bw, 7, Math.max(0, s.hull.hp), f.hpShown, s.hull.max, side === 0 ? C.lime : C.red, f.barFlash, game.t);
  // status pips: fray / burn
  const burn = s.hull.burns.length;
  if (s.hull.fray > 0 || burn > 0) {
    const px = r.x + r.w - 3;
    if (s.hull.fray > 0) rect(g, px - 2, r.y - 2, 2, 2, C.ice);
    if (burn > 0) rect(g, px - 5, r.y - 2, 2, 2, C.fire3);
  }
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

/** Dusk result card: WIN, LOSS (-1 LIFE) or DRAW; the fight's numbers; income; then the next DAWN. */
export function drawResult(g: G, game: Game, r: DayResult, pt: number, label: string, onNext: () => void): void {
  const { W, H, ui } = game;
  const run = game.run!;
  const w = Math.min(W - 10, 214), h = 162;
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
  drawText(g, `DUSK · DAY ${r.day} · ${r.time.toFixed(1)}S`, W / 2, yy + 23, C.slate4, { font: "3", align: "center" });
  drawText(g, `VS ${r.foe}`, W / 2, yy + 31, C.bone, { font: "3", align: "center" });
  // lives, with the heart just lost blinking and -1 LIFE beside them; the W-L record on the right
  const hx = x + 10;
  drawHearts(g, hx, yy + 42, run.lives, pt, loss ? run.lives : -1);
  if (loss) drawText(g, "-1 LIFE", hx + START_LIVES * 6 + 4, yy + 42, C.red, { font: "3", outline: C.ink });
  drawText(g, `W-L ${record(run)}`, x + w - 10, yy + 42, C.white, { font: "3", align: "right" });
  const p = r.player, e = r.enemy;
  const idle = (s: typeof p) => `${Math.round((s.idle / Math.max(0.001, s.turretTime)) * 100)}%`;
  const rows: [string, string, string][] = [
    ["DAMAGE DEALT", String(Math.round(p.damage)), String(Math.round(e.damage))],
    ["SHOTS", String(p.shots), String(e.shots)],
    ["FIRST SHOT", p.firstShot < 0 ? "NEVER" : `${p.firstShot.toFixed(1)}S`, e.firstShot < 0 ? "NEVER" : `${e.firstShot.toFixed(1)}S`],
    ["GUNS IDLE", idle(p), idle(e)],
    ["JAMS", String(p.jams), String(e.jams)],
    ["BURN DAMAGE", String(Math.round(p.burnDealt)), String(Math.round(e.burnDealt))],
  ];
  let ry = yy + 53;
  drawText(g, "YOU", x + w - 52, ry, C.lime, { font: "3", align: "right" });
  drawText(g, "FOE", x + w - 10, ry, C.red, { font: "3", align: "right" });
  ry += 8;
  for (const [lb, a, bb] of rows) {
    drawText(g, lb, x + 10, ry, C.slate4, { font: "3" });
    drawText(g, a, x + w - 52, ry, C.white, { font: "3", align: "right" });
    drawText(g, bb, x + w - 10, ry, C.bone, { font: "3", align: "right" });
    ry += 8;
  }
  drawText(g, `INCOME +${r.income}G`, x + 10, ry + 3, C.yellow);
  if (pt > 0.35) button(ui, g, "next", { x: x + 10, y: yy + h - 27, w: w - 20, h: 21 }, label, { primary: true, onTap: onNext });
}

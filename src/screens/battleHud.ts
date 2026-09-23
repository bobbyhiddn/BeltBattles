// Battle HUD: a name plate + tick hull bar bolted to each cruiser, one docked bar with the
// clock and speed controls, and the round result card.

import type { Game } from "../game/game";
import type { Arena } from "../game/arena";
import type { BattleLayout } from "../game/battleLayout";
import type { RoundResult } from "../game/run";
import { RUN_LIVES, RUN_WINS, WIND_START } from "../sim/content";
import type { Side } from "../sim/battle";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { heartIcon } from "../render/sprites";
import { button, panel, type Rect } from "../ui/ui";
import { hullBar } from "../ui/hud";

export const SPEEDS = [1, 2, 4];

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

const SPEED_LABELS = ["1X", "2X", "4X"];

export interface BarState {
  speed: number;
  compact: boolean;
  showSpeeds: boolean;
  onSpeed: (() => void)[]; // pre-bound per speed index
  onCycle: () => void;
  onSkip: () => void;
  onMenu: () => void;
}

/** Docked control bar: clock (plum once the dark wind blows) + 1X 2X 4X SKIP + menu. */
export function drawBar(g: G, game: Game, a: Arena, r: Rect, clock: string, st: BarState): void {
  const ui = game.ui;
  panel(g, r, "dark");
  const wind = a.b.t >= WIND_START;
  const big = r.h >= 14;
  const cy = r.y + Math.floor((r.h - (big ? 7 : 5)) / 2);
  drawText(g, clock, r.x + 4, cy, wind ? C.plum4 : C.bone, { font: big ? "5" : "3", outline: C.ink });
  let x = r.x + 4 + textWidth(clock, big ? "5" : "3") + 4;
  if (wind && r.w > 150) {
    drawText(g, `WIND ${a.b.windDps()}/S`, x, r.y + Math.floor((r.h - 5) / 2), C.plum4, { font: "3" });
    x += 40;
  }
  const bh = r.h - 2, by = r.y + 1;
  const right = r.x + r.w - 2;
  const menuW = Math.max(10, Math.round(bh * 0.9));
  button(ui, g, "bmenu", { x: right - menuW, y: by, w: menuW, h: bh }, "II", { font: "3", onTap: st.onMenu });
  if (!st.showSpeeds) return;
  const skipW = Math.max(18, Math.round(bh * 1.7));
  const skipX = right - menuW - 2 - skipW;
  button(ui, g, "skip", { x: skipX, y: by, w: skipW, h: bh }, "SKIP", { font: "3", onTap: st.onSkip });
  if (st.compact) {
    const sw = Math.max(14, Math.round(bh * 1.3));
    button(ui, g, "spd", { x: skipX - 2 - sw, y: by, w: sw, h: bh }, SPEED_LABELS[st.speed], {
      font: "3", active: st.speed > 0, onTap: st.onCycle,
    });
    return;
  }
  const avail = skipX - 2 - x;
  const sw = Math.max(12, Math.min(Math.round(bh * 1.5), Math.floor((avail - 4) / 3)));
  for (let i = 0; i < SPEEDS.length; i++) {
    const bx = skipX - 2 - (SPEEDS.length - i) * (sw + 1);
    button(ui, g, SPEED_IDS[i], { x: bx, y: by, w: sw, h: bh }, SPEED_LABELS[i], { font: "3", active: st.speed === i, onTap: st.onSpeed[i] });
  }
}

const SPEED_IDS = ["sp0", "sp1", "sp2"];

export function hudRects(L: BattleLayout): { plates: [Rect, Rect]; bar: Rect } {
  return { plates: L.plates, bar: L.bar };
}

/** Round result card (fits every battle view scale). */
export function drawResult(g: G, game: Game, r: RoundResult, foe: string, pt: number, label: string, onNext: () => void): void {
  const { W, H, ui } = game;
  const run = game.run!;
  const w = Math.min(W - 10, 214), h = 150;
  const x = Math.round(W / 2 - w / 2), y = Math.round(H / 2 - h / 2);
  const k = Math.min(1, pt / 0.25);
  g.globalAlpha = 0.55 * k;
  rect(g, 0, 0, W, H, C.ink);
  g.globalAlpha = 1;
  const yy = y + Math.round((1 - k) * 30);
  panel(g, { x, y: yy, w, h }, "raised");
  ui.add({ id: "resultbg", r: { x: 0, y: 0, w: W, h: H }, block: true });
  const title = r.outcome === "win" ? "VICTORY!" : r.outcome === "loss" ? "DEFEAT" : "DRAW";
  const tc = r.outcome === "win" ? C.lime : r.outcome === "loss" ? C.red : C.bone;
  drawText(g, title, W / 2, yy + 6, tc, { align: "center", scale: 2, outline: C.ink });
  drawText(g, `ROUND ${r.round} · ${r.time.toFixed(1)}S VS ${foe}`, W / 2, yy + 23, C.slate4, { font: "3", align: "center" });
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
  let ry = yy + 34;
  drawText(g, "YOU", x + w - 52, ry, C.lime, { font: "3", align: "right" });
  drawText(g, "FOE", x + w - 10, ry, C.red, { font: "3", align: "right" });
  ry += 8;
  for (const [lb, a, bb] of rows) {
    drawText(g, lb, x + 10, ry, C.slate4, { font: "3" });
    drawText(g, a, x + w - 52, ry, C.white, { font: "3", align: "right" });
    drawText(g, bb, x + w - 10, ry, C.bone, { font: "3", align: "right" });
    ry += 8;
  }
  ry += 3;
  drawText(g, `INCOME +${r.income}G`, x + 10, ry, C.yellow);
  for (let i = 0; i < RUN_LIVES; i++) g.drawImage(heartIcon(i < run.lives), x + w - 12 - (RUN_LIVES - i) * 7, ry + 1);
  ry += 11;
  drawText(g, "WINS", x + 10, ry + 1, C.slate4, { font: "3" });
  for (let i = 0; i < RUN_WINS; i++) rect(g, x + 30 + i * 6, ry, 5, 6, i < run.wins ? C.lime : C.ink);
  if (pt > 0.35) button(ui, g, "next", { x: x + 10, y: yy + h - 27, w: w - 20, h: 21 }, label, { primary: true, onTap: onNext });
}

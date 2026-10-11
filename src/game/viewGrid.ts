// FIELD-1 (REQ-BFG-075): the battle's finer canvas grid. The battle camera (render/camera.ts) draws both of its shots with
// whole device pixels per art pixel, so the battle's canvas runs on a finer grid than today's: its backing store is the
// logical resolution (core/io.ts View W x H) times `sub`, and the game draws its logical px at `sub` canvas px each
// (game.ts render), so the HUD keeps today's size exactly. Only a screen that asks for it (Screen.pickSub: the battle and
// the replay) gets sub > 1; every other screen keeps today's view and canvas through core/io.ts, unchanged. This module
// wraps core/io.ts's computeView and applyView; it changes nothing in src/core.

import { applyView, computeView, type ScalePick, type View } from "../core/io";

/** A screen's canvas grid (canvas px per logical px) at its scale; 1 for today's canvas. */
export type SubPick = (pw: number, ph: number, portrait: boolean, scale: number) => number;

/** The game's view: core/io.ts's, with the canvas grid where a screen asked for one (absent: 1, today's). */
export interface GameView extends View {
  sub?: number;
}

/** core/io.ts computeView, then the screen's grid: kept only when it is a whole divisor of the scale above 1. */
export function viewWithSub(cssW: number, cssH: number, dpr: number, pick?: ScalePick, pickSub?: SubPick): GameView {
  const v: GameView = computeView(cssW, cssH, dpr, pick);
  if (!pickSub) return v;
  const pw = Math.max(1, Math.floor(cssW * dpr)), ph = Math.max(1, Math.floor(cssH * dpr));
  const sub = Math.floor(pickSub(pw, ph, v.portrait, v.scale));
  if (sub > 1 && v.scale % sub === 0) v.sub = sub;
  return v;
}

/** core/io.ts applyView for today's grid; with a finer grid, the backing store `sub` times the logical size and the same
 *  CSS size (whole device px per canvas px). */
export function applyGameView(canvas: HTMLCanvasElement, v: GameView): void {
  const s = v.sub ?? 1;
  if (s === 1) return applyView(canvas, v);
  if (canvas.width !== v.W * s) canvas.width = v.W * s;
  if (canvas.height !== v.H * s) canvas.height = v.H * s;
  canvas.style.width = `${(v.W * v.scale) / v.dpr}px`;
  canvas.style.height = `${(v.H * v.scale) / v.dpr}px`;
}

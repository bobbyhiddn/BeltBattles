// Shared HUD pieces: Mega Man style tick hull bar with chip damage, full-width banners,
// and the options card (Reduced Motion, sound) used by the pause menus.

import { settings, setReducedMotion } from "../core/settings";
import type { Game } from "../game/game";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText } from "../render/font";
import { button, panel, type Rect } from "./ui";

/**
 * Hull bar: ink frame, 1px ticks. `shown` trails `hp` (chip damage drains after a hold);
 * `flash` > 0 blinks the live fill white on the frame a hit lands.
 */
export function hullBar(g: G, x: number, y: number, w: number, h: number, hp: number, shown: number, max: number, color: string, flash: number, t: number): void {
  rect(g, x, y, w, h, C.ink);
  const iw = w - 2, ih = h - 2;
  const fa = Math.max(0, Math.min(1, hp / max));
  const fs = Math.max(fa, Math.min(1, shown / max));
  const na = Math.round(iw * fa), ns = Math.round(iw * fs);
  const low = fa < 0.25;
  const live = flash > 0 ? C.white : low && Math.floor(t * 6) % 2 ? C.red : color;
  rect(g, x + 1, y + 1, iw, ih, C.slate0);
  if (ns > na) rect(g, x + 1 + na, y + 1, ns - na, ih, flash > 0 ? C.bone : C.white);
  if (na > 0) {
    rect(g, x + 1, y + 1, na, ih, live);
    if (ih >= 3) rect(g, x + 1, y + 1, na, 1, C.white);
  }
  // tick gaps every 3px, Mega Man style
  for (let i = 3; i < iw; i += 3) rect(g, x + 1 + i, y + 1, 1, ih, C.ink);
}

/** Full-width band with a big word; k (0..1) wipes it open from the centre. */
export function banner(g: G, W: number, y: number, text: string, color: string, sub?: string, k = 1, scale = 2): void {
  const th = 7 * scale;
  const h = th + 8 + (sub ? 9 : 0);
  const bw = Math.round(W * Math.max(0, Math.min(1, k)));
  const x0 = Math.round((W - bw) / 2);
  g.globalAlpha = 0.86;
  rect(g, x0, y, bw, h, C.ink);
  g.globalAlpha = 1;
  rect(g, x0, y, bw, 2, color);
  rect(g, x0, y + h - 2, bw, 2, color);
  rect(g, x0, y + 2, bw, 1, C.night);
  if (k < 0.98) return;
  drawText(g, text, W / 2, y + 4, color, { align: "center", scale, outline: C.ink });
  if (sub) drawText(g, sub, W / 2, y + th + 6, C.bone, { font: "3", align: "center" });
}

/** Options card with Reduced Motion and sound toggles plus caller-supplied actions. */
export function optionsCard(game: Game, g: G, title: string, actions: { id: string; label: string; primary?: boolean; danger?: boolean; onTap: () => void }[], onClose: () => void): Rect {
  const { W, H, ui } = game;
  const bw = Math.min(W - 24, 150);
  const rows = 2 + actions.length;
  const h = 18 + rows * 22 + 4;
  const w = bw + 20;
  const x = Math.round(W / 2 - w / 2), y = Math.round(H / 2 - h / 2);
  g.globalAlpha = 0.6;
  rect(g, 0, 0, W, H, C.ink);
  g.globalAlpha = 1;
  ui.add({ id: "optbg", r: { x: 0, y: 0, w: W, h: H }, onTap: onClose });
  const card = { x, y, w, h };
  panel(g, card, "raised");
  ui.add({ id: "optcard", r: card, block: true });
  drawText(g, title, W / 2, y + 6, C.yellow, { align: "center", outline: C.ink });
  let by = y + 18;
  const bx = x + 10;
  for (const a of actions) {
    button(ui, g, a.id, { x: bx, y: by, w: bw, h: 19 }, a.label, { primary: a.primary, danger: a.danger, onTap: a.onTap });
    by += 22;
  }
  button(ui, g, "opt-rm", { x: bx, y: by, w: bw, h: 19 }, `REDUCED MOTION: ${settings.reducedMotion ? "ON" : "OFF"}`, {
    font: "3", active: settings.reducedMotion, onTap: () => setReducedMotion(!settings.reducedMotion),
  });
  by += 22;
  const m = game.audio.mode;
  button(ui, g, "opt-snd", { x: bx, y: by, w: bw, h: 19 }, `SOUND: ${m === 0 ? "MUSIC + SFX" : m === 1 ? "SFX ONLY" : "OFF"}`, {
    font: "3", active: m === 0, onTap: () => game.cycleSound(),
  });
  return card;
}

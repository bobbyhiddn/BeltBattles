// Immediate-mode pixel UI. Widgets register hit regions while drawing; input is routed
// against the regions of the most recent frame.

import { C, RARITY_COLOR } from "../render/palette";
import { bevel, frame, rect, type G } from "../render/pixel";
import { drawText, textWidth, wrap, type FontId } from "../render/font";
import { itemIcon } from "../render/sprites";
import { ITEMS } from "../sim/content";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Region {
  id: string;
  r: Rect;
  onTap?: () => void;
  onDown?: (x: number, y: number) => void;
  block?: boolean; // swallow input even without handlers
}

export const inside = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

export class UI {
  regions: Region[] = [];
  private building: Region[] = [];
  pressed: string | null = null;
  hover: string | null = null;
  pointer = { x: -1, y: -1, down: false };

  begin(): void {
    this.building = [];
  }

  end(): void {
    this.regions = this.building;
  }

  add(r: Region): void {
    this.building.push(r);
  }

  hit(x: number, y: number): Region | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      if (inside(this.regions[i].r, x, y)) return this.regions[i];
    }
    return null;
  }
}

export type PanelStyle = "dark" | "raised" | "inset" | "glass";

/**
 * The one panel component (STUDY rule 12): 1px ink frame, a 2px bevel lit from the upper
 * left, and corner rivets on anything big enough to carry them.
 */
export function bevel2(g: G, x: number, y: number, w: number, h: number, fill: string, hi1: string, hi2: string, lo1: string, lo2: string, rivet?: string): void {
  rect(g, x, y, w, h, C.ink);
  rect(g, x + 1, y + 1, w - 2, h - 2, fill);
  rect(g, x + 1, y + 1, w - 2, 1, hi1);
  rect(g, x + 1, y + 1, 1, h - 2, hi1);
  rect(g, x + 1, y + h - 2, w - 2, 1, lo1);
  rect(g, x + w - 2, y + 1, 1, h - 2, lo1);
  if (w >= 8 && h >= 12) {
    rect(g, x + 2, y + 2, w - 4, 1, hi2);
    rect(g, x + 2, y + 2, 1, h - 4, hi2);
    rect(g, x + 2, y + h - 3, w - 4, 1, lo2);
    rect(g, x + w - 3, y + 2, 1, h - 4, lo2);
  }
  if (rivet && w >= 16 && h >= 12) {
    rivetAt(g, x + 4, y + 4, rivet, lo2);
    rivetAt(g, x + w - 5, y + 4, rivet, lo2);
    rivetAt(g, x + 4, y + h - 5, rivet, lo2);
    rivetAt(g, x + w - 5, y + h - 5, rivet, lo2);
  }
}

function rivetAt(g: G, x: number, y: number, c: string, shade: string): void {
  rect(g, x, y, 1, 1, c);
  rect(g, x + 1, y + 1, 1, 1, shade);
}

export function panel(g: G, r: Rect, style: PanelStyle = "dark"): void {
  const { x, y, w, h } = r;
  switch (style) {
    case "raised":
      bevel2(g, x, y, w, h, C.slate1, C.slate3, C.slate2, C.navy, C.slate0, C.slate4);
      break;
    case "inset":
      rect(g, x, y, w, h, C.ink);
      rect(g, x + 1, y + 1, w - 2, h - 2, C.night);
      rect(g, x + 1, y + 1, w - 2, 1, C.ink);
      rect(g, x + 1, y + h - 2, w - 2, 1, C.slate1);
      rect(g, x + w - 2, y + 1, 1, h - 2, C.slate0);
      break;
    case "glass":
      g.globalAlpha = 0.86;
      rect(g, x, y, w, h, C.night);
      g.globalAlpha = 1;
      frame(g, x, y, w, h, C.ink);
      rect(g, x + 1, y + 1, w - 2, 1, C.slate2);
      break;
    default:
      bevel2(g, x, y, w, h, C.navy, C.slate2, C.slate1, C.ink, C.night, C.slate3);
  }
}

export interface ButtonOpts {
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  active?: boolean;
  font?: FontId;
  blink?: boolean;
  onTap?: () => void;
  onBlocked?: () => void; // a press while disabled (e.g. toast why)
  sub?: string; // small second line
  subColor?: string;
}

export function button(ui: UI, g: G, id: string, r: Rect, label: string, o: ButtonOpts = {}): void {
  const pressed = ui.pressed === id && ui.pointer.down && inside(r, ui.pointer.x, ui.pointer.y);
  const hover = ui.hover === id;
  let fill: string = C.slate2, hi: string = C.slate4, hi2: string = C.slate3, lo: string = C.slate0, text: string = C.white;
  if (o.primary) { fill = C.amber; hi = C.fire4; hi2 = C.fire3; lo = C.fire1; text = C.ink; }
  if (o.danger) { fill = C.red; hi = C.fire4; hi2 = C.fire3; lo = C.maroon; text = C.ink; }
  if (o.active) { fill = C.cyan; hi = C.white; hi2 = C.ice; lo = C.deepblue; text = C.ink; }
  if (o.disabled) { fill = C.slate1; hi = C.slate2; hi2 = C.slate2; lo = C.slate0; text = C.slate3; }
  if (hover && !o.disabled && !pressed) { hi = C.white; hi2 = hi2 === C.slate3 ? C.slate4 : hi2; }
  const dy = pressed ? 1 : 0;
  rect(g, r.x, r.y + r.h - 1, r.w, 1, C.ink); // drop edge
  if (pressed) {
    rect(g, r.x, r.y, r.w, r.h, C.ink);
    rect(g, r.x + 1, r.y + 2, r.w - 2, r.h - 3, lo);
    rect(g, r.x + 2, r.y + 3, r.w - 4, r.h - 5, fill);
  } else if (r.h >= 12 && r.w >= 12) {
    bevel2(g, r.x, r.y, r.w, r.h - 1, fill, hi, hi2, lo, fill === C.amber ? C.fire2 : lo);
  } else {
    bevel(g, r.x, r.y, r.w, r.h - 1, fill, hi, lo, C.ink);
  }
  const font = o.font ?? "5";
  const fh = font === "5" ? 7 : 5;
  if (o.sub) {
    // centre the label + sub block in the bevel's fill (rows y+2 .. y+h-4)
    const top = r.y + 2 + dy + Math.max(0, Math.floor((r.h - 5 - (fh + 8)) / 2));
    drawText(g, label, r.x + r.w / 2, top, text, { font, align: "center" });
    drawText(g, o.sub, r.x + r.w / 2, top + fh + 3, o.subColor ?? text, { font: "3", align: "center" });
  } else {
    const blinkOff = o.blink && Math.floor(performance.now() / 300) % 2 === 0;
    if (!blinkOff) drawText(g, label, r.x + r.w / 2, r.y + Math.floor((r.h - 1 - fh) / 2) + dy, text, { font, align: "center" });
  }
  ui.add({ id, r, onTap: o.disabled ? o.onBlocked : o.onTap, block: true });
}

/** A disabled button that says why in red: under its label when both fit, else in its place
 *  (wrapped). A press calls onBlocked (e.g. to toast the reason). */
export function blockedButton(ui: UI, g: G, id: string, r: Rect, label: string, why: string, onBlocked?: () => void): void {
  const fits = r.h >= 19 && textWidth(label) <= r.w - 6 && textWidth(why, "3") <= r.w - 6;
  button(ui, g, id, r, fits ? label : "", { disabled: true, onBlocked, sub: fits ? why : undefined, subColor: C.red });
  if (fits) return;
  const lines = wrap(why, r.w - 6, "3");
  let y = r.y + Math.floor((r.h - 1 - (lines.length * 7 - 2)) / 2);
  for (const ln of lines) {
    drawText(g, ln, r.x + r.w / 2, y, C.red, { font: "3", align: "center" });
    y += 7;
  }
}

/** 0.6.1d (ARSENAL.md §8.2): none at ★1, two 2x1 yellow pips at ★2, three plus a 1px gold rim at ★3. */
function starPips(g: G, x: number, y: number, w: number, stars: number): void {
  if (stars < 2) return;
  const n = stars >= 3 ? 3 : 2;
  const totalW = n * 2 + (n - 1) * 1;
  let px = x + Math.max(0, Math.round((w - totalW) / 2));
  for (let i = 0; i < n; i++) {
    rect(g, px, y, 2, 1, C.yellow);
    px += 3;
  }
}

/** Item slot (cargo tray / inspector icon). `stars` defaults to 1 (no pips, no rim). 0.6.1d2:
 *  `survivor` pulses a 1px yellow ring (a hovered/selected shop offer would merge into this copy). */
export function itemSlot(g: G, x: number, y: number, def: string | null, selected: boolean, t: number, stars = 1, survivor = false): void {
  rect(g, x, y, 18, 18, C.ink);
  rect(g, x + 1, y + 1, 16, 16, C.slate0);
  rect(g, x + 1, y + 16, 16, 1, C.slate1);
  if (def) {
    const d = ITEMS[def];
    rect(g, x + 1, y + 16, 16, 1, RARITY_COLOR[d.rarity]);
    g.drawImage(itemIcon(def), x + 3, y + 3);
    starPips(g, x + 1, y + 13, 16, stars);
  }
  if (stars >= 3) frame(g, x, y, 18, 18, C.brass3);
  if (survivor) {
    g.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 5));
    frame(g, x - 1, y - 1, 20, 20, C.yellow);
    g.globalAlpha = 1;
  }
  if (selected) frame(g, x - 1, y - 1, 20, 20, Math.floor(t * 6) % 2 ? C.white : C.yellow);
}

/** Draw wrapped paragraph lines; returns height used. */
export function para(g: G, lines: string[], x: number, y: number, w: number, color: string, font: FontId = "5", gap = 2): number {
  let yy = y;
  const fh = font === "5" ? 7 : 5;
  for (const ln of lines) {
    for (const part of wrap(ln, w, font)) {
      drawText(g, part, x, yy, color, { font });
      yy += fh + gap;
    }
  }
  return yy - y;
}

/** Mega Man style vertical tick bar. */
export function tickBar(g: G, x: number, y: number, h: number, frac: number, color: string, label?: string): void {
  const ticks = Math.max(4, Math.floor((h - 2) / 2));
  rect(g, x, y, 8, h, C.ink);
  const filled = Math.round(Math.max(0, Math.min(1, frac)) * ticks);
  for (let i = 0; i < ticks; i++) {
    const yy = y + h - 2 - i * 2;
    const on = i < filled;
    rect(g, x + 1, yy, 6, 1, on ? (i % 2 ? color : C.white) : C.slate0);
  }
  if (label) drawText(g, label, x + 4, y + h + 2, C.bone, { font: "3", align: "center", outline: C.ink });
}

export function horizontalBar(g: G, x: number, y: number, w: number, frac: number, color: string): void {
  rect(g, x, y, w, 5, C.ink);
  const ticks = Math.floor((w - 2) / 2);
  const filled = Math.round(Math.max(0, Math.min(1, frac)) * ticks);
  for (let i = 0; i < ticks; i++) {
    rect(g, x + 1 + i * 2, y + 1, 1, 3, i < filled ? (i % 2 ? color : C.white) : C.slate0);
  }
}

export function label(g: G, text: string, x: number, y: number, color: string = C.slate4): void {
  drawText(g, text, x, y, color, { font: "3" });
}

export { textWidth, drawText };

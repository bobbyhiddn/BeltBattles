// Road-event screen layout (0.5.0). Reading order: HUD bar -> one bolted panel (kind chip +
// title, the scene vignette, two lines of flavour) -> the choice cards (a row in landscape, a
// stack in portrait). The screen picks its own integer scale like the build screen.

import type { Rect } from "../../ui/ui";

export interface EventLayout {
  W: number;
  H: number;
  portrait: boolean;
  panel: Rect;
  scene: Rect;
  titleY: number;
  titleScale: number;
  textY: number;
  cards: Rect[];
  actions: Rect; // result beat: outcome line + REFIT / FIGHT buttons (over the cards)
}

const BAR = 14;

/** Largest integer scale with room for the scene and three readable choice cards. */
export function eventScale(pw: number, ph: number, portrait: boolean): number {
  for (let s = 12; s > 1; s--) {
    const W = Math.floor(pw / s), H = Math.floor(ph / s);
    if (portrait ? W >= 190 && H >= 330 : W >= 440 && H >= 250) return s;
  }
  return 1;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function eventLayout(W: number, H: number, portrait: boolean, n: number): EventLayout {
  const top = BAR + 4;
  if (!portrait) {
    const cardH = 50, gap = 6;
    const pw = Math.min(W - 12, 468);
    const avail = H - top - 6 - cardH - gap;
    const sceneH = clamp(avail - 22 - 20, 80, 136);
    const ph = 22 + sceneH + 20;
    const y0 = top + Math.max(0, Math.floor((avail - ph) / 2));
    const panel = { x: Math.round(W / 2 - pw / 2), y: y0, w: pw, h: ph };
    const cw = Math.min(160, Math.floor((pw - (n - 1) * gap) / n));
    const rowW = n * cw + (n - 1) * gap;
    const cy = y0 + ph + gap;
    const cards = Array.from({ length: n }, (_, i) => ({ x: Math.round(W / 2 - rowW / 2) + i * (cw + gap), y: cy, w: cw, h: cardH }));
    return {
      W, H, portrait, panel, scene: { x: panel.x + 4, y: panel.y + 20, w: pw - 8, h: sceneH },
      titleY: panel.y + 5, titleScale: 2, textY: panel.y + 22 + sceneH + 2, cards,
      actions: { x: panel.x, y: cy, w: pw, h: cardH },
    };
  }
  const cardH = 42, gap = 4;
  const pw = W - 8;
  const cardsH = n * cardH + (n - 1) * gap;
  const avail = H - top - 6 - cardsH - 6;
  const sceneH = clamp(avail - 16 - 20, 70, 150);
  const ph = 16 + sceneH + 20;
  const y0 = top + Math.max(0, Math.floor((avail - ph) / 2));
  const panel = { x: 4, y: y0, w: pw, h: ph };
  const cy = y0 + ph + 6;
  const cards = Array.from({ length: n }, (_, i) => ({ x: 4, y: cy + i * (cardH + gap), w: pw, h: cardH }));
  return {
    W, H, portrait, panel, scene: { x: panel.x + 4, y: panel.y + 14, w: pw - 8, h: sceneH },
    titleY: panel.y + 4, titleScale: 1, textY: panel.y + 16 + sceneH + 2, cards,
    actions: { x: 4, y: cy, w: pw, h: Math.max(cardH, 44) },
  };
}

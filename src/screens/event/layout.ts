// Road-event screen layout (0.5.0). Reading order: HUD bar -> one bolted panel -> the choice
// cards. Landscape: the scene vignette on the left of the panel, kind chip + title + flavour in
// a column on its right, cards in a row below. Portrait: title, scene, flavour, then the cards
// stacked. After a pick the chosen card moves to the first slot and the outcome panel takes the
// other slots. The screen picks its own integer scale like the build screen.

import type { Rect } from "../../ui/ui";

export interface EventLayout {
  W: number;
  H: number;
  portrait: boolean;
  panel: Rect;
  scene: Rect;
  titleX: number;
  titleY: number;
  titleScale: number;
  textX: number; // flavour text: left x (landscape column) or centre x (portrait)
  textY: number;
  textW: number;
  cards: Rect[];
  outcome: Rect; // result beat: the slots after the first card
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

function union(rs: Rect[]): Rect {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
}

export function eventLayout(W: number, H: number, portrait: boolean, n: number): EventLayout {
  const top = BAR + 4;
  if (!portrait) {
    const cardH = 50, gap = 6;
    const pw = Math.min(W - 12, 468);
    const avail = H - top - 6 - cardH - gap;
    const sceneH = clamp(avail - 8, 90, 124);
    const sceneW = Math.min(pw - 150, Math.round(sceneH * 2.4));
    const ph = sceneH + 8;
    const y0 = top + Math.max(0, Math.floor((avail - ph) / 2));
    const panel = { x: Math.round(W / 2 - pw / 2), y: y0, w: pw, h: ph };
    const cw = Math.min(160, Math.floor((pw - (n - 1) * gap) / n));
    const rowW = n * cw + (n - 1) * gap;
    const cy = y0 + ph + gap;
    const cards = Array.from({ length: n }, (_, i) => ({ x: Math.round(W / 2 - rowW / 2) + i * (cw + gap), y: cy, w: cw, h: cardH }));
    const tx = panel.x + 4 + sceneW + 8;
    return {
      W, H, portrait, panel, scene: { x: panel.x + 4, y: panel.y + 4, w: sceneW, h: sceneH },
      titleX: tx, titleY: panel.y + 7, titleScale: 2, textX: tx, textY: panel.y + 44, textW: panel.x + pw - 6 - tx,
      cards, outcome: union(cards.slice(1)),
    };
  }
  const cardH = 42, gap = 4;
  const pw = W - 8;
  const cardsH = n * cardH + (n - 1) * gap;
  const avail = H - top - 6 - cardsH - 6;
  const sceneH = clamp(avail - 16 - 20, 70, 118);
  const ph = 16 + sceneH + 20;
  const y0 = top + Math.max(0, Math.floor((avail - ph) / 2));
  const panel = { x: 4, y: y0, w: pw, h: ph };
  const cy = y0 + ph + 6;
  const cards = Array.from({ length: n }, (_, i) => ({ x: 4, y: cy + i * (cardH + gap), w: pw, h: cardH }));
  return {
    W, H, portrait, panel, scene: { x: panel.x + 4, y: panel.y + 14, w: pw - 8, h: sceneH },
    titleX: panel.x + 4, titleY: panel.y + 4, titleScale: 1, textX: W / 2, textY: panel.y + 16 + sceneH + 3, textW: pw - 8,
    cards, outcome: union(cards.slice(1)),
  };
}

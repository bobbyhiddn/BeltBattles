// World overlays that are not tied to a cruiser: the dark wind storm front.

import { C } from "./palette";
import { bayer, rect, type G } from "./pixel";

/** Dark wind: a plum tint plus a storm front rolling in from the west with streaks. WIND-2 (REQ-BFG-093) tooling: `mark`
 *  (a colour; display only, scripts/mirror1shots.mjs sets it through ArenaMotion.windMark for one frame; the game never
 *  does) draws the band alone, flat and opaque in that colour (no wash, dither or streaks), so the pixels under it can be
 *  counted. */
export function drawWind(g: G, level: number, W: number, H: number, t: number, mark = ""): void {
  if (level <= 0) return;
  if (!mark) {
    g.globalAlpha = Math.min(0.32, level * 0.32);
    rect(g, 0, 0, W, H, C.plum0);
    g.globalAlpha = 1;
  }
  const front = level * W * 0.42;
  for (let y = 0; y < H; y += 2) {
    const wob = Math.sin(y * 0.07 + t * 1.3) * 7 + Math.sin(y * 0.19 - t * 2.3) * 3;
    const fx = Math.max(0, Math.round(front + wob));
    if (fx <= 0) continue;
    if (mark) {
      rect(g, 0, y, fx, 2, mark);
      continue;
    }
    g.globalAlpha = 0.55;
    rect(g, 0, y, fx, 2, C.plum0);
    g.globalAlpha = 1;
    bayer(g, fx - 10, y, 10, 2, C.plum1, 0.5, 0, y);
    bayer(g, fx - 4, y, 6, 2, C.plum2, 0.35, 1, y);
  }
  if (mark) return;
  const n = Math.floor(10 + level * 40);
  for (let k = 0; k < n; k++) {
    const speed = 90 + (k % 7) * 20;
    const span = front + 60;
    const x = ((k * 97 + t * speed) % span) - 30;
    const y = (k * 53 + Math.sin(t + k) * 10) % H;
    rect(g, Math.round(x), Math.round(y), 5 + (k % 4), 1, k % 3 === 0 ? C.plum4 : C.plum3);
  }
}

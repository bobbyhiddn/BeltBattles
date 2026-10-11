// World overlays that are not tied to a cruiser: the dark wind storm front.

import { C } from "./palette";
import { bayer, rect, type G } from "./pixel";

/**
 * WIND-2 (REQ-BFG-093): how the dark wind is drawn on this layout. `both`: the carriers sit side by side (the caller
 * decides it from the layout at rest, never the camera), so the front rolls in from BOTH screen edges: today's from the
 * left and its mirror image from the right, with the same depth, wobble, dither and streaks, and each board sits under
 * the same share of it. Otherwise (stacked: a portrait phone) the one front from the left, which lies over both boards
 * alike, exactly as before. `mark` (tooling, display only: scripts/mirror1shots.mjs sets it through ArenaMotion.windMark
 * for one frame; the game never does): the band alone, flat and opaque in that colour (no wash, dither or streaks), so
 * the pixels under it can be counted.
 */
export interface WindLook {
  both?: boolean;
  mark?: string;
}

/** Dark wind: a plum tint over the whole screen plus a storm front rolling in from the west (WIND-2: and its mirror image
 *  from the east, `look.both`), dithered at its edge, with streaks inside it. */
export function drawWind(g: G, level: number, W: number, H: number, t: number, look: WindLook = {}): void {
  if (level <= 0) return;
  const mark = look.mark ?? "", fronts = look.both ? 2 : 1;
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
    for (let f = 0; f < fronts; f++) {
      // the west front covers columns [0, fx), the east one their mirror image [W - fx, W), its dither mirrored too
      const x0 = f ? W - fx : 0;
      if (mark) {
        rect(g, x0, y, fx, 2, mark);
        continue;
      }
      g.globalAlpha = 0.55;
      rect(g, x0, y, fx, 2, C.plum0);
      g.globalAlpha = 1;
      bayer(g, f ? W - fx : fx - 10, y, 10, 2, C.plum1, 0.5, 0, y);
      bayer(g, f ? W - fx - 2 : fx - 4, y, 6, 2, C.plum2, 0.35, 1, y);
    }
  }
  if (mark) return;
  const n = Math.floor(10 + level * 40);
  for (let f = 0; f < fronts; f++) {
    // each front its own streaks, as many as the one front had (the east's the mirror image of the west's)
    for (let k = 0; k < n; k++) {
      const speed = 90 + (k % 7) * 20;
      const span = front + 60;
      const x = ((k * 97 + t * speed) % span) - 30;
      const y = (k * 53 + Math.sin(t + k) * 10) % H;
      const len = 5 + (k % 4);
      rect(g, f ? W - Math.round(x) - len : Math.round(x), Math.round(y), len, 1, k % 3 === 0 ? C.plum4 : C.plum3);
    }
  }
}

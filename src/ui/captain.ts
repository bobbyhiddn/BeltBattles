// Captain chips (0.6.0b): a rival captain's 24x24 portrait (portraitImage, src/render/portraits.ts)
// and the small colour tags the road fork, the NEXT BATTLE card and the battle intros share.

import { portraitImage } from "../render/portraits";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { RIVALS, difficultyOf, type Difficulty, type RivalId } from "../sim/rivals";

/** A portrait: 24 draws the whole 24x24 image; 16 crops the face (centre 16x16) at 1:1, so small
 *  cards keep crisp pixels. */
export function drawPortrait(g: G, id: RivalId, x: number, y: number, size: 24 | 16 = 24): void {
  const img = portraitImage(id);
  rect(g, x - 1, y - 1, size + 2, size + 2, C.ink);
  if (size === 24) g.drawImage(img, x, y);
  else g.drawImage(img, 4, 3, 16, 16, x, y, 16, 16);
}

/** A 3x5-font tag on a colour chip; returns its width. */
export function tag(g: G, text: string, x: number, y: number, bg: string, fg: string = C.ink): number {
  const w = textWidth(text, "3") + 5;
  rect(g, x, y, w, 8, bg);
  drawText(g, text, x + 3, y + 2, fg, { font: "3" });
  return w;
}

export const TIER_LABEL: Record<Difficulty, string> = { easy: "EASY", medium: "MEDIUM", hard: "HARD" };
export const TIER_COLOR: Record<Difficulty, string> = { easy: C.lime, medium: C.yellow, hard: C.red };

/** ELITE (amber) or BOSS (plum) for the two elites and the Iron Matriarch, as DESIGN.md says. */
export function rankTag(id: RivalId): { text: string; color: string } | null {
  const r = RIVALS[id].rank;
  return r === "elite" ? { text: "ELITE", color: C.amber } : r === "boss" ? { text: "BOSS", color: C.plum4 } : null;
}

/** Name colour: red for regulars, amber for elites, plum for the boss. */
export function nameColor(id: RivalId): string {
  const r = RIVALS[id].rank;
  return r === "elite" ? C.amber : r === "boss" ? C.plum4 : C.red;
}

export { difficultyOf };

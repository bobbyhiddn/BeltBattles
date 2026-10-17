// RETUNE-1 run 2 step 5 (REQ-BFG-096; brief section 10): the stakes UI with HEARTS on. On a hearts run (hearts.ts heartsRun:
// the run's own mark) the NEXT BATTLE panel (inspector.ts drawFoe) and the dusk's fight intro (battle.ts) show what
// tonight's loss costs, "-N" and a heart (N = heartCost(today)), and say when LAST CHANCE would save the run. Both read
// hearts.ts heartsDusk, the game's own step (finishDay takes it), so the UI and the rule can't drift. The heart is the
// sprite the run bar draws for hearts (render/sprites.ts heartIcon), not the font's ♥: in the icon set (U1, REQ-BFG-046)
// the font's ♥ is HULL. A run without the mark (every run with HEARTS off) gets null: nothing is drawn, as before.

import type { Run } from "../game/run";
import { heartsDusk, heartsRun, livesCap } from "../sim/hearts";
import { lcLastDay } from "../sim/longRun"; // RUN-1 (REQ-BFG-059, D7): LAST CHANCE can save a long run on any day
import { drawText, textWidth } from "../render/font";
import { C } from "../render/palette";
import type { G } from "../render/pixel";
import { heartIcon } from "../render/sprites";

/** What tonight's dusk puts at stake on a hearts run: the hearts a loss costs, and whether LAST CHANCE would save the run. */
export interface DuskStakes {
  cost: number;
  saves: boolean;
}

/** The stakes of `run`'s dusk today, or null on a run without the hearts mark (nothing drawn: as before). A loss's step on
 *  the hearts ledger (heartsDusk): its cost, and LAST CHANCE (the loss would leave 1 heart or fewer, unused, before the
 *  last day). RUN-1 (REQ-BFG-059, D7): a long run has no last day (longRun.ts lcLastDay, the step day.ts finishHeartsDay takes), so on
 *  its day 10 and later the line still says when LAST CHANCE would save the run; a 10-day run's lastDay is RUN_DAYS, the default. */
export function duskStakes(run: Pick<Run, "hearts" | "lives" | "day" | "lastChance" | "longRun">): DuskStakes | null {
  if (!heartsRun(run)) return null;
  const step = heartsDusk(run.lives, run.day, "loss", run.lastChance !== undefined, { lastDay: lcLastDay(run) });
  return { cost: step.cost, saves: step.lastChance };
}

/** The words when LAST CHANCE would save the run, and the short form where they don't fit. */
export const STAKES_SAVES = "LAST CHANCE SAVES YOU";
export const STAKES_SAVES_SHORT = "LAST CHANCE";
/** "-2": the number drawn before the heart. */
export const stakesText = (s: DuskStakes): string => `-${s.cost}`;
/** HEART or HEARTS for `n`. */
export const heartsWord = (n: number): string => (n === 1 ? "HEART" : "HEARTS");
/** The one-life word on `run`: HEART on a hearts run, LIFE (as before) otherwise ("WARLORDS NEVER COST A LIFE"). */
export const lifeWord = (run: { hearts?: boolean }): string => (heartsRun(run) ? "HEART" : "LIFE");
/** The hero card's count: "4/5 LIVES" as before, "7/10 HEARTS" on a hearts run (hearts.ts livesCap). */
export const livesOf = (run: Pick<Run, "hearts" | "lives">): string => `${run.lives}/${livesCap(run)} ${heartsRun(run) ? "HEARTS" : "LIVES"}`;
/** A run's lives as the summary says them: "3 LIVES LEFT" / "1 LIFE LEFT" as before, "7 HEARTS LEFT" on a hearts run. */
export const livesLeft = (run: Pick<Run, "hearts" | "lives">): string =>
  `${run.lives} ${heartsRun(run) ? heartsWord(run.lives) : run.lives === 1 ? "LIFE" : "LIVES"} LEFT`;

/** The heart's sprite: 5 px, drawn 1 px after the number. */
const HEART_W = 5;

/** "-N" and the heart's width in `font`. */
export const stakesWidth = (s: DuskStakes, font: "3" | "5" = "3"): number => textWidth(stakesText(s), font) + 1 + HEART_W;

/** Draws "-N" (red) then the heart at (x, y), its left edge; returns stakesWidth. */
export function drawStakes(g: G, s: DuskStakes, x: number, y: number, font: "3" | "5" = "3"): number {
  const tw = textWidth(stakesText(s), font);
  drawText(g, stakesText(s), x, y, C.red, { font, outline: C.ink });
  g.drawImage(heartIcon(true), x + tw + 1, y + (font === "3" ? 0 : 1));
  return tw + 1 + HEART_W;
}

/** The fight intro's line (3x5): "-N" and the heart, then " · LAST CHANCE SAVES YOU" when it would; its width. */
export function stakesLineWidth(s: DuskStakes): number {
  return stakesWidth(s) + (s.saves ? textWidth(` · ${STAKES_SAVES}`, "3") : 0);
}

/** Draws the fight intro's line centred on `cx`; returns its left edge. */
export function drawStakesLine(g: G, s: DuskStakes, cx: number, y: number): number {
  const x = Math.round(cx - stakesLineWidth(s) / 2);
  const w = drawStakes(g, s, x, y);
  if (s.saves) drawText(g, ` · ${STAKES_SAVES}`, x + w, y, C.lime, { font: "3", outline: C.ink });
  return x;
}

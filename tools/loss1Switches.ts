// LOSS-1 (REQ-BFG-092): tools/loss1.ts's --all-on, through each switch's own setter (as fightBench.ts and
// lastChanceBench.ts do), never by editing a default. Kept apart so that the 0.9.8 code (live098), which has none of the
// three switches, runs tools/loss1.ts with a no-op copy of this file in its export (kit-loss1/loss1Switches.off.ts).
import { setHullScale } from "../src/sim/hullScale";
import { setLadderFix } from "../src/sim/ladderFix";
import { setNpcDay } from "../src/sim/npcDay";

export const SWITCHES_HERE = true;

/** NPC_DAY, HULL_SCALE and LADDER_FIX on in this thread (call it in the main thread and in every worker). */
export function allOn(): string {
  setHullScale(true);
  setLadderFix(true);
  setNpcDay(true);
  return "NPC_DAY, HULL_SCALE and LADDER_FIX on";
}

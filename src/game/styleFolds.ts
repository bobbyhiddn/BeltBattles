// CUSTOM-2a (REQ-BFG-072): the screens' fold calls. Each folds the run's own records into the profile (game/profile.ts)
// at the study's fold points: a dusk's result (finishDay), a warlord's result, and the run's end (complete, lost or
// ABANDON). Every fold counts once per "<runId>:<day>" (the profile remembers its folds), so a reload, CONTINUE or a
// second call changes nothing. Display only: the sim never reads the profile; these read what the run already recorded.

import type { DayResult, Run } from "./run";
import { flawless } from "./day";
import { commitFold, foldDusk, foldEnd, foldWarlord, type RunFacts } from "./profile";

/** The facts a fold reads from a run. */
export function runFacts(run: Run): RunFacts {
  return { runId: run.runId, hero: run.hero, day: run.day, over: run.over, flawless: flawless(run), belts: run.build.routes.length };
}

/** After finishDay: the dusk, and the run's end when that dusk ended it. Returns the ids unlocked. */
export function foldDuskResult(run: Run, res: Pick<DayResult, "day" | "outcome">): string[] {
  const r = runFacts(run);
  return commitFold((p) => [...foldDusk(p, r, res.day, res.outcome), ...(run.over ? foldEnd(p, r) : [])]);
}

/** After finishWarlord: the warlord's result (and the Iron Matriarch). */
export function foldWarlordResult(run: Run, day: number, outcome: "win" | "loss" | "draw", warlordId: string): string[] {
  const r = runFacts(run);
  return commitFold((p) => foldWarlord(p, r, day, outcome, warlordId === "matriarch"));
}

/** The run's end: the summary (complete or lost) and ABANDON (a run, not a finished one). */
export function foldRunEnd(run: Run): string[] {
  const r = runFacts(run);
  return commitFold((p) => foldEnd(p, r));
}

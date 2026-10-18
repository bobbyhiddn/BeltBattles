// CUSTOM-2a (REQ-BFG-072): the screens' fold calls. Each folds the run's own records into the profile (game/profile.ts)
// at the study's fold points: a dusk's result (finishDay), a warlord's result, and the run's end (complete, lost or
// ABANDON). Every fold counts once per "<runId>:<day>" (the profile remembers its folds), so a reload, CONTINUE or a
// second call changes nothing. Display only: the sim never reads the profile; these read what the run already recorded.

import type { DayResult, Run } from "./run";
import { flawless } from "./day";
import { commitFold, foldDusk, foldEnd, foldEndless, foldWarlord, type RunFacts } from "./profile";
import { online } from "./session"; // PROFILE-UP (REQ-BFG-074 clause 4): the page's session (session.ts imports types only), or null offline: then nothing here runs

/** The facts a fold reads from a run. ENDLESS-1 (REQ-BFG-059, 3.5): a run that took CONTINUE ENDLESS also carries its endless wins. */
export function runFacts(run: Run): RunFacts {
  return {
    runId: run.runId, hero: run.hero, day: run.day, over: run.over, flawless: flawless(run), belts: run.build.routes.length,
    ...(run.endlessRun ? { endlessWins: run.endlessRun.wins } : {}),
  };
}

/** After finishDay: the dusk, and the run's end when that dusk ended it. Returns the ids unlocked. ENDLESS-1 (REQ-BFG-059): the run's
 *  end is folded at its WIN_GOAL-th win and ONLY then: the end of endless (run.over "won" again, with the endless state) is not the
 *  run's end, and the fold's own key "<runId>:end" cannot be trusted to still be remembered (profile.ts FOLDED_MAX keeps the last 40
 *  keys, and an endless of 20 days makes more), so it must not run a second time (a second run, a second finished run, a second
 *  FLAWLESS). An endless dusk folds the personal best instead (a max: each dusk and the end change nothing twice). */
export function foldDuskResult(run: Run, res: Pick<DayResult, "day" | "outcome">): string[] {
  const r = runFacts(run);
  const fresh = commitFold((p) => [...foldDusk(p, r, res.day, res.outcome), ...(run.over && !run.endlessRun ? foldEnd(p, r) : []), ...foldEndless(p, r)]);
  if (run.over) online()?.profileChanged?.("end", run.runId); // PROFILE-UP: the run's end is committed; online, it uploads
  return fresh;
}

/** After finishWarlord: the warlord's result (and the Iron Matriarch). */
export function foldWarlordResult(run: Run, day: number, outcome: "win" | "loss" | "draw", warlordId: string): string[] {
  const r = runFacts(run);
  return commitFold((p) => foldWarlord(p, r, day, outcome, warlordId === "matriarch"));
}

/** The run's end: the summary (complete or lost) and ABANDON (a run, not a finished one). */
export function foldRunEnd(run: Run): string[] {
  const r = runFacts(run);
  // ENDLESS-1: a run that played endless had its end folded at its WIN_GOAL-th win (foldDuskResult), so this one folds only the
  // personal best (ABANDON in endless, the ENDLESS OVER summary); every other run folds its end as before
  const fresh = commitFold((p) => [...(run.endlessRun ? [] : foldEnd(p, r)), ...foldEndless(p, r)]);
  online()?.profileChanged?.("end", run.runId); // PROFILE-UP: the run's end (also ABANDON) is committed; one upload per run id
  return fresh;
}

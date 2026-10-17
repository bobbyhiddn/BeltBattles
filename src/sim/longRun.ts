// RUN-1 (REQ-BFG-059, REQ-BFG-116): LONG_RUN, the run won at 10 wins with no day limit, behind one switch. The operator,
// 2026-10-14: "A win is only 10 wins." With LONG_RUN on, a run (marked long by newRun) ends ONLY at its WIN_GOAL-th dusk
// win (over "won") or at 0 hearts (over "lost"). Days go on while hearts remain; nothing ends, clamps or changes a run by
// its day. The hearts numbers don't change (hearts.ts: 10 at the start, a loss costs 1/2/3 from days 1/4/7, so 3 on every
// day past 10; PATCH UP +1 capped at 10); LAST CHANCE stays once a run, at the first loss leaving 1 heart or fewer, and on
// a long run it can fire on ANY day (lcLastDay). A draw still costs nothing. flawless = won with 0 losses.
// With LONG_RUN off, everything is as live: a run ends after day RUN_DAYS's dusk ("complete") or at 0 hearts.
//
// THE SWITCH: LONG_RUN (false), built as RETUNE-1 built HEARTS (hearts.ts): longRunRules(), setLongRun(on) and
// withLongRun(fn, on = true), which puts the switch back even on a throw. A run plays on the rule it STARTED on: newRun
// marks a run started with the switch on (Run.longRun = true) and every run rule reads the run's mark (longRun), so a run
// saved before the bump that turns LONG_RUN on finishes on its own 10 days. A stored record or a match request never reads
// the switch alone: it asks its own rules (rulesGate.ts longRunFor: the switch on AND rules at or after LONG_RUN_RULES).
// The release bump writes LONG_RUN_RULES as a literal and turns the switch on.
//
// BOUNDS ARE DATA SAFETY, NEVER RULES (D4): the only bounds on a day number are the record check's (records.ts) and the
// snapshot's (snapshot.ts maxDayFor), which refuse an UPLOAD; the run itself plays on. Draws are the only way a run could
// last without end, so an upload may carry at most MAX_RUN_DRAWS draws (anti-forgery); a run past that keeps playing.
// Pure and dependency-light (no DOM), like hearts.ts.

import { RUN_DAYS } from "./content";

/** THE switch (REQ-BFG-059): on since bb-0.11.0 (BUMP-1D turned it on and wrote rulesGate.ts LONG_RUN_RULES as the literal "bb-0.11.0"). */
export const LONG_RUN: boolean = true;

let lrOn = false;

/** Is the long run in the game now (LONG_RUN, or a withLongRun call)? */
export function longRunRules(): boolean {
  return lrOn;
}

/** Turn the long run on or off (newRun reads it once; every run rule then reads the run's own mark). */
export function setLongRun(on: boolean): void {
  lrOn = on;
}

/** Run `fn` with the long run on (or off), then put the switch back as it was, even if `fn` throws (withHearts' form). */
export function withLongRun<T>(fn: () => T, on = true): T {
  const was = lrOn;
  setLongRun(on);
  try {
    return fn();
  } finally {
    setLongRun(was);
  }
}

setLongRun(LONG_RUN);

/** A long run's goal: it is WON at its WIN_GOAL-th dusk win (it replaces RUN_DAYS as the run's goal). */
export const WIN_GOAL = 10;

/** The most draws an upload under long-run rules may carry (anti-forgery sanity bound, D4). A run with more keeps playing;
 *  only its upload is refused (records.ts). */
export const MAX_RUN_DRAWS = 8;

/** The deepest dusk a long run reaches without a draw: 9 wins and the most losses 10 hearts survive (a loss costs 1/2/3
 *  from days 1/4/7; LAST CHANCE once; PATCH UP +1 once): 6 losses (day 16), or 7 with an early PATCH UP (day 17). Pinned
 *  against the record model (records.ts) by tests/run1.records.test.ts. */
export const LONG_RUN_DEEPEST_DAY = 17;

/** The deepest dusk day a long-run record may state: LONG_RUN_DEEPEST_DAY + MAX_RUN_DRAWS (data safety, D4). */
export const LONG_RUN_MAX_DAY = LONG_RUN_DEEPEST_DAY + MAX_RUN_DRAWS;

/** THE DEPTH THE GENERATORS GO TO (D5): the stand-in pool (standInPool.ts STAND_IN_GEN_DAYS), the par player's run
 *  (harness/player.ts PLAYER_DAYS_LONG) and the reference builds (races/refBuilds.ts REF_DAYS_LONG): day 16, the deepest dusk
 *  a run reaches without a draw and without an early PATCH UP. THE RULE FOR A LATER DAY (17 with an early PATCH UP, or after
 *  draws): the day-16 plan with that day's hull, gold and odds: its deck is day 16's (standInDay clamps to the deepest day
 *  the pool holds; refDay / playerBuild to this one), its hull is the day's own (the ramp, rampPlates / refHullDay, and
 *  hullScale's M(d), which every carrier takes on the day), its gold maxGoldByDay(day) and its odds rarityWeights(day). */
export const LONG_RUN_GEN_DAYS = 16;

/** Does `run` play the long run? Its own mark (Run.longRun, set by newRun while LONG_RUN is on), never the switch. */
export const longRun = (run: { longRun?: boolean }): boolean => run.longRun === true;

/** The day LAST CHANCE must come before on `run`: none on a long run (any day; hearts.ts heartsLastChanceFires' lastDay),
 *  RUN_DAYS on a 10-day run. */
export const lcLastDay = (run: { longRun?: boolean }): number => (longRun(run) ? Infinity : RUN_DAYS);

/** A long run's end after a dusk: "won" at WIN_GOAL wins, "lost" at 0 hearts, else null (the next dawn comes). A loss
 *  that empties the hearts ends the run "lost" even on the dusk of a win count below the goal; a win never loses. */
export function longRunEnd(run: { wins: number; lives: number }): "won" | "lost" | null {
  if (run.lives <= 0) return "lost";
  return run.wins >= WIN_GOAL ? "won" : null;
}

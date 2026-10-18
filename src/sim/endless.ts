// ENDLESS-1 (REQ-BFG-059, its second step): ENDLESS, the run that goes on after it is won, behind one switch. The operator's
// rule (cap's calls, W/ref/DESIGN-ENDLESS.md): a run is won at its WIN_GOAL-th win (longRun.ts); the RUN WON screen then offers
// CONTINUE ENDLESS or END RUN. END RUN ends the run exactly as today. CONTINUE ENDLESS keeps the same run and build (hero, deck,
// cargo, gold, runes, upgrades) and every day still has its dawn rune, shop, upgrades, merges and road. Endless starts with
// ENDLESS_LIVES (3) fresh hearts, whatever the run had left. An endless loss costs 1 heart on every day (the run's 1/2/2 ladder
// does not apply), a draw costs none; PATCH UP heals up to 3; LAST CHANCE never fires in endless, and neither does the
// early-loss refund. Endless ends at the 3rd heart lost (0 hearts), at the ENDLESS_WIN_CAP-th endless win (a perfect endless),
// or after the dusk of day ENDLESS_LAST_DAY. The score is the endless wins. The won run is recorded at its WIN_GOAL-th win,
// before the choice, exactly as today; nothing in endless can change that record or cost anything already earned. The run's own
// wins stay WIN_GOAL: endless wins count apart (EndlessRun.wins).
//
// THE SWITCH: ENDLESS (false), built as longRun.ts built LONG_RUN: endlessRules(), setEndless(on) and withEndless(fn, on = true),
// which puts the switch back even on a throw. A run is OFFERED endless only if it carries the mark newRun sets while ENDLESS is
// on (Run.endless), so a run saved before the release plays on its own rules (it ends at its win, as today). A stored record or a
// match request never reads the switch alone: it asks its own rules (rulesGate.ts endlessFor: the switch on AND rules at or after
// ENDLESS_RULES). The release bump that ships ENDLESS writes ENDLESS_RULES as a literal and turns the switch on. With the switch
// off the game is byte for byte as it was: nothing here runs before a run's WIN_GOAL-th win, and no pool changes.
//
// BOUNDS ARE DATA SAFETY, NEVER RULES (RUN-1's D4), except the last endless day, which ENDS endless (the game's rule) so that
// every honest endless can be uploaded: ENDLESS_LAST_DAY is DERIVED from the record model (records.ts endlessLastDay; pinned by
// tests/endless1.records.test.ts), as RUN-1 pinned LONG_RUN_DEEPEST_DAY. Pure and dependency-light (no DOM), like longRun.ts.

import { WIN_GOAL } from "./longRun";

/** THE switch (REQ-BFG-059, ENDLESS-1): off. The release bump that ships endless turns it on and writes rulesGate.ts ENDLESS_RULES. */
export const ENDLESS: boolean = false;

let enOn = false;

/** Is endless in the game now (ENDLESS, or a withEndless call)? */
export function endlessRules(): boolean {
  return enOn;
}

/** Turn endless on or off (newRun reads it once; every endless rule then reads the run's own mark). */
export function setEndless(on: boolean): void {
  enOn = on;
}

/** Run `fn` with endless on (or off), then put the switch back as it was, even if `fn` throws (withLongRun's form). */
export function withEndless<T>(fn: () => T, on = true): T {
  const was = enOn;
  setEndless(on);
  try {
    return fn();
  } finally {
    setEndless(was);
  }
}

setEndless(ENDLESS);

/** The hearts an endless starts with, whatever the run had left (the score compares builds, not how the run went). */
export const ENDLESS_LIVES = 3;

/** The endless wins that end endless: a perfect endless (the score's top). It bounds the snapshot, the budget tables and a build
 *  that cannot lose (R1e: at p 0.7 about 1 run in 850 gets there). */
export const ENDLESS_WIN_CAP = 30;

/** The most draws an endless upload may carry (an anti-forgery bound, as longRun.ts MAX_RUN_DRAWS: a draw costs nothing, so
 *  draws are the only way an endless could last without end besides ENDLESS_LAST_DAY). The game itself ends endless at
 *  ENDLESS_LAST_DAY, so no honest endless is ever longer than the bound the checks hold. */
export const ENDLESS_MAX_DRAWS = 2;

/** THE LAST ENDLESS DAY: endless ends after this day's dusk. DERIVED, not chosen: records.ts endlessLastDay() walks the endless
 *  record model (ENDLESS_WIN_CAP - 1 wins into a dusk, ENDLESS_MAX_DRAWS draws, hearts ENDLESS_LIVES, PATCH UP once per event bag)
 *  from every victory day (WIN_GOAL..longRun.ts LONG_RUN_MAX_DAY) and returns the deepest dusk day any endless record can name;
 *  tests/endless1.records.test.ts pins this number to it. cap's count without PATCH UP was 59 (25 + 29 wins + 2 losses + the last
 *  dusk + 2 draws, and the model agrees: endlessLastDay({ patchUp: false }) = 59); the dock's PATCH UP comes once per event bag
 *  (RUN-1's R1.3, as LONG_RUN_DEEPEST_DAY counts it), one more loss each: bags 3-7 are in reach of a victory on day 25, so
 *  25 + 29 wins + 7 losses + 2 draws + the last dusk = 64. Under 99 (the stores' dDD keys). */
export const ENDLESS_LAST_DAY = 64;

/** An endless run's state (Run.endlessRun): set by CONTINUE ENDLESS (day.ts startEndless), kept in the save. The snapshot of an
 *  endless dusk carries it as mode "endless", victoryDay, endlessWins and endlessLives (the hearts going into the fight). */
export interface EndlessRun {
  /** The day of the run's WIN_GOAL-th win (the dusk that won the run). */
  victoryDay: number;
  /** Endless wins: the score. */
  wins: number;
  /** Endless losses and draws (the run's own `losses` stay the run's). */
  losses: number;
  draws: number;
  /** Why endless is over, once it is: the 3rd heart lost, the ENDLESS_WIN_CAP-th win, or the last endless day's dusk. Absent while it plays. */
  end?: EndlessEnd;
}

export type EndlessEnd = "hearts" | "cap" | "lastDay";

/** Is `run` offered endless once it is won? It carries the mark newRun sets while ENDLESS is on, never the switch alone. */
export const endlessMarked = (run: { endless?: boolean }): boolean => run.endless === true;

/** Is `run` playing endless now (CONTINUE ENDLESS taken, not over)? */
export const inEndless = (run: { endlessRun?: EndlessRun }): boolean => run.endlessRun !== undefined && run.endlessRun.end === undefined;

/** Is `run`'s endless over (it played endless and it ended)? */
export const endlessOver = (run: { endlessRun?: EndlessRun }): boolean => run.endlessRun !== undefined && run.endlessRun.end !== undefined;

/** Does the won `run` offer CONTINUE ENDLESS now? Marked, won, and endless not yet taken. */
export const endlessOffered = (run: { endless?: boolean; over?: string | null; endlessRun?: EndlessRun }): boolean =>
  endlessMarked(run) && run.over === "won" && run.endlessRun === undefined;

/** One endless dusk on the ledger (the one step the game's day.ts, the record model, the bots and the benches all take): the
 *  hearts and endless wins after it, what the loss cost, and why endless ended (null: it goes on). A win adds an endless win; a
 *  loss costs ONE heart on every day; a draw costs nothing. No LAST CHANCE, no refund. Hearts first (a loss that empties them
 *  ends it), then the win cap, then the last day. */
export function endlessDusk(hearts: number, wins: number, day: number, outcome: "win" | "loss" | "draw"): { hearts: number; wins: number; cost: number; end: EndlessEnd | null } {
  const w = outcome === "win" ? wins + 1 : wins;
  const cost = outcome === "loss" ? 1 : 0;
  const h = Math.max(0, hearts - cost);
  const end: EndlessEnd | null = h <= 0 ? "hearts" : w >= ENDLESS_WIN_CAP ? "cap" : day >= ENDLESS_LAST_DAY ? "lastDay" : null;
  return { hearts: h, wins: w, cost, end };
}

/** The most hearts an endless run may hold (PATCH UP's cap, the save's clamp). */
export const ENDLESS_HEARTS_CAP = ENDLESS_LIVES;

/** The first endless day any run can have: the day after the earliest victory (the WIN_GOAL-th win on day WIN_GOAL). An endless
 *  query never reads before it (no endless ghost can be older). */
export const ENDLESS_FIRST_DAY = WIN_GOAL + 1;

/** How many days back an endless query widens to the nearest earlier day's endless ghost (a data-safety bound on the store's
 *  reads: at launch nobody has endless ghosts, and an unbounded widening would LIST every bucket from the request's day to
 *  ENDLESS_FIRST_DAY on every request). Past the window the foe is the GOD stand-in. */
export const ENDLESS_WIDEN_DAYS = 6;

/** The days an endless query reads, in order: its own day, then the nearest earlier days within ENDLESS_WIDEN_DAYS, never before
 *  ENDLESS_FIRST_DAY, never a later one (a later day has more gold). The server (server/app.ts), the client's fallback pick and the
 *  local pool's pick (game/ghosts.ts) all follow it. */
export function endlessMatchDays(day: number): number[] {
  const top = Math.max(1, Math.floor(day));
  const out: number[] = [];
  for (let d = top; d >= Math.max(ENDLESS_FIRST_DAY, top - ENDLESS_WIDEN_DAYS); d--) out.push(d);
  return out.length ? out : [top];
}

/** THE ONE TUNABLE NUMBER (BRIEF-ENDLESS1 section 4): the hull the GOD stand-in gains for each endless win the player has, in
 *  Build.hullBonus units (a day-1 number, as plating is: the day's M(d) scales it in battle); a plating is 250 (content.ts).
 *  R1e's design: "+25 hull per endless round" in the pre-NUM-1 units, i.e. 250 now. Tuned only by the bench (the band: par's mean
 *  endless wins between 2 and 6); godStandIn.ts reads it. */
export const ENDLESS_GOD_HULL_STEP = 250;
